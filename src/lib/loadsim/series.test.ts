import { describe, expect, it } from "vitest";
import { design, requirement, runDesign } from "@/test/loadsim-designs";
import { cumulativeFailed, maxEdgeRate } from "./series";

const stateless = { resources: { memoryGb: 0.5, vcpus: 0.5, storageGb: 0 } };
const singleVm = design(
  [requirement("ping", { targetRpm: 60, computeMsPerRequest: 10, ...stateless })],
  [
    ["desktop", "desktop"],
    ["vm", "vm", { capacity: { vcpus: 1 } }],
  ],
  ["desktop -> vm : http"],
  { ping: "vm" },
);

describe("series for playback", () => {
  // The hand-worked overload: 7 a step fail from step 50.
  const run = runDesign(singleVm, { requests: 8_400, windowSeconds: 60, shape: "steady" });

  it("counts failures so far at each step", () => {
    const failed = cumulativeFailed(run).vm;
    expect(failed[49]).toBeCloseTo(0, 6);
    expect(failed[50]).toBeCloseTo(7, 6);
    expect(failed[59]).toBeCloseTo(70, 6);
    expect(failed.at(-1)).toBeCloseTo(run.summary.perNode.vm.failed, 6);
  });

  it("finds the busiest edge's rate over the run, in req/s", () => {
    expect(maxEdgeRate(run)).toBeCloseTo(140, 6);
  });
});
