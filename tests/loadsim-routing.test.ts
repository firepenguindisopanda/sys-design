import { describe, expect, it } from "vitest";
import { useSimulatorStore } from "@/lib/store";
import { fixtureDesign, runDesign } from "@/test/loadsim-designs";
import type { Scenario } from "@/lib/loadsim/types";

// SPEC-loadsim-routing.md: designs that are fine shouldn't lose requests to routing.
// A light load keeps the separate default-load calibration gap out of these checks.
const light: Scenario = { requests: 2000, windowSeconds: 1200, shape: "steady" };

function beuwiDemo() {
  useSimulatorStore.getState().loadDemo();
  const { nodes, edges, features } = useSimulatorStore.getState();
  return { nodes, edges, features };
}

describe("routing guards", () => {
  it("lab-monitor's reference design serves its requests (the push-only phone sends none)", () => {
    const built = fixtureDesign("lab-monitor", "good");
    const s = runDesign(built, light, { brief: built.brief }).summary;
    expect(s.served / s.requests).toBeGreaterThanOrEqual(0.99);
  });

  it("the BeUWI demo serves its requests through its CDN and static hosting", () => {
    const demo = beuwiDemo();
    const s = runDesign(demo, light).summary;
    expect(s.served / s.requests).toBeGreaterThanOrEqual(0.99);
    const cdn = demo.nodes.find((n) => n.data.componentKind === "cdn")!;
    const staticHosting = demo.nodes.find((n) => n.data.componentKind === "static_hosting")!;
    expect(s.perNode[cdn.id].served).toBeGreaterThan(0);
    expect(s.perNode[staticHosting.id].peakUtilisation).toBeGreaterThan(0);
    // Their file traffic is still listed as not simulated, but not under their node ids,
    // so their gauges show how busy they are.
    const ids = s.notSimulated.map((n) => n.id);
    expect(ids).not.toContain(cdn.id);
    expect(s.notSimulated.some((n) => n.text.startsWith("CDN (CDN): file traffic"))).toBe(true);
  });
});
