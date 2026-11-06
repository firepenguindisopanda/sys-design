import type { Edge } from "@xyflow/react";
import { isClientKind, isComputeKind } from "@/lib/catalog";
import { PROTOCOL_META, getEdgeData } from "@/lib/edges";
import type { DatabaseConfig, FeatureBlock } from "@/lib/types";
import { CAPACITY } from "./capacities";
import type { FeatureLoads, FlowClass, FlowGraph, NotSimulated, Op, PathStep, SimNode } from "./types";

type Link = { to: string; edgeId: string };

/** Where a request can go from each node: edges as drawn, plus the reverse of two-way ones. */
function adjacency(edges: Edge[]): Map<string, Link[]> {
  const out = new Map<string, Link[]>();
  const add = (from: string, to: string, edgeId: string) => {
    const list = out.get(from) ?? [];
    list.push({ to, edgeId });
    out.set(from, list);
  };
  for (const e of edges) {
    add(e.source, e.target, e.id);
    if (PROTOCOL_META[getEdgeData(e).protocol].direction === "bidirectional") add(e.target, e.source, e.id);
  }
  for (const list of out.values()) {
    list.sort((a, b) => a.to.localeCompare(b.to) || a.edgeId.localeCompare(b.edgeId));
  }
  return out;
}

/** Compute nodes behind the same load balancer serve as one pool of identical copies. */
function buildPools(nodes: SimNode[], out: Map<string, Link[]>): string[][] {
  const kind = new Map(nodes.map((n) => [n.id, n.data.componentKind]));
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const p = parent.get(id)!;
    if (p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };
  for (const n of nodes) if (isComputeKind(n.data.componentKind)) parent.set(n.id, n.id);
  for (const n of nodes) {
    if (n.data.componentKind !== "load_balancer") continue;
    const members = (out.get(n.id) ?? []).map((l) => l.to).filter((id) => isComputeKind(kind.get(id) ?? ""));
    for (const m of members.slice(1)) parent.set(find(m), find(members[0]));
  }
  const groups = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    groups.set(root, [...(groups.get(root) ?? []), id]);
  }
  return [...groups.values()].map((g) => g.sort()).sort((a, b) => a[0].localeCompare(b[0]));
}

/** Copies a database's requests spread over: reads over every copy, writes over each shard's primary. */
export function databaseStations(
  nodeId: string,
  config: DatabaseConfig,
  op: Op,
): { id: string; fraction: number }[] {
  const shards = Math.max(1, config.shards);
  const copies = Math.max(1, config.replicas);
  const stations: { id: string; fraction: number }[] = [];
  for (let s = 0; s < shards; s++) {
    if (op === "write") {
      stations.push({ id: `${nodeId}#s${s}c0`, fraction: 1 / shards });
      continue;
    }
    for (let c = 0; c < copies; c++) stations.push({ id: `${nodeId}#s${s}c${c}`, fraction: 1 / (shards * copies) });
  }
  return stations;
}

/** Fraction of a class's requests that arrive at each node along its path. */
export function reachShares(cls: FlowClass): Record<string, number> {
  const shares: Record<string, number> = {};
  const walk = (step: PathStep, fraction: number) => {
    shares[step.nodeId] = (shares[step.nodeId] ?? 0) + fraction;
    for (const n of step.next) walk(n.step, fraction * n.fraction);
  };
  if (cls.root) walk(cls.root, 1);
  return shares;
}

const evenly = (steps: PathStep[]) => steps.map((step) => ({ fraction: 1 / steps.length, step }));

/** Nodes requests pass through on the way to compute, splitting evenly over the routes on. */
const PASS_THROUGH = new Set(["load_balancer", "cdn", "static_hosting"]);
/** Parts a client's own requests can't reach yet; a client that only talks to these sends nothing here. */
const OFF_MODEL = new Set(["message_queue", "task_worker", "object_storage", "external_api"]);

export type ClientRole = { role: "sender" } | { role: "receiver" | "off-model"; note: string };

/**
 * Which clients send requests (SPEC-loadsim-routing.md). A client whose every edge is a
 * server push into it only receives; one whose every request edge goes to parts not
 * simulated yet is off the model. Every other client sends, including one with no edges
 * or one wired straight to a database: those are flaws, and their requests fail.
 */
export function clientRoles(nodes: SimNode[], edges: Edge[]): Map<string, ClientRole> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kind = (id: string) => byId.get(id)?.data.componentKind ?? "";
  const out = adjacency(edges);
  const roles = new Map<string, ClientRole>();
  for (const client of nodes.filter((n) => isClientKind(n.data.componentKind))) {
    const touching = edges.filter((e) => e.source === client.id || e.target === client.id);
    const isPushIn = (e: Edge) => {
      const { protocol } = getEdgeData(e);
      return e.target === client.id && (protocol === "sse" || protocol === "web_push");
    };
    const links = (out.get(client.id) ?? []).filter((l) => byId.has(l.to));
    if (touching.length > 0 && touching.every(isPushIn)) {
      roles.set(client.id, { role: "receiver", note: `${client.data.label} only receives pushes, so it sends no requests here.` });
    } else if (links.length > 0 && links.every((l) => OFF_MODEL.has(kind(l.to)))) {
      const targets = [...new Set(links.map((l) => l.to))].sort();
      const named = targets.map((id) => `${byId.get(id)!.data.label} (${KIND_WORDS[kind(id)]})`);
      const list = named.length === 1 ? named[0] : `${named.slice(0, -1).join(", ")} and ${named.at(-1)}`;
      // Queues and workers are simulated behind compute (SPEC-loadsim-queues.md), but a
      // client sending straight to one isn't, so the note says what isn't simulated.
      const what = named.length === 1 ? "it" : "them";
      roles.set(client.id, {
        role: "off-model",
        note: `${client.data.label} only talks to ${list}, and requests straight from a client to ${what} aren't simulated yet, so it sends no requests here.`,
      });
    } else {
      roles.set(client.id, { role: "sender" });
    }
  }
  return roles;
}

const KIND_WORDS: Partial<Record<string, string>> = {
  message_queue: "queue",
  task_worker: "worker",
  cdn: "CDN",
  static_hosting: "static hosting",
  object_storage: "object storage",
  external_api: "external API",
};

/**
 * `loads`, when given, say which features' external calls are simulated (those with
 * `apiMs`), so an external API they call is no longer listed as not simulated.
 */
export function buildFlowGraph(nodes: SimNode[], edges: Edge[], features: FeatureBlock[], loads?: FeatureLoads): FlowGraph {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kind = (id: string) => byId.get(id)?.data.componentKind ?? "";
  const label = (id: string) => byId.get(id)?.data.label ?? id;
  const out = adjacency(edges);
  const links = (id: string) => (out.get(id) ?? []).filter((l) => byId.has(l.to));
  const pools = buildPools(nodes, out);
  const poolOf = new Map(pools.flatMap((pool) => pool.map((id) => [id, pool] as const)));
  /** Compute nodes, by feature name, where a storing feature's requests find no database */
  const noDatabase = new Map<string, Set<string>>();
  /** Workers that finish a storing feature's jobs with no outgoing edge at all */
  const resultsNowhere = new Set<string>();
  /** Features whose compute has an edge to each external API, by API id */
  const apiCallers = new Map<string, Set<string>>();
  const isQueue = (id: string) => {
    const config = byId.get(id)?.data.config;
    return config?.kind === "message_queue" && config.mode !== "pubsub";
  };
  const consumers = (queueId: string) => links(queueId).filter((l) => kind(l.to) === "task_worker");

  /**
   * A job from the queue on (SPEC-loadsim-queues.md): split evenly over the queue's
   * workers; each worker passes it on to a later stage, or writes the result, or ends it.
   * A queue with no worker is a leaf: its jobs are never done.
   */
  function jobFrom(queueId: string, edgeId: string, feature: FeatureBlock, seen: Set<string>): PathStep {
    const inner = new Set(seen).add(queueId);
    const workers = consumers(queueId).filter((l) => !inner.has(l.to));
    return {
      nodeId: queueId,
      edgeId,
      job: true,
      next: evenly(workers.map((l) => workerStep(l.to, l.edgeId, feature, inner))),
    };
  }

  function workerStep(workerId: string, edgeId: string, feature: FeatureBlock, seen: Set<string>): PathStep {
    const inner = new Set(seen).add(workerId);
    const out = links(workerId);
    const stages = out.filter((l) => isQueue(l.to) && !inner.has(l.to) && consumers(l.to).length > 0);
    let next: PathStep[] = [];
    if (stages.length > 0) {
      next = stages.map((l) => jobFrom(l.to, l.edgeId, feature, inner));
    } else if (feature.resources.storageGb > 0) {
      const dbs = out.filter((l) => kind(l.to) === "database");
      next = dbs.map((l) => ({ nodeId: l.to, edgeId: l.edgeId, job: true, op: "write" as const, next: [] }));
      if (dbs.length === 0 && out.length === 0) resultsNowhere.add(workerId);
    }
    return { nodeId: workerId, edgeId, job: true, slowMs: 0, next: evenly(next) };
  }

  /** Each worker's equal share of the slow work, over the most stages on any branch. */
  function splitSlowWork(step: PathStep, slowMs: number) {
    const stages = (s: PathStep): number =>
      (s.slowMs !== undefined ? 1 : 0) + Math.max(0, ...s.next.map((n) => stages(n.step)));
    const share = slowMs / Math.max(1, stages(step));
    const walk = (s: PathStep) => {
      if (s.slowMs !== undefined) s.slowMs = share;
      for (const n of s.next) walk(n.step);
    };
    walk(step);
  }

  /** After compute: reads check a cache first, then a database; writes go to a database. */
  function dataSteps(computeId: string, feature: FeatureBlock, op: Op): PathStep["next"] {
    // Writes, and every request of a feature with slow work, go on this instance's queues.
    const slowMs = feature.backgroundWorkMs ?? 0;
    const queues = links(computeId).filter((l) => isQueue(l.to));
    if ((op === "write" || slowMs > 0) && queues.length > 0) {
      const jobs = queues.map((l) => jobFrom(l.to, l.edgeId, feature, new Set([computeId])));
      for (const j of jobs) splitSlowWork(j, slowMs);
      return evenly(jobs);
    }
    if (feature.resources.storageGb <= 0) return [];
    const caches = links(computeId).filter((l) => kind(l.to) === "cache");
    const dbs = links(computeId).filter((l) => kind(l.to) === "database");
    if (dbs.length === 0 && !links(computeId).some((l) => kind(l.to) === "object_storage")) {
      noDatabase.set(feature.name, (noDatabase.get(feature.name) ?? new Set()).add(computeId));
    }
    const dbSteps = (share: number) =>
      dbs.map((l) => ({ fraction: share / dbs.length, step: { nodeId: l.to, edgeId: l.edgeId, next: [] } }));
    if (op === "write" || caches.length === 0) return dbSteps(1);
    // Cache aside: a miss goes on to the database, along the compute node's own edge to it.
    const miss = 1 - CAPACITY.cache.hitRatio;
    return evenly(caches.map((l) => ({ nodeId: l.to, edgeId: l.edgeId, next: dbSteps(miss) })));
  }

  /** The path on from a node towards compute that runs the feature, or null if none. */
  function routeFrom(
    nodeId: string,
    edgeId: string,
    hosts: Set<string>,
    feature: FeatureBlock,
    op: Op,
    seen: Set<string>,
  ): PathStep | null {
    if (seen.has(nodeId)) return null;
    const k = kind(nodeId);
    if (isComputeKind(k)) {
      if (!hosts.has(nodeId)) return null;
      // SPEC-loadsim-cascades.md: slow work this instance can't hand to a queue is done in
      // the request; an edge to an external API means the request may call it.
      const slowMs = feature.backgroundWorkMs ?? 0;
      const inline = slowMs > 0 && !links(nodeId).some((l) => isQueue(l.to));
      const apis = links(nodeId).filter((l) => kind(l.to) === "external_api");
      for (const l of apis) {
        apiCallers.set(l.to, (apiCallers.get(l.to) ?? new Set()).add(feature.id));
      }
      return {
        nodeId,
        edgeId,
        next: dataSteps(nodeId, feature, op),
        ...(inline ? { inlineSlowMs: slowMs } : {}),
        ...(apis.length > 0 ? { callsApi: true } : {}),
      };
    }
    if (!PASS_THROUGH.has(k)) return null;
    const inner = new Set(seen).add(nodeId);
    const next = links(nodeId)
      .map((l) => routeFrom(l.to, l.edgeId, hosts, feature, op, inner))
      .filter((s): s is PathStep => s !== null);
    return next.length > 0 ? { nodeId, edgeId, next: evenly(next) } : null;
  }

  const roles = clientRoles(nodes, edges);
  const clients = nodes
    .filter((n) => roles.get(n.id)?.role === "sender")
    .sort((a, b) => a.id.localeCompare(b.id));
  const classes: FlowClass[] = [];
  for (const client of clients) {
    for (const feature of [...features].sort((a, b) => a.id.localeCompare(b.id))) {
      const ops: Op[] = feature.resources.storageGb > 0 ? ["read", "write"] : ["read"];
      const placed = feature.placedOnNodeId && byId.has(feature.placedOnNodeId) ? feature.placedOnNodeId : null;
      const hosts = new Set(placed ? (poolOf.get(placed) ?? [placed]) : []);
      for (const op of ops) {
        const next = placed
          ? links(client.id)
              .map((l) => routeFrom(l.to, l.edgeId, hosts, feature, op, new Set([client.id])))
              .filter((s): s is PathStep => s !== null)
          : [];
        const base = { id: `${client.id}|${feature.id}|${op}`, clientId: client.id, featureId: feature.id, op };
        if (next.length === 0) {
          classes.push({
            ...base,
            outcome: "no-route",
            reason: placed
              ? `${client.data.label} can't reach an instance running ${feature.name}.`
              : `${feature.name} isn't placed on any compute.`,
            root: null,
          });
        } else {
          classes.push({
            ...base,
            outcome: "routed",
            reason: null,
            root: { nodeId: client.id, edgeId: null, next: evenly(next) },
          });
        }
      }
    }
  }

  const roleNotes = [...roles.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .flatMap(([, r]) => (r.role === "sender" ? [] : [r.note]));
  const dataNotes = [...noDatabase.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, ids]) => {
      const where = [...ids].sort().map(label);
      const at = where.length === 1 ? where[0] : `${where.slice(0, -1).join(", ")} or ${where.at(-1)}`;
      return `${name}'s data has no database to go to from ${at}, so those requests end there.`;
    });
  const possessive = (name: string) => (name.endsWith("s") ? `${name}'` : `${name}'s`);
  const workerNotes = [...resultsNowhere].sort().map((id) => `${possessive(label(id))} results go nowhere: no database.`);
  const carrying = new Set(classes.flatMap((c) => Object.keys(reachShares(c))));
  return {
    pools,
    classes,
    notSimulated: notSimulated(nodes, edges, features, carrying, simulatedApis(apiCallers, loads)),
    notes: [...roleNotes, ...dataNotes, ...workerNotes],
  };
}

/** External APIs that some feature with `apiMs` calls from its compute (SPEC-loadsim-cascades.md). */
function simulatedApis(callers: Map<string, Set<string>>, loads: FeatureLoads | undefined): Set<string> {
  if (!loads) return new Set();
  return new Set(
    [...callers].filter(([, ids]) => [...ids].some((id) => (loads[id]?.apiMs ?? null) !== null)).map(([api]) => api),
  );
}

/**
 * The parts of a design this version of the model ignores, in words. A CDN or static
 * hosting node that requests pass through keeps its file note under another id, so its
 * gauge shows how busy it is rather than "Not simulated yet".
 */
function notSimulated(
  nodes: SimNode[],
  edges: Edge[],
  features: FeatureBlock[],
  carrying: Set<string>,
  calledApis: Set<string>,
): NotSimulated[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const label = (id: string) => byId.get(id)?.data.label ?? id;
  const list: NotSimulated[] = [];

  // Queues in queue mode, and the workers they feed, are simulated (SPEC-loadsim-queues.md).
  const queueMode = (id: string) => {
    const config = byId.get(id)?.data.config;
    return config?.kind === "message_queue" && config.mode !== "pubsub";
  };
  const fedByQueue = new Set(edges.filter((e) => queueMode(e.source)).map((e) => e.target));
  for (const n of nodes) {
    const k = n.data.componentKind;
    const word = KIND_WORDS[k];
    if (!word) continue;
    if (k === "message_queue" && queueMode(n.id)) continue;
    if (k === "task_worker" && fedByQueue.has(n.id)) continue;
    if (k === "external_api" && calledApis.has(n.id)) continue;
    const text =
      k === "message_queue"
        ? `${n.data.label} (pub/sub): not simulated yet.`
        : k === "task_worker"
          ? `${n.data.label} (worker): not simulated yet.`
          : k === "external_api"
            ? `${n.data.label} (external API): calls to it aren't simulated yet.`
            : `${n.data.label} (${word}): file traffic isn't simulated yet.`;
    list.push({ id: carrying.has(n.id) ? `${n.id}:files` : n.id, text });
  }

  const scaling = nodes.filter((n) => ["paas", "functions", "edge"].includes(n.data.componentKind));
  if (scaling.length > 0) {
    list.push({
      id: "autoscaling",
      text: `Autoscaling isn't simulated yet: ${scaling.map((n) => n.data.label).join(", ")} run at the size drawn.`,
    });
  }

  for (const e of edges) {
    const { protocol } = getEdgeData(e);
    const source = byId.get(e.source)?.data.componentKind ?? "";
    const target = byId.get(e.target)?.data.componentKind ?? "";
    if (protocol === "sse" || protocol === "web_push") {
      list.push({
        id: e.id,
        text: `${label(e.source)} → ${label(e.target)} (${PROTOCOL_META[protocol].shortLabel}): server push isn't simulated yet.`,
      });
      continue;
    }
    const dataStore = (k: string) => k === "database" || k === "cache";
    if ((isClientKind(source) && dataStore(target)) || (dataStore(source) && isClientKind(target))) {
      list.push({
        id: e.id,
        text: `${label(e.source)} → ${label(e.target)} carries no requests: clients reach data through compute.`,
      });
    }
  }

  // Slow work is simulated: queued by the queues module, inline by SPEC-loadsim-cascades.md.
  for (const f of features) {
    const parts = [
      f.pollingRpm ? "polling" : null,
      f.fileRpm ? "file requests" : null,
    ].filter((p): p is string => p !== null);
    if (parts.length === 0) continue;
    const verb = parts.length === 1 ? "isn't" : "aren't";
    list.push({ id: f.id, text: `${f.name}: its ${parts.join(", ")} ${verb} simulated yet.` });
  }

  return list.sort((a, b) => a.id.localeCompare(b.id));
}
