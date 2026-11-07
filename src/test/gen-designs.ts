import { DEFAULT_CAPACITIES, type ComputeKind } from "@/lib/catalog";
import { buildCompactDesign, type BuiltDesign } from "@/lib/challenges/design";
import type { BriefRequirement, CompactDesign, CompactEdge, CompactNode } from "@/lib/challenges/types";
import type { ComponentKind, EdgeProtocol, FunctionalRequirement } from "@/lib/types";

// Seeded designs for the stress tests (SPEC-stress-harness.md). The same seed gives the same
// design on any machine, so every failure can be replayed from its description.

/** mulberry32: a small seeded generator giving numbers from 0 (inclusive) to 1. */
export function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Range = { min: number; max: number; step: number };

const COMPUTE_KINDS: ComputeKind[] = ["vm", "paas", "functions", "edge"];
const CLIENT_KINDS: ComponentKind[] = ["mobile", "desktop", "iot"];
const ALL_KINDS: ComponentKind[] = [
  ...COMPUTE_KINDS,
  "database",
  "cache",
  "object_storage",
  "message_queue",
  "task_worker",
  "load_balancer",
  "static_hosting",
  "cdn",
  "external_api",
  ...CLIENT_KINDS,
];
const PROTOCOLS: EdgeProtocol[] = ["http", "websocket", "sse", "web_push", "db", "webrtc"];

function computeRanges(kind: ComputeKind): Record<string, Range> {
  const d = DEFAULT_CAPACITIES[kind];
  return {
    "capacity.vcpus": { min: 0.5, max: Math.max(0.5, d.vcpus * 4), step: 0.5 },
    "capacity.memoryGb": { min: 0.5, max: Math.max(0.5, d.memoryGb * 4), step: 0.5 },
    "capacity.storageGb": { min: 0.25, max: Math.max(0.25, d.storageGb * 4), step: 0.25 },
  };
}

/**
 * In-range values for each numeric config field, by kind; nested fields as `capacity.vcpus`.
 * Minimums are the inspector's; maximums are the inspector's where it has one (replicas,
 * shards, concurrency), otherwise 4× the catalog default. `config-bounds` replaces this
 * with the limits the product shares (CAPACITY-MAP-stress.md); it's kept apart here so this
 * module changes no product code.
 */
export const CONFIG_RANGES: Partial<Record<ComponentKind, Record<string, Range>>> = {
  vm: computeRanges("vm"),
  paas: computeRanges("paas"),
  functions: computeRanges("functions"),
  edge: computeRanges("edge"),
  database: {
    replicas: { min: 1, max: 8, step: 1 },
    shards: { min: 1, max: 16, step: 1 },
    storageGb: { min: 1, max: 200, step: 1 },
  },
  cache: { memoryGb: { min: 0.5, max: 8, step: 0.5 } },
  object_storage: { storageGb: { min: 1, max: 400, step: 1 } },
  task_worker: { concurrency: { min: 1, max: 64, step: 1 } },
};

/** String config fields with a fixed set of values (mirrors the validator's CONFIG_ENUMS). */
export const CONFIG_ENUMS: Partial<Record<ComponentKind, Record<string, string[]>>> = {
  database: { engine: ["relational", "document", "graph", "vector"] },
  cache: { engine: ["redis", "memcached"] },
  message_queue: { mode: ["queue", "pubsub"] },
};

export type GenerateOptions =
  | { seed: number; shape: "random" | "app"; nodes?: number }
  | { shape: "stacked"; layers: number; width: number };

export type GeneratedDesign = BuiltDesign & {
  functionalReqs: FunctionalRequirement[];
  /** The design as fixtures write it, before building */
  compact: CompactDesign;
  /** For failure messages, e.g. "random seed 1234, 9 nodes" */
  description: string;
};

type Rand = {
  next: () => number;
  /** A whole number from `lo` to `hi`, both included */
  int: (lo: number, hi: number) => number;
  pick: <T>(list: readonly T[]) => T;
  chance: (p: number) => boolean;
};

function rand(seed: number): Rand {
  const next = rng(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  return { next, int, pick: (list) => list[int(0, list.length - 1)], chance: (p) => next() < p };
}

/** Random in-range overrides for about half of a kind's fields; the rest stay at the default. */
function randomConfig(r: Rand, kind: ComponentKind): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const [field, range] of Object.entries(CONFIG_RANGES[kind] ?? {})) {
    if (!r.chance(0.5)) continue;
    const value = range.min + range.step * r.int(0, Math.round((range.max - range.min) / range.step));
    const [outer, inner] = field.split(".");
    if (inner) config[outer] = { ...((config[outer] as Record<string, unknown>) ?? {}), [inner]: value };
    else config[outer] = value;
  }
  for (const [field, values] of Object.entries(CONFIG_ENUMS[kind] ?? {})) {
    if (r.chance(0.5)) config[field] = r.pick(values);
  }
  return config;
}

/** Collects nodes and edges, refusing self-loops and a second edge between one pair. */
class Builder {
  nodes: CompactNode[] = [];
  edges: CompactEdge[] = [];
  private pairs = new Set<string>();

  constructor(private r: Rand | null) {}

  node(kind: ComponentKind, id = `${kind.replace(/_/g, "-")}-${this.nodes.length}`): string {
    this.nodes.push({
      id,
      kind,
      label: null,
      purpose: null,
      position: null,
      config: this.r ? randomConfig(this.r, kind) : {},
    });
    return id;
  }

  edge(source: string, target: string, protocol: EdgeProtocol): boolean {
    const pair = [source, target].sort().join("|");
    if (source === target || this.pairs.has(pair)) return false;
    this.pairs.add(pair);
    this.edges.push({ id: `${source}->${target}`, source, target, protocol });
    return true;
  }
}

/** 1–3 features, with each optional workload field set about 30% of the time. */
function randomRequirements(r: Rand): BriefRequirement[] {
  return Array.from({ length: r.int(1, 3) }, (_, i) => {
    const id = `feature-${i}`;
    return {
      id,
      text: `Feature ${i}`,
      feature: {
        name: `Feature ${i}`,
        description: "",
        resources: { memoryGb: 0.5, vcpus: 0.5, storageGb: 1 },
        targetRpm: r.int(0, 3000),
        computeMsPerRequest: r.int(1, 200),
        ...(r.chance(0.3) ? { backgroundWorkMs: r.int(100, 5000) } : {}),
        ...(r.chance(0.3) ? { pollingRpm: r.int(1, 5000) } : {}),
        ...(r.chance(0.3) ? { fileRpm: r.int(1, 3000) } : {}),
        ...(r.chance(0.3) ? { writeRpm: r.int(1, 2000) } : {}),
      },
    };
  });
}

/** Any kinds, about two edges per node with any protocol; features placed 85% of the time. */
function randomShape(r: Rand, size: number | undefined) {
  const n = size ?? r.int(2, 14);
  const b = new Builder(r);
  const clients = Math.max(1, Math.round(n / 10));
  for (let i = 0; i < clients; i++) b.node(r.pick(CLIENT_KINDS));
  const compute = [b.node(r.pick(COMPUTE_KINDS))];
  while (b.nodes.length < n) {
    const kind = r.pick(ALL_KINDS);
    const id = b.node(kind);
    if ((COMPUTE_KINDS as ComponentKind[]).includes(kind)) compute.push(id);
  }
  const ids = b.nodes.map((x) => x.id);
  for (let i = 0; i < n * 2; i++) b.edge(r.pick(ids), r.pick(ids), r.pick(PROTOCOLS));
  const reqs = randomRequirements(r);
  const placements: Record<string, string> = {};
  for (const req of reqs) if (r.chance(0.85)) placements[req.id] = r.pick(compute);
  return { b, reqs, placements };
}

/**
 * The shape students draw: clients, then service blocks (load balancer → 1–4 compute → an
 * optional cache → a database), some with a queue → worker branch, and an optional CDN →
 * static hosting front. With `size`, blocks are added until the design has that many nodes.
 */
function appShape(r: Rand, size: number | undefined) {
  const target = Math.max(5, size ?? r.int(5, 30));
  const b = new Builder(r);
  const clients = Array.from({ length: r.int(1, Math.min(3, target - 4)) }, () => b.node(r.pick(CLIENT_KINDS)));
  const front = target - clients.length >= 6 && r.chance(0.3);
  const compute: string[] = [];
  const blockLbs: string[] = [];
  const reserved = front ? 2 : 0;

  while (b.nodes.length + reserved < target) {
    const left = target - reserved - b.nodes.length;
    if (left < 3 && blockLbs.length > 0) {
      // Too few for another block: widen the last one.
      for (let i = 0; i < left; i++) {
        const id = b.node(r.pick(COMPUTE_KINDS));
        b.edge(blockLbs[blockLbs.length - 1], id, "http");
        compute.push(id);
      }
      break;
    }
    const cache = left >= 4 && r.chance(0.5);
    const queue = left >= 5 + (cache ? 1 : 0) && r.chance(0.3);
    const k = Math.max(1, Math.min(r.int(1, 4), left - 2 - (cache ? 1 : 0) - (queue ? 2 : 0)));
    const lb = b.node("load_balancer");
    blockLbs.push(lb);
    for (const c of clients) b.edge(c, lb, "http");
    const instances = Array.from({ length: k }, () => b.node(r.pick(COMPUTE_KINDS)));
    const cacheId = cache ? b.node("cache") : null;
    const db = b.node("database");
    const jobs = queue ? b.node("message_queue") : null;
    const worker = queue ? b.node("task_worker") : null;
    for (const id of instances) {
      b.edge(lb, id, "http");
      if (cacheId) b.edge(id, cacheId, "db");
      b.edge(id, db, "db");
      if (jobs) b.edge(id, jobs, "http");
    }
    if (jobs && worker) {
      b.edge(jobs, worker, "http");
      b.edge(worker, db, "db");
    }
    compute.push(...instances);
  }
  if (front) {
    const cdn = b.node("cdn");
    const site = b.node("static_hosting");
    for (const c of clients) b.edge(c, cdn, "http");
    b.edge(cdn, site, "http");
  }
  const reqs = randomRequirements(r);
  const placements = Object.fromEntries(reqs.map((req) => [req.id, r.pick(compute)]));
  return { b, reqs, placements };
}

/** A client, `layers` fully connected layers of `width` load balancers, then a VM and a database. */
function stackedShape(layers: number, width: number) {
  const b = new Builder(null);
  let previous = [b.node("desktop", "client")];
  for (let l = 1; l <= layers; l++) {
    const layer = Array.from({ length: width }, (_, i) => b.node("load_balancer", `lb-${l}-${i + 1}`));
    for (const from of previous) for (const to of layer) b.edge(from, to, "http");
    previous = layer;
  }
  const api = b.node("vm", "api");
  const db = b.node("database", "db");
  for (const from of previous) b.edge(from, api, "http");
  b.edge(api, db, "db");
  const reqs: BriefRequirement[] = [
    {
      id: "feature-0",
      text: "Feature 0",
      feature: {
        name: "Feature 0",
        description: "",
        resources: { memoryGb: 0.5, vcpus: 0.5, storageGb: 1 },
        targetRpm: 600,
        computeMsPerRequest: 20,
      },
    },
  ];
  return { b, reqs, placements: { "feature-0": api } };
}

/** A seeded design, built as the store would hold it (SPEC-stress-harness.md). */
export function generateDesign(options: GenerateOptions): GeneratedDesign {
  const { b, reqs, placements } =
    options.shape === "stacked"
      ? stackedShape(options.layers, options.width)
      : options.shape === "app"
        ? appShape(rand(options.seed), options.nodes)
        : randomShape(rand(options.seed), options.nodes);
  const compact: CompactDesign = { nodes: b.nodes, edges: b.edges, placements };
  const nfr = { maxLatencyMs: 100, minThroughputRpm: 0, minAvailabilityPct: 99, maxMonthlyCostUsd: null };
  const name =
    options.shape === "stacked"
      ? `stacked ${options.layers} × ${options.width}`
      : `${options.shape} seed ${options.seed}`;
  return {
    ...buildCompactDesign(reqs, nfr, compact),
    functionalReqs: reqs.map((req) => ({ id: `freq-${req.id}`, text: req.text, featureId: req.id })),
    compact,
    description: `${name}, ${compact.nodes.length} nodes`,
  };
}
