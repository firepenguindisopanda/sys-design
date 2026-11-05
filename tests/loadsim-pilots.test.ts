import { describe, expect, it } from "vitest";
import { defaultScenario } from "@/lib/loadsim/scenario";
import { fixtureDesign, runDesign } from "@/test/loadsim-designs";

// Calibration of the load simulation on its two pilot briefs (SPEC-dataflow-sim.md), each
// under its brief's default scenario. Capacities are realistic, and each brief's `dbMs`
// is a realistic cost for that query; neither is raised just to make a flaw show.
function run(briefId: string, fixture: string) {
  const built = fixtureDesign(briefId, fixture);
  return runDesign(built, defaultScenario(built.brief), { brief: built.brief }).summary;
}

describe("both pilot briefs have a default load scenario", () => {
  it.each(["link-shortener", "course-registration"])("%s", (briefId) => {
    expect(fixtureDesign(briefId, "good").brief.load).toBeDefined();
  });
});

describe.each(["link-shortener", "course-registration"])("%s: good design", (briefId) => {
  it("serves at least 99% with nothing saturated", () => {
    const s = run(briefId, "good");
    expect(s.served / s.requests).toBeGreaterThanOrEqual(0.99);
    expect(s.firstSaturation).toBeNull();
  });
});

describe("course-registration: no cache", () => {
  it("saturates the database first, and at least 5% of requests fail", () => {
    const s = run("course-registration", "bad-no-cache");
    expect(s.firstSaturation?.nodeId).toBe("db");
    expect(s.failed / s.requests).toBeGreaterThanOrEqual(0.05);
  });
});

describe("link-shortener: no cache", () => {
  // A redirect is a key lookup: realistically cheap, so the flaw costs speed and
  // capacity rather than failures (decision on open question 1).
  const good = run("link-shortener", "good");
  const bad = run("link-shortener", "bad-no-cache");

  it("fails nothing", () => {
    expect(bad.failed).toBeLessThan(0.5);
  });

  it("works the database at least twice as hard", () => {
    // Link creations still write to the primary either way, so the ratio stays well under
    // the read ratio (about 4× with realistic costs).
    expect(bad.perNode.db.peakUtilisation).toBeGreaterThanOrEqual(2 * good.perNode.db.peakUtilisation);
  });

  it("answers a typical request more slowly", () => {
    // p50, not p95: a cache miss pays for the cache and the database, so with realistic
    // costs the cache speeds up typical answers but not the slowest (found in Task 4).
    expect(bad.p50Ms).toBeGreaterThan(good.p50Ms);
  });

  it("says what a cache would save", () => {
    expect(bad.notes.some((n) => n.startsWith("Links DB") && n.includes("A cache in front would bring it to about"))).toBe(
      true,
    );
  });
});

describe("link-shortener: no load balancer", () => {
  it("fails the phone's redirects: it reaches only the instance running Create link", () => {
    const s = run("link-shortener", "bad-no-load-balancer");
    const phone = s.failures.find((f) => f.reason === "no-route" && f.clientId === "phone" && f.featureId === "redirect");
    expect(phone?.count).toBeGreaterThan(0);
  });
});
