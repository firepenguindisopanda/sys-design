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

describe("every pilot brief has a default load scenario", () => {
  it.each(["link-shortener", "course-registration", "lab-autograder", "lab-monitor"])("%s", (briefId) => {
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

// SPEC-loadsim-queues.md: the pilot table. Calibrated in Task 5 with realistic figures only.
describe("course-registration: enrolments on a queue", () => {
  it("does every enrolment job in the reference design", () => {
    const jobs = run("course-registration", "good").jobs!;
    expect(jobs.queued).toBeGreaterThan(0);
    expect(jobs.stillWaiting + jobs.neverDone).toBeLessThan(0.5);
  });

  it("has no jobs without the queue, so it now differs from the reference design", () => {
    expect(run("course-registration", "bad-direct-enrol").jobs).toBeNull();
  });
});

describe("lab-autograder: a deadline rush", () => {
  let cached: ReturnType<typeof run> | null = null;
  const reference = () => (cached ??= run("lab-autograder", "good"));

  it("backs up the grading queue while the workers run flat out, then drains it", () => {
    const good = reference();
    const q = good.jobs!.perQueue.jobs;
    expect(q.peakBacklog).toBeGreaterThan(0);
    expect(q.fellBehindAt).not.toBeNull();
    expect(q.emptyAt).not.toBeNull();
    expect(good.perNode.sandbox.peakUtilisation).toBeGreaterThanOrEqual(1);
  });

  it("grades every submission, the slowest after more than a minute", () => {
    const jobs = reference().jobs!;
    expect(jobs.stillWaiting + jobs.neverDone).toBeLessThan(0.5);
    expect(jobs.p95Ms).toBeGreaterThan(60_000);
  });

  it("serves the students' requests in the reference design", () => {
    const good = reference();
    expect(good.served / good.requests).toBeGreaterThanOrEqual(0.99);
  });

  it("never grades anything without a worker", () => {
    const jobs = run("lab-autograder", "bad-no-worker").jobs!;
    expect(jobs.done).toBeLessThan(0.5);
    expect(Math.abs(jobs.neverDone - jobs.queued)).toBeLessThan(0.5);
  });

  it("says when results go nowhere", () => {
    expect(run("lab-autograder", "bad-results-not-stored").notes).toContain(
      "Sandbox workers' results go nowhere: no database.",
    );
  });
});

describe("lab-monitor: batched writes", () => {
  it("works the database far less when workers batch the readings", () => {
    const good = run("lab-monitor", "good");
    const direct = run("lab-monitor", "bad-direct-writes");
    expect(good.jobs!.queued).toBeGreaterThan(0);
    expect(direct.jobs).toBeNull();
    expect(good.perNode.db.peakUtilisation).toBeLessThan(direct.perNode.db.peakUtilisation / 3);
  });

  it("doesn't offer a cache for a database that's barely busy", () => {
    // Found in Task 5: at the brief's realistic load the database is under 1% busy, and the
    // cache note read "peaked at 0% busy … bring it to about 0%".
    expect(run("lab-monitor", "bad-no-cache").notes.some((n) => n.includes("A cache in front"))).toBe(false);
  });
});
