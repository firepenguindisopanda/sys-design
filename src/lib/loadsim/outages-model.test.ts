import { describe, expect, it } from "vitest";
import { challenges, design, fixtureDesign, requirement, runDesign } from "@/test/loadsim-designs";
import { buildDesign } from "@/lib/challenges/design";
import { simulateLoad } from "./model";
import type { Outage } from "./outages";
import { defaultScenario, featureLoads } from "./scenario";
import type { FeatureLoads, LoadRun, Scenario } from "./types";

// SPEC-loadsim-failures.md: switching components off in the load model. Every design here
// is hand-built and loaded steadily, so the expected numbers can be worked out by hand.

const stateless = { resources: { memoryGb: 0.5, vcpus: 0.5, storageGb: 0 } };
const steady = (perSecond: number, seconds = 300): Scenario => ({
  requests: perSecond * seconds,
  windowSeconds: seconds,
  shape: "steady",
});
const off = (nodeId: string, offAt: number, onAt: number | null = null): Outage => ({ nodeId, offAt, onAt });
type Built = ReturnType<typeof design>;

function run(built: Built, scenario: Scenario, outages: Outage[], loads?: FeatureLoads): LoadRun {
  return simulateLoad({
    nodes: built.nodes,
    edges: built.edges,
    features: built.features,
    scenario,
    loads: loads ?? featureLoads(built.features, null),
    outages,
  });
}
const stepAt = (r: LoadRun, seconds: number) => Math.round(seconds / r.dtSeconds);
const switchedOff = (r: LoadRun, nodeId: string) =>
  r.summary.failures.filter((f) => f.reason === "switched-off" && f.nodeId === nodeId).reduce((s, f) => s + f.count, 0);

/** desktop → load balancer → two PaaS instances, one stateless 10 ms feature. */
const pool = design(
  [requirement("ping", { targetRpm: 60, computeMsPerRequest: 10, ...stateless })],
  [
    ["desktop", "desktop"],
    ["lb", "load_balancer"],
    ["p1", "paas", { capacity: { vcpus: 2 } }, "Lab API 1"],
    ["p2", "paas", { capacity: { vcpus: 2 } }, "Lab API 2"],
  ],
  ["desktop -> lb : http", "lb -> p1 : http", "lb -> p2 : http"],
  { ping: "p1" },
);

/** desktop → one VM, one stateless 10 ms feature. */
const lone = design(
  [requirement("ping", { targetRpm: 60, computeMsPerRequest: 10, ...stateless })],
  [
    ["desktop", "desktop"],
    ["vm", "vm", { capacity: { vcpus: 2 } }, "Lone API"],
  ],
  ["desktop -> vm : http"],
  { ping: "vm" },
);

/** desktop → VM → database with this many copies; half reads, half writes. */
const withDatabase = (replicas: number) =>
  design(
    [requirement("save", { targetRpm: 60, computeMsPerRequest: 10 })],
    [
      ["desktop", "desktop"],
      ["vm", "vm", { capacity: { vcpus: 2 } }, "Links API"],
      ["db", "database", { replicas }, "Links DB"],
    ],
    ["desktop -> vm : http", "vm -> db : db"],
    { save: "vm" },
  );
const halfWrites: FeatureLoads = { save: { share: 1, writeShare: 0.5, readDbMs: 3, writeDbMs: 8, batch: 1, slowWork: "wait", apiMs: null, slowMs: null } };

/** desktop → VM → cache → database (and VM → database); reads only. */
const cached = design(
  [requirement("look", { targetRpm: 60, computeMsPerRequest: 10 })],
  [
    ["desktop", "desktop"],
    ["vm", "vm", { capacity: { vcpus: 2 } }, "Links API"],
    ["cache", "cache", {}, "Section cache"],
    ["db", "database", { replicas: 2 }, "Links DB"],
  ],
  ["desktop -> vm : http", "vm -> cache : db", "vm -> db : db"],
  { look: "vm" },
);
const readsOnly: FeatureLoads = { look: { share: 1, writeShare: 0, readDbMs: 3, writeDbMs: 8, batch: 1, slowWork: "wait", apiMs: null, slowMs: null } };

/** desktop → VM → queue → one worker slot at 100 ms a job (10 jobs/s). */
const queued = design(
  [requirement("grade", { targetRpm: 60, computeMsPerRequest: 10, backgroundWorkMs: 95, ...stateless })],
  [
    ["desktop", "desktop"],
    ["vm", "vm", { capacity: { vcpus: 2 } }],
    ["q", "message_queue", {}, "Grading jobs"],
    ["w", "task_worker", { concurrency: 1 }, "Graders"],
  ],
  ["desktop -> vm : http", "vm -> q : http", "q -> w : http"],
  { grade: "vm" },
);

describe("an instance behind a load balancer", () => {
  // 10 req/s split over two instances; Lab API 1 off at 60 s for the rest of the run.
  const r = run(pool, steady(10), [off("p1", 60)]);

  it("fails its share only until the balancer notices, 10 s later", () => {
    // 5 req/s × 10 s.
    expect(switchedOff(r, "p1")).toBeGreaterThan(45);
    expect(switchedOff(r, "p1")).toBeLessThan(55);
    expect(r.summary.failed).toBeCloseTo(switchedOff(r, "p1"), 6);
  });

  it("then sends everything to the other instance", () => {
    const later = r.frames[stepAt(r, 100)].nodes;
    expect(later.p1.arrivals).toBeLessThan(1e-9);
    expect(later.p2.arrivals).toBeCloseTo(10 * r.dtSeconds, 6);
  });

  it("marks the instance off, still routed during the health check and noticed after", () => {
    expect(r.frames[stepAt(r, 50)].nodes.p1.off).toBeUndefined();
    expect(r.frames[stepAt(r, 64)].nodes.p1.off).toBe("routed");
    expect(r.frames[stepAt(r, 72)].nodes.p1.off).toBe("noticed");
  });

  it("counts the failures against the instance", () => {
    expect(r.summary.perNode.p1.failedWhileOff).toBeCloseTo(switchedOff(r, "p1"), 6);
    expect(r.summary.failures.find((f) => f.reason === "switched-off")?.text).toBe("Failed at Lab API 1 while it was off.");
  });

  it("brings it back into the pool one health check after it's back", () => {
    const back = run(pool, steady(10), [off("p1", 60, 120)]);
    expect(back.frames[stepAt(back, 125)].nodes.p1.arrivals).toBeLessThan(1e-9);
    expect(back.frames[stepAt(back, 135)].nodes.p1.arrivals).toBeCloseTo(5 * back.dtSeconds, 6);
  });
});

describe("an instance on its own", () => {
  it("fails every request while it's off, and none outside the outage", () => {
    const r = run(lone, steady(10), [off("vm", 60, 120)]);
    expect(switchedOff(r, "vm")).toBeGreaterThan(590);
    expect(switchedOff(r, "vm")).toBeLessThan(610);
    expect(r.summary.failed).toBeCloseTo(switchedOff(r, "vm"), 6);
  });

  it("fails the requests waiting at it when it goes off", () => {
    // One vCPU does 70 req/s; 140 req/s leaves a backlog to lose at 60 s.
    const small = design(
      [requirement("ping", { targetRpm: 60, computeMsPerRequest: 10, ...stateless })],
      [
        ["desktop", "desktop"],
        ["vm", "vm", { capacity: { vcpus: 1 } }],
      ],
      ["desktop -> vm : http"],
      { ping: "vm" },
    );
    const r = run(small, steady(140), [off("vm", 60)]);
    const atOff = r.frames[stepAt(r, 60)].nodes.vm;
    expect(atOff.failed).toBeGreaterThan(140 * r.dtSeconds + 100);
  });
});

describe("a database", () => {
  it("with a replica: reads carry on, and writes fail only for the 30 s failover", () => {
    // 5 writes a second for 30 s.
    const r = run(withDatabase(2), steady(10), [off("db", 60, 180)], halfWrites);
    expect(switchedOff(r, "db")).toBeGreaterThan(140);
    expect(switchedOff(r, "db")).toBeLessThan(160);
    expect(r.summary.failed).toBeCloseTo(switchedOff(r, "db"), 6);
  });

  it("with one copy: everything that needs it fails for the whole outage", () => {
    // 10 a second for 120 s.
    const r = run(withDatabase(1), steady(10), [off("db", 60, 180)], halfWrites);
    expect(switchedOff(r, "db")).toBeGreaterThan(1180);
    expect(switchedOff(r, "db")).toBeLessThan(1220);
  });

  it("keeps workers' writes waiting rather than losing them", () => {
    const jobsToDb = design(
      [requirement("save", { targetRpm: 60, computeMsPerRequest: 10 })],
      [
        ["desktop", "desktop"],
        ["vm", "vm", { capacity: { vcpus: 2 } }],
        ["q", "message_queue"],
        ["w", "task_worker", { concurrency: 4 }],
        ["db", "database", { replicas: 1 }],
      ],
      ["desktop -> vm : http", "vm -> q : http", "q -> w : http", "w -> db : db"],
      { save: "vm" },
    );
    const allWrites: FeatureLoads = { save: { share: 1, writeShare: 1, readDbMs: 3, writeDbMs: 8, batch: 1, slowWork: "wait", apiMs: null, slowMs: null } };
    const r = run(jobsToDb, steady(10), [off("db", 60, 120)], allWrites);
    const jobs = r.summary.jobs!;
    expect(r.summary.failed).toBeLessThan(0.5);
    expect(jobs.neverDone).toBeLessThan(0.5);
    expect(Math.abs(jobs.done + jobs.stillWaiting - jobs.queued)).toBeLessThan(0.5);
    expect(jobs.stillWaiting).toBeLessThan(0.5);
  });
});

describe("a cache", () => {
  // 10 reads a second: 1 a second reaches the database through a warm cache.
  const r = run(cached, steady(10), [off("cache", 60, 120)], readsOnly);
  const dbReadsPerSecond = (seconds: number) => r.frames[stepAt(r, seconds)].nodes.db.arrivals / r.dtSeconds;

  it("sends every read to the database while it's off", () => {
    expect(dbReadsPerSecond(50)).toBeCloseTo(1, 1);
    expect(dbReadsPerSecond(90)).toBeCloseTo(10, 1);
    expect(r.summary.failed).toBeLessThan(0.5);
  });

  it("comes back empty, so the database calms down over 30 s, not at once", () => {
    expect(dbReadsPerSecond(125)).toBeGreaterThan(7);
    expect(dbReadsPerSecond(135)).toBeCloseTo(5.5, 0);
    expect(dbReadsPerSecond(160)).toBeCloseTo(1, 1);
  });
});

describe("a worker", () => {
  // 5 jobs a second against a worker that does 10; off from 30 to 90 s.
  const r = run(queued, steady(5), [off("w", 30, 90)]);
  const waiting = (seconds: number) => r.frames[stepAt(r, seconds)].nodes.q.backlog;

  it("lets jobs pile up on its queue while it's off, then drains it", () => {
    expect(waiting(25)).toBeLessThan(1);
    expect(waiting(89)).toBeGreaterThan(280);
    expect(waiting(89)).toBeLessThan(310);
    expect(waiting(160)).toBeLessThan(1);
  });

  it("loses nothing", () => {
    const jobs = r.summary.jobs!;
    expect(r.summary.failed).toBeLessThan(0.5);
    expect(Math.abs(jobs.done - jobs.queued)).toBeLessThan(0.5);
  });
});

describe("runs without outages", () => {
  it("are identical with no outages field and with an empty list", () => {
    const built = fixtureDesign("course-registration", "good");
    const input = {
      nodes: built.nodes,
      edges: built.edges,
      features: built.features,
      scenario: defaultScenario(built.brief),
      loads: featureLoads(built.features, built.brief),
    };
    expect(JSON.stringify(simulateLoad({ ...input, outages: [] }))).toBe(JSON.stringify(simulateLoad(input)));
  });

  it("play every frame before the first outage exactly as without it", () => {
    const without = run(pool, steady(10), []);
    const withOne = run(pool, steady(10), [off("p1", 60)]);
    const before = stepAt(withOne, 60);
    expect(JSON.stringify(withOne.frames.slice(0, before))).toBe(JSON.stringify(without.frames.slice(0, before)));
  });
});

describe("conservation with outages", () => {
  const cases: [string, string, string, Outage[]][] = [
    ["registration, cache off", "course-registration", "good", [off("cache", 120)]],
    ["registration, database off", "course-registration", "good", [off("db", 120, 240)]],
    ["registration, one copy off", "course-registration", "bad-single-db-replica", [off("db", 120, 240)]],
    ["link shortener, API off", "link-shortener", "good", [off("api-1", 60, 300), off("cache", 400)]],
    ["autograder, workers off", "lab-autograder", "good", [off("sandbox", 2400, 3000)]],
  ];

  it.each(cases)("%s: served + failed = requests, and every job is accounted for", (_, briefId, fixture, outages) => {
    const challenge = challenges.find((c) => c.brief.id === briefId)!;
    const built = buildDesign(challenge.brief, challenge.fixtures.find((f) => f.name === fixture)!);
    const r = runDesign(built, defaultScenario(challenge.brief), { brief: challenge.brief });
    const withOutages = simulateLoad({
      nodes: built.nodes,
      edges: built.edges,
      features: built.features,
      scenario: defaultScenario(challenge.brief),
      loads: featureLoads(built.features, challenge.brief),
      outages,
    });
    for (const s of [r.summary, withOutages.summary]) {
      expect(Math.abs(s.served + s.failed - s.requests)).toBeLessThan(0.5);
      if (s.jobs) expect(Math.abs(s.jobs.done + s.jobs.stillWaiting + s.jobs.neverDone - s.jobs.queued)).toBeLessThan(0.5);
    }
  });
});

describe("reusing a run without outages as the baseline", () => {
  it("gives the same result as working the baseline out itself", () => {
    // Found in Task 7: the page already has the run without outages, so passing it in
    // saves running the model twice for each switch-off.
    const built = fixtureDesign("lab-autograder", "good");
    const input = {
      nodes: built.nodes,
      edges: built.edges,
      features: built.features,
      scenario: defaultScenario(built.brief),
      loads: featureLoads(built.features, built.brief),
    };
    const baseline = simulateLoad(input);
    const outages = [off("sandbox", 2400, 3000)];
    expect(JSON.stringify(simulateLoad({ ...input, outages, baseline }))).toBe(JSON.stringify(simulateLoad({ ...input, outages })));
  });
});

describe("an invalid list", () => {
  it("is refused", () => {
    expect(() => run(pool, steady(10), [off("lb", 60)])).toThrow(/can't be switched off/);
    expect(() => run(pool, steady(10), [off("p1", 60, 50)])).toThrow();
  });
});

describe("the summary of each outage", () => {
  it("tells a pool's story: lost before the balancer noticed, then who took over", () => {
    const r = run(pool, steady(10), [off("p1", 60, 180)]);
    const o = r.summary.outages[0];
    expect(o).toMatchObject({ nodeId: "p1", offAt: 60, onAt: 180 });
    expect(o.failedHere).toBeCloseTo(switchedOff(r, "p1"), 6);
    expect(o.takeover.map((t) => t.nodeId)).toEqual(["p2"]);
    expect(o.note).toMatch(
      /^Lab API 1 was off from 1:00 to 3:00\. [\d,]+ requests failed before the load balancer noticed; then Lab API 2 took its share and peaked at \d+% busy\.$/,
    );
    expect(r.summary.notes[0]).toBe(o.note);
  });

  it("tells a database's story, with and without a replica", () => {
    const two = run(withDatabase(2), steady(10), [off("db", 60, 180)], halfWrites).summary.outages[0];
    expect(two.note).toMatch(
      /^Links DB was off from 1:00 to 3:00\. Reads carried on from its replica; [\d,]+ writes failed in the 30 s before the replica took over\.$/,
    );
    const one = run(withDatabase(1), steady(10), [off("db", 60, 180)], halfWrites).summary.outages[0];
    expect(one.note).toMatch(/^Links DB was off from 1:00 to 3:00\. It had no replica, so [\d,]+ requests failed\.$/);
  });

  it("tells a cache's story: where the reads went", () => {
    const o = run(cached, steady(10), [off("cache", 60)], readsOnly).summary.outages[0];
    expect(o.onAt).toBeNull();
    expect(o.takeover.map((t) => t.nodeId)).toEqual(["db"]);
    expect(o.note).toMatch(/^Section cache was off from 1:00\. Every read went to Links DB, which peaked at \d+% busy(; [\d,]+ requests timed out there)?\.$/);
  });

  it("tells a worker's story: the queue grew and nothing was lost", () => {
    const o = run(queued, steady(5), [off("w", 30, 90)]).summary.outages[0];
    expect(o.note).toMatch(/^Graders were off from 0:30 to 1:30\. Grading jobs grew to [\d,]+ waiting; no job was lost\.$/);
  });

  it("is empty without outages", () => {
    expect(run(pool, steady(10), []).summary.outages).toEqual([]);
  });
});
