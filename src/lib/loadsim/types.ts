import type { Edge, Node } from "@xyflow/react";
import type { LoadShape } from "@/lib/challenges/types";
import type { DesignNodeData, FeatureBlock } from "@/lib/types";

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

export type FailureReason = "timed-out" | "no-route";

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
};

export type LoadInput = {
  nodes: SimNode[];
  edges: Edge[];
  features: FeatureBlock[];
  scenario: Scenario;
  loads: FeatureLoads;
};

export type LoadRun = {
  scenario: Scenario;
  /** Steps in the scenario's window; frames after these are the backlog draining */
  windowSteps: number;
  dtSeconds: number;
  frames: Frame[];
  summary: Summary;
  graph: FlowGraph;
};
