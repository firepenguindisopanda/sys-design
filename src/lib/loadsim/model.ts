import { isClientKind, isComputeKind } from "@/lib/catalog";
import { CAPACITY, computeBudgetMs, databaseBudgetMs } from "./capacities";
import { buildFlowGraph, databaseStations } from "./graph";
import { STEPS, arrivals } from "./scenario";
import { buildSummary, type Tally } from "./summary";
import type { FailureGroup, Frame, LoadInput, LoadRun, NodeSummary, Op, PathStep } from "./types";

/**
 * A deterministic fluid model of the load (SPEC-dataflow-sim.md). Requests aren't
 * simulated one by one: each step, every station (a load balancer, a compute
 * instance, a cache, a database copy) is offered work, serves what its budget allows,
 * keeps the rest waiting, and gives up on anything that would wait more than 5 s.
 * Cost depends on steps and stations, not on the number of requests.
 */

const EPS = 1e-9;
/** Steps allowed after the window for backlogs to clear; whatever is left then fails */
const MAX_DRAIN_STEPS = 5_000;
/** Above this, the queueing formula stops growing and the backlog's own wait takes over */
const QUEUEING_CAP = 0.95;

/**
 * Average wait in a queue, as a multiple of the time per request, for a component this
 * busy with this many servers (vCPUs). Sakasegawa's approximation of a multi-server
 * queue; with one server it is the textbook busy ÷ (1 − busy). Real systems slow down
 * gradually like this well before they saturate.
 */
export function queueingFactor(utilisation: number, servers: number): number {
  const rho = Math.min(Math.max(utilisation, 0), QUEUEING_CAP);
  if (rho === 0) return 0;
  const c = Math.max(1, Math.round(servers));
  return rho ** (Math.sqrt(2 * (c + 1)) - 1) / (c * (1 - rho));
}

/** Order stations are processed in each step, so a request is offered on before it's served downstream. */
const KIND_RANK: Record<string, number> = { load_balancer: 1, cache: 3, database: 4 };
const rankOf = (kind: string) => (isClientKind(kind) ? 0 : isComputeKind(kind) ? 2 : (KIND_RANK[kind] ?? 5));

/** One step of one class's path, flattened. */
type Hop = {
  classIndex: number;
  nodeId: string;
  edgeId: string | null;
  parent: number;
  /** Of the parent's served requests */
  fraction: number;
  children: number[];
  /** Of this hop's served requests, the part answered here */
  remainder: number;
  costMs: number;
  /** Time a request spends here before any wait, plus the hop to get here */
  baseMs: number;
  stations: { id: string; fraction: number }[];
  op: Op;
  featureId: string;
  depth: number;
};

type Station = {
  id: string;
  nodeId: string;
  budgetMs: number;
  /** Requests it can work on at once (vCPUs), for the queueing wait */
  servers: number;
  entries: { hop: number; fraction: number }[];
};

export function simulateLoad({ nodes, edges, features, scenario, loads }: LoadInput): LoadRun {
  const graph = buildFlowGraph(nodes, edges, features);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kind = (id: string) => byId.get(id)?.data.componentKind ?? "";
  const featureById = new Map(features.map((f) => [f.id, f]));
  const steps = arrivals(scenario, STEPS);
  const dt = scenario.windowSeconds / STEPS;
  const clients = nodes.filter((n) => isClientKind(n.data.componentKind));

  // Each class's share of every request.
  const classShare = graph.classes.map((c) => {
    const load = loads[c.featureId];
    if (!load) return 0;
    const hasWrites = graph.classes.some((o) => o.clientId === c.clientId && o.featureId === c.featureId && o.op === "write");
    const opShare = !hasWrites ? 1 : c.op === "write" ? load.writeShare : 1 - load.writeShare;
    return (load.share * opShare) / clients.length;
  });
  // Requests no class carries: no client, or no features.
  const unassignedShare = clients.length === 0 || features.length === 0 ? 1 : 0;

  // Flatten each routed class's path into hops, and set up the stations they use.
  const hops: Hop[] = [];
  const stations = new Map<string, Station>();
  const station = (id: string, nodeId: string, budgetMs: number, servers = 1) => {
    if (!stations.has(id)) stations.set(id, { id, nodeId, budgetMs, servers, entries: [] });
    return stations.get(id)!;
  };
  const roots: number[] = [];
  graph.classes.forEach((cls, classIndex) => {
    if (!cls.root) return;
    const feature = featureById.get(cls.featureId)!;
    const load = loads[cls.featureId];
    const clientKind = kind(cls.clientId);
    const add = (step: PathStep, parent: number, fraction: number, depth: number): number => {
      const index = hops.length;
      const k = kind(step.nodeId);
      const config = byId.get(step.nodeId)?.data.config;
      // The first hop is the client's round trip; every later one is inside the system.
      const fromClient = parent >= 0 && hops[parent].parent === -1;
      const hopMs =
        step.edgeId === null ? 0 : fromClient ? (CAPACITY.clientRoundTripMs[clientKind] ?? 30) : CAPACITY.internalHopMs;
      const hop: Hop = {
        classIndex,
        nodeId: step.nodeId,
        edgeId: step.edgeId,
        parent,
        fraction,
        children: [],
        remainder: 1,
        costMs: 0,
        baseMs: hopMs,
        stations: [],
        op: cls.op,
        featureId: cls.featureId,
        depth,
      };
      hops.push(hop);
      if (k === "load_balancer") {
        hop.costMs = CAPACITY.loadBalancer.costMs;
        hop.baseMs += CAPACITY.loadBalancer.timeMs;
        hop.stations = [{ id: step.nodeId, fraction: 1 }];
        station(step.nodeId, step.nodeId, CAPACITY.loadBalancer.budgetMs);
      } else if (config && "capacity" in config) {
        hop.costMs = feature.computeMsPerRequest;
        hop.baseMs += feature.computeMsPerRequest;
        hop.stations = [{ id: step.nodeId, fraction: 1 }];
        station(step.nodeId, step.nodeId, computeBudgetMs(config.capacity.vcpus), config.capacity.vcpus);
      } else if (k === "cache") {
        hop.costMs = CAPACITY.cache.costMs;
        hop.baseMs += CAPACITY.cache.timeMs;
        hop.stations = [{ id: step.nodeId, fraction: 1 }];
        station(step.nodeId, step.nodeId, CAPACITY.cache.budgetMs);
      } else if (config?.kind === "database") {
        const ms = cls.op === "write" ? load.writeDbMs : load.readDbMs;
        hop.costMs = ms;
        hop.baseMs += ms;
        hop.stations = databaseStations(step.nodeId, config, cls.op);
        for (const s of hop.stations) station(s.id, step.nodeId, databaseBudgetMs(), CAPACITY.databaseVcpus);
      }
      if (parent === -1) roots.push(index);
      for (const n of step.next) hop.children.push(add(n.step, index, n.fraction, depth + 1));
      const left = 1 - step.next.reduce((s, n) => s + n.fraction, 0);
      hop.remainder = left > 1e-12 ? left : 0;
      return index;
    };
    add(cls.root, -1, 1, 0);
  });

  hops.forEach((hop, index) => {
    for (const s of hop.stations) stations.get(s.id)!.entries.push({ hop: index, fraction: s.fraction });
  });
  const depthOf = new Map<string, number>();
  for (const hop of hops) depthOf.set(hop.nodeId, Math.max(depthOf.get(hop.nodeId) ?? 0, hop.depth));
  const order = [...stations.values()].sort(
    (a, b) =>
      rankOf(kind(a.nodeId)) - rankOf(kind(b.nodeId)) ||
      (depthOf.get(a.nodeId) ?? 0) - (depthOf.get(b.nodeId) ?? 0) ||
      a.id.localeCompare(b.id),
  );
  const byDepth = hops.map((_, i) => i).sort((a, b) => hops[a].depth - hops[b].depth || a - b);

  // State carried between steps: what waits at each station, per hop.
  const backlog = new Map<string, number[]>([...stations.values()].map((s) => [s.id, s.entries.map(() => 0)]));

  // Totals for the summary.
  const perNode: Record<string, NodeSummary> = {};
  for (const n of nodes) perNode[n.id] = { peakUtilisation: 0, peakBacklog: 0, served: 0, failed: 0, firstSaturatedAt: null };
  const timedOut = new Map<string, number>();
  const noRoute = new Map<number, number>();
  let unassigned = 0;
  let served = 0;
  const latency = new Map<number, number>();
  const peak: Tally["peak"] = {};
  const readWork: Tally["readWork"] = {};
  const writeWork: Tally["writeWork"] = {};
  const cacheInFront = new Set(
    hops.filter((h) => kind(h.nodeId) === "database" && h.parent >= 0 && kind(hops[h.parent].nodeId) === "cache").map((h) => h.nodeId),
  );
  let firstSaturation: Tally["firstSaturation"] = null;

  const frames: Frame[] = [];
  const volIn = new Float64Array(hops.length);
  const servedOut = new Float64Array(hops.length);
  const failedAt = new Float64Array(hops.length);
  const stationsLeft = new Int32Array(hops.length);
  const waitMs = new Map<string, number>();

  const runStep = (stepIndex: number, sent: number) => {
    volIn.fill(0);
    servedOut.fill(0);
    failedAt.fill(0);
    hops.forEach((h, i) => (stationsLeft[i] = h.stations.length));
    const frame: Frame = { nodes: {}, edges: {} };
    for (const n of nodes) frame.nodes[n.id] = { arrivals: 0, served: 0, failed: 0, backlog: 0, utilisation: 0 };

    // Hand a hop's served requests on to its children once all its stations are done.
    const finish = (index: number) => {
      for (const child of hops[index].children) {
        volIn[child] = servedOut[index] * hops[child].fraction;
        if (stationsLeft[child] === 0) {
          servedOut[child] = volIn[child];
          finish(child);
        }
      }
    };

    for (const index of roots) {
      const cls = graph.classes[hops[index].classIndex];
      volIn[index] = sent * classShare[hops[index].classIndex];
      servedOut[index] = volIn[index];
      frame.nodes[cls.clientId].arrivals += volIn[index];
      frame.nodes[cls.clientId].served += volIn[index];
      finish(index);
    }
    graph.classes.forEach((cls, i) => {
      if (cls.outcome === "no-route") noRoute.set(i, (noRoute.get(i) ?? 0) + sent * classShare[i]);
    });
    unassigned += sent * unassignedShare;

    let saturatedNow: string | null = null;
    for (const s of order) {
      const queue = backlog.get(s.id)!;
      const budgetStep = s.budgetMs * dt;
      let offered = 0;
      let arrivingWork = 0;
      let arrivingRead = 0;
      let present = 0;
      s.entries.forEach((e, j) => {
        const hop = hops[e.hop];
        const arriving = volIn[e.hop] * e.fraction;
        queue[j] += arriving;
        present += queue[j];
        offered += queue[j] * hop.costMs;
        arrivingWork += arriving * hop.costMs;
        if (hop.op === "read") arrivingRead += arriving * hop.costMs;
        if (kind(s.nodeId) === "database") {
          const node = hop.nodeId;
          if (hop.op === "read") {
            readWork[node] ??= {};
            readWork[node][hop.featureId] = (readWork[node][hop.featureId] ?? 0) + arriving * hop.costMs;
          } else {
            writeWork[node] = (writeWork[node] ?? 0) + arriving * hop.costMs;
          }
        }
        frame.nodes[s.nodeId].arrivals += arriving;
      });

      const serve = offered <= budgetStep + EPS ? 1 : budgetStep / offered;
      const servedWork = offered * serve;
      let remaining = 0;
      s.entries.forEach((e, j) => {
        const out = queue[j] * serve;
        queue[j] -= out;
        servedOut[e.hop] += out;
        frame.nodes[s.nodeId].served += out;
        remaining += queue[j] * hops[e.hop].costMs;
      });
      // The client gives up after the timeout: at most that much work can wait here.
      const limit = s.budgetMs * CAPACITY.timeoutSeconds;
      if (remaining > limit * (1 + EPS) + EPS) {
        const drop = (remaining - limit) / remaining;
        s.entries.forEach((e, j) => {
          const lost = queue[j] * drop;
          queue[j] -= lost;
          failedAt[e.hop] += lost;
          frame.nodes[s.nodeId].failed += lost;
          timedOut.set(s.nodeId, (timedOut.get(s.nodeId) ?? 0) + lost);
        });
        remaining = limit;
      }
      // Demand against capacity: what arrived, or what was served while a backlog drains.
      // Work already waiting isn't counted again, so an overloaded node reads 130%, not 400%.
      const utilisation = budgetStep > 0 ? Math.max(arrivingWork, servedWork) / budgetStep : 0;

      // Wait here: the backlog's own (seconds, once saturated) plus queueing, which grows
      // with how busy the station is, in units of its average time per request.
      const meanServiceMs = present > EPS ? offered / present : 0;
      const queueingMs = queueingFactor(utilisation, s.servers) * meanServiceMs;
      waitMs.set(s.id, (remaining / s.budgetMs) * 1000 + queueingMs);
      const nodeFrame = frame.nodes[s.nodeId];
      nodeFrame.backlog += queue.reduce((sum, q) => sum + q, 0);
      if (utilisation > nodeFrame.utilisation) nodeFrame.utilisation = utilisation;
      const summary = perNode[s.nodeId];
      if (utilisation > summary.peakUtilisation) summary.peakUtilisation = utilisation;
      if (arrivingWork > (peak[s.nodeId] ? peak[s.nodeId].readWork + peak[s.nodeId].writeWork : 0)) {
        peak[s.nodeId] = { readWork: arrivingRead, writeWork: arrivingWork - arrivingRead, budgetWork: budgetStep };
      }
      if (offered > EPS && utilisation >= 1 - EPS) {
        summary.firstSaturatedAt ??= stepIndex * dt;
        if (!firstSaturation && (saturatedNow === null || s.nodeId < saturatedNow)) saturatedNow = s.nodeId;
      }

      for (const e of s.entries) {
        if (--stationsLeft[e.hop] === 0) finish(e.hop);
      }
    }
    if (!firstSaturation && saturatedNow) firstSaturation = { nodeId: saturatedNow, atSeconds: stepIndex * dt };

    // Latency of what was answered this step: each hop's base time plus its wait now.
    const cumulative = new Float64Array(hops.length);
    for (const index of byDepth) {
      const hop = hops[index];
      const wait = hop.stations.reduce((sum, st) => sum + st.fraction * (waitMs.get(st.id) ?? 0), 0);
      cumulative[index] = (hop.parent >= 0 ? cumulative[hop.parent] : 0) + hop.baseMs + wait;
      const answered = servedOut[index] * hop.remainder;
      if (answered > EPS) {
        const key = Math.round(cumulative[index] * 10) / 10;
        latency.set(key, (latency.get(key) ?? 0) + answered);
        served += answered;
      }
      if (hop.edgeId) {
        const edge = (frame.edges[hop.edgeId] ??= { volume: 0, failedShare: 0 });
        edge.volume += volIn[index];
        edge.failedShare += failedAt[index]; // a count for now; made a share below
      }
    }
    for (const edge of Object.values(frame.edges)) {
      edge.failedShare = edge.volume > EPS ? Math.min(1, edge.failedShare / edge.volume) : edge.failedShare > EPS ? 1 : 0;
    }

    for (const [id, f] of Object.entries(frame.nodes)) {
      perNode[id].served += f.served;
      perNode[id].failed += f.failed;
      if (f.backlog > perNode[id].peakBacklog) perNode[id].peakBacklog = f.backlog;
    }
    frames.push(frame);
  };

  steps.forEach((sent, i) => runStep(i, sent));
  const waiting = () => [...backlog.values()].reduce((sum, q) => sum + q.reduce((a, b) => a + b, 0), 0);
  for (let i = 0; i < MAX_DRAIN_STEPS && waiting() > EPS; i++) runStep(STEPS + i, 0);
  // Anything still waiting after the drain fails where it waits (the timeout keeps this rare).
  for (const s of stations.values()) {
    const left = backlog.get(s.id)!.reduce((a, b) => a + b, 0);
    if (left > EPS) {
      timedOut.set(s.nodeId, (timedOut.get(s.nodeId) ?? 0) + left);
      perNode[s.nodeId].failed += left;
    }
  }

  const label = (id: string) => byId.get(id)?.data.label ?? id;
  const failures: FailureGroup[] = [];
  for (const [nodeId, count] of [...timedOut].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (count > EPS) {
      failures.push({ nodeId, clientId: null, featureId: null, reason: "timed-out", count, text: `Timed out waiting at ${label(nodeId)}.` });
    }
  }
  const noRouteGroups = new Map<string, FailureGroup>();
  for (const [i, count] of noRoute) {
    if (count <= EPS) continue;
    const cls = graph.classes[i];
    const key = `${cls.clientId}|${cls.featureId}`;
    const group = noRouteGroups.get(key);
    if (group) group.count += count;
    else noRouteGroups.set(key, { nodeId: null, clientId: cls.clientId, featureId: cls.featureId, reason: "no-route", count, text: cls.reason! });
  }
  failures.push(...[...noRouteGroups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, g]) => g));
  if (unassigned > EPS) {
    failures.push({
      nodeId: null,
      clientId: null,
      featureId: null,
      reason: "no-route",
      count: unassigned,
      text: clients.length === 0 ? "No client is connected, so nothing sends requests." : "There are no features to request.",
    });
  }

  const tally: Tally = {
    requests: scenario.requests,
    served,
    failures,
    latency,
    perNode,
    firstSaturation,
    peak,
    readWork,
    writeWork,
    cacheInFront,
  };
  return {
    scenario,
    windowSteps: STEPS,
    dtSeconds: dt,
    frames,
    summary: buildSummary(tally, nodes, features, graph),
    graph,
  };
}
