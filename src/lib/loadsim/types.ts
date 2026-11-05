import type { Edge, Node } from "@xyflow/react";
import type { LoadShape } from "@/lib/challenges/types";
import type { DesignNodeData, FeatureBlock } from "@/lib/types";
import type { Outage } from "./outages";

export type SimNode = Node<DesignNodeData>;

/** How much traffic a run sends, and when (SPEC-dataflow-sim.md). */
export type Scenario = {
  requests: number;
  windowSeconds: number;
  shape: LoadShape;
};

/** One feature's part of the traffic and what its requests cost at the database. */
export type FeatureLoad = {
  /** Fraction of all requests that are for this feature */
  share: number;
  /** Fraction of this feature's requests that write */
  writeShare: number;
  readDbMs: number;
  writeDbMs: number;
  /** Writes a worker groups into one database write; API writes are never batched */
  batch: number;
};

/** By feature id */
export type FeatureLoads = Record<string, FeatureLoad>;

export type Op = "read" | "write";

/**
 * One step of a request's path. `next` are the ways it can go on, each with the
 * fraction of what this step serves; whatever isn't sent on is answered here.
 */
export type PathStep = {
  nodeId: string;
  /** The edge the request arrived by; null for the client it starts from */
  edgeId: string | null;
  next: { fraction: number; step: PathStep }[];
  /**
   * Part of a background job (SPEC-loadsim-queues.md): the queue the request was handed to
   * and everything after it. The client is answered once the job is on the queue.
   */
  job?: boolean;
  /** On a worker: its share of the feature's slow work, in ms per job */
  slowMs?: number;
  /** On a job's database step: a job writes its result, whatever the request was */
  op?: Op;
};

/** Requests from one client for one feature, reads or writes. */
export type FlowClass = {
  id: string;
  clientId: string;
  featureId: string;
  op: Op;
  outcome: "routed" | "no-route";
  /** Why there's no route, in words; null when routed */
  reason: string | null;
  /** Starts at the client; null when there's no route */
  root: PathStep | null;
};

export type NotSimulated = { id: string; text: string };

export type FlowGraph = {
  /** Compute nodes that serve as one (sharing a load balancer), each sorted by id */
  pools: string[][];
  classes: FlowClass[];
  notSimulated: NotSimulated[];
  notes: string[];
};

/** Request counts for one step, not rates; divide by `dtSeconds` for req/s. */
export type NodeFrame = {
  arrivals: number;
  served: number;
  failed: number;
  /** Requests waiting at the end of the step */
  backlog: number;
  /**
   * Demand over capacity at the node's busiest station: the work that arrived in the
   * step (or was served, while a backlog drains) over the work it could do.
   */
  utilisation: number;
  /**
   * Switched off (SPEC-loadsim-failures.md): "routed" while its load balancer still sends
   * it requests, "noticed" after; absent while it is up.
   */
  off?: "routed" | "noticed";
};

export type EdgeFrame = {
  /** Requests that crossed the edge in the step */
  volume: number;
  /** Part of that volume that failed where the edge leads */
  failedShare: number;
};

export type Frame = {
  nodes: Record<string, NodeFrame>;
  edges: Record<string, EdgeFrame>;
};

export type FailureReason = "timed-out" | "no-route" | "switched-off";

export type FailureGroup = {
  /** Where they failed; null for requests with no route */
  nodeId: string | null;
  clientId: string | null;
  featureId: string | null;
  reason: FailureReason;
  count: number;
  text: string;
};

export type NodeSummary = {
  peakUtilisation: number;
  peakBacklog: number;
  served: number;
  failed: number;
  /** Seconds into the run; null if it never saturated */
  firstSaturatedAt: number | null;
  /** Requests that failed here while it was switched off */
  failedWhileOff: number;
};

export type Summary = {
  requests: number;
  served: number;
  failed: number;
  failures: FailureGroup[];
  p50Ms: number;
  p95Ms: number;
  perNode: Record<string, NodeSummary>;
  firstSaturation: { nodeId: string; atSeconds: number; note: string } | null;
  /** Only when nothing saturated */
  busiest: { nodeId: string; peakUtilisation: number; note: string } | null;
  notSimulated: NotSimulated[];
  notes: string[];
  /** Background jobs (SPEC-loadsim-queues.md); null when no request reaches a queue */
  jobs: JobsSummary | null;
  /** One per outage, in order (SPEC-loadsim-failures.md) */
  outages: OutageSummary[];
};

export type OutageSummary = {
  nodeId: string;
  offAt: number;
  onAt: number | null;
  /** Requests that failed at the component while it was off */
  failedHere: number;
  /** Requests that timed out elsewhere while it was off, beyond a run without the outage */
  failedElsewhere: number;
  /** What took its place: the rest of its pool, a cache's databases, a database itself, a worker's queue */
  takeover: { nodeId: string; peakUtilisation: number; peakWaiting: number }[];
  note: string;
};

/** One queue over the run. Times are seconds into the run. */
export type QueueSummary = {
  /** Jobs put on this queue */
  queued: number;
  /** Jobs its workers finished */
  done: number;
  /** Jobs still waiting for its workers when the run ended */
  stillWaiting: number;
  /** Jobs put on it with no worker to read them */
  neverDone: number;
  peakBacklog: number;
  peakAt: number | null;
  /** When it was empty again after its peak; null if it never was */
  emptyAt: number | null;
  /** When its workers first ran at 100%; null if they never did */
  fellBehindAt: number | null;
};

export type JobsSummary = {
  /** Requests handed to a queue: each one is a job */
  queued: number;
  /** Jobs that reached the end of their path */
  done: number;
  /** Jobs still waiting anywhere when the run ended */
  stillWaiting: number;
  /** Jobs put on a queue with no worker */
  neverDone: number;
  /** Time from being queued to done */
  p50Ms: number;
  p95Ms: number;
  perQueue: Record<string, QueueSummary>;
};

export type LoadInput = {
  nodes: SimNode[];
  edges: Edge[];
  features: FeatureBlock[];
  scenario: Scenario;
  loads: FeatureLoads;
  /** Components the student switched off (SPEC-loadsim-failures.md); none if left out */
  outages?: Outage[];
  /**
   * The same design and scenario run without outages, if the caller has it: used to tell
   * what an outage cost elsewhere, instead of running the model a second time.
   */
  baseline?: LoadRun;
};

export type LoadRun = {
  scenario: Scenario;
  /** Steps in the scenario's window; frames after these are the backlog draining */
  windowSteps: number;
  dtSeconds: number;
  frames: Frame[];
  summary: Summary;
  graph: FlowGraph;
  /** Each task worker's slots (its concurrency), for the gauge's "k of c slots" */
  workerSlots: Record<string, number>;
};
