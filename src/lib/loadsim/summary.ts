import { isClientKind, isComputeKind } from "@/lib/catalog";
import type { FeatureBlock } from "@/lib/types";
import { CAPACITY } from "./capacities";
import type { FailureGroup, FlowGraph, NodeSummary, OutageSummary, QueueSummary, SimNode, Summary } from "./types";

/** What the model counted over a run, for the summary. */
export type Tally = {
  requests: number;
  served: number;
  failures: FailureGroup[];
  /** Latency in ms (rounded to 0.1) → requests answered in that time */
  latency: Map<number, number>;
  perNode: Record<string, NodeSummary>;
  firstSaturation: { nodeId: string; atSeconds: number } | null;
  /** Read and write work at each node's busiest station in its busiest step, and that station's budget */
  peak: Record<string, { readWork: number; writeWork: number; budgetWork: number }>;
  /** Read work over the run, by node, then feature */
  readWork: Record<string, Record<string, number>>;
  writeWork: Record<string, number>;
  /** Databases some reads reach through a cache */
  cacheInFront: Set<string>;
  /** Background jobs (SPEC-loadsim-queues.md); null when no request reaches a queue */
  jobs: {
    queued: number;
    done: number;
    stillWaiting: number;
    neverDone: number;
    /** Time from queued to done in ms (rounded to 0.1) → jobs */
    latency: Map<number, number>;
    perQueue: Record<string, QueueSummary & { consumers: string[] }>;
  } | null;
  /** One per outage, in order, before its note (SPEC-loadsim-failures.md) */
  outages: (Omit<OutageSummary, "note"> & { behindBalancer: boolean; replicas: number })[];
  /** What the cascade notes need, by compute node (SPEC-loadsim-cascades.md) */
  cascades: {
    /** Requests that timed out or were too slow there, by feature */
    failedByFeature: Record<string, Record<string, number>>;
    /** Slot time (request-ms) used there, by feature */
    slotMsByFeature: Record<string, Record<string, number>>;
    /** When slots or connections first bound there, in seconds; null if never */
    firstLimit: Record<string, { slots: number | null; connections: number | null }>;
    /** The databases its requests reach directly or through a cache */
    databasesBelow: Record<string, string[]>;
    /** By feature, the slow work and external call its requests make there, in ms */
    slowParts: Record<string, Record<string, { slowMs: number; callMs: number }>>;
  };
};

/** One outage's story, by the kind of component that was off. */
function outageNote(
  o: Tally["outages"][number],
  label: (id: string) => string,
  kind: (id: string) => string,
): string {
  const name = label(o.nodeId);
  // "Sandbox workers were off", "Lab API 1 was off".
  const verb = /[^s]s$/.test(name) ? "were" : "was";
  const when = `${name} ${verb} off from ${clock(o.offAt)}${o.onAt === null ? "" : ` to ${clock(o.onAt)}`}.`;
  const names = (ids: string[]) =>
    ids.length <= 1 ? (ids[0] ?? "") : `${ids.slice(0, -1).join(", ")} and ${ids.at(-1)}`;
  const takers = names(o.takeover.map((t) => label(t.nodeId)));
  const peak = Math.max(0, ...o.takeover.map((t) => t.peakUtilisation));
  const k = kind(o.nodeId);
  if (k === "database") {
    return o.replicas >= 2
      ? `${when} Reads carried on from its replica; ${count(o.failedHere)} writes failed in the 30 s before the replica took over.`
      : `${when} It had no replica, so ${count(o.failedHere)} requests failed.`;
  }
  if (k === "cache") {
    const timedOut = o.failedElsewhere >= 0.5 ? `; ${count(o.failedElsewhere)} requests timed out there` : "";
    return `${when} Every read went to ${takers}, which peaked at ${pct(peak)}% busy${timedOut}.`;
  }
  if (k === "task_worker") {
    const waiting = Math.max(0, ...o.takeover.map((t) => t.peakWaiting));
    return `${when} ${takers} grew to ${count(waiting)} waiting; no job was lost.`;
  }
  // A compute instance.
  if (!o.behindBalancer || o.takeover.length === 0) {
    return `${when} Nothing could take its requests, so ${count(o.failedHere)} failed.`;
  }
  const timedOut = o.failedElsewhere >= 0.5 ? `, and ${count(o.failedElsewhere)} requests timed out` : "";
  return `${when} ${count(o.failedHere)} requests failed before the load balancer noticed; then ${takers} took its share and peaked at ${pct(peak)}% busy${timedOut}.`;
}

const count = (n: number) => Math.round(n).toLocaleString("en");

/** Each queue's story in one note: never done, or how its workers fell behind and caught up. */
function queueNotes(jobs: NonNullable<Tally["jobs"]>, label: (id: string) => string): string[] {
  const notes: string[] = [];
  for (const id of Object.keys(jobs.perQueue).sort()) {
    const q = jobs.perQueue[id];
    if (q.neverDone >= 0.5) {
      notes.push(`${label(id)} has no worker reading it, so ${count(q.neverDone)} jobs were never done.`);
      continue;
    }
    if (q.fellBehindAt === null || q.peakAt === null) continue;
    const workers = q.consumers.map(label);
    const who = workers.length <= 1 ? (workers[0] ?? label(id)) : `${workers.slice(0, -1).join(", ")} and ${workers.at(-1)}`;
    const end =
      q.emptyAt !== null
        ? `was empty again by ${clock(q.emptyAt)}.`
        : `${count(q.stillWaiting)} were still waiting at the end.`;
    notes.push(`${who} fell behind at ${clock(q.fellBehindAt)}. The queue peaked at ${count(q.peakBacklog)} jobs and ${end}`);
  }
  return notes;
}

/** "A", "A and B", "A, B and C" */
const listOf = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

/** 2,000 ms → "2 s", 2,500 → "2.5 s" */
const secondsOf = (ms: number) => `${Math.round(ms / 100) / 10} s`;

/**
 * One note per instance where slots or connections, not CPU, held it back for at least a
 * step (SPEC-loadsim-cascades.md): when it started, what held them, and what else failed.
 */
function cascadeNotes(
  tally: Tally,
  label: (id: string) => string,
  featureName: (id: string) => string,
  features: FeatureBlock[],
): string[] {
  const c = tally.cascades;
  const notes: string[] = [];
  const order = new Map(features.map((f, i) => [f.id, i]));
  const byOrder = (a: string, b: string) => (order.get(a) ?? 0) - (order.get(b) ?? 0) || a.localeCompare(b);
  for (const id of Object.keys(c.firstLimit).sort()) {
    const first = c.firstLimit[id];
    if (first.slots !== null) {
      const slotMs = c.slotMsByFeature[id] ?? {};
      const holder = Object.keys(slotMs).sort((a, b) => slotMs[b] - slotMs[a] || byOrder(a, b))[0];
      const parts = holder ? c.slowParts[id]?.[holder] : undefined;
      const what = [
        parts && parts.slowMs > 0 ? `${secondsOf(parts.slowMs)} of slow work` : null,
        parts && parts.callMs > 0 ? `${secondsOf(parts.callMs)} external call` : null,
      ].filter((p): p is string => p !== null);
      const start = `${label(id)} ran out of request slots at ${clock(first.slots)}`;
      const held = holder ? `${start}: ${featureName(holder)}'s ${what.length > 0 ? listOf(what) : "requests"} held them.` : `${start}.`;
      const others = Object.entries(c.failedByFeature[id] ?? {})
        .filter(([f, n]) => f !== holder && n >= 0.5)
        .map(([f]) => f)
        .sort(byOrder)
        .map(featureName);
      const too = others.length > 0 ? ` Requests for ${listOf(others)} timed out there too.` : "";
      notes.push(`${held}${too}`);
    }
    if (first.connections !== null) {
      const dbs = c.databasesBelow[id] ?? [];
      const db = [...dbs].sort(
        (a, b) => (tally.perNode[b]?.peakUtilisation ?? 0) - (tally.perNode[a]?.peakUtilisation ?? 0) || a.localeCompare(b),
      )[0];
      const busy = db ? (tally.perNode[db]?.peakUtilisation ?? 0) : 0;
      const why = !db ? "" : busy >= 1 ? `, because ${label(db)} was saturated` : `, while ${label(db)} was ${pct(busy)}% busy`;
      const timedOut = tally.failures
        .filter((f) => f.nodeId === id && f.reason === "timed-out")
        .reduce((n, f) => n + f.count, 0);
      const where = timedOut >= 0.5 ? ` ${count(timedOut)} requests timed out there, not at the database.` : "";
      notes.push(`${label(id)}'s database connections were all busy from ${clock(first.connections)}${why}.${where}`);
    }
  }
  return notes;
}

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

const pct = (ratio: number) => Math.round(ratio * 100);

function percentile(latency: Map<number, number>, p: number): number {
  const total = [...latency.values()].reduce((s, w) => s + w, 0);
  if (total <= 0) return 0;
  let seen = 0;
  for (const ms of [...latency.keys()].sort((a, b) => a - b)) {
    seen += latency.get(ms)!;
    if (seen >= p * total - 1e-9) return ms;
  }
  return 0;
}

export function buildSummary(
  tally: Tally,
  nodes: SimNode[],
  features: FeatureBlock[],
  graph: FlowGraph,
): Summary {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const label = (id: string) => byId.get(id)?.data.label ?? id;
  const kind = (id: string) => byId.get(id)?.data.componentKind ?? "";
  const featureName = (id: string) => features.find((f) => f.id === id)?.name ?? id;

  const reads = (id: string) => Object.values(tally.readWork[id] ?? {}).reduce((s, w) => s + w, 0);
  const mostlyReads = (id: string) => reads(id) > 0 && reads(id) >= (tally.writeWork[id] ?? 0);
  /** The feature whose reads make up most of a node's read work */
  const topReader = (id: string) =>
    Object.entries(tally.readWork[id] ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  const uncachedReads = (id: string) => kind(id) === "database" && !tally.cacheInFront.has(id) && mostlyReads(id);

  let firstSaturation: Summary["firstSaturation"] = null;
  if (tally.firstSaturation) {
    const { nodeId, atSeconds } = tally.firstSaturation;
    const k = kind(nodeId);
    const at = `${label(nodeId)} saturated at ${clock(atSeconds)}`;
    // An instance that ran out of slots, not CPU: more vCPUs wouldn't add any (SPEC-loadsim-cascades.md).
    const slotsAt = tally.cascades.firstLimit[nodeId]?.slots ?? null;
    const outOfSlots = slotsAt !== null && slotsAt <= atSeconds + 1e-9;
    const note =
      k === "database"
        ? uncachedReads(nodeId)
          ? `${at}: every ${featureName(topReader(nodeId)!)} read reaches it. A cache in front would take most of them.`
          : `${at}. Add shards for writes, or replicas for reads.`
        : isComputeKind(k) && outOfSlots
          ? `${at}: all ${CAPACITY.instance.slots} of its request slots are held. Move the slow work to a queue, or add instances behind a load balancer.`
          : isComputeKind(k)
            ? `${at}: its instances can't keep up. Add instances behind a load balancer, or give them more vCPUs.`
            : k === "cache"
              ? `${at}. Give it more memory, or add another cache.`
              : `${at}.`;
    firstSaturation = { nodeId, atSeconds, note };
  }

  let busiest: Summary["busiest"] = null;
  if (!firstSaturation) {
    const top = Object.entries(tally.perNode)
      // Queues and workers have their own story in the jobs notes, and an instance waiting for
      // database connections in its connection note (SPEC-loadsim-cascades.md).
      .filter(
        ([id, s]) =>
          !isClientKind(kind(id)) &&
          !["message_queue", "task_worker"].includes(kind(id)) &&
          (tally.cascades.firstLimit[id]?.connections ?? null) === null &&
          s.peakUtilisation > 0,
      )
      .sort((a, b) => b[1].peakUtilisation - a[1].peakUtilisation || a[0].localeCompare(b[0]))[0];
    if (top) {
      const [nodeId, s] = top;
      busiest = { nodeId, peakUtilisation: s.peakUtilisation, note: `${label(nodeId)} peaked at ${pct(s.peakUtilisation)}% busy.` };
    }
  }

  // A flaw that costs capacity without failures still shows: what a cache would save.
  const cacheNotes = nodes
    .map((n) => n.id)
    // A database under 1% busy has nothing for a cache to save worth saying.
    .filter((id) => uncachedReads(id) && id !== firstSaturation?.nodeId && tally.peak[id])
    .filter((id) => {
      const { readWork, writeWork, budgetWork } = tally.peak[id];
      return pct((readWork + writeWork) / budgetWork) >= 1;
    })
    .sort()
    .map((id) => {
      const { readWork, writeWork, budgetWork } = tally.peak[id];
      const now = (readWork + writeWork) / budgetWork;
      const withCache = (readWork * (1 - CAPACITY.cache.hitRatio) + writeWork) / budgetWork;
      return `${label(id)} peaked at ${pct(now)}% busy, mostly with ${featureName(topReader(id)!)} reads. A cache in front would bring it to about ${pct(withCache)}%.`;
    });

  const failed = tally.failures.reduce((s, f) => s + f.count, 0);
  const outages: OutageSummary[] = tally.outages.map((o) => ({
    nodeId: o.nodeId,
    offAt: o.offAt,
    onAt: o.onAt,
    failedHere: o.failedHere,
    failedElsewhere: o.failedElsewhere,
    takeover: o.takeover,
    note: outageNote(o, label, kind),
  }));
  const jobs: Summary["jobs"] = tally.jobs
    ? {
        queued: tally.jobs.queued,
        done: tally.jobs.done,
        stillWaiting: tally.jobs.stillWaiting,
        neverDone: tally.jobs.neverDone,
        p50Ms: percentile(tally.jobs.latency, 0.5),
        p95Ms: percentile(tally.jobs.latency, 0.95),
        perQueue: Object.fromEntries(
          Object.entries(tally.jobs.perQueue).map(([id, q]) => [
            id,
            {
              queued: q.queued,
              done: q.done,
              stillWaiting: q.stillWaiting,
              neverDone: q.neverDone,
              peakBacklog: q.peakBacklog,
              peakAt: q.peakAt,
              emptyAt: q.emptyAt,
              fellBehindAt: q.fellBehindAt,
            },
          ]),
        ),
      }
    : null;
  return {
    requests: tally.requests,
    served: tally.served,
    failed,
    failures: tally.failures,
    p50Ms: percentile(tally.latency, 0.5),
    p95Ms: percentile(tally.latency, 0.95),
    perNode: tally.perNode,
    firstSaturation,
    busiest,
    notSimulated: graph.notSimulated,
    notes: [
      ...outages.map((o) => o.note),
      ...graph.notes,
      ...cascadeNotes(tally, label, featureName, features),
      ...cacheNotes,
      ...(tally.jobs ? queueNotes(tally.jobs, label) : []),
    ],
    jobs,
    outages,
  };
}
