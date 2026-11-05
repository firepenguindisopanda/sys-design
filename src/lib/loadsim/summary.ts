import { isClientKind, isComputeKind } from "@/lib/catalog";
import type { FeatureBlock } from "@/lib/types";
import { CAPACITY } from "./capacities";
import type { FailureGroup, FlowGraph, NodeSummary, QueueSummary, SimNode, Summary } from "./types";

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
};

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
    const note =
      k === "database"
        ? uncachedReads(nodeId)
          ? `${at}: every ${featureName(topReader(nodeId)!)} read reaches it. A cache in front would take most of them.`
          : `${at}. Add shards for writes, or replicas for reads.`
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
      // Queues and workers have their own story in the jobs notes.
      .filter(([id, s]) => !isClientKind(kind(id)) && !["message_queue", "task_worker"].includes(kind(id)) && s.peakUtilisation > 0)
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
    notes: [...graph.notes, ...cacheNotes, ...(tally.jobs ? queueNotes(tally.jobs, label) : [])],
    jobs,
  };
}
