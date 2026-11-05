import { describe, expect, it } from "vitest";
import { briefById, design, requirement } from "@/test/loadsim-designs";
import { STEPS, arrivals, defaultScenario, featureLoads } from "./scenario";

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

describe("arrivals", () => {
  it.each(["steady", "ramp", "spike"] as const)("%s adds up to the requests over 600 steps", (shape) => {
    const steps = arrivals({ requests: 100_000, windowSeconds: 1200, shape });
    expect(steps).toHaveLength(STEPS);
    expect(STEPS).toBe(600);
    expect(Math.abs(sum(steps) - 100_000)).toBeLessThan(1e-6);
  });

  it("steady is flat", () => {
    const steps = arrivals({ requests: 60_000, windowSeconds: 600, shape: "steady" });
    expect(new Set(steps.map((x) => x.toFixed(9))).size).toBe(1);
    expect(steps[0]).toBeCloseTo(100, 9);
  });

  it("ramp rises from near zero", () => {
    const steps = arrivals({ requests: 100_000, windowSeconds: 1200, shape: "ramp" });
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
    expect(steps[0]).toBeLessThan(steps[599] / 100);
  });

  it("spike puts half the requests in the first quarter, then an even rate", () => {
    const steps = arrivals({ requests: 100_000, windowSeconds: 1200, shape: "spike" });
    expect(sum(steps.slice(0, 150))).toBeCloseTo(50_000, 6);
    expect(sum(steps.slice(150))).toBeCloseTo(50_000, 6);
    expect(new Set(steps.slice(150).map((x) => x.toFixed(9))).size).toBe(1);
  });
});

describe("defaultScenario", () => {
  it("is 100,000 requests over 20 minutes with a spike without a brief load block", () => {
    expect(defaultScenario(null)).toEqual({ requests: 100_000, windowSeconds: 1200, shape: "spike" });
    expect(defaultScenario(briefById("chat-app"))).toEqual({
      requests: 100_000,
      windowSeconds: 1200,
      shape: "spike",
    });
  });

  it("takes each field the brief's load block sets", () => {
    const brief = { ...briefById("chat-app"), load: { windowSeconds: 600, shape: "steady" as const } };
    expect(defaultScenario(brief)).toEqual({ requests: 100_000, windowSeconds: 600, shape: "steady" });
  });
});

describe("featureLoads", () => {
  it("splits traffic across features by targetRpm", () => {
    const brief = briefById("link-shortener");
    const built = design(brief.functionalRequirements, [], [], {});
    const loads = featureLoads(built.features, brief);
    expect(loads.redirect.share).toBeCloseTo(1200 / 1260, 9);
    expect(loads["create-link"].share).toBeCloseTo(60 / 1260, 9);
  });

  it("defaults writeShare from writeRpm, then 0.2 for storing features, then 0", () => {
    const lab = briefById("lab-monitor");
    const labFeatures = design(lab.functionalRequirements, [], [], {}).features;
    const report = labFeatures.find((f) => f.id === "report-metrics")!;
    expect(featureLoads(labFeatures, null)["report-metrics"].writeShare).toBeCloseTo(
      report.writeRpm! / report.targetRpm,
      9,
    );

    const features = design(
      [
        requirement("stores", { targetRpm: 100, computeMsPerRequest: 10 }),
        requirement("stateless", {
          targetRpm: 100,
          computeMsPerRequest: 10,
          resources: { memoryGb: 0.5, vcpus: 0.5, storageGb: 0 },
        }),
      ],
      [],
      [],
      {},
    ).features;
    const loads = featureLoads(features, null);
    expect(loads.stores.writeShare).toBe(0.2);
    expect(loads.stateless.writeShare).toBe(0);
  });

  it("defaults database time to 3 ms for reads and 8 ms for writes", () => {
    const features = design([requirement("a", { targetRpm: 1, computeMsPerRequest: 10 })], [], [], {}).features;
    expect(featureLoads(features, null).a).toMatchObject({ readDbMs: 3, writeDbMs: 8 });
  });

  it("takes writeShare and dbMs from the brief's load block", () => {
    const brief = {
      ...briefById("link-shortener"),
      load: { features: { redirect: { writeShare: 0, dbMs: 2 }, "create-link": { writeShare: 1 } } },
    };
    const features = design(brief.functionalRequirements, [], [], {}).features;
    const loads = featureLoads(features, brief);
    expect(loads.redirect).toMatchObject({ writeShare: 0, readDbMs: 2, writeDbMs: 2 });
    expect(loads["create-link"]).toMatchObject({ writeShare: 1, readDbMs: 3, writeDbMs: 8 });
  });

  it("defaults batch to 1 and takes it from the brief's load block (SPEC-loadsim-queues.md)", () => {
    const brief = briefById("link-shortener");
    const features = design(brief.functionalRequirements, [], [], {}).features;
    expect(featureLoads(features, null).redirect.batch).toBe(1);
    const batched = { ...brief, load: { features: { "create-link": { batch: 10 } } } };
    const loads = featureLoads(features, batched);
    expect(loads["create-link"].batch).toBe(10);
    expect(loads.redirect.batch).toBe(1);
  });
});
