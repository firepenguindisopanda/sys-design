export type ComponentKind =
  | "vm"
  | "paas"
  | "functions"
  | "edge"
  | "database"
  | "cache"
  | "object_storage"
  | "message_queue"
  | "task_worker"
  | "load_balancer"
  | "static_hosting"
  | "cdn"
  | "external_api";

/** Connection protocol — direction semantics from the System Design PDF. */
export type EdgeProtocol =
  | "http"
  | "websocket"
  | "sse"
  | "web_push"
  | "db"
  | "webrtc";

export type EdgeDirection = "directed" | "bidirectional";

export type EdgeData = {
  protocol: EdgeProtocol;
  label?: string;
  [key: string]: unknown;
};

export type Resources = {
  memoryGb: number;
  vcpus: number;
  storageGb: number;
};

export type ComputeConfig = {
  kind: "vm" | "paas" | "functions" | "edge";
  capacity: Resources;
  appType: string;
  hosting: string;
};

export type DatabaseConfig = {
  kind: "database";
  engine: "relational" | "document" | "graph" | "vector";
  replicas: number;
  shards: number;
  storageGb: number;
};

export type CacheConfig = {
  kind: "cache";
  engine: "redis" | "memcached";
  memoryGb: number;
};

export type ObjectStorageConfig = {
  kind: "object_storage";
  storageGb: number;
};

export type MessageQueueConfig = {
  kind: "message_queue";
  mode: "queue" | "pubsub";
};

export type TaskWorkerConfig = {
  kind: "task_worker";
  concurrency: number;
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

export type ExternalApiConfig = {
  kind: "external_api";
  provider: string;
};

export type NodeConfig =
  | ComputeConfig
  | DatabaseConfig
  | CacheConfig
  | ObjectStorageConfig
  | MessageQueueConfig
  | TaskWorkerConfig
  | LoadBalancerConfig
  | StaticHostingConfig
  | CdnConfig
  | ExternalApiConfig;

export type DesignNodeData = {
  label: string;
  componentKind: ComponentKind;
  purpose: string;
  config: NodeConfig;
  [key: string]: unknown;
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

export type CatalogCategory = "compute" | "data" | "messaging" | "network" | "edge" | "external";

export type CatalogItem = {
  kind: ComponentKind;
  label: string;
  shortLabel: string;
  description: string;
  category: CatalogCategory;
  defaultConfig: NodeConfig;
  defaultCapacity?: Resources;
};
