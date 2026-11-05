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
  /** A request waiting longer than this at one component is given up on */
  timeoutSeconds: 5,
};

/** Work a compute instance can do each second. */
export function computeBudgetMs(vcpus: number): number {
  return vcpus * 1000 * CAPACITY.utilisationCeiling;
}

/** Work one database copy can do each second. */
export function databaseBudgetMs(): number {
  return CAPACITY.databaseVcpus * 1000 * CAPACITY.utilisationCeiling;
}
