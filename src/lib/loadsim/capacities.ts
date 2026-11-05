/**
 * Realistic capacities for small cloud instances, used only by the load simulation
 * (SPEC-dataflow-sim.md). They are not the engine's campus heuristics. Every station
 * has a work budget in milliseconds per second, and each request costs some of it.
 * The range in each comment is how far calibration may move a figure.
 */
export const CAPACITY = {
  /** Share of each vCPU's time usable before queues build (0.6–0.8) */
  utilisationCeiling: 0.7,
  /** 20,000 req/s, 1 ms each */
  loadBalancer: { budgetMs: 1000, costMs: 0.05, timeMs: 1 },
  /** 25,000 ops/s (10,000–50,000), 1 ms each; hit ratio 0.8–0.95 */
  cache: { budgetMs: 1000, costMs: 0.04, timeMs: 1, hitRatio: 0.9 },
  /** Assumed size of each database copy; its config has no size */
  databaseVcpus: 2,
  /** One round trip between the client and the system */
  clientRoundTripMs: { desktop: 20, mobile: 40, iot: 50 } as Record<string, number>,
  /** Each hop inside the system */
  internalHopMs: 1,
  /** A request waiting longer than this at one component is given up on; jobs never are */
  timeoutSeconds: 5,
  /**
   * A managed queue (SPEC-loadsim-queues.md): 3,000 messages/s, in line with a FIFO queue
   * with batching; no campus brief comes near it. Putting a job on it takes 2 ms.
   */
  queue: { budgetMs: 1000, costMs: 1000 / 3000, enqueueMs: 2 },
  /**
   * A task worker runs `concurrency` jobs at once, flat out (no utilisation ceiling: the
   * queue in front absorbs the waiting). Each job costs this much handling plus its share
   * of the feature's slow work.
   */
  worker: { handlingMs: 5 },
};

/**
 * How long recovery takes when a component is switched off (SPEC-loadsim-failures.md),
 * typical of managed cloud services: a load balancer's health check marks an instance
 * down (or back) after 10 s; a replica takes over a database's writes after 30 s; a cache
 * that comes back empty is full again after 30 s.
 */
export const FAILOVER = { healthCheckSeconds: 10, databaseFailoverSeconds: 30, cacheWarmUpSeconds: 30 };

/** Work a task worker can do each second. */
export function workerBudgetMs(concurrency: number): number {
  return Math.max(1, concurrency) * 1000;
}

/** Work a compute instance can do each second. */
export function computeBudgetMs(vcpus: number): number {
  return vcpus * 1000 * CAPACITY.utilisationCeiling;
}

/** Work one database copy can do each second. */
export function databaseBudgetMs(): number {
  return CAPACITY.databaseVcpus * 1000 * CAPACITY.utilisationCeiling;
}
