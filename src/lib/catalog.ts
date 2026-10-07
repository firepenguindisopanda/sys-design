import type { CatalogItem, Resources } from "./types";

export type ComputeKind = "vm" | "paas" | "functions" | "edge";

export const DEFAULT_CAPACITIES: Record<ComputeKind, Resources> = {
  vm: { memoryGb: 8, vcpus: 4, storageGb: 80 },
  paas: { memoryGb: 4, vcpus: 2, storageGb: 20 },
  functions: { memoryGb: 1, vcpus: 1, storageGb: 0.5 },
  edge: { memoryGb: 0.5, vcpus: 0.5, storageGb: 0.25 },
};

/** Auto-scale multiplier applied in verification (PDF: PaaS/Functions/Edge scale; VMs fixed). */
export const SCALE_FACTOR: Record<ComputeKind, number> = {
  vm: 1,
  paas: 3,
  functions: 10,
  edge: 12,
};

/** Rough monthly base cost (USD) heuristics for cost NFR checks. */
export const BASE_MONTHLY_COST: Record<string, number> = {
  vm: 48,
  paas: 25,
  functions: 8,
  edge: 10,
  database: 30,
  cache: 22,
  object_storage: 8,
  message_queue: 15,
  task_worker: 12,
  load_balancer: 18,
  static_hosting: 0,
  cdn: 12,
  external_api: 0,
};

export const COMPONENT_CATALOG: CatalogItem[] = [
  {
    kind: "vm",
    label: "Virtual Machine",
    shortLabel: "VM",
    description: "Fixed resources, pay for uptime. Hosts several apps (EC2, Droplets, GCE).",
    category: "compute",
    defaultCapacity: DEFAULT_CAPACITIES.vm,
    defaultConfig: {
      kind: "vm",
      capacity: { ...DEFAULT_CAPACITIES.vm },
      appType: "express",
      hosting: "cloud-vm",
    },
  },
  {
    kind: "paas",
    label: "PaaS / App Platform",
    shortLabel: "PaaS",
    description: "Built-in autoscaling; configure runtime & env (Render, Heroku, App Engine).",
    category: "compute",
    defaultCapacity: DEFAULT_CAPACITIES.paas,
    defaultConfig: {
      kind: "paas",
      capacity: { ...DEFAULT_CAPACITIES.paas },
      appType: "web-api",
      hosting: "paas",
    },
  },
  {
    kind: "functions",
    label: "Cloud Functions",
    shortLabel: "Fn",
    description: "Pay-per-use serverless; finely scoped scripts (Lambda, Cloud Functions).",
    category: "compute",
    defaultCapacity: DEFAULT_CAPACITIES.functions,
    defaultConfig: {
      kind: "functions",
      capacity: { ...DEFAULT_CAPACITIES.functions },
      appType: "handler",
      hosting: "serverless",
    },
  },
  {
    kind: "edge",
    label: "Edge Compute",
    shortLabel: "Edge",
    description: "Small code near end-users; global auto-scale (Cloudflare Workers, Lambda@Edge).",
    category: "compute",
    defaultCapacity: DEFAULT_CAPACITIES.edge,
    defaultConfig: {
      kind: "edge",
      capacity: { ...DEFAULT_CAPACITIES.edge },
      appType: "worker",
      hosting: "edge",
    },
  },
  {
    kind: "database",
    label: "Database",
    shortLabel: "DB",
    description: "Persistent data store. Configure replicas (availability) and shards (scale).",
    category: "data",
    defaultConfig: {
      kind: "database",
      engine: "relational",
      replicas: 1,
      shards: 1,
      storageGb: 50,
    },
  },
  {
    kind: "cache",
    label: "Cache / Memory Store",
    shortLabel: "Cache",
    description: "In-memory cache for fast reads (Redis, Memcached) — Cache Aside pattern.",
    category: "data",
    defaultConfig: {
      kind: "cache",
      engine: "redis",
      memoryGb: 2,
    },
  },
  {
    kind: "object_storage",
    label: "Object Storage",
    shortLabel: "Objects",
    description: "File/object media storage and distribution (S3, GCS, Firebase Storage).",
    category: "data",
    defaultConfig: {
      kind: "object_storage",
      storageGb: 100,
    },
  },
  {
    kind: "message_queue",
    label: "Message Queue / Pub-Sub",
    shortLabel: "MQ",
    description: "Receive, queue, and deliver messages across components (SQS, Pub/Sub, Kafka).",
    category: "messaging",
    defaultConfig: {
      kind: "message_queue",
      mode: "queue",
    },
  },
  {
    kind: "task_worker",
    label: "Task Queue / Worker",
    shortLabel: "Worker",
    description: "Scheduled tasks and background workers (Cloud Tasks, Celery, RQ).",
    category: "messaging",
    defaultConfig: {
      kind: "task_worker",
      concurrency: 4,
    },
  },
  {
    kind: "load_balancer",
    label: "Load Balancer",
    shortLabel: "LB",
    description: "Receives requests and distributes them evenly among compute instances.",
    category: "network",
    defaultConfig: { kind: "load_balancer" },
  },
  {
    kind: "static_hosting",
    label: "Static Hosting",
    shortLabel: "Static",
    description: "Hosts HTML/CSS/JS clients (Firebase Hosting, Netlify, GitHub Pages).",
    category: "edge",
    defaultConfig: { kind: "static_hosting" },
  },
  {
    kind: "cdn",
    label: "CDN",
    shortLabel: "CDN",
    description: "High-availability edge delivery of assets — Static Content Hosting pattern.",
    category: "edge",
    defaultConfig: { kind: "cdn" },
  },
  {
    kind: "external_api",
    label: "External / 3rd-Party API",
    shortLabel: "3P API",
    description: "External systems (Maps, IMDB, social APIs). Prefer proxying via compute for keys.",
    category: "external",
    defaultConfig: {
      kind: "external_api",
      provider: "third-party",
    },
  },
];

export function isComputeKind(kind: string): kind is ComputeKind {
  return kind === "vm" || kind === "paas" || kind === "functions" || kind === "edge";
}
