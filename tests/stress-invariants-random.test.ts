import { describe, expect, it } from "vitest";
import { useSimulatorStore } from "@/lib/store";
import { brokenInvariants } from "@/test/invariants";
import { onlySeed, seedInvariants } from "@/test/stress-suite";

// SPEC-stress-harness.md: the invariants on both demos and on random designs.

describe.skipIf(onlySeed !== null)("demos", () => {
  it.each(["loadDemo", "loadFanInDemo"] as const)("%s keeps every invariant", (load) => {
    useSimulatorStore.getState()[load]();
    expect(brokenInvariants(useSimulatorStore.getState(), null), load).toEqual([]);
  });
});

seedInvariants("random");
