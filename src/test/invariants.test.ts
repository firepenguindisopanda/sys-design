import { describe, expect, it } from "vitest";
import { runVerification } from "@/lib/simulation";
import { defaultScenario, featureLoads } from "@/lib/loadsim/scenario";
import { simulateLoad } from "@/lib/loadsim/model";
import type { LoadRun, SimNode } from "@/lib/loadsim/types";
import type { VerificationResult } from "@/lib/types";
import { fixtureDesign } from "./loadsim-designs";
import { generateDesign } from "./gen-designs";
import { brokenInvariants, canonical, checkEngine, checkLoadRun, type Broken } from "./invariants";

// SPEC-stress-harness.md, Task 2. Each check is fed a doctored result and must name the
// invariant it breaks, so a check that can never fail is caught here.

const ids = (broken: Broken[]) => broken.map((b) => b.id);

function engineOf(briefId: string, fixture: string): VerificationResult {
  const d = fixtureDesign(briefId, fixture);
  return runVerification(d.nodes, d.edges, d.features, d.nfr);
}

function loadRunOf(briefId: string, fixture: string): LoadRun {
  const d = fixtureDesign(briefId, fixture);
  return simulateLoad({
    nodes: d.nodes,
    edges: d.edges,
    features: d.features,
    scenario: defaultScenario(d.brief),
    loads: featureLoads(d.features, d.brief),
  });
}

const engine = engineOf("link-shortener", "good");
const run = loadRunOf("link-shortener", "good");
/** Has background jobs, for the jobs invariant */
const jobsRun = loadRunOf("lab-autograder", "good");

describe("checkEngine", () => {
  it("passes a real result", () => {
    expect(checkEngine(engine)).toEqual([]);
  });

  it("E2: a NaN estimate", () => {
    expect(ids(checkEngine({ ...engine, estimatedLatencyMs: NaN }))).toEqual(["E2"]);
  });

  it("E2: a negative estimate", () => {
    expect(ids(checkEngine({ ...engine, estimatedMonthlyCostUsd: -1 }))).toEqual(["E2"]);
  });

  it("E2: availability over 100", () => {
    expect(ids(checkEngine({ ...engine, estimatedAvailabilityPct: 101 }))).toEqual(["E2"]);
  });

  it("E3: an overall better than the worst check", () => {
    const failing = engineOf("link-shortener", "bad-no-cache");
    expect(failing.overall).toBe("fail");
    expect(ids(checkEngine({ ...failing, overall: "pass" }))).toEqual(["E3"]);
  });
});

describe("checkLoadRun", () => {
  const doctor = (base: LoadRun, change: (r: LoadRun) => void): LoadRun => {
    const copy = structuredClone(base);
    change(copy);
    return copy;
  };

  it("passes real runs", () => {
    expect(checkLoadRun(run)).toEqual([]);
    expect(jobsRun.summary.jobs).not.toBeNull();
    expect(checkLoadRun(jobsRun)).toEqual([]);
  });

  it("L2: an Infinity in a frame", () => {
    const bad = doctor(run, (r) => {
      const [nodeId] = Object.keys(r.frames[3].nodes);
      r.frames[3].nodes[nodeId].utilisation = Infinity;
    });
    const broken = checkLoadRun(bad);
    expect(ids(broken)).toEqual(["L2"]);
    expect(broken[0].text).toMatch(/frames\[3\]/);
  });

  it("L3: served + 1", () => {
    expect(ids(checkLoadRun(doctor(run, (r) => (r.summary.served += 1))))).toEqual(["L3"]);
  });

  it("L3 tolerates the model's rounding", () => {
    expect(checkLoadRun(doctor(run, (r) => (r.summary.served += 1e-8)))).toEqual([]);
  });

  it("L4: failure groups off by 1", () => {
    const bad = doctor(run, (r) =>
      r.summary.failures.push({ nodeId: null, clientId: null, featureId: null, reason: "no-route", count: 1, text: "" }),
    );
    expect(ids(checkLoadRun(bad))).toEqual(["L4"]);
  });

  it("L5: a negative backlog", () => {
    const bad = doctor(run, (r) => {
      const [nodeId] = Object.keys(r.summary.perNode);
      r.summary.perNode[nodeId].peakBacklog = -5;
    });
    expect(ids(checkLoadRun(bad))).toEqual(["L5"]);
  });

  it("L5: a negative utilisation in a frame", () => {
    const bad = doctor(run, (r) => {
      const [nodeId] = Object.keys(r.frames[0].nodes);
      r.frames[0].nodes[nodeId].utilisation = -0.1;
    });
    expect(ids(checkLoadRun(bad))).toEqual(["L5"]);
  });

  it("L6: p50 above p95", () => {
    expect(ids(checkLoadRun(doctor(run, (r) => (r.summary.p50Ms = r.summary.p95Ms + 1))))).toEqual(["L6"]);
  });

  it("L7: jobs off by 1", () => {
    expect(ids(checkLoadRun(doctor(jobsRun, (r) => (r.summary.jobs!.done += 1))))).toEqual(["L7"]);
  });
});

describe("canonical", () => {
  it("replaces node and edge ids by position, so renamed ids compare equal", () => {
    const a = canonical({ id: "topo-lb-static_hosting-5", key: "a->static_hosting-5", n: "static_hosting-5" }, ["static_hosting-5", "a"], []);
    const b = canonical({ id: "topo-lb-static-hosting-5", key: "a->static-hosting-5", n: "static-hosting-5" }, ["static-hosting-5", "a"], []);
    expect(a).toBe(b);
  });

  it("doesn't touch an id inside a longer one", () => {
    expect(canonical({ x: "api-10" }, ["api-1"], [])).toBe(canonical({ x: "api-10" }, ["api-2"], []));
    expect(canonical({ x: "api-1" }, ["api-1"], [])).not.toBe(canonical({ x: "api-1" }, ["api-2"], []));
  });
});

describe("brokenInvariants", () => {
  it("finds nothing wrong with the link shortener's reference design", () => {
    const d = fixtureDesign("link-shortener", "good");
    expect(brokenInvariants(d, d.brief)).toEqual([]);
  });

  it("finds nothing wrong with random seed 1", () => {
    expect(brokenInvariants(generateDesign({ seed: 1, shape: "random" }), null)).toEqual([]);
  });

  it("reports a throw as E1 and L1 instead of throwing", () => {
    const d = generateDesign({ seed: 1, shape: "random" });
    // A node with no data makes both the engine and the model throw.
    const broken = { ...d, nodes: [...d.nodes, { id: "ghost" } as unknown as SimNode] };
    const result = brokenInvariants(broken, null);
    expect(ids(result)).toEqual(expect.arrayContaining(["E1", "L1"]));
    expect(result.find((b) => b.id === "E1")!.text).toMatch(/threw/);
  });

  it("skips determinism, the outage and the round trip when asked", () => {
    const d = generateDesign({ seed: 2, shape: "app" });
    expect(brokenInvariants(d, null, { determinism: false, outage: false, roundTrip: false })).toEqual([]);
  });
});
