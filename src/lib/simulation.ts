import {
  BASE_MONTHLY_COST,
  SCALE_FACTOR,
  isClientishKind,
  isComputeKind,
} from "./catalog";
import { getEdgeData } from "./edges";
import type {
  CheckStatus,
  DesignNodeData,
  EdgeProtocol,
  FeatureBlock,
  NonFunctionalRequirements,
  VerificationCheck,
  VerificationResult,
} from "./types";
import type { Edge, Node } from "@xyflow/react";

type SimNode = Node<DesignNodeData>;

function worst(...statuses: CheckStatus[]): CheckStatus {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warn")) return "warn";
  return "pass";
}

function remainingCapacity(
  node: SimNode,
  features: FeatureBlock[],
): { memoryGb: number; vcpus: number; storageGb: number } | null {
  const cfg = node.data.config;
  if (
    cfg.kind !== "vm" &&
    cfg.kind !== "paas" &&
    cfg.kind !== "functions" &&
    cfg.kind !== "edge"
  ) {
    return null;
  }
  const used = features
    .filter((f) => f.placedOnNodeId === node.id)
    .reduce(
      (acc, f) => ({
        memoryGb: acc.memoryGb + f.resources.memoryGb,
        vcpus: acc.vcpus + f.resources.vcpus,
        storageGb: acc.storageGb + f.resources.storageGb,
      }),
      { memoryGb: 0, vcpus: 0, storageGb: 0 },
    );
  return {
    memoryGb: cfg.capacity.memoryGb - used.memoryGb,
    vcpus: cfg.capacity.vcpus - used.vcpus,
    storageGb: cfg.capacity.storageGb - used.storageGb,
  };
}

export function canPlaceFeature(
  node: SimNode,
  feature: FeatureBlock,
  features: FeatureBlock[],
): boolean {
  const rem = remainingCapacity(node, features.filter((f) => f.id !== feature.id));
  if (!rem) return false;
  return (
    rem.memoryGb >= feature.resources.memoryGb &&
    rem.vcpus >= feature.resources.vcpus &&
    rem.storageGb >= feature.resources.storageGb
  );
}

function hopLatencyMs(
  source: SimNode | undefined,
  target: SimNode | undefined,
  protocol: EdgeProtocol,
): number {
  if (!source || !target) return 40;
  const sk = source.data.componentKind;
  const tk = target.data.componentKind;

  if (protocol === "websocket") return 15;
  if (protocol === "sse" || protocol === "web_push") return 12;
  if (protocol === "webrtc") return 22;

  if (sk === "cdn" || tk === "cdn" || sk === "edge" || tk === "edge") return 14;
  if (sk === "cache" || tk === "cache") return 5;
  if (sk === "message_queue" || tk === "message_queue") return 10;
  if (sk === "object_storage" || tk === "object_storage") return 28;
  if (sk === "external_api" || tk === "external_api") return 45;
  if (sk === "iot" || tk === "iot") return 30;
  if (sk === "mobile" || tk === "mobile") return 28;
  if (sk === "desktop" || tk === "desktop") return 22;
  if (sk === "static_hosting" || tk === "static_hosting") return 35;
  if (sk === "load_balancer" || tk === "load_balancer") return 8;
  if (tk === "database" || sk === "database") {
    const db = (tk === "database" ? target : source).data.config;
    const replicas = db.kind === "database" ? db.replicas : 1;
    const base = protocol === "db" ? 12 : 20;
    return Math.max(6, base - (replicas - 1) * 2);
  }
  if (isComputeKind(tk) || isComputeKind(sk)) return 25;
  return 40;
}

function estimatePathLatency(nodes: SimNode[], edges: Edge[]): number {
  if (edges.length === 0) {
    const hasCdn = nodes.some((n) => n.data.componentKind === "cdn");
    const hasStatic = nodes.some((n) => n.data.componentKind === "static_hosting");
    const hasDb = nodes.some((n) => n.data.componentKind === "database");
    const hasCache = nodes.some((n) => n.data.componentKind === "cache");
    let ms = 80;
    if (hasStatic) ms += hasCdn ? 18 : 45;
    if (hasDb) ms += hasCache ? 12 : 25;
    return ms;
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, Edge[]>();
  for (const e of edges) {
    const list = outgoing.get(e.source) ?? [];
    list.push(e);
    outgoing.set(e.source, list);
    // Bidirectional protocols contribute reverse hop for path latency
    const { protocol } = getEdgeData(e);
    if (protocol === "websocket" || protocol === "webrtc") {
      const rev = outgoing.get(e.target) ?? [];
      rev.push({ ...e, source: e.target, target: e.source });
      outgoing.set(e.target, rev);
    }
  }

  let max = 0;
  const visit = (id: string, acc: number, seen: Set<string>) => {
    max = Math.max(max, acc);
    if (seen.has(id)) return;
    const next = new Set(seen);
    next.add(id);
    for (const e of outgoing.get(id) ?? []) {
      const { protocol } = getEdgeData(e);
      const add = hopLatencyMs(byId.get(e.source), byId.get(e.target), protocol);
      visit(e.target, acc + add, next);
    }
  };

  const targets = new Set(edges.map((e) => e.target));
  const roots = nodes.filter((n) => !targets.has(n.id));
  for (const r of roots.length ? roots : nodes) {
    visit(r.id, 0, new Set());
  }

  const hasCdn = nodes.some((n) => n.data.componentKind === "cdn");
  const hasStatic = nodes.some((n) => n.data.componentKind === "static_hosting");
  if (hasStatic && !hasCdn) max += 40;

  // Cache-aside bonus when cache sits next to a database
  const hasCache = nodes.some((n) => n.data.componentKind === "cache");
  const hasDb = nodes.some((n) => n.data.componentKind === "database");
  if (hasCache && hasDb) max = Math.max(20, max - 15);

  return Math.max(max, 20);
}

function estimateThroughputRpm(nodes: SimNode[], features: FeatureBlock[]): number {
  const placed = features.filter((f) => f.placedOnNodeId);
  if (placed.length === 0) return 0;

  const byNode = new Map<string, FeatureBlock[]>();
  for (const f of placed) {
    const list = byNode.get(f.placedOnNodeId!) ?? [];
    list.push(f);
    byNode.set(f.placedOnNodeId!, list);
  }

  let totalCapacity = 0;

  for (const [nodeId, feats] of byNode) {
    const node = nodes.find((n) => n.id === nodeId);
    const cfg = node?.data.config;
    if (
      !cfg ||
      (cfg.kind !== "vm" &&
        cfg.kind !== "paas" &&
        cfg.kind !== "functions" &&
        cfg.kind !== "edge")
    ) {
      continue;
    }
    const scale = SCALE_FACTOR[cfg.kind];
    const avgMs =
      feats.reduce((s, f) => s + f.computeMsPerRequest, 0) / Math.max(feats.length, 1);
    const rpmPerVcpu = Math.floor((60_000 / Math.max(avgMs, 5)) * 0.7);
    totalCapacity += cfg.capacity.vcpus * rpmPerVcpu * scale;
  }

  const dbs = nodes.filter((n) => n.data.componentKind === "database");
  if (dbs.length > 0) {
    let dbCap = 0;
    for (const db of dbs) {
      const cfg = db.data.config;
      if (cfg.kind !== "database") continue;
      dbCap += 400 * cfg.shards * (1 + (cfg.replicas - 1) * 0.15);
    }
    // Cache raises effective read throughput
    const caches = nodes.filter((n) => n.data.componentKind === "cache");
    if (caches.length > 0) {
      let cacheBoost = 0;
      for (const c of caches) {
        const cfg = c.data.config;
        if (cfg.kind === "cache") cacheBoost += cfg.memoryGb * 200;
      }
      dbCap += cacheBoost;
    }
    totalCapacity = Math.min(totalCapacity, dbCap);
  }

  // Queue / worker pattern: async load leveling softens peak throughput pressure
  const hasQueue = nodes.some((n) => n.data.componentKind === "message_queue");
  const hasWorker = nodes.some((n) => n.data.componentKind === "task_worker");
  if (hasQueue && hasWorker) {
    totalCapacity = Math.floor(totalCapacity * 1.15);
  }

  return totalCapacity;
}

function estimateAvailability(nodes: SimNode[], edges: Edge[]): number {
  if (nodes.length === 0) return 0;

  let avail = 0.985;
  const hasLb = nodes.some((n) => n.data.componentKind === "load_balancer");
  const compute = nodes.filter((n) => isComputeKind(n.data.componentKind));
  const dbs = nodes.filter((n) => n.data.componentKind === "database");
  const hasCdn = nodes.some((n) => n.data.componentKind === "cdn");
  const hasQueue = nodes.some((n) => n.data.componentKind === "message_queue");

  if (compute.some((n) => n.data.componentKind === "functions" || n.data.componentKind === "edge")) {
    avail = Math.max(avail, 0.995);
  }
  if (compute.some((n) => n.data.componentKind === "paas")) avail = Math.max(avail, 0.992);
  if (hasLb && compute.length >= 2) avail += 0.004;
  else if (!hasLb && compute.length >= 2) avail -= 0.01;

  for (const db of dbs) {
    const cfg = db.data.config;
    if (cfg.kind !== "database") continue;
    if (cfg.replicas >= 2) avail += 0.003;
    else avail -= 0.005;
  }

  if (hasCdn) avail += 0.002;
  if (hasQueue) avail += 0.001; // load leveling / decoupling

  void edges;
  return Math.min(0.9995, Math.max(0.9, avail)) * 100;
}

function estimateMonthlyCost(nodes: SimNode[], features: FeatureBlock[]): number {
  let cost = 0;
  for (const n of nodes) {
    cost += BASE_MONTHLY_COST[n.data.componentKind] ?? 10;
    const cfg = n.data.config;
    if (cfg.kind === "database") {
      cost += (cfg.replicas - 1) * 20 + (cfg.shards - 1) * 25;
    }
    if (cfg.kind === "cache") {
      cost += cfg.memoryGb * 6;
    }
    if (cfg.kind === "object_storage") {
      cost += Math.ceil(cfg.storageGb / 50) * 2;
    }
    if (cfg.kind === "task_worker") {
      cost += cfg.concurrency * 3;
    }
    if (
      cfg.kind === "vm" ||
      cfg.kind === "paas" ||
      cfg.kind === "functions" ||
      cfg.kind === "edge"
    ) {
      const vcpuRate =
        cfg.kind === "vm" ? 12 : cfg.kind === "paas" ? 8 : cfg.kind === "edge" ? 3 : 2;
      cost += cfg.capacity.vcpus * vcpuRate;
      cost += cfg.capacity.memoryGb * (cfg.kind === "vm" ? 4 : 2);
    }
  }
  const fnRpm = features
    .filter((f) => {
      const node = nodes.find((n) => n.id === f.placedOnNodeId);
      const k = node?.data.componentKind;
      return k === "functions" || k === "edge";
    })
    .reduce((s, f) => s + f.targetRpm, 0);
  cost += (fnRpm * 60 * 24 * 30) / 1_000_000 * 0.2;
  return Math.round(cost);
}

export function runVerification(
  nodes: SimNode[],
  edges: Edge[],
  features: FeatureBlock[],
  nfr: NonFunctionalRequirements,
): VerificationResult {
  const checks: VerificationCheck[] = [];

  const unplaced = features.filter((f) => !f.placedOnNodeId);
  if (features.length === 0) {
    checks.push({
      id: "placement-empty",
      category: "placement",
      title: "Feature placement",
      status: "fail",
      detail: "Add at least one feature block from a functional requirement.",
    });
  } else if (unplaced.length > 0) {
    checks.push({
      id: "placement-unplaced",
      category: "placement",
      title: "Feature placement",
      status: "fail",
      detail: `${unplaced.length} feature(s) not placed on compute: ${unplaced.map((f) => f.name).join(", ")}.`,
    });
  } else {
    let overflow = false;
    for (const n of nodes) {
      if (!isComputeKind(n.data.componentKind)) continue;
      const rem = remainingCapacity(n, features);
      if (rem && (rem.memoryGb < 0 || rem.vcpus < 0 || rem.storageGb < 0)) {
        overflow = true;
        checks.push({
          id: `placement-overflow-${n.id}`,
          category: "placement",
          title: `Capacity overflow on ${n.data.label}`,
          status: "fail",
          detail: `Placed features exceed ${n.data.label}'s capacity.`,
        });
      }
    }
    if (!overflow) {
      checks.push({
        id: "placement-ok",
        category: "placement",
        title: "Feature placement",
        status: "pass",
        detail: "All features fit on assigned compute instances.",
      });
    }
  }

  const computeCount = nodes.filter((n) => isComputeKind(n.data.componentKind)).length;
  const dbCount = nodes.filter((n) => n.data.componentKind === "database").length;
  const hasLb = nodes.some((n) => n.data.componentKind === "load_balancer");
  const hasStatic = nodes.some((n) => n.data.componentKind === "static_hosting");
  const hasCdn = nodes.some((n) => n.data.componentKind === "cdn");
  const hasCache = nodes.some((n) => n.data.componentKind === "cache");
  const hasQueue = nodes.some((n) => n.data.componentKind === "message_queue");

  if (nodes.length === 0) {
    checks.push({
      id: "topo-empty",
      category: "topology",
      title: "Topology",
      status: "fail",
      detail: "Canvas is empty. Place components from the library.",
    });
  } else {
    checks.push({
      id: "topo-present",
      category: "topology",
      title: "Topology present",
      status: "pass",
      detail: `${nodes.length} component(s), ${edges.length} connection(s).`,
    });
  }

  if (dbCount > 0 && computeCount === 0) {
    checks.push({
      id: "topo-db-no-compute",
      category: "topology",
      title: "Database without compute",
      status: "warn",
      detail: "PDF guideline: clients should reach databases via compute intermediates.",
    });
  }

  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  for (const e of edges) {
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
    outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1);
  }
  const hopOk = new Set([
    "load_balancer",
    "cdn",
    "message_queue",
    "cache",
  ]);
  for (const n of nodes) {
    const inC = inDeg.get(n.id) ?? 0;
    const outC = outDeg.get(n.id) ?? 0;
    if (
      inC > 0 &&
      outC > 0 &&
      !isComputeKind(n.data.componentKind) &&
      !hopOk.has(n.data.componentKind)
    ) {
      checks.push({
        id: `topo-intermediate-${n.id}`,
        category: "topology",
        title: `${n.data.label} used as hop`,
        status: "warn",
        detail: "PDF: mainly only compute components should be intermediates between others.",
      });
    }
  }

  if (computeCount >= 2 && !hasLb) {
    checks.push({
      id: "topo-lb",
      category: "topology",
      title: "Load balancer for multi-instance compute",
      status: "warn",
      detail: "Multiple compute nodes without a load balancer — uneven load / weaker availability.",
    });
  }

  if (hasStatic && !hasCdn) {
    checks.push({
      id: "topo-cdn",
      category: "topology",
      title: "Static Content Hosting pattern",
      status: "warn",
      detail: "Static hosting without CDN — higher client latency for assets (PDF pattern).",
    });
  }

  if (dbCount > 0 && !hasCache) {
    checks.push({
      id: "topo-cache",
      category: "topology",
      title: "Cache Aside opportunity",
      status: "warn",
      detail: "No cache next to the database — consider Redis/Memcached for hot reads (PDF / cost case study).",
    });
  } else if (hasCache && dbCount > 0) {
    checks.push({
      id: "topo-cache-ok",
      category: "topology",
      title: "Cache present",
      status: "pass",
      detail: "Cache can absorb hot reads and lower DB latency/cost.",
    });
  }

  if (hasQueue) {
    checks.push({
      id: "topo-queue",
      category: "topology",
      title: "Async messaging",
      status: "pass",
      detail: "Message queue / pub-sub decouples producers and consumers (Queue-Based Load Levelling).",
    });
  }

  // Security: client-like nodes (static) talking directly to external API
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) {
    const src = byId.get(e.source);
    const tgt = byId.get(e.target);
    if (!src || !tgt) continue;
    const clientish = isClientishKind(src.data.componentKind);
    const external =
      tgt.data.componentKind === "external_api" || src.data.componentKind === "external_api";
    if (clientish && external) {
      checks.push({
        id: `topo-api-keys-${e.id}`,
        category: "topology",
        title: "Client → external API",
        status: "warn",
        detail:
          "PDF/security: API keys on the client risk reverse engineering. Prefer proxying through compute (Type B).",
      });
    }
  }

  // SSE / push should typically originate from compute/server toward clients
  for (const e of edges) {
    const { protocol } = getEdgeData(e);
    if (protocol !== "sse" && protocol !== "web_push") continue;
    const src = byId.get(e.source);
    const tgt = byId.get(e.target);
    if (!src || !tgt) continue;
    const serverish =
      isComputeKind(src.data.componentKind) ||
      src.data.componentKind === "external_api" ||
      src.data.componentKind === "task_worker";
    const clientish =
      isClientishKind(tgt.data.componentKind) || tgt.data.componentKind === "edge";
    if (!serverish || !clientish) {
      checks.push({
        id: `topo-sse-dir-${e.id}`,
        category: "topology",
        title: `${protocol === "sse" ? "SSE" : "Web Push"} direction`,
        status: "warn",
        detail: "Draw SSE / Web Push from server → client (PDF: server delivers messages).",
      });
    }
  }

  const latency = estimatePathLatency(nodes, edges);
  const throughput = estimateThroughputRpm(nodes, features);
  const availability = estimateAvailability(nodes, edges);
  const cost = estimateMonthlyCost(nodes, features);

  const demandedRpm = features.reduce((s, f) => s + f.targetRpm, 0);
  const throughputTarget = Math.max(nfr.minThroughputRpm, demandedRpm);

  checks.push({
    id: "nfr-latency",
    category: "latency",
    title: "Latency budget",
    status: latency <= nfr.maxLatencyMs ? "pass" : "fail",
    detail:
      latency <= nfr.maxLatencyMs
        ? "Estimated critical-path latency meets the NFR."
        : "Critical path is too slow. Add CDN/cache, shorten hops, or add DB replicas.",
    actual: `${Math.round(latency)} ms`,
    target: `≤ ${nfr.maxLatencyMs} ms`,
  });

  const thrStatus: CheckStatus =
    features.length === 0 || unplaced.length > 0
      ? "fail"
      : throughput >= throughputTarget
        ? "pass"
        : "fail";
  checks.push({
    id: "nfr-throughput",
    category: "throughput",
    title: "Throughput capacity",
    status: thrStatus,
    detail:
      thrStatus === "pass"
        ? "Compute + data tier capacity covers target usage across features."
        : "Insufficient capacity. Scale compute, shard DB, add cache, or use queue load-levelling.",
    actual: `${Math.round(throughput)} req/min`,
    target: `≥ ${throughputTarget} req/min`,
  });

  checks.push({
    id: "nfr-availability",
    category: "availability",
    title: "Availability",
    status: availability >= nfr.minAvailabilityPct ? "pass" : "fail",
    detail:
      availability >= nfr.minAvailabilityPct
        ? "Topology meets the availability target."
        : "Raise availability with replicas, load balancer, PaaS/Functions/Edge, CDN, or queues.",
    actual: `${availability.toFixed(2)}%`,
    target: `≥ ${nfr.minAvailabilityPct}%`,
  });

  if (nfr.maxMonthlyCostUsd != null) {
    checks.push({
      id: "nfr-cost",
      category: "cost",
      title: "Cost budget",
      status: cost <= nfr.maxMonthlyCostUsd ? "pass" : "fail",
      detail:
        cost <= nfr.maxMonthlyCostUsd
          ? "Estimated monthly cost is within budget (heuristic; PDF stresses cost as a design axis)."
          : "Over budget. Prefer Functions/Edge at low load, cache-aside, or smaller fixed VMs.",
      actual: `$${cost}/mo`,
      target: `≤ $${nfr.maxMonthlyCostUsd}/mo`,
    });
  }

  const overall = worst(...checks.map((c) => c.status));

  return {
    ranAt: Date.now(),
    overall,
    checks,
    estimatedLatencyMs: Math.round(latency),
    estimatedThroughputRpm: Math.round(throughput),
    estimatedAvailabilityPct: Number(availability.toFixed(2)),
    estimatedMonthlyCostUsd: cost,
  };
}

export { remainingCapacity };
