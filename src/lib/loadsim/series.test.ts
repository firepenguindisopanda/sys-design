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
  // The hand-worked overload: 1.4 fail at step 47, then 7 a step (model.test.ts; from step
  // 50 before SPEC-loadsim-cascades.md, when clients waited 5 s at the VM itself).
  const run = runDesign(singleVm, { requests: 8_400, windowSeconds: 60, shape: "steady" });

  it("counts failures so far at each step", () => {
    const failed = cumulativeFailed(run).vm;
    expect(failed[46]).toBeCloseTo(0, 6);
    expect(failed[47]).toBeCloseTo(1.4, 6);
    expect(failed[48]).toBeCloseTo(8.4, 6);
    expect(failed[57]).toBeCloseTo(71.4, 6);
    expect(failed.at(-1)).toBeCloseTo(run.summary.perNode.vm.failed, 6);
  });

  it("finds the busiest edge's rate over the run, in req/s", () => {
    expect(maxEdgeRate(run)).toBeCloseTo(140, 6);
  });
});
