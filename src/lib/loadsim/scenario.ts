import type { Brief } from "@/lib/challenges/types";
import type { FeatureBlock } from "@/lib/types";
import type { FeatureLoads, Scenario } from "./types";

/** Every run's window is split into this many steps. */
export const STEPS = 600;

const DEFAULT_SCENARIO: Scenario = { requests: 100_000, windowSeconds: 1200, shape: "spike" };
const DEFAULT_READ_DB_MS = 3;
const DEFAULT_WRITE_DB_MS = 8;
/** Write share for a feature that stores data and doesn't say otherwise */
const DEFAULT_WRITE_SHARE = 0.2;

/** Requests arriving in each step. */
export function arrivals(scenario: Scenario, steps = STEPS): number[] {
  const { requests, shape } = scenario;
  if (shape === "steady") return Array.from({ length: steps }, () => requests / steps);
  if (shape === "ramp") {
    // The rate rises evenly from zero: step i gets weight i + ½.
    const total = (steps * steps) / 2;
    return Array.from({ length: steps }, (_, i) => (requests * (i + 0.5)) / total);
  }
  // Spike: half the requests in the first quarter, the other half evenly after it.
  const quarter = Math.floor(steps / 4);
  return Array.from({ length: steps }, (_, i) =>
    i < quarter ? requests / 2 / quarter : requests / 2 / (steps - quarter),
  );
}

/** The brief's default scenario, field by field, or the sandbox default. */
export function defaultScenario(brief: Brief | null): Scenario {
  const load = brief?.load;
  return {
    requests: load?.requests ?? DEFAULT_SCENARIO.requests,
    windowSeconds: load?.windowSeconds ?? DEFAULT_SCENARIO.windowSeconds,
    shape: load?.shape ?? DEFAULT_SCENARIO.shape,
  };
}

/** Each feature's share of the traffic (by targetRpm) and its database costs. */
export function featureLoads(features: FeatureBlock[], brief: Brief | null): FeatureLoads {
  const total = features.reduce((s, f) => s + f.targetRpm, 0);
  const loads: FeatureLoads = {};
  for (const f of features) {
    const set = brief?.load?.features?.[f.id];
    const fallbackShare = f.writeRpm
      ? Math.min(1, f.writeRpm / Math.max(f.targetRpm, 1))
      : f.resources.storageGb > 0
        ? DEFAULT_WRITE_SHARE
        : 0;
    loads[f.id] = {
      share: total > 0 ? f.targetRpm / total : 1 / features.length,
      writeShare: set?.writeShare ?? fallbackShare,
      readDbMs: set?.dbMs ?? DEFAULT_READ_DB_MS,
      writeDbMs: set?.dbMs ?? DEFAULT_WRITE_DB_MS,
      batch: set?.batch ?? 1,
      slowWork: set?.slowWork ?? "wait",
      apiMs: set?.apiMs ?? null,
      slowMs: set?.slowMs ?? null,
    };
  }
  return loads;
}
