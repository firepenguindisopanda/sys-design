import { describe, expect, it } from "vitest";
import { challenges, design, fixtureDesign, requirement, runDesign } from "@/test/loadsim-designs";
import { buildDesign } from "@/lib/challenges/design";
import { queueingFactor } from "./model";
import { defaultScenario } from "./scenario";
import type { Scenario } from "./types";

const stateless = { resources: { memoryGb: 0.5, vcpus: 0.5, storageGb: 0 } };

/** A desktop wired straight to one VM running one stateless 10 ms feature. */
function singleVm(vcpus: number) {
  return design(
    [requirement("ping", { targetRpm: 60, computeMsPerRequest: 10, ...stateless })],
    [
      ["desktop", "desktop"],
      ["vm", "vm", { capacity: { vcpus } }],
    ],
    ["desktop -> vm : http"],
    { ping: "vm" },
  );
}

describe("conservation", () => {
  const cases = challenges.flatMap((c) =>
    c.fixtures.map((f) => [`${c.brief.id}/${f.name}`, c.brief, f] as const),
  );

  it.each(cases)("%s: served + failed = requests", (_, brief, fixture) => {
    const built = buildDesign(brief, fixture);
    const run = runDesign(built, defaultScenario(brief), { brief });
    const { summary } = run;
    expect(Math.abs(summary.served + summary.failed - summary.requests)).toBeLessThan(0.5);
    const grouped = summary.failures.reduce((s, f) => s + f.count, 0);
    expect(Math.abs(grouped - summary.failed)).toBeLessThan(0.5);
  });
});

describe("nodes requests pass through (SPEC-loadsim-routing.md)", () => {
  // An overloaded one-vCPU VM must serve the same share whatever sits in front of it.
  // Stations used to run in a fixed kind order, so a CDN ran after the VM and its
  // requests reached the VM after the VM's turn, skipping its capacity.
  const overload: Scenario = { requests: 200000, windowSeconds: 600, shape: "steady" };
  const ping = requirement("ping", { targetRpm: 60, computeMsPerRequest: 10, ...stateless });
  const served = (edges: string[]) => {
    const built = design(
      [ping],
      [
        ["d", "desktop"],
        ["cdn", "cdn"],
        ["static", "static_hosting"],
        ["lb2", "load_balancer"],
        ["lb", "load_balancer"],
        ["vm", "vm", { capacity: { vcpus: 1 } }],
      ],
      edges,
      { ping: "vm" },
    );
    const s = runDesign(built, overload).summary;
    return s.served / s.requests;
  };
  const direct = served(["d -> lb : http", "lb -> vm : http"]);

  it.each([
    ["a CDN", ["d -> cdn : http", "cdn -> lb : http", "lb -> vm : http"]],
    ["a CDN and static hosting", ["d -> cdn : http", "cdn -> static : http", "static -> lb : http", "lb -> vm : http"]],
    ["a CDN beside the direct route", ["d -> lb : http", "d -> cdn : http", "cdn -> lb : http", "lb -> vm : http"]],
    ["a second load balancer", ["d -> lb2 : http", "lb2 -> lb : http", "lb -> vm : http"]],
  ])("serves the same share through %s", (_, edges) => {
    expect(direct).toBeLessThan(0.5);
    expect(served(edges)).toBeCloseTo(direct, 6);
  });
});

describe("determinism", () => {
  it("gives identical output for identical input", () => {
    const built = fixtureDesign("course-registration", "bad-no-cache");
    const scenario = defaultScenario(built.brief);
    const a = runDesign(built, scenario, { brief: built.brief });
    const b = runDesign(built, scenario, { brief: built.brief });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("under capacity", () => {
  const run = runDesign(singleVm(1), { requests: 1_000, windowSeconds: 600, shape: "steady" });

  it("fails nothing and saturates nothing", () => {
    expect(run.summary.failed).toBe(0);
    expect(run.summary.firstSaturation).toBeNull();
    expect(run.frames.every((f) => f.nodes.vm.backlog < 1e-6)).toBe(true);
  });

  it("answers in the sum of the base times: 20 ms from a desktop plus 10 ms of compute", () => {
    expect(run.summary.p50Ms).toBeGreaterThanOrEqual(29);
    expect(run.summary.p50Ms).toBeLessThanOrEqual(31);
    expect(run.summary.p95Ms).toBeLessThanOrEqual(31);
  });
});

describe("gradual slowdown before saturation", () => {
  // Queueing wait grows with how busy a component is, well before it saturates. With one
  // server it's busy ÷ (1 − busy) × the time per request: at 80%, 4 × 10 ms = 40 ms.
  it("follows the single-server rule for one server", () => {
    expect(queueingFactor(0.5, 1)).toBeCloseTo(1, 9);
    expect(queueingFactor(0.8, 1)).toBeCloseTo(4, 9);
    expect(queueingFactor(0.9, 1)).toBeCloseTo(9, 9);
    expect(queueingFactor(0, 1)).toBe(0);
  });

  it("waits less with more servers at the same utilisation", () => {
    expect(queueingFactor(0.8, 2)).toBeLessThan(queueingFactor(0.8, 1));
    expect(queueingFactor(0.8, 2)).toBeCloseTo(1.81, 2);
  });

  it("is capped so the backlog takes over from saturation", () => {
    expect(queueingFactor(1.5, 1)).toBe(queueingFactor(0.95, 1));
  });

  it("adds the wait to latency: one vCPU at 80% answers in 20 + 10 + 40 ms", () => {
    // 56 req/s against 70.
    const run = runDesign(singleVm(1), { requests: 3_360, windowSeconds: 60, shape: "steady" });
    expect(run.summary.failed).toBe(0);
    expect(run.summary.firstSaturation).toBeNull();
    expect(run.summary.p50Ms).toBeGreaterThanOrEqual(69.5);
    expect(run.summary.p50Ms).toBeLessThanOrEqual(70.5);
  });

  it("waits less on two vCPUs at the same 80%", () => {
    // 112 req/s against 140: 20 + 10 + 1.81 × 10 ms.
    const run = runDesign(singleVm(2), { requests: 6_720, windowSeconds: 60, shape: "steady" });
    expect(run.summary.p50Ms).toBeGreaterThanOrEqual(47.5);
    expect(run.summary.p50Ms).toBeLessThanOrEqual(48.7);
  });
});

describe("one component at twice its capacity (worked by hand)", () => {
  // 1 vCPU × 1000 ms × 0.7 = 700 ms of work a second; at 10 ms a request that's 70 req/s.
  // 140 req/s for 60 s is 8,400 requests: 14 arrive per 0.1 s step and 7 are served, so
  // the backlog grows by 7 a step. The client gives up after 5 s, so the VM holds at
  // most 350 waiting requests; from step 50 on, 7 a step fail. After the window the 350
  // still waiting are served: 4,200 + 350 served and 3,850 failed.
  const run = runDesign(singleVm(1), { requests: 8_400, windowSeconds: 60, shape: "steady" });
  const vm = run.frames.map((f) => f.nodes.vm);

  it("steps the window in 600 steps of 0.1 s, then drains", () => {
    expect(run.windowSteps).toBe(600);
    expect(run.dtSeconds).toBeCloseTo(0.1, 9);
    expect(run.frames.length).toBeGreaterThan(600);
    expect(vm.at(-1)!.backlog).toBeLessThan(1e-6);
  });

  it("grows the backlog by the excess", () => {
    expect(vm[0].arrivals).toBeCloseTo(14, 6);
    expect(vm[0].served).toBeCloseTo(7, 6);
    expect(vm[9].backlog).toBeCloseTo(70, 6);
    expect(vm[0].utilisation).toBeCloseTo(2, 6);
  });

  it("starts failing once a request would wait more than 5 s", () => {
    const firstFail = vm.findIndex((f) => f.failed > 1e-6);
    expect(firstFail).toBe(50);
    expect(vm[50].failed).toBeCloseTo(7, 6);
    expect(vm[60].backlog).toBeCloseTo(350, 6);
  });

  it("names the VM as first to saturate and blames it for the failures", () => {
    expect(run.summary.firstSaturation).toMatchObject({ nodeId: "vm", atSeconds: 0 });
    expect(run.summary.failed).toBeCloseTo(3_850, 0);
    expect(run.summary.served).toBeCloseTo(4_550, 0);
    expect(run.summary.failures).toEqual([
      expect.objectContaining({ nodeId: "vm", reason: "timed-out", count: expect.closeTo(3_850, 0) }),
    ]);
    expect(run.summary.perNode.vm.peakBacklog).toBeCloseTo(350, 6);
  });

  it("marks the edge into the VM with the share that failed there", () => {
    const edge = run.frames[50].edges["desktop->vm"];
    expect(edge.volume).toBeCloseTo(14, 6);
    expect(edge.failedShare).toBeCloseTo(0.5, 6);
  });
});

describe("cost depends on steps, not requests", () => {
  it("runs a million requests in the same number of frames", () => {
    const small = runDesign(singleVm(64), { requests: 1_000, windowSeconds: 600, shape: "steady" });
    const started = performance.now();
    const big = runDesign(singleVm(64), { requests: 1_000_000, windowSeconds: 600, shape: "steady" });
    expect(performance.now() - started).toBeLessThan(2_000);
    expect(big.frames.length).toBe(small.frames.length);
  });
});
