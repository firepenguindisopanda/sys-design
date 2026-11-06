import { isClientKind, isComputeKind } from "@/lib/catalog";
import { CAPACITY, computeBudgetMs, databaseBudgetMs, workerBudgetMs } from "./capacities";
import { buildFlowGraph, databaseStations } from "./graph";
import { nodeState, validateOutages, type NodeState } from "./outages";
import { STEPS, arrivals } from "./scenario";
import { buildSummary, type Tally } from "./summary";
import type { FailureGroup, Frame, Limit, LoadInput, LoadRun, NodeSummary, Op, PathStep } from "./types";

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
  /** The hop to get here, part of `baseMs` */
  hopMs: number;
  /** A compute instance: it has slots and connections (SPEC-loadsim-cascades.md) */
  compute: boolean;
  stations: { id: string; fraction: number }[];
  op: Op;
  featureId: string;
  depth: number;
  /** Part of a background job (SPEC-loadsim-queues.md) */
  job: boolean;
  /** The queue hop where a request becomes a job: the client is answered here */
  answers: boolean;
};

type Station = {
  id: string;
  /** Its place in creation order, for arrays indexed by station */
  index: number;
  nodeId: string;
  kind: string;
  budgetMs: number;
  /** Requests it can work on at once (vCPUs), for the queueing wait */
  servers: number;
  entries: { hop: number; fraction: number }[];
  /** A compute instance, with slot and connection budgets besides its CPU */
  compute?: boolean;
};

/**
 * Stations in an order where every station comes after the ones that hand it requests, so
 * a request is offered on before it's served downstream. A station processed too early
 * would let later arrivals through without using its capacity. Ties, and any cycle across
 * classes, fall back to `byRank`.
 */
function upstreamFirst(list: Station[], hops: Hop[], byRank: (a: Station, b: Station) => number): Station[] {
  // The stations a hop's requests come from: its parent's, or further up past hops with none.
  const fromStations = (index: number): string[] => {
    const parent = hops[index].parent;
    if (parent < 0) return [];
    return hops[parent].stations.length > 0 ? hops[parent].stations.map((s) => s.id) : fromStations(parent);
  };
  const feeds = new Map<string, Set<string>>(list.map((s) => [s.id, new Set<string>()]));
  hops.forEach((hop, index) => {
    for (const from of fromStations(index)) {
      for (const to of hop.stations) if (from !== to.id) feeds.get(from)!.add(to.id);
    }
  });
  const waitingOn = new Map(list.map((s) => [s.id, 0]));
  for (const targets of feeds.values()) for (const t of targets) waitingOn.set(t, waitingOn.get(t)! + 1);
  const left = [...list].sort(byRank);
  const ordered: Station[] = [];
  while (left.length > 0) {
    const i = Math.max(0, left.findIndex((s) => waitingOn.get(s.id) === 0));
    const [next] = left.splice(i, 1);
    ordered.push(next);
    for (const t of feeds.get(next.id)!) waitingOn.set(t, waitingOn.get(t)! - 1);
  }
  return ordered;
}

export function simulateLoad({ nodes, edges, features, scenario, loads, outages = [], baseline: given }: LoadInput): LoadRun {
  const invalid = validateOutages(nodes, outages);
  if (invalid) throw new Error(invalid);
  // Components with outages (SPEC-loadsim-failures.md); with none, nothing below changes.
  const outageNodes = new Set(outages.map((o) => o.nodeId));
  const graph = buildFlowGraph(nodes, edges, features, loads);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kind = (id: string) => byId.get(id)?.data.componentKind ?? "";
  const featureById = new Map(features.map((f) => [f.id, f]));
  const steps = arrivals(scenario, STEPS);
  const dt = scenario.windowSeconds / STEPS;
  const clients = nodes.filter((n) => isClientKind(n.data.componentKind));
  // Clients that send requests; receivers and off-the-model clients have no classes.
  const senders = new Set(graph.classes.map((c) => c.clientId)).size;

  // Each class's share of every request.
  const classShare = graph.classes.map((c) => {
    const load = loads[c.featureId];
    if (!load) return 0;
    const hasWrites = graph.classes.some((o) => o.clientId === c.clientId && o.featureId === c.featureId && o.op === "write");
    const opShare = !hasWrites ? 1 : c.op === "write" ? load.writeShare : 1 - load.writeShare;
    return (load.share * opShare) / senders;
  });
  // Requests no class carries: no client sends, or no features.
  const unassignedShare = senders === 0 || features.length === 0 ? 1 : 0;

  // Flatten each routed class's path into hops, and set up the stations they use.
  const hops: Hop[] = [];
  const stations = new Map<string, Station>();
  const station = (id: string, nodeId: string, budgetMs: number, servers = 1) => {
    if (!stations.has(id)) stations.set(id, { id, index: stations.size, nodeId, kind: kind(nodeId), budgetMs, servers, entries: [] });
    return stations.get(id)!;
  };
  const roots: number[] = [];
  /** Each compute hop's slow work and external call, for the cascade notes */
  const slowPartsOf = new Map<number, { slowMs: number; callMs: number }>();
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
      const job = !!step.job;
      const op = step.op ?? cls.op;
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
        hopMs,
        compute: false,
        stations: [],
        op,
        featureId: cls.featureId,
        depth,
        job,
        answers: job && (parent < 0 || !hops[parent].job),
      };
      hops.push(hop);
      if (job && config?.kind === "message_queue") {
        hop.costMs = CAPACITY.queue.costMs;
        hop.baseMs += CAPACITY.queue.enqueueMs;
        hop.stations = [{ id: step.nodeId, fraction: 1 }];
        station(step.nodeId, step.nodeId, CAPACITY.queue.budgetMs);
      } else if (job && config?.kind === "task_worker") {
        const ms = CAPACITY.worker.handlingMs + (step.slowMs ?? 0);
        hop.costMs = ms;
        hop.baseMs += ms;
        hop.stations = [{ id: step.nodeId, fraction: 1 }];
        station(step.nodeId, step.nodeId, workerBudgetMs(config.concurrency), Math.max(1, config.concurrency));
      } else if (k === "load_balancer" || k === "cdn" || k === "static_hosting") {
        // A CDN or static hosting node that requests pass through costs what a balancer does.
        hop.costMs = CAPACITY.loadBalancer.costMs;
        hop.baseMs += CAPACITY.loadBalancer.timeMs;
        hop.stations = [{ id: step.nodeId, fraction: 1 }];
        station(step.nodeId, step.nodeId, CAPACITY.loadBalancer.budgetMs);
      } else if (config && "capacity" in config) {
        // SPEC-loadsim-cascades.md: slow work done in the request takes its time, and costs
        // CPU if it's CPU work; an external call takes apiMs. Both hold the request's slot.
        const inlineMs = step.inlineSlowMs ?? 0;
        const callMs = step.callsApi ? (load?.apiMs ?? 0) : 0;
        slowPartsOf.set(index, { slowMs: inlineMs, callMs });
        hop.costMs = feature.computeMsPerRequest + (load?.slowWork === "cpu" ? inlineMs : 0);
        hop.baseMs += feature.computeMsPerRequest + inlineMs + callMs;
        hop.compute = true;
        hop.stations = [{ id: step.nodeId, fraction: 1 }];
        station(step.nodeId, step.nodeId, computeBudgetMs(config.capacity.vcpus), config.capacity.vcpus).compute = true;
      } else if (k === "cache") {
        hop.costMs = CAPACITY.cache.costMs;
        hop.baseMs += CAPACITY.cache.timeMs;
        hop.stations = [{ id: step.nodeId, fraction: 1 }];
        station(step.nodeId, step.nodeId, CAPACITY.cache.budgetMs);
      } else if (config?.kind === "database") {
        // A worker's write can be one of a batch; writes in the request never are.
        const ms = op === "write" ? load.writeDbMs / (job ? Math.max(1, load.batch) : 1) : load.readDbMs;
        hop.costMs = ms;
        hop.baseMs += ms;
        hop.stations = databaseStations(step.nodeId, config, op);
        // A database that goes off moves its writes to a replica, so its write hops need
        // an entry for every copy; only the primary's carries writes until then.
        if (op === "write" && outageNodes.has(step.nodeId) && config.replicas >= 2) {
          const shards = Math.max(1, config.shards);
          hop.stations = [];
          for (let s = 0; s < shards; s++) {
            for (let c = 0; c < config.replicas; c++) {
              hop.stations.push({ id: `${step.nodeId}#s${s}c${c}`, fraction: c === 0 ? 1 / shards : 0 });
            }
          }
        }
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

  /** Each hop's entries at its stations, so an outage can change their shares */
  const entriesOf: { entry: { hop: number; fraction: number }; stationId: string }[][] = hops.map(() => []);
  hops.forEach((hop, index) => {
    for (const s of hop.stations) {
      const entry = { hop: index, fraction: s.fraction };
      stations.get(s.id)!.entries.push(entry);
      entriesOf[index].push({ entry, stationId: s.id });
    }
  });
  const depthOf = new Map<string, number>();
  for (const hop of hops) depthOf.set(hop.nodeId, Math.max(depthOf.get(hop.nodeId) ?? 0, hop.depth));
  const byRank = (a: Station, b: Station) =>
    rankOf(kind(a.nodeId)) - rankOf(kind(b.nodeId)) ||
    (depthOf.get(a.nodeId) ?? 0) - (depthOf.get(b.nodeId) ?? 0) ||
    a.id.localeCompare(b.id);
  const order = upstreamFirst([...stations.values()], hops, byRank);
  const byDepth = hops.map((_, i) => i).sort((a, b) => hops[a].depth - hops[b].depth || a - b);

  // State carried between steps: what waits at each station, per hop.
  const backlog = new Map<string, number[]>([...stations.values()].map((s) => [s.id, s.entries.map(() => 0)]));

  // Totals for the summary.
  const perNode: Record<string, NodeSummary> = {};
  for (const n of nodes) perNode[n.id] = { peakUtilisation: 0, peakBacklog: 0, served: 0, failed: 0, firstSaturatedAt: null, failedWhileOff: 0 };
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
  /** Each station's wait this step, by station index; 0 until it's first worked out */
  const waitMs = new Float64Array(stations.size);
  // Each hop's stations as arrays, for the per-step sums.
  const stationCount = Int32Array.from(hops, (h) => h.stations.length);
  const hopStationIndex = hops.map((h) => Int32Array.from(h.stations, (st) => stations.get(st.id)!.index));
  const hopStationFraction = hops.map((h) => Float64Array.from(h.stations, (st) => st.fraction));
  /** A hop's wait: its connection wait if it has one this step, else its stations' waits */
  const hopWait = (index: number) => {
    const own = connWait.get(index);
    if (own !== undefined) return own;
    const at = hopStationIndex[index];
    const share = hopStationFraction[index];
    let sum = 0;
    for (let k = 0; k < at.length; k++) sum += share[k] * waitMs[at[k]];
    return sum;
  };

  // Background jobs (SPEC-loadsim-queues.md). A job never times out: the worker retries.
  const exemptHop = Uint8Array.from(hops, (h) => (h.job && !h.answers ? 1 : 0));
  const exempt = (index: number) => exemptHop[index] === 1;
  const isQueueHop = (h: Hop) => h.job && kind(h.nodeId) === "message_queue";
  const isWorkerHop = (h: Hop) => h.job && kind(h.nodeId) === "task_worker";
  const queueHop = Uint8Array.from(hops, (h) => (isQueueHop(h) ? 1 : 0));
  const workerHop = Uint8Array.from(hops, (h) => (isWorkerHop(h) ? 1 : 0));
  const hasJobs = hops.some((h) => h.answers);
  const queueIds = [...new Set(hops.filter(isQueueHop).map((h) => h.nodeId))].sort();
  /** The queue each worker hop takes its jobs from */
  const queueOf = (index: number) => hops[hops[index].parent].nodeId;
  const consumersOf = new Map<string, Set<string>>(queueIds.map((q) => [q, new Set<string>()]));
  hops.forEach((h, i) => {
    if (isWorkerHop(h)) consumersOf.get(queueOf(i))!.add(h.nodeId);
  });
  const perQueue = new Map(
    queueIds.map((q) => [q, { queued: 0, done: 0, neverDone: 0, waiting: [] as number[], fellBehindStep: null as number | null }]),
  );
  /**
   * First in, first out at each worker: jobs that have arrived so far, step by step, and
   * jobs taken so far. A job taken now arrived when the arrivals first reached the number
   * taken, so its wait is the time since then. Requests use the backlog's drain time, which
   * is close enough for waits capped at 5 s, but jobs can wait minutes.
   */
  const fifo = new Map<string, { arrived: number[]; taken: number }>();
  let jobsQueued = 0;
  let jobsDone = 0;
  let jobsNeverDone = 0;
  const jobLatency = new Map<number, number>();

  // Outages (SPEC-loadsim-failures.md). Shares that an outage changes are worked out again
  // each step; with no outages they stay as the paths set them, and nothing else changes.
  const fracNow = Float64Array.from(hops, (h) => h.fraction);
  const remNow = Float64Array.from(hops, (h) => h.remainder);
  /** Part of a hop's arrivals with nowhere to go this step: they fail as switched off */
  const lostShare = new Float64Array(hops.length);
  /** Balancer hops with no instance to send to this step, by the pool member to blame */
  const poolDown = new Map<number, string>();
  const downStations = new Set<string>();
  const switchedOff = new Map<string, number>();
  const behindBalancer = new Set(hops.filter((h) => h.parent >= 0 && kind(hops[h.parent].nodeId) === "load_balancer").map((h) => h.nodeId));
  const outageHops = hops.map((_, i) => i).filter((i) => outageNodes.has(hops[i].nodeId));
  const balancerHops = hops
    .map((_, i) => i)
    .filter((i) => kind(hops[i].nodeId) === "load_balancer" && hops[i].children.some((c) => outageNodes.has(hops[c].nodeId)));
  const states = new Map<string, NodeState>();

  // Request slots and database connections (SPEC-loadsim-cascades.md). A request holds a
  // slot at its instance from admission to its answer leaving, and a database request holds
  // a connection for its database time, waits included. Those waits depend on how many
  // requests the instances admit, so each step admission is solved: every instance admits
  // what its slots and connections allow, given the waits its own admission causes below
  // it. Nothing is carried from earlier steps but the backlogs, so admission can't swing.
  const instance = CAPACITY.instance;
  const isDbHop = hops.map((h) => kind(h.nodeId) === "database");
  const computeHops = hops.map((_, i) => i).filter((i) => hops[i].compute);
  /** The compute hop holding each hop's request (itself, for a compute hop); -1 if none */
  const nearestCompute = new Int32Array(hops.length);
  for (const i of byDepth) {
    nearestCompute[i] = hops[i].compute ? i : hops[i].parent >= 0 ? nearestCompute[hops[i].parent] : -1;
  }
  const ownMs = (i: number) => hops[i].baseMs - hops[i].hopMs;
  const timeoutMs = CAPACITY.timeoutSeconds * 1000;
  /** Time from the client to the end of each hop's wait, this step */
  const upTo = new Float64Array(hops.length);
  /** Each hop's wait last step, and from it the slowest way on from a hop to an answer */
  const lastWait = new Float64Array(hops.length);
  const afterMax = new Float64Array(hops.length);
  const byDepthUp = [...byDepth].reverse();
  /** Each hop's wait as predicted for this step, where the admission solve predicted it */
  const predictedWait = new Float64Array(hops.length).fill(NaN);
  const workOutAfter = () => {
    for (const i of byDepthUp) {
      let most = 0;
      for (const c of hops[i].children) {
        if (exempt(c) || !(fracNow[c] > 0)) continue;
        const wait = Number.isNaN(predictedWait[c]) ? lastWait[c] : predictedWait[c];
        most = Math.max(most, hops[c].baseMs + wait + afterMax[c]);
      }
      afterMax[i] = most;
    }
  };
  /** Each compute hop's slot and connection hold this step, in ms per request */
  const holdNow = new Float64Array(hops.length);
  const connNow = new Float64Array(hops.length);
  /** A compute hop whose requests go on to a database, so they need a connection */
  const usesDb = new Uint8Array(hops.length);
  /** Stations by number, for the solve's arrays */
  const stationList = [...stations.values()];
  const stationIndex = new Map(stationList.map((s, i) => [s.id, i]));
  /**
   * What a request admitted at a compute hop does below it: the time it spends at each
   * hop (base times, then each station's wait times `wait`), and the requests it brings to
   * each station (`arrive`, of `cost` ms each). Shares follow the paths as they are now.
   */
  type Term = { station: number; wait: number; arrive: number; cost: number; db: boolean };
  const reach: { base: number; connBase: number; terms: Term[] }[] = [];
  const buildReach = () => {
    for (const j of computeHops) {
      const r = { base: 0, connBase: 0, terms: [] as Term[] };
      let db = false;
      const walk = (h: number, share: number) => {
        for (const c of hops[h].children) {
          if (exempt(c)) continue; // a job: the client was answered at the queue
          const p = share * fracNow[c] * (1 - lostShare[c]);
          if (!(p > 0)) continue;
          const hop = hops[c];
          r.base += p * hop.baseMs;
          if (isDbHop[c]) {
            r.connBase += p * hop.baseMs;
            db = true;
          }
          hop.stations.forEach((st, k) => {
            r.terms.push({
              station: stationIndex.get(st.id)!,
              wait: p * st.fraction,
              arrive: p * entriesOf[c][k].entry.fraction,
              cost: hop.costMs,
              db: isDbHop[c],
            });
          });
          walk(c, p);
        }
      };
      walk(j, 1);
      reach[j] = r;
      usesDb[j] = db ? 1 : 0;
    }
  };
  let reachBuilt = false;
  /** The shares `reach` was built from; an outage changes them only when a state changes */
  const shareSnapshot: number[] = [];
  const sharesChanged = () => {
    let i = 0;
    let changed = false;
    const keep = (x: number) => {
      if (shareSnapshot[i] !== x) {
        shareSnapshot[i] = x;
        changed = true;
      }
      i++;
    };
    for (let h = 0; h < hops.length; h++) {
      keep(fracNow[h]);
      keep(lostShare[h]);
      for (const { entry } of entriesOf[h]) keep(entry.fraction);
    }
    return changed;
  };
  /** Requests and work that jobs brought to each station last step: the solve's estimate for this one */
  const jobArrivals = new Map<string, { count: number; work: number }>();
  /** Each compute station's admission this step: by slots, and by connections for database requests */
  const levels = new Map<string, { slot: number; conn: number }>();
  /** The levels solved last step, where the next step's solve starts */
  const lastLevels = new Map<string, { slot: number; conn: number }>();
  /** A compute hop's own wait this step, when its connections drain slower than the instance */
  const connWait = new Map<number, number>();
  const computeStations = order.filter((s) => s.compute);
  const isFront = (s: Station) => s.entries.every((e) => nearestCompute[e.hop] < 0);
  const frontStations = order.filter(isFront);
  const backStations = order.filter((s) => !isFront(s));
  const waitsNow = new Float64Array(stationList.length);
  const arriveCount = new Float64Array(stationList.length);
  const arriveWork = new Float64Array(stationList.length);
  /** Stations whose wait the solve predicted this step */
  const predicted = new Uint8Array(stationList.length);

  /** Bracketed root of an increasing function (Illinois): g(a) < 0 < g(b). */
  const rootOf = (g: (x: number) => number, a: number, ga: number, b: number, gb: number) => {
    let side = 0;
    let x = b;
    for (let i = 0; i < 100 && b - a > 1e-12; i++) {
      x = (a * gb - b * ga) / (gb - ga);
      const gx = g(x);
      if (Math.abs(gx) < 1e-12) return x;
      if (gx > 0) {
        b = x;
        gb = gx;
        if (side === 1) ga /= 2;
        side = 1;
      } else {
        a = x;
        ga = gx;
        if (side === -1) gb /= 2;
        side = -1;
      }
    }
    return x;
  };

  type Control = { id: string; cpu: number; slot: number; conn: number; items: { hop: number; q: number }[]; hasDb: boolean };

  const solveAdmission = () => {
    levels.clear();
    if (computeStations.length === 0) return;
    const sharesMoved = outageNodes.size > 0 && sharesChanged();
    if (!reachBuilt || sharesMoved) {
      buildReach();
      reachBuilt = true;
    }
    // What each instance is offered now, and what its CPU allows.
    const slotBudget = instance.slots * 1000 * dt;
    const connBudget = instance.connections * 1000 * dt;
    const controls: Control[] = [];
    const below = new Set<number>();
    for (const s of computeStations) {
      if (downStations.has(s.id)) continue;
      const queue = backlog.get(s.id)!;
      let offered = 0;
      const items: Control["items"] = [];
      s.entries.forEach((e, j) => {
        const q = queue[j] + volIn[e.hop] * e.fraction;
        offered += q * hops[e.hop].costMs;
        if (q > 0) items.push({ hop: e.hop, q });
      });
      if (items.length === 0) continue;
      const budgetStep = s.budgetMs * dt;
      const cpu = offered <= budgetStep + EPS ? 1 : budgetStep / offered;
      for (const it of items) for (const t of reach[it.hop].terms) below.add(t.station);
      controls.push({ id: s.id, cpu, slot: 1, conn: 1, items, hasDb: items.some((it) => usesDb[it.hop] === 1) });
    }
    // Each station below: what already waits there, and the jobs expected this step.
    const downstream = [...below].map((index) => {
      const st = stationList[index];
      const queue = backlog.get(st.id)!;
      let work = 0;
      let count = 0;
      let requestWork = 0;
      st.entries.forEach((e, j) => {
        work += queue[j] * hops[e.hop].costMs;
        count += queue[j];
        if (!exempt(e.hop)) requestWork += queue[j] * hops[e.hop].costMs;
      });
      const jobs = jobArrivals.get(st.id) ?? { count: 0, work: 0 };
      return { index, st, work, count, requestWork, jobs, down: downStations.has(st.id) };
    });
    // The wait each station below would have, for what the instances admit: the same
    // arithmetic its own turn does (served, given up on, then backlog plus queueing).
    const evaluate = () => {
      for (const d of downstream) {
        arriveCount[d.index] = 0;
        arriveWork[d.index] = 0;
      }
      for (const c of controls) {
        for (const it of c.items) {
          const admitted = it.q * Math.min(c.cpu, c.slot, usesDb[it.hop] ? c.conn : 1);
          for (const t of reach[it.hop].terms) {
            arriveCount[t.station] += admitted * t.arrive;
            arriveWork[t.station] += admitted * t.arrive * t.cost;
          }
        }
      }
      for (const d of downstream) {
        if (d.down) {
          waitsNow[d.index] = 0;
          continue;
        }
        const budgetMs = d.st.budgetMs;
        const budgetStep = budgetMs * dt;
        const arriving = arriveWork[d.index] + d.jobs.work;
        const total = d.work + arriving;
        const present = d.count + arriveCount[d.index] + d.jobs.count;
        const serve = total <= budgetStep + EPS ? 1 : budgetStep / total;
        const servedWork = total * serve;
        let left = total - servedWork;
        const requestLeft = (d.requestWork + arriveWork[d.index]) * (1 - serve);
        const most = budgetMs * CAPACITY.timeoutSeconds;
        if (left > most * (1 + EPS) + EPS && requestLeft > EPS) left -= Math.min(1, (left - most) / requestLeft) * requestLeft;
        const busy = Math.max(arriving, servedWork) / budgetStep;
        const meanService = present > EPS ? total / present : 0;
        waitsNow[d.index] = (left / budgetMs) * 1000 + queueingFactor(busy, d.st.servers) * meanService;
      }
    };
    const holdOf = (hop: number) => {
      const r = reach[hop];
      let h = ownMs(hop) + r.base;
      for (const t of r.terms) h += t.wait * waitsNow[t.station];
      return h;
    };
    const connOf = (hop: number) => {
      const r = reach[hop];
      let h = r.connBase;
      for (const t of r.terms) if (t.db) h += t.wait * waitsNow[t.station];
      return h;
    };
    /** What an instance's slots and connections allow, at the waits evaluated last. */
    const allowed = (c: Control) => {
      let others = 0; // slot time of requests that don't use the database
      let dbSlots = 0;
      let dbConns = 0;
      for (const it of c.items) {
        const h = it.q * holdOf(it.hop);
        if (usesDb[it.hop]) {
          dbSlots += h;
          dbConns += it.q * connOf(it.hop);
        } else others += h;
      }
      // Connections: database requests, each admitted up to what CPU and slots allow.
      const conn = dbConns * Math.min(c.cpu, c.slot) <= connBudget + EPS ? 1 : connBudget / dbConns;
      // Slots: every request, database requests capped by their connections too.
      const capOthers = c.cpu;
      const capDb = Math.min(c.cpu, c.conn);
      let slot = 1;
      if (others * capOthers + dbSlots * capDb > slotBudget + EPS) {
        const low = Math.min(capOthers, capDb);
        if ((others + dbSlots) * low >= slotBudget) slot = slotBudget / (others + dbSlots);
        else {
          const [fixed, rest] = low === capDb ? [dbSlots * capDb, others] : [others * capOthers, dbSlots];
          slot = rest > 0 ? (slotBudget - fixed) / rest : 1;
        }
      }
      return { slot, conn };
    };

    evaluate();
    const binds = controls.some((c) => {
      const a = allowed(c);
      return a.slot < 1 || a.conn < 1;
    });
    if (binds) {
      // Solve each level in turn, given the others, until none moves. Levels change little
      // from step to step, so start from last step's.
      const coords: [Control, "slot" | "conn"][] = [];
      for (const c of controls) {
        const last = lastLevels.get(c.id);
        if (last) {
          c.slot = last.slot;
          c.conn = last.conn;
        }
        coords.push([c, "slot"]);
        if (c.hasDb) coords.push([c, "conn"]);
      }
      for (let sweep = 0; sweep < 100; sweep++) {
        let moved = 0;
        for (const [c, field] of coords) {
          const before = c[field];
          const g = (x: number) => {
            c[field] = x;
            evaluate();
            return x - allowed(c)[field];
          };
          // g rises with slope at least 1 (admitting more only lengthens the waits that
          // set what's allowed), so the root is within |g| of where it's evaluated. Bracket
          // it there, widening if it isn't, up to the bounds 0 and 1.
          const at = g(before);
          let x = before;
          if (at > 1e-12) {
            let hi = before;
            let gHi = at;
            let step = at;
            for (;;) {
              const lo = Math.max(0, hi - step * (1 + 1e-6));
              const gLo = g(lo);
              if (gLo < 0) {
                x = rootOf(g, lo, gLo, hi, gHi);
                break;
              }
              if (lo === 0) {
                x = 0;
                break;
              }
              hi = lo;
              gHi = gLo;
              step *= 4;
            }
          } else if (at < -1e-12) {
            let lo = before;
            let gLo = at;
            let step = -at;
            for (;;) {
              const hi = Math.min(1, lo + step * (1 + 1e-6));
              const gHi = g(hi);
              if (gHi > 0) {
                x = rootOf(g, lo, gLo, hi, gHi);
                break;
              }
              if (hi === 1) {
                x = 1;
                break;
              }
              lo = hi;
              gLo = gHi;
              step *= 4;
            }
          }
          c[field] = x;
          moved = Math.max(moved, Math.abs(x - before));
        }
        if (moved < 1e-9) break;
      }
      evaluate();
    }
    for (const c of controls) {
      levels.set(c.id, { slot: c.slot, conn: c.conn });
      lastLevels.set(c.id, { slot: c.slot, conn: c.conn });
    }
    for (const j of computeHops) {
      holdNow[j] = holdOf(j);
      connNow[j] = usesDb[j] ? connOf(j) : 0;
    }
    // This step's predicted waits below the instances, for how long their requests can wait.
    predicted.fill(0);
    for (const d of downstream) predicted[d.index] = 1;
    predictedWait.fill(NaN);
    for (let i = 0; i < hops.length; i++) {
      const at = hopStationIndex[i];
      if (at.length === 0) continue;
      const share = hopStationFraction[i];
      let sum = 0;
      let all = true;
      for (let k = 0; k < at.length && all; k++) {
        all = predicted[at[k]] === 1;
        sum += share[k] * waitsNow[at[k]];
      }
      if (all) predictedWait[i] = sum;
    }
    workOutAfter();
  };
  // For the cascade notes.
  const failedByFeature: Tally["cascades"]["failedByFeature"] = {};
  const slotMsByFeature: Tally["cascades"]["slotMsByFeature"] = {};
  const firstLimit: Tally["cascades"]["firstLimit"] = {};
  const countFor = (map: Record<string, Record<string, number>>, nodeId: string, featureId: string, n: number) => {
    map[nodeId] ??= {};
    map[nodeId][featureId] = (map[nodeId][featureId] ?? 0) + n;
  };
  const tooSlow = new Map<string, number>();

  const applyOutages = (stepIndex: number) => {
    if (outageNodes.size === 0) return;
    const t = stepIndex * dt;
    for (const id of outageNodes) states.set(id, nodeState(outages, byId.get(id)!, t));
    downStations.clear();
    poolDown.clear();
    // A balancer splits evenly over the instances it still sends to.
    for (const index of balancerHops) {
      const children = hops[index].children;
      const live = children.filter((c) => !isComputeKind(kind(hops[c].nodeId)) || (states.get(hops[c].nodeId)?.routable ?? true));
      for (const c of children) fracNow[c] = live.includes(c) ? 1 / live.length : 0;
      if (live.length === 0 && children.length > 0) poolDown.set(index, hops[children[0]].nodeId);
    }
    for (const index of outageHops) {
      const hop = hops[index];
      const state = states.get(hop.nodeId)!;
      const k = kind(hop.nodeId);
      const config = byId.get(hop.nodeId)!.data.config;
      if (isComputeKind(k) || k === "task_worker") {
        if (state.down) downStations.add(hop.nodeId);
      } else if (k === "cache") {
        // A cache answers its hit ratio; the rest go on to the database.
        remNow[index] = state.hitRatio;
        const misses = hop.children.length;
        for (const c of hop.children) fracNow[c] = misses > 0 ? (1 - state.hitRatio) / misses : 0;
        if (state.down) downStations.add(hop.nodeId);
      } else if (config.kind === "database") {
        const shards = Math.max(1, config.shards);
        const copies = Math.max(1, config.replicas);
        const copyOf = (stationId: string) => Number(/c(\d+)$/.exec(stationId)![1]);
        if (state.downCopy !== null) {
          for (let s = 0; s < shards; s++) downStations.add(`${hop.nodeId}#s${s}c${state.downCopy}`);
        }
        lostShare[index] = 0;
        if (hop.op === "write") {
          // Writes go to the primary; while it's off with no replica in charge yet, a
          // request's write has nowhere to go, but a worker's waits for it.
          if (state.writesFail && !hop.job) lostShare[index] = 1;
          for (const { entry, stationId } of entriesOf[index]) {
            entry.fraction = lostShare[index] === 1 ? 0 : copyOf(stationId) === state.primaryCopy ? 1 / shards : 0;
          }
        } else {
          const up = copies - (state.downCopy === null ? 0 : 1);
          if (up === 0) lostShare[index] = 1;
          for (const { entry, stationId } of entriesOf[index]) {
            entry.fraction = up === 0 || copyOf(stationId) === state.downCopy ? 0 : 1 / (shards * up);
          }
        }
      }
    }
  };

  /** Switched-off failures per node, by step, for each outage's summary */
  const offByStep = new Map<string, number[]>();
  let currentStep = 0;
  /** Requests that fail because a component is off */
  const loseToOutage = (nodeId: string, count: number, hopIndex: number, frame: Frame) => {
    if (count <= EPS) return;
    switchedOff.set(nodeId, (switchedOff.get(nodeId) ?? 0) + count);
    const series = offByStep.get(nodeId) ?? [];
    series[currentStep] = (series[currentStep] ?? 0) + count;
    offByStep.set(nodeId, series);
    failedAt[hopIndex] += count;
    frame.nodes[nodeId].failed += count;
    perNode[nodeId].failedWhileOff += count;
  };

  const runStep = (stepIndex: number, sent: number) => {
    volIn.fill(0);
    servedOut.fill(0);
    failedAt.fill(0);
    stationsLeft.set(stationCount);
    const frame: Frame = { nodes: {}, edges: {} };
    for (const n of nodes) frame.nodes[n.id] = { arrivals: 0, served: 0, failed: 0, backlog: 0, utilisation: 0 };
    currentStep = stepIndex;
    applyOutages(stepIndex);
    connWait.clear();
    workOutAfter();
    for (const [id, state] of states) {
      if (state.down) frame.nodes[id].off = behindBalancer.has(id) && state.routable ? "routed" : "noticed";
    }

    // Hand a hop's served requests on to its children once all its stations are done.
    const finish = (index: number) => {
      const hop = hops[index];
      upTo[index] = (hop.parent >= 0 ? upTo[hop.parent] : 0) + hop.baseMs + hopWait(index);
      const blamed = poolDown.get(index);
      if (blamed) loseToOutage(blamed, servedOut[index], index, frame);
      for (const child of hops[index].children) {
        volIn[child] = servedOut[index] * fracNow[child];
        if (lostShare[child] > 0) loseToOutage(hops[child].nodeId, volIn[child] * lostShare[child], child, frame);
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
    const processStation = (s: Station) => {
      const queue = backlog.get(s.id)!;
      // A component that's off serves nothing; a cache that's off just passes reads on.
      const isDown = downStations.has(s.id);
      const budgetStep = isDown ? (s.kind === "cache" ? Infinity : 0) : s.budgetMs * dt;
      let offered = 0;
      let arrivingWork = 0;
      let arrivingRead = 0;
      let present = 0;
      // A compute instance's slot and connection time, in request-ms (SPEC-loadsim-cascades.md).
      let slotArriving = 0;
      let connArriving = 0;
      // Jobs arriving: the next step's admission solve expects as many.
      let jobCount = 0;
      let jobWork = 0;
      s.entries.forEach((e, j) => {
        const hop = hops[e.hop];
        const arriving = volIn[e.hop] * e.fraction;
        queue[j] += arriving;
        present += queue[j];
        offered += queue[j] * hop.costMs;
        arrivingWork += arriving * hop.costMs;
        if (s.compute) {
          slotArriving += arriving * holdNow[e.hop];
          connArriving += arriving * connNow[e.hop];
        }
        if (exempt(e.hop)) {
          jobCount += arriving;
          jobWork += arriving * hop.costMs;
        }
        if (hop.op === "read") arrivingRead += arriving * hop.costMs;
        if (s.kind === "database") {
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
      if (jobCount > 0) jobArrivals.set(s.id, { count: jobCount, work: jobWork });
      else jobArrivals.delete(s.id);

      const serve = offered <= budgetStep + EPS ? 1 : budgetStep / offered;
      // At an instance, the solved admission: slots limit every request, connections only
      // database requests. Whichever is lowest is the limit that binds.
      const level = s.compute && !isDown ? levels.get(s.id) : undefined;
      const slotLevel = level?.slot ?? 1;
      const connLevel = level?.conn ?? 1;
      const uniform = slotLevel >= 1 && connLevel >= 1;
      const serveOf = (hop: number) => (uniform ? serve : Math.min(serve, slotLevel, usesDb[hop] ? connLevel : 1));
      let limit: Limit | undefined = serve < 1 ? "cpu" : undefined;
      if (slotLevel < Math.min(1, serve)) limit = "slots";
      if (connLevel < Math.min(1, serve, slotLevel)) limit = "connections";
      const slotBudget = instance.slots * 1000 * dt;
      const connBudget = instance.connections * 1000 * dt;
      let servedWork = uniform ? offered * serve : 0;
      let remaining = 0;
      let slotRemaining = 0;
      let connRemaining = 0;
      let slotServed = 0;
      let connServed = 0;
      s.entries.forEach((e, j) => {
        const out = queue[j] * serveOf(e.hop);
        if (!uniform) servedWork += out * hops[e.hop].costMs;
        queue[j] -= out;
        servedOut[e.hop] += out;
        frame.nodes[s.nodeId].served += out;
        remaining += queue[j] * hops[e.hop].costMs;
        if (s.compute) {
          slotRemaining += queue[j] * holdNow[e.hop];
          connRemaining += queue[j] * connNow[e.hop];
          slotServed += out * holdNow[e.hop];
          connServed += out * connNow[e.hop];
          countFor(slotMsByFeature, s.nodeId, hops[e.hop].featureId, out * holdNow[e.hop]);
        }
      });
      if (limit && !isDown) {
        frame.nodes[s.nodeId].limit = limit;
        if (limit !== "cpu") {
          const first = (firstLimit[s.nodeId] ??= { slots: null, connections: null });
          first[limit] ??= stepIndex * dt;
        }
      }
      // Requests at a component that's off fail, those waiting when it went off too; jobs
      // wait for it to come back.
      if (isDown && budgetStep === 0) {
        s.entries.forEach((e, j) => {
          if (exempt(e.hop) || queue[j] <= 0) return;
          remaining -= queue[j] * hops[e.hop].costMs;
          slotRemaining -= queue[j] * holdNow[e.hop];
          connRemaining -= queue[j] * connNow[e.hop];
          loseToOutage(s.nodeId, queue[j], e.hop, frame);
          queue[j] = 0;
        });
      }
      // Demand against capacity: what arrived, or what was served while a backlog drains.
      // Work already waiting isn't counted again, so an overloaded node reads 130%, not 400%.
      const cpuUtilisation = budgetStep > 0 ? Math.max(arrivingWork, servedWork) / budgetStep : 0;
      // An instance is as busy as its busiest budget, so slots in use show on the gauge.
      const utilisation =
        s.compute && budgetStep > 0
          ? Math.max(
              cpuUtilisation,
              Math.max(slotArriving, slotServed) / slotBudget,
              Math.max(connArriving, connServed) / connBudget,
            )
          : cpuUtilisation;

      // Wait here: the backlog's own (seconds, once saturated) plus queueing, which grows
      // with how busy the CPU is, in units of its average time per request.
      const meanServiceMs = present > EPS ? offered / present : 0;
      const queueingMs = queueingFactor(cpuUtilisation, s.servers) * meanServiceMs;

      // The client gives up once its answer would take over the timeout (amended in Task 4,
      // SPEC-loadsim-cascades.md): a request waits here at most what's left of the 5 s after
      // the time it took to get here, its work here and its slowest way on to an answer.
      // Several kinds of request share the backlog, so it holds no more than the least
      // patient of them allows, and every request served still answers in time. A request
      // waits behind every job in front of it, but only requests are given up on. At an
      // instance the same holds for its slot and connection time.
      /** The longest this station's waiting requests (those `which` picks) can wait, in ms */
      const patience = (which: (hop: number) => boolean) => {
        let least = Infinity;
        s.entries.forEach((e, j) => {
          if (exempt(e.hop) || !which(e.hop) || !(queue[j] > EPS)) return;
          const hop = hops[e.hop];
          const before = (hop.parent >= 0 ? upTo[hop.parent] : 0) + hop.baseMs;
          least = Math.min(least, timeoutMs - before - afterMax[e.hop]);
        });
        return Math.max(0, least - queueingMs);
      };
      /** The share of the waiting requests (those `which` picks) to give up on so `left` fits in `most` */
      const dropFor = (left: number, most: number, cost: (hop: number) => number, which: (hop: number) => boolean) => {
        if (!(left > most * (1 + EPS) + EPS)) return 0;
        let requestWork = 0;
        s.entries.forEach((e, j) => {
          if (!exempt(e.hop) && which(e.hop)) requestWork += queue[j] * cost(e.hop);
        });
        return requestWork > EPS ? Math.min(1, (left - most) / requestWork) : 0;
      };
      const giveUp = (drop: number, which: (hop: number) => boolean) => {
        if (!(drop > 0)) return;
        s.entries.forEach((e, j) => {
          if (exempt(e.hop) || !which(e.hop)) return;
          const lost = queue[j] * drop;
          queue[j] -= lost;
          remaining -= lost * hops[e.hop].costMs;
          slotRemaining -= lost * holdNow[e.hop];
          connRemaining -= lost * connNow[e.hop];
          failedAt[e.hop] += lost;
          frame.nodes[s.nodeId].failed += lost;
          timedOut.set(s.nodeId, (timedOut.get(s.nodeId) ?? 0) + lost);
          if (s.compute) countFor(failedByFeature, s.nodeId, hops[e.hop].featureId, lost);
        });
      };
      const every = () => true;
      const waitAll = patience(every);
      if (waitAll < Infinity) {
        let drop = dropFor(remaining, (s.budgetMs * waitAll) / 1000, (h) => hops[h].costMs, every);
        if (s.compute) {
          drop = Math.max(drop, dropFor(slotRemaining, (instance.slots * 1000 * waitAll) / 1000, (h) => holdNow[h], every));
        }
        giveUp(drop, every);
      }
      // Database requests also wait for a connection, as long as they can.
      if (s.compute) {
        const dbOnly = (h: number) => usesDb[h] === 1;
        const waitDb = patience(dbOnly);
        if (waitDb < Infinity) {
          giveUp(dropFor(connRemaining, (instance.connections * 1000 * waitDb) / 1000, (h) => connNow[h], dbOnly), dbOnly);
        }
      }
      if (s.kind === "task_worker") {
        const f = fifo.get(s.id) ?? { arrived: [], taken: 0 };
        fifo.set(s.id, f);
        let arrivedNow = 0;
        let takenNow = 0;
        s.entries.forEach((e) => {
          arrivedNow += volIn[e.hop] * e.fraction;
          takenNow += servedOut[e.hop];
        });
        f.arrived.push((f.arrived.at(-1) ?? 0) + arrivedNow);
        f.taken += takenNow;
        // The first step whose arrivals reach what's been taken: binary search.
        let lo = 0;
        let hi = f.arrived.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (f.arrived[mid] >= f.taken - EPS) hi = mid;
          else lo = mid + 1;
        }
        waitMs[s.index] = Math.max((f.arrived.length - 1 - lo) * dt * 1000, queueingMs);
      } else if (s.compute) {
        // Every request waits for CPU and a slot; a database request may wait longer, for a
        // connection.
        const drainSeconds = Math.max(remaining / s.budgetMs, slotRemaining / (instance.slots * 1000));
        waitMs[s.index] = drainSeconds * 1000 + queueingMs;
        const connSeconds = connRemaining / (instance.connections * 1000);
        if (connSeconds > drainSeconds) {
          for (const e of s.entries) if (usesDb[e.hop]) connWait.set(e.hop, connSeconds * 1000 + queueingMs);
        }
      } else {
        waitMs[s.index] = (remaining / s.budgetMs) * 1000 + queueingMs;
      }
      const nodeFrame = frame.nodes[s.nodeId];
      const isWorker = s.kind === "task_worker";
      if (isWorker) {
        // Jobs wait for a worker on the queue they came from, so that's where they show.
        s.entries.forEach((e, j) => (frame.nodes[queueOf(e.hop)].backlog += queue[j]));
      } else {
        nodeFrame.backlog += queue.reduce((sum, q) => sum + q, 0);
      }
      if (utilisation > nodeFrame.utilisation) nodeFrame.utilisation = utilisation;
      const summary = perNode[s.nodeId];
      if (utilisation > summary.peakUtilisation) summary.peakUtilisation = utilisation;
      if (arrivingWork > (peak[s.nodeId] ? peak[s.nodeId].readWork + peak[s.nodeId].writeWork : 0)) {
        peak[s.nodeId] = { readWork: arrivingRead, writeWork: arrivingWork - arrivingRead, budgetWork: budgetStep };
      }
      if (offered > EPS && utilisation >= 1 - EPS) {
        summary.firstSaturatedAt ??= stepIndex * dt;
        // A worker running flat out is what a queue is for, so it's never the headline.
        // Nor is an instance waiting for database connections: the database is the cause,
        // and the instance's connection note tells its side (SPEC-loadsim-cascades.md).
        const headline = !isWorker && s.kind !== "message_queue" && limit !== "connections";
        if (headline && !firstSaturation && (saturatedNow === null || s.nodeId < saturatedNow)) saturatedNow = s.nodeId;
        if (isWorker) {
          for (const e of s.entries) {
            const q = perQueue.get(queueOf(e.hop))!;
            q.fellBehindStep ??= stepIndex;
          }
        }
      }

      for (const e of s.entries) {
        if (--stationsLeft[e.hop] === 0) finish(e.hop);
      }
    };
    // Balancers and CDNs hand on their requests first; then the instances' admission is
    // solved together (SPEC-loadsim-cascades.md); then every station from the instances on.
    for (const s of frontStations) processStation(s);
    solveAdmission();
    for (const s of backStations) processStation(s);
    if (!firstSaturation && saturatedNow) firstSaturation = { nodeId: saturatedNow, atSeconds: stepIndex * dt };

    // Latency of what was answered this step: each hop's base time plus its wait now. A
    // request handed to a queue is answered there; its job's time starts from that point.
    const cumulative = new Float64Array(hops.length);
    const jobTime = new Float64Array(hops.length);
    const record = (map: Map<number, number>, ms: number, count: number) => {
      const key = Math.round(ms * 10) / 10;
      map.set(key, (map.get(key) ?? 0) + count);
    };
    // An answer that took over the timeout overall is given up on (SPEC-loadsim-cascades.md),
    // counted against the instance holding the request.
    const answer = (index: number, count: number) => {
      // A backlog capped at what's left of the timeout answers at exactly 5 s: allow rounding.
      if (cumulative[index] <= timeoutMs + 1e-6) {
        record(latency, cumulative[index], count);
        served += count;
        return;
      }
      const holder = nearestCompute[index] >= 0 ? nearestCompute[index] : index;
      const nodeId = hops[holder].nodeId;
      tooSlow.set(nodeId, (tooSlow.get(nodeId) ?? 0) + count);
      failedAt[holder] += count;
      frame.nodes[nodeId].failed += count;
      if (hops[holder].compute) countFor(failedByFeature, nodeId, hops[holder].featureId, count);
    };
    for (const index of byDepth) {
      const hop = hops[index];
      const wait = hopWait(index);
      lastWait[index] = wait;
      cumulative[index] = (hop.parent >= 0 ? cumulative[hop.parent] : 0) + hop.baseMs + wait;
      if (!hop.job) {
        const answered = servedOut[index] * remNow[index];
        if (answered > EPS) answer(index, answered);
      } else {
        const out = servedOut[index];
        if (hop.answers) {
          if (out > EPS) answer(index, out);
          jobsQueued += out;
          jobTime[index] = 0;
        } else {
          jobTime[index] = jobTime[hop.parent] + hop.baseMs + wait;
        }
        if (queueHop[index]) {
          const q = perQueue.get(hop.nodeId)!;
          q.queued += out;
          if (hop.children.length === 0) {
            q.neverDone += out;
            jobsNeverDone += out;
          }
        } else {
          if (workerHop[index]) perQueue.get(queueOf(index))!.done += out;
          const finished = out * remNow[index];
          if (finished > EPS) {
            jobsDone += finished;
            record(jobLatency, jobTime[index], finished);
          }
        }
      }
    }
    // Edges after every answer, so a too-slow failure shows on the edge into its instance.
    for (const index of byDepth) {
      const hop = hops[index];
      if (hop.edgeId) {
        const edge = (frame.edges[hop.edgeId] ??= { volume: 0, failedShare: 0 });
        // Into a worker: the jobs it takes, so a growing backlog shows as more dots into
        // the queue than out of it. Everywhere else: what arrives.
        edge.volume += workerHop[index] ? servedOut[index] : volIn[index];
        edge.failedShare += failedAt[index]; // a count for now; made a share below
      }
    }
    // Jobs nobody will ever take stay on their queue.
    for (const [id, q] of perQueue) {
      frame.nodes[id].backlog += q.neverDone;
      q.waiting.push(frame.nodes[id].backlog);
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
  /** What still waits anywhere: requests, or jobs */
  const waiting = (jobs: boolean) => {
    let sum = 0;
    for (const s of stations.values()) {
      const queue = backlog.get(s.id)!;
      s.entries.forEach((e, j) => {
        if (exempt(e.hop) === jobs) sum += queue[j];
      });
    }
    return sum;
  };
  // Drain: requests until they clear, as before; jobs for at most one more window.
  for (let i = 0; ; i++) {
    const requests = i < MAX_DRAIN_STEPS && waiting(false) > EPS;
    const jobs = i < STEPS && waiting(true) > EPS;
    if (!requests && !jobs) break;
    runStep(STEPS + i, 0);
  }
  // A request still waiting then fails where it waits (the timeout keeps this rare); a job
  // still waiting is counted as still waiting.
  let jobsStillWaiting = 0;
  const stillWaitingAt = new Map<string, number>();
  for (const s of stations.values()) {
    const queue = backlog.get(s.id)!;
    let left = 0;
    s.entries.forEach((e, j) => {
      if (!exempt(e.hop)) {
        left += queue[j];
        if (s.compute && queue[j] > EPS) countFor(failedByFeature, s.nodeId, hops[e.hop].featureId, queue[j]);
      } else if (queue[j] > EPS) {
        jobsStillWaiting += queue[j];
        // Waiting for a worker counts on that worker's queue. A job waiting at a later
        // stage's queue or a database was already done by an earlier queue's workers.
        if (isWorkerHop(hops[e.hop])) {
          const q = queueOf(e.hop);
          stillWaitingAt.set(q, (stillWaitingAt.get(q) ?? 0) + queue[j]);
        }
      }
    });
    if (left > EPS) {
      timedOut.set(s.nodeId, (timedOut.get(s.nodeId) ?? 0) + left);
      perNode[s.nodeId].failed += left;
    }
  }

  const jobs: Tally["jobs"] = hasJobs
    ? {
        queued: jobsQueued,
        done: jobsDone,
        stillWaiting: jobsStillWaiting,
        neverDone: jobsNeverDone,
        latency: jobLatency,
        perQueue: Object.fromEntries(
          [...perQueue].map(([id, q]) => {
            const peakBacklog = Math.max(0, ...q.waiting);
            const peakStep = peakBacklog > 0.5 ? q.waiting.indexOf(peakBacklog) : -1;
            const emptyStep = peakStep < 0 ? -1 : q.waiting.findIndex((w, i) => i > peakStep && w < 0.5);
            return [
              id,
              {
                queued: q.queued,
                done: q.done,
                stillWaiting: stillWaitingAt.get(id) ?? 0,
                neverDone: q.neverDone,
                peakBacklog,
                peakAt: peakStep < 0 ? null : peakStep * dt,
                emptyAt: emptyStep < 0 ? null : emptyStep * dt,
                fellBehindAt: q.fellBehindStep === null ? null : q.fellBehindStep * dt,
                consumers: [...consumersOf.get(id)!].sort(),
              },
            ];
          }),
        ),
      }
    : null;

  const label = (id: string) => byId.get(id)?.data.label ?? id;
  const failures: FailureGroup[] = [];
  for (const [nodeId, count] of [...timedOut].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (count > EPS) {
      failures.push({ nodeId, clientId: null, featureId: null, reason: "timed-out", count, text: `Timed out waiting at ${label(nodeId)}.` });
    }
  }
  for (const [nodeId, count] of [...tooSlow].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (count > EPS) {
      failures.push({
        nodeId,
        clientId: null,
        featureId: null,
        reason: "too-slow",
        count,
        text: `Gave up on ${label(nodeId)}: answers took over ${CAPACITY.timeoutSeconds} s.`,
      });
    }
  }
  for (const [nodeId, count] of [...switchedOff].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (count > EPS) {
      failures.push({ nodeId, clientId: null, featureId: null, reason: "switched-off", count, text: `Failed at ${label(nodeId)} while it was off.` });
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
      text:
        clients.length === 0
          ? "No client is connected, so nothing sends requests."
          : features.length === 0
            ? "There are no features to request."
            : "No client sends requests: they only receive pushes or talk to parts not simulated yet.",
    });
  }

  // Each outage's story: what it lost, what it cost elsewhere against a run without
  // outages, and what took its place.
  let outageRecords: Tally["outages"] = [];
  if (outages.length > 0) {
    const baseline = given ?? simulateLoad({ nodes, edges, features, scenario, loads });
    const stepOf = (seconds: number) => Math.min(frames.length, Math.max(0, Math.round(seconds / dt)));
    const peakOf = (id: string, from: number, to: number) => {
      let utilisation = 0;
      let waiting = 0;
      for (let i = from; i < to; i++) {
        const f = frames[i].nodes[id];
        if (f.utilisation > utilisation) utilisation = f.utilisation;
        if (f.backlog > waiting) waiting = f.backlog;
      }
      return { nodeId: id, peakUtilisation: utilisation, peakWaiting: waiting };
    };
    const unique = (ids: string[]) => [...new Set(ids)].sort();
    outageRecords = [...outages]
      .sort((a, b) => a.offAt - b.offAt || a.nodeId.localeCompare(b.nodeId))
      .map((o) => {
        const from = stepOf(o.offAt);
        const to = o.onAt === null ? frames.length : stepOf(o.onAt);
        let failedHere = 0;
        let elsewhere = 0;
        for (let i = from; i < to; i++) {
          failedHere += offByStep.get(o.nodeId)?.[i] ?? 0;
          for (const n of nodes) {
            if (n.id === o.nodeId) continue;
            const timedOutThere = frames[i].nodes[n.id].failed - (offByStep.get(n.id)?.[i] ?? 0);
            elsewhere += timedOutThere - (baseline.frames[i]?.nodes[n.id].failed ?? 0);
          }
        }
        const k = kind(o.nodeId);
        const takeoverIds = isComputeKind(k)
          ? (graph.pools.find((pool) => pool.includes(o.nodeId)) ?? []).filter((id) => id !== o.nodeId)
          : k === "cache"
            ? unique(hops.filter((h) => h.parent >= 0 && hops[h.parent].nodeId === o.nodeId).map((h) => h.nodeId))
            : k === "database"
              ? [o.nodeId]
              : unique(hops.filter((h) => h.nodeId === o.nodeId && isWorkerHop(h)).map((h) => hops[h.parent].nodeId));
        const config = byId.get(o.nodeId)!.data.config;
        return {
          nodeId: o.nodeId,
          offAt: o.offAt,
          onAt: o.onAt,
          failedHere,
          failedElsewhere: Math.max(0, elsewhere),
          takeover: takeoverIds.map((id) => peakOf(id, from, to)),
          behindBalancer: behindBalancer.has(o.nodeId),
          replicas: config.kind === "database" ? config.replicas : 0,
        };
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
    jobs,
    outages: outageRecords,
    cascades: {
      failedByFeature,
      slotMsByFeature,
      firstLimit,
      databasesBelow: Object.fromEntries(
        [...new Set(computeHops.map((i) => hops[i].nodeId))].sort().map((id) => {
          const dbs = new Set<string>();
          const walk = (i: number) => {
            for (const child of hops[i].children) {
              if (exempt(child)) continue;
              if (isDbHop[child]) dbs.add(hops[child].nodeId);
              walk(child);
            }
          };
          computeHops.filter((i) => hops[i].nodeId === id).forEach(walk);
          return [id, [...dbs].sort()];
        }),
      ),
      slowParts: computeHops.reduce<Tally["cascades"]["slowParts"]>((parts, i) => {
        const hop = hops[i];
        const step = slowPartsOf.get(i)!;
        (parts[hop.nodeId] ??= {})[hop.featureId] = step;
        return parts;
      }, {}),
    },
  };
  return {
    scenario,
    windowSteps: STEPS,
    dtSeconds: dt,
    frames,
    summary: buildSummary(tally, nodes, features, graph),
    graph,
    workerSlots: Object.fromEntries(
      nodes.flatMap((n) => (n.data.config.kind === "task_worker" ? [[n.id, Math.max(1, n.data.config.concurrency)]] : [])),
    ),
  };
}
