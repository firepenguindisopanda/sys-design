import { describe, expect, it } from "vitest";
import { useSimulatorStore } from "@/lib/store";

// Pins the built-in demos' verification results so engine changes that move
// them show up here. Recorded before phase 2 (reachability) and expected to
// stay the same through it.
function verifyDemo(load: "loadDemo" | "loadFanInDemo") {
  useSimulatorStore.getState()[load]();
  useSimulatorStore.getState().runVerification();
  const v = useSimulatorStore.getState().verification!;
  return {
    overall: v.overall,
    estimates: [
      v.estimatedLatencyMs,
      v.estimatedThroughputRpm,
      v.estimatedAvailabilityPct,
      v.estimatedMonthlyCostUsd,
    ],
    // Store node ids carry a counter (e.g. "static_hosting-5"); strip it.
    nonPass: v.checks
      .filter((c) => c.status !== "pass")
      .map((c) => `${c.status} ${c.id.replace(/-\d+$/, "-<n>")}`),
  };
}

describe("demo designs", () => {
  it("BeUWI demo", () => {
    expect(verifyDemo("loadDemo")).toEqual({
      overall: "warn",
      estimates: [96, 860, 99.8, 190],
      nonPass: ["warn topo-intermediate-static_hosting-<n>"],
    });
  });

  it("fan-in DB demo", () => {
    expect(verifyDemo("loadFanInDemo")).toEqual({
      overall: "fail",
      estimates: [20, 520, 97.8, 710],
      nonPass: ["warn topo-lb", "warn topo-cache", "fail nfr-availability", "fail nfr-cost"],
    });
  });
});
