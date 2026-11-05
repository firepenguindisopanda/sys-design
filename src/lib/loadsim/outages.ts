import { isComputeKind } from "@/lib/catalog";
import { CAPACITY, FAILOVER } from "./capacities";
import type { SimNode } from "./types";

/**
 * Components a student switches off during playback (SPEC-loadsim-failures.md). Times are
 * seconds into the run; `onAt` null means off until the end.
 */
export type Outage = { nodeId: string; offAt: number; onAt: number | null };

/** Compute instances, databases, caches and workers; managed services run on many machines. */
export function canSwitchOff(kind: string): boolean {
  return isComputeKind(kind) || kind === "database" || kind === "cache" || kind === "task_worker";
}

const MANAGED_WORDS: Record<string, string> = {
  load_balancer: "a load balancer",
  message_queue: "a queue",
  cdn: "a CDN",
  static_hosting: "static hosting",
  external_api: "an external API",
};

/** Why a list of outages can't be simulated, or null when it can. */
export function validateOutages(nodes: SimNode[], outages: Outage[]): string | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const o of outages) {
    const node = byId.get(o.nodeId);
    if (!node) return `There's no component "${o.nodeId}" to switch off.`;
    const kind = node.data.componentKind;
    if (!canSwitchOff(kind)) {
      const what = MANAGED_WORDS[kind] ? `it's ${MANAGED_WORDS[kind]}, a managed service` : "it isn't part of the system";
      return `${node.data.label} can't be switched off: ${what}.`;
    }
    if (!(o.offAt >= 0)) return `The outage on ${o.nodeId} must start at 0 s or later.`;
    if (o.onAt !== null && !(o.onAt > o.offAt)) return `The outage on ${o.nodeId} must end after it starts.`;
  }
  for (const id of new Set(outages.map((o) => o.nodeId))) {
    const mine = outages.filter((o) => o.nodeId === id).sort((a, b) => a.offAt - b.offAt);
    for (let i = 1; i < mine.length; i++) {
      const before = mine[i - 1];
      if (before.onAt === null || before.onAt > mine[i].offAt) return `Outages on ${id} overlap.`;
    }
  }
  return null;
}

export type NodeState = {
  /** Inside an outage */
  down: boolean;
  /** A compute instance a load balancer sends requests to: until it notices it's down, and once it notices it's back */
  routable: boolean;
  /** A database's copy that takes writes */
  primaryCopy: number;
  /** A database's copy that's off, while it is */
  downCopy: number | null;
  /** A database whose writes have nowhere to go: before a replica takes over, or with no replica */
  writesFail: boolean;
  /** A cache's share of reads it answers */
  hitRatio: number;
};

const byStart = (a: Outage, b: Outage) => a.offAt - b.offAt;

/** A component's state at `t` seconds, given every outage. */
export function nodeState(outages: Outage[], node: SimNode, t: number): NodeState {
  const mine = outages.filter((o) => o.nodeId === node.id).sort(byStart);
  const current = mine.find((o) => o.offAt <= t && (o.onAt === null || t < o.onAt)) ?? null;
  const lastEnded = mine.filter((o) => o.onAt !== null && o.onAt <= t).at(-1) ?? null;
  const config = node.data.config;
  const copies = config.kind === "database" ? Math.max(1, config.replicas) : 1;

  // Each outage that outlasts the failover moves the writes to another copy, for good.
  let primaryCopy = 0;
  let downCopy: number | null = null;
  if (copies >= 2) {
    for (const o of mine) {
      if (o.offAt > t) break;
      if (o === current) downCopy = primaryCopy;
      const failedOver = o.offAt + FAILOVER.databaseFailoverSeconds;
      if (failedOver <= t && (o.onAt === null || o.onAt > failedOver)) primaryCopy = (primaryCopy + 1) % copies;
    }
  } else if (current) {
    downCopy = 0;
  }

  const healthCheck = FAILOVER.healthCheckSeconds;
  const routable = current
    ? t - current.offAt < healthCheck
    : !(lastEnded && t - lastEnded.onAt! < healthCheck);

  const full = CAPACITY.cache.hitRatio;
  const hitRatio = current
    ? 0
    : lastEnded && t - lastEnded.onAt! < FAILOVER.cacheWarmUpSeconds
      ? (full * (t - lastEnded.onAt!)) / FAILOVER.cacheWarmUpSeconds
      : full;

  const writesFail =
    config.kind === "database" && !!current && (copies < 2 || t < current.offAt + FAILOVER.databaseFailoverSeconds);

  return { down: !!current, routable, primaryCopy, downCopy, writesFail, hitRatio };
}

const ordered = (list: Outage[]) => [...list].sort((a, b) => a.nodeId.localeCompare(b.nodeId) || a.offAt - b.offAt);

/**
 * What pressing a component's power button at `t` does: if it's off, it comes back then
 * (and its later outages go); if it's on, it goes off then, until its next outage begins.
 */
export function toggleOutage(outages: Outage[], nodeId: string, t: number): Outage[] {
  const others = outages.filter((o) => o.nodeId !== nodeId);
  const mine = outages.filter((o) => o.nodeId === nodeId).sort(byStart);
  const current = mine.find((o) => o.offAt <= t && (o.onAt === null || t < o.onAt));
  if (current) {
    const earlier = mine.filter((o) => o.offAt < current.offAt);
    const closed = t > current.offAt ? [{ ...current, onAt: t }] : [];
    return ordered([...others, ...earlier, ...closed]);
  }
  const upcoming = mine.find((o) => o.offAt > t);
  return ordered([...others, ...mine, { nodeId, offAt: t, onAt: upcoming ? upcoming.offAt : null }]);
}
