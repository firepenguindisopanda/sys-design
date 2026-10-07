import type { CatalogItem, Resources } from "./types";

export const DEFAULT_CAPACITIES: Record<"vm" | "paas" | "functions", Resources> = {
  vm: { memoryGb: 8, vcpus: 4, storageGb: 80 },
  paas: { memoryGb: 4, vcpus: 2, storageGb: 20 },
  functions: { memoryGb: 1, vcpus: 1, storageGb: 0.5 },
};

/** Auto-scale multiplier applied in verification (PDF: PaaS/Functions scale; VMs fixed). */
export const SCALE_FACTOR: Record<"vm" | "paas" | "functions", number> = {
  vm: 1,
  paas: 3,
  functions: 10,
};

/** Rough monthly base cost (USD) heuristics for cost NFR checks. */
export const BASE_MONTHLY_COST: Record<string, number> = {
  vm: 48,
  paas: 25,
  functions: 8,
  database: 30,
  load_balancer: 18,
  static_hosting: 0,
  cdn: 12,
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
];

export function isComputeKind(kind: string): kind is "vm" | "paas" | "functions" {
  return kind === "vm" || kind === "paas" || kind === "functions";
}
