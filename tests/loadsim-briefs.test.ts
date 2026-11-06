import { describe, expect, it } from "vitest";
import { isComputeKind } from "@/lib/catalog";
import { defaultScenario } from "@/lib/loadsim/scenario";
import type { FailureReason, LoadRun, Summary } from "@/lib/loadsim/types";
import { briefById, fixtureDesign, runDesign } from "@/test/loadsim-designs";

// The twelve briefs calibrated in SPEC-brief-load-rollout.md, each under its own default
// load. The four earlier pilots are in loadsim-pilots.test.ts.
const BRIEFS = [
  "campus-food-guide",
  "chat-app",
  "club-auction",
  "club-photo-wall",
  "course-assistant",
  "file-storage",
  "printing-credits",
  "shuttle-tracker",
  "textbook-price-watch",
];

// The course assistant's slowest 5% all wait for the model's first words, since 43% of its
// requests ask a question: they get 1,000 ms plus that call (decided in Task 4). The
// call's own figure stays honest, about 1,000 ms (open question 3).
const MODEL_CALL_ALLOWED: Record<string, number> = {
  "course-assistant": briefById("course-assistant").load?.features?.["ask-question"]?.apiMs ?? 0,
};

// Each run once, on first use, so a failing brief can't stop the others loading.
const runs = new Map<string, LoadRun>();
function runOf(briefId: string, fixture: string): LoadRun {
  const key = `${briefId}/${fixture}`;
  if (!runs.has(key)) {
    const built = fixtureDesign(briefId, fixture);
    runs.set(key, runDesign(built, defaultScenario(built.brief), { brief: built.brief }));
  }
  return runs.get(key)!;
}
const summaryOf = (briefId: string, fixture: string): Summary => runOf(briefId, fixture).summary;

/** Requests that failed for one of these reasons at these nodes */
function failedThere(s: Summary, nodeIds: string[], reasons: FailureReason[]) {
  return s.failures.filter((f) => f.nodeId !== null && nodeIds.includes(f.nodeId) && reasons.includes(f.reason)).reduce((n, f) => n + f.count, 0);
}
/** The busiest compute instance's peak */
function computePeak(briefId: string, fixture: string) {
  const built = fixtureDesign(briefId, fixture);
  const s = summaryOf(briefId, fixture);
  return Math.max(...built.nodes.filter((n) => isComputeKind(n.data.componentKind)).map((n) => s.perNode[n.id]?.peakUtilisation ?? 0));
}
const computeIds = (briefId: string, fixture: string) =>
  fixtureDesign(briefId, fixture).nodes.filter((n) => isComputeKind(n.data.componentKind)).map((n) => n.id);

describe.each(BRIEFS)("%s", (briefId) => {
  it("has a load block", () => {
    expect(briefById(briefId).load).toBeDefined();
  });

  it("averages the brief's own rate: the sum of its features' targetRpm (open question 1)", () => {
    const brief = briefById(briefId);
    const perMinute = brief.functionalRequirements.reduce((sum, r) => sum + r.feature.targetRpm, 0);
    const scenario = defaultScenario(brief);
    expect(Math.abs((scenario.requests * 60) / scenario.windowSeconds - perMinute)).toBeLessThanOrEqual(1);
  });

  describe("the reference design", () => {
    it("serves at least 99.9%", () => {
      const s = summaryOf(briefId, "good");
      expect(s.served / s.requests).toBeGreaterThanOrEqual(0.999);
    });

    it("answers the slowest 5% in under 1,000 ms, plus the model call for the course assistant", () => {
      expect(summaryOf(briefId, "good").p95Ms).toBeLessThan(1000 + (MODEL_CALL_ALLOWED[briefId] ?? 0));
    });

    it("saturates no compute instance or database", () => {
      const built = fixtureDesign(briefId, "good");
      const s = summaryOf(briefId, "good");
      const kinds = built.nodes.filter((n) => isComputeKind(n.data.componentKind) || n.data.componentKind === "database");
      expect(kinds.filter((n) => s.perNode[n.id]?.firstSaturatedAt !== null).map((n) => n.id)).toEqual([]);
    });

    it("empties every queue before the end", () => {
      const jobs = summaryOf(briefId, "good").jobs;
      expect(jobs?.stillWaiting ?? 0).toBeLessThan(0.5);
      expect(jobs?.neverDone ?? 0).toBeLessThan(0.5);
    });
  });
});

// The flaws the load page can show now (spec section C, column 2). Their exact numbers are
// pinned in each brief's own task; here each checks the direction.
describe("flaws the load page shows", () => {
  // A missing cache costs speed, not failures: the database is busier (SPEC-dataflow-sim.md,
  // realistic dbMs). Food guide: 2% busy with the cache, 9% without.
  it("campus-food-guide/bad-no-cache: the database is about five times busier, and the note says a cache would help", () => {
    const db = (fixture: string) => summaryOf("campus-food-guide", fixture).perNode.db.peakUtilisation;
    expect(db("bad-no-cache")).toBeGreaterThan(4 * db("good"));
    expect(summaryOf("campus-food-guide", "bad-no-cache").notes).toContain(
      "Vendors DB peaked at 9% busy, mostly with Browse vendors reads. A cache in front would bring it to about 2%.",
    );
  });

  // Shuttle: one-row reads, so even without its cache the database stays under 3% busy.
  it("shuttle-tracker/bad-no-cache: the database is about four times busier, and the note says a cache would help", () => {
    const db = (fixture: string) => summaryOf("shuttle-tracker", fixture).perNode.db.peakUtilisation;
    expect(db("bad-no-cache")).toBeGreaterThan(3 * db("good"));
    expect(summaryOf("shuttle-tracker", "bad-no-cache").notes).toContain(
      "Routes DB peaked at 2% busy, mostly with Live map reads. A cache in front would bring it to about 1%.",
    );
  });

  // Both APIs share the load balancer's pool, so three seconds of CPU per photo fills them
  // both in the rush: 162% busy against 19%, and about 19% of all requests time out.
  it("club-photo-wall/bad-sync-thumbnails: thumbnails inside the request fill the API's CPU", () => {
    expect(computePeak("club-photo-wall", "bad-sync-thumbnails")).toBeGreaterThan(computePeak("club-photo-wall", "good") + 0.3);
    expect(computePeak("club-photo-wall", "bad-sync-thumbnails")).toBeGreaterThan(1.5);
    expect(computePeak("club-photo-wall", "good")).toBeLessThan(0.25);
    const s = summaryOf("club-photo-wall", "bad-sync-thumbnails");
    expect(failedThere(s, computeIds("club-photo-wall", "bad-sync-thumbnails"), ["timed-out"])).toBeGreaterThan(0.15 * s.requests);
  });

  // API 1, shrunk to 1 vCPU, holds uploads (150 ms of CPU each) and lists. The ramp fills it
  // at 13:20 as the deadline nears, and about 5% of all requests time out there.
  it("file-storage/bad-capacity-overflow: an instance saturates", () => {
    const s = summaryOf("file-storage", "bad-capacity-overflow");
    expect(computeIds("file-storage", "bad-capacity-overflow").some((id) => s.perNode[id].firstSaturatedAt !== null)).toBe(true);
    expect(s.perNode["api-1"].firstSaturatedAt).toBeGreaterThan(600);
    expect(s.perNode["api-2"].firstSaturatedAt).toBeNull();
    expect(failedThere(s, ["api-1"], ["timed-out"])).toBeGreaterThan(0.04 * s.requests);
  });

  // One request in six adds a watch, so the slowest 5% are those waiting the bookstore's
  // 2,000 ms (backgroundWorkMs): about 2,080 ms, against 75 ms with the queue.
  it("textbook-price-watch/bad-inline-check: checking prices inside the request slows the slowest answers", () => {
    const bad = summaryOf("textbook-price-watch", "bad-inline-check").p95Ms;
    const good = summaryOf("textbook-price-watch", "good").p95Ms;
    expect(bad).toBeGreaterThan(good + 1000);
    expect(bad).toBeGreaterThan(2000);
    expect(good).toBeLessThan(100);
  });

  it("course-assistant: the AI call takes about 1,000 ms, the time to the first streamed words (open question 3)", () => {
    const apiMs = briefById("course-assistant").load?.features?.["ask-question"]?.apiMs;
    expect(apiMs).toBeGreaterThanOrEqual(800);
    expect(apiMs).toBeLessThanOrEqual(1200);
  });
});
