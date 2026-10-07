export type ComponentKind =
  | "vm"
  | "paas"
  | "functions"
  | "database"
  | "load_balancer"
  | "static_hosting"
  | "cdn";

export type EdgeProtocol = "http" | "websocket" | "sse" | "db";

export type Resources = {
  memoryGb: number;
  vcpus: number;
  storageGb: number;
};

export type ComputeConfig = {
  kind: "vm" | "paas" | "functions";
  capacity: Resources;
  appType: string;
  hosting: string;
};

export type DatabaseConfig = {
  kind: "database";
  engine: "relational" | "document" | "graph";
  replicas: number;
  shards: number;
  storageGb: number;
};

export type LoadBalancerConfig = {
  kind: "load_balancer";
};

export type StaticHostingConfig = {
  kind: "static_hosting";
};

export type CdnConfig = {
  kind: "cdn";
};

export type NodeConfig =
  | ComputeConfig
  | DatabaseConfig
  | LoadBalancerConfig
  | StaticHostingConfig
  | CdnConfig;

export type DesignNodeData = {
  label: string;
  componentKind: ComponentKind;
  purpose: string;
  config: NodeConfig;
};

export type FeatureBlock = {
  id: string;
  name: string;
  description: string;
  resources: Resources;
  /** Target requests per minute attributed to this feature under peak load */
  targetRpm: number;
  /** Milliseconds of compute work assumed per request */
  computeMsPerRequest: number;
  /** Assigned compute node id, or null if unplaced */
  placedOnNodeId: string | null;
};

export type FunctionalRequirement = {
  id: string;
  text: string;
  featureId: string;
};

export type NonFunctionalRequirements = {
  maxLatencyMs: number;
  minThroughputRpm: number;
  minAvailabilityPct: number;
  maxMonthlyCostUsd: number | null;
};

export type CheckStatus = "pass" | "fail" | "warn";

export type VerificationCheck = {
  id: string;
  category: "latency" | "throughput" | "availability" | "cost" | "topology" | "placement";
  title: string;
  status: CheckStatus;
  detail: string;
  actual?: string;
  target?: string;
};

export type VerificationResult = {
  ranAt: number;
  overall: CheckStatus;
  checks: VerificationCheck[];
  estimatedLatencyMs: number;
  estimatedThroughputRpm: number;
  estimatedAvailabilityPct: number;
  estimatedMonthlyCostUsd: number;
};

export type CatalogItem = {
  kind: ComponentKind;
  label: string;
  shortLabel: string;
  description: string;
  category: "compute" | "data" | "edge" | "network";
  defaultConfig: NodeConfig;
  defaultCapacity?: Resources;
};
