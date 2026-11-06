import { describe, expect, it } from "vitest";
import { design, fixtureDesign, requirement, runDesign } from "@/test/loadsim-designs";
import { CAPACITY } from "./capacities";
import { simulateLoad } from "./model";
import { defaultScenario, featureLoads } from "./scenario";
import type { FailureReason, FeatureLoad, LoadRun, Scenario } from "./types";

// SPEC-loadsim-cascades.md: request slots, database connections, slow work inside the
// request, external calls and answers that take over 5 s. Every figure here is worked by
// hand from CAPACITY: 80 slots and 10 connections per instance, a 5 s timeout, 20 ms from
// a desktop, 1 ms per hop inside the system.

const stateless = { resources: { memoryGb: 0.5, vcpus: 0.5, storageGb: 0 } };
const storing = { resources: { memoryGb: 0.5, vcpus: 0.5, storageGb: 1 } };

/** One feature's load: reads only, with no slow work kind or call unless given. */
const load = (o: Partial<FeatureLoad> = {}): FeatureLoad => ({
  share: 1,
  writeShare: 0,
  readDbMs: 3,
  writeDbMs: 8,
  batch: 1,
  slowWork: "wait",
  apiMs: null,
  slowMs: null,
  ...o,
});

const steady = (perSecond: number, seconds = 60): Scenario => ({
  requests: perSecond * seconds,
  windowSeconds: seconds,
  shape: "steady",
});

/** The window's second half: a steady load has settled by then. */
const settled = (run: LoadRun) => run.frames.slice(run.windowSteps / 2, run.windowSteps);

/** Requests a node admitted per second in each settled step. */
const settledRates = (run: LoadRun, nodeId: string) => settled(run).map((f) => f.nodes[nodeId].served / run.dtSeconds);

const failedAt = (run: LoadRun, nodeId: string, reason: FailureReason) =>
  run.summary.failures.filter((f) => f.nodeId === nodeId && f.reason === reason).reduce((n, f) => n + f.count, 0);

/** Runs with the slot and connection limits too big to ever bind. */
function withoutLimits<T>(fn: () => T): T {
  const saved = { ...CAPACITY.instance };
  CAPACITY.instance.slots = 1e12;
  CAPACITY.instance.connections = 1e12;
  try {
    return fn();
  } finally {
    Object.assign(CAPACITY.instance, saved);
  }
}

function expectConserved(run: LoadRun) {
  const { summary } = run;
  expect(Math.abs(summary.served + summary.failed - summary.requests)).toBeLessThan(0.5);
  expect(Math.abs(summary.failures.reduce((s, f) => s + f.count, 0) - summary.failed)).toBeLessThan(0.5);
}

describe("the limits", () => {
  it("are 80 request slots and 10 database connections per instance", () => {
    // Holds were smoothed over 5 steps until Task 4 found that swings; admission is now
    // solved each step instead (SPEC-loadsim-cascades.md, amended).
    expect(CAPACITY.instance).toEqual({ slots: 80, connections: 10 });
  });
});

describe("request slots", () => {
  // Each request holds a slot for 10 ms of compute plus a 2 s external call: at most
  // 80 ÷ 2.01 s ≈ 39.8 requests a second. The 8 vCPUs alone could do 5,600 ÷ 10 = 560.
  function callingDesign() {
    return design(
      [requirement("ask", { name: "Ask", targetRpm: 60, computeMsPerRequest: 10, ...stateless })],
      [
        ["desktop", "desktop"],
        ["vm", "vm", { capacity: { vcpus: 8 } }, "Ask API"],
        ["llm", "external_api", {}, "AI API"],
      ],
      ["desktop -> vm : http", "vm -> llm : http"],
      { ask: "vm" },
    );
  }
  const loads = { ask: load({ apiMs: 2000 }) };

  describe("100 requests a second for a minute", () => {
    let cached: LoadRun | null = null;
    const get = () => (cached ??= runDesign(callingDesign(), steady(100), { loads }));

    it("admits about 40 a second", () => {
      const rates = settledRates(get(), "vm");
      expect(Math.min(...rates)).toBeGreaterThan(38);
      expect(Math.max(...rates)).toBeLessThan(41);
    });

    it("records slots as the limit that binds", () => {
      for (const f of settled(get())) expect(f.nodes.vm.limit).toBe("slots");
    });

    it("keeps the rest waiting in front of the instance only while they can still be answered in 5 s", () => {
      // Amended in Task 4: a client gives up once its answer would take over 5 s, not after
      // 5 s at one stop. The answer takes 20 + 10 + 2,000 ms, so a request can wait about
      // 2.97 s: about 118 requests at about 40 a second. They time out there.
      const run = get();
      expect(failedAt(run, "vm", "timed-out")).toBeGreaterThan(0);
      expect(run.summary.perNode.vm.peakBacklog).toBeGreaterThan(100);
      expect(run.summary.perNode.vm.peakBacklog).toBeLessThan(125);
    });

    it("answers every request it admits in time: none is too slow", () => {
      expect(failedAt(get(), "vm", "too-slow")).toBe(0);
    });

    it("conserves requests", () => expectConserved(get()));
  });

  it("binds nothing at 30 a second: 60 of 80 slots, and every answer takes the call's 2 s", () => {
    const run = runDesign(callingDesign(), steady(30), { loads });
    expect(run.summary.failed).toBeLessThan(0.5);
    for (const f of run.frames) expect(f.nodes.vm.limit).toBeUndefined();
    const rates = settledRates(run, "vm");
    expect(Math.min(...rates)).toBeGreaterThan(29.9);
    // 20 ms from the desktop, 10 ms of compute and 2,000 ms for the call.
    expect(run.summary.p50Ms).toBeGreaterThanOrEqual(2029);
    expect(run.summary.p50Ms).toBeLessThanOrEqual(2032);
  });
});

describe("database connections", () => {
  // A read holds a connection for its database time: 49 ms of query, the 1 ms hop and well
  // under 1 ms of queueing, so about 50 ms. 10 connections allow about 10 ÷ 0.05 s = 200
  // reads a second. A hundred database copies keep the database under 10% busy, and the
  // request's slot (about 51 ms) allows 1,500 a second, so only the connections can bind.
  function readsDesign() {
    return design(
      [requirement("look", { name: "Look", targetRpm: 60, computeMsPerRequest: 1, ...storing })],
      [
        ["desktop", "desktop"],
        ["vm", "vm", { capacity: { vcpus: 8 } }, "Look API"],
        ["db", "database", { shards: 10, replicas: 10 }, "Look DB"],
      ],
      ["desktop -> vm : http", "vm -> db : db"],
      { look: "vm" },
    );
  }
  const loads = { look: load({ readDbMs: 49, writeDbMs: 49 }) };

  it("admits about 200 database requests a second at 300 offered, with connections binding", () => {
    const run = runDesign(readsDesign(), steady(300), { loads });
    const rates = settledRates(run, "vm");
    expect(Math.min(...rates)).toBeGreaterThan(190);
    expect(Math.max(...rates)).toBeLessThan(205);
    for (const f of settled(run)) expect(f.nodes.vm.limit).toBe("connections");
    expect(failedAt(run, "vm", "timed-out")).toBeGreaterThan(0);
    expectConserved(run);
  });

  it("binds nothing at 150 a second", () => {
    const run = runDesign(readsDesign(), steady(150), { loads });
    expect(run.summary.failed).toBeLessThan(0.5);
    for (const f of run.frames) expect(f.nodes.vm.limit).toBeUndefined();
  });
});

describe("a saturated database backs up into the instance (the cascade)", () => {
  // One database copy does 2 × 1,000 × 0.7 = 1,400 ms of work a second: about 466 reads of
  // 3 ms. At 600 a second its waits grow, each read holds its connection longer, and the
  // instance's 10 connections run out. The instance then admits only what 10 connections
  // can carry: just under what the database can take (about 434 a second, where
  // 10 ÷ hold = rate with the database's queueing wait in the hold).
  function cascadeDesign() {
    return design(
      [requirement("look", { name: "Look", targetRpm: 60, computeMsPerRequest: 1, ...storing })],
      [
        ["desktop", "desktop"],
        ["vm", "vm", { capacity: { vcpus: 8 } }, "Look API"],
        ["db", "database", {}, "Look DB"],
      ],
      ["desktop -> vm : http", "vm -> db : db"],
      { look: "vm" },
    );
  }
  const loads = { look: load() };
  const scenario = steady(600, 120);
  let cached: { run: LoadRun; unlimited: LoadRun } | null = null;
  const get = () =>
    (cached ??= {
      run: runDesign(cascadeDesign(), scenario, { loads }),
      unlimited: withoutLimits(() => runDesign(cascadeDesign(), scenario, { loads })),
    });

  it("records connections as the instance's limit", () => {
    for (const f of settled(get().run)) expect(f.nodes.vm.limit).toBe("connections");
  });

  it("times requests out at the instance, more than at the database", () => {
    const { run } = get();
    const atInstance = failedAt(run, "vm", "timed-out") + failedAt(run, "vm", "too-slow");
    expect(failedAt(run, "vm", "timed-out")).toBeGreaterThan(0);
    expect(atInstance).toBeGreaterThan(failedAt(run, "db", "timed-out"));
  });

  it("leaves the database's own backlog far smaller than without the limits", () => {
    const { run, unlimited } = get();
    expect(failedAt(unlimited, "vm", "timed-out")).toBe(0);
    expect(run.summary.perNode.db.peakBacklog).toBeLessThan(unlimited.summary.perNode.db.peakBacklog / 2);
  });

  it("admits just under what the database can take", () => {
    const rates = settledRates(get().run, "vm");
    const mean = rates.reduce((s, r) => s + r, 0) / rates.length;
    expect(mean).toBeGreaterThan(380);
    expect(mean).toBeLessThan(467);
  });

  it("settles to a steady admission rate: no settled step more than 10% from the one before", () => {
    // Holds feed back into admission (fewer admitted, shorter holds, more admitted). Smoothed
    // over 5 steps they swung in a 1.8 s cycle; solved each step they mustn't. If this
    // swings, stop and report: don't tune numbers.
    const rates = settledRates(get().run, "vm");
    for (let i = 1; i < rates.length; i++) {
      expect(Math.abs(rates[i] - rates[i - 1]) / rates[i - 1]).toBeLessThanOrEqual(0.1);
    }
  });

  it("conserves requests", () => expectConserved(get().run));
});

describe("slow work inside the request", () => {
  // 1 ms of compute and 500 ms of slow work on one vCPU (700 ms of CPU a second).
  function gradingDesign() {
    return design(
      [requirement("grade", { name: "Grade", targetRpm: 60, computeMsPerRequest: 1, backgroundWorkMs: 500, ...stateless })],
      [
        ["desktop", "desktop"],
        ["vm", "vm", { capacity: { vcpus: 1 } }, "Grading API"],
      ],
      ["desktop -> vm : http"],
      { grade: "vm" },
    );
  }

  it("costs CPU when it's cpu: one vCPU does 700 ÷ 501 ≈ 1.4 a second", () => {
    const run = runDesign(gradingDesign(), steady(3, 120), { loads: { grade: load({ slowWork: "cpu" }) } });
    const rates = settledRates(run, "vm");
    expect(Math.min(...rates)).toBeGreaterThan(1.35);
    expect(Math.max(...rates)).toBeLessThan(1.42);
    for (const f of settled(run)) expect(f.nodes.vm.limit).toBe("cpu");
  });

  it("holds a slot but costs no CPU when it's wait: 80 ÷ 0.501 s ≈ 160 a second", () => {
    const run = runDesign(gradingDesign(), steady(300), { loads: { grade: load({ slowWork: "wait" }) } });
    const rates = settledRates(run, "vm");
    expect(Math.min(...rates)).toBeGreaterThan(152);
    expect(Math.max(...rates)).toBeLessThan(162);
    for (const f of settled(run)) expect(f.nodes.vm.limit).toBe("slots");
  });

  it("adds its time to the answer: 20 + 1 + 500 ms", () => {
    const run = runDesign(gradingDesign(), steady(1), { loads: { grade: load() } });
    expect(run.summary.failed).toBeLessThan(0.5);
    expect(run.summary.p50Ms).toBeGreaterThanOrEqual(520.5);
    expect(run.summary.p50Ms).toBeLessThanOrEqual(522);
  });
});

describe("external calls", () => {
  function askDesign(withEdge = true) {
    return design(
      [requirement("ask", { name: "Ask", targetRpm: 60, computeMsPerRequest: 10, ...stateless })],
      [
        ["desktop", "desktop"],
        ["vm", "vm", { capacity: { vcpus: 2 } }, "Ask API"],
        ["llm", "external_api", {}, "AI API"],
      ],
      ["desktop -> vm : http", ...(withEdge ? ["vm -> llm : http"] : [])],
      { ask: "vm" },
    );
  }

  it("adds apiMs to the answer: 20 + 10 + 300 ms, and the API is no longer 'not simulated'", () => {
    const run = runDesign(askDesign(), steady(1), { loads: { ask: load({ apiMs: 300 }) } });
    expect(run.summary.p50Ms).toBeGreaterThanOrEqual(329.5);
    expect(run.summary.p50Ms).toBeLessThanOrEqual(331);
    expect(run.summary.notSimulated.some((n) => n.id === "llm" || n.id.startsWith("llm:"))).toBe(false);
  });

  it("isn't simulated without apiMs: the answer is as before and the API stays listed", () => {
    const run = runDesign(askDesign(), steady(1), { loads: { ask: load() } });
    expect(run.summary.p50Ms).toBeLessThanOrEqual(31);
    expect(run.summary.notSimulated.some((n) => n.id === "llm")).toBe(true);
  });

  it("needs an edge to an external API: apiMs alone calls nothing", () => {
    const run = runDesign(askDesign(false), steady(1), { loads: { ask: load({ apiMs: 300 }) } });
    expect(run.summary.p50Ms).toBeLessThanOrEqual(31);
  });
});

describe("too slow to answer", () => {
  // At 1 request a second nothing is busy: the answer is 20 ms from the desktop, 10 ms of
  // compute and the slow work.
  function slowDesign(backgroundWorkMs: number, withDb = false) {
    return design(
      [requirement("work", { name: "Work", targetRpm: 60, computeMsPerRequest: 10, backgroundWorkMs, ...(withDb ? storing : stateless) })],
      [
        ["desktop", "desktop"],
        ["vm", "vm", { capacity: { vcpus: 8 } }, "Work API"],
        ["db", "database", {}, "Work DB"],
        ["llm", "external_api", {}, "AI API"],
      ],
      ["desktop -> vm : http", "vm -> llm : http", ...(withDb ? ["vm -> db : db"] : [])],
      { work: "vm" },
    );
  }
  const once = steady(1);

  it("serves an answer just under 5 s: 4,900 ms of slow work makes 4,930", () => {
    const run = runDesign(slowDesign(4900), once, { loads: { work: load() } });
    expect(run.summary.failed).toBeLessThan(0.5);
    expect(run.summary.p50Ms).toBeGreaterThanOrEqual(4929.5);
    expect(run.summary.p50Ms).toBeLessThanOrEqual(4931);
  });

  it("fails one just over, 4,990 ms making 5,020, as too-slow at the instance holding it", () => {
    const run = runDesign(slowDesign(4990), once, { loads: { work: load() } });
    expect(run.summary.served).toBeLessThan(0.5);
    expect(run.summary.failures).toEqual([
      expect.objectContaining({
        nodeId: "vm",
        reason: "too-slow",
        count: expect.closeTo(60, 3),
        text: "Gave up on Work API: answers took over 5 s.",
      }),
    ]);
  });

  it("fails 6 s of slow work even at one request a second", () => {
    // Waiting, not CPU: 6 s of CPU a second would saturate the 8 vCPUs (5,600 ms a second).
    const run = runDesign(slowDesign(6000), once, { loads: { work: load() } });
    expect(run.summary.served).toBeLessThan(0.5);
    expect(failedAt(run, "vm", "too-slow")).toBeCloseTo(60, 3);
  });

  it("fails a 5 s external call even with no load", () => {
    const built = design(
      [requirement("ask", { name: "Ask", targetRpm: 60, computeMsPerRequest: 10, ...stateless })],
      [
        ["desktop", "desktop"],
        ["vm", "vm", { capacity: { vcpus: 8 } }, "Ask API"],
        ["llm", "external_api"],
      ],
      ["desktop -> vm : http", "vm -> llm : http"],
      { ask: "vm" },
    );
    const run = runDesign(built, once, { loads: { ask: load({ apiMs: 5000 }) } });
    expect(run.summary.served).toBeLessThan(0.5);
    expect(failedAt(run, "vm", "too-slow")).toBeCloseTo(60, 3);
  });

  it("blames the instance, not the database, for an answer that passes 5 s at the database", () => {
    // 20 + 10 + 4,990 + 1 + 3 ms, answered at the database.
    const run = runDesign(slowDesign(4990, true), once, { loads: { work: load() } });
    expect(run.summary.served).toBeLessThan(0.5);
    expect(failedAt(run, "vm", "too-slow")).toBeCloseTo(60, 3);
    expect(failedAt(run, "db", "too-slow")).toBe(0);
  });

  describe("with a queue", () => {
    function queuedDesign() {
      return design(
        [requirement("grade", { name: "Grade", targetRpm: 60, computeMsPerRequest: 10, backgroundWorkMs: 6000, ...stateless })],
        [
          ["desktop", "desktop"],
          ["vm", "vm", { capacity: { vcpus: 8 } }, "Grade API"],
          ["llm", "external_api"],
          ["q", "message_queue", {}, "Grading jobs"],
          ["w", "task_worker", { concurrency: 20 }, "Graders"],
        ],
        ["desktop -> vm : http", "vm -> llm : http", "vm -> q : http", "q -> w : http"],
        { grade: "vm" },
      );
    }

    it("never fails a job as too slow: 6 s of slow work on a worker is fine", () => {
      const run = runDesign(queuedDesign(), once, { loads: { grade: load() } });
      expect(run.summary.failed).toBeLessThan(0.5);
      const jobs = run.summary.jobs!;
      expect(Math.abs(jobs.done - jobs.queued)).toBeLessThan(0.5);
      expect(jobs.p50Ms).toBeGreaterThan(6000);
    });

    it("still checks the request answered at the queue: a 6 s call before queueing is too slow", () => {
      const run = runDesign(queuedDesign(), once, { loads: { grade: load({ apiMs: 6000 }) } });
      expect(run.summary.served).toBeLessThan(0.5);
      expect(failedAt(run, "vm", "too-slow")).toBeCloseTo(60, 3);
      const jobs = run.summary.jobs!;
      expect(Math.abs(jobs.done + jobs.stillWaiting + jobs.neverDone - jobs.queued)).toBeLessThan(0.5);
    });
  });
});

describe("designs where no new limit binds and no answer passes 5 s", () => {
  it.each([
    ["link-shortener", "good"],
    ["course-registration", "good"],
    ["lab-monitor", "good"],
    ["lab-autograder", "good"],
  ])("%s/%s gives identical output with the limits made huge", (briefId, fixture) => {
    const built = fixtureDesign(briefId, fixture);
    const scenario = defaultScenario(built.brief);
    const run = runDesign(built, scenario, { brief: built.brief });
    const unlimited = withoutLimits(() => runDesign(built, scenario, { brief: built.brief }));
    for (const f of run.frames) {
      for (const n of Object.values(f.nodes)) expect(n.limit === undefined || n.limit === "cpu").toBe(true);
    }
    expect(JSON.stringify(run)).toBe(JSON.stringify(unlimited));
  });
});

describe("conservation and determinism, with an outage too", () => {
  // Two instances behind a balancer, each call 2 s: about 40 a second each. 120 a second
  // overloads them, and switching one off for 20 s overloads the other further.
  function poolDesign() {
    return design(
      [
        requirement("ask", { name: "Ask", targetRpm: 60, computeMsPerRequest: 10, ...stateless }),
        requirement("look", { name: "Look", targetRpm: 60, computeMsPerRequest: 5, ...storing }),
      ],
      [
        ["desktop", "desktop"],
        ["lb", "load_balancer"],
        ["api-1", "vm", { capacity: { vcpus: 4 } }, "API 1"],
        ["api-2", "vm", { capacity: { vcpus: 4 } }, "API 2"],
        ["db", "database", {}, "DB"],
        ["llm", "external_api"],
      ],
      ["desktop -> lb : http", "lb -> api-1 : http", "lb -> api-2 : http", "api-1 -> llm : http", "api-2 -> llm : http", "api-1 -> db : db", "api-2 -> db : db"],
      { ask: "api-1", look: "api-1" },
    );
  }
  const loads = { ask: load({ share: 0.5, apiMs: 2000 }), look: load({ share: 0.5, readDbMs: 20 }) };
  const run = (outages: { nodeId: string; offAt: number; onAt: number | null }[] = []) => {
    const built = poolDesign();
    return simulateLoad({ nodes: built.nodes, edges: built.edges, features: built.features, scenario: steady(120), loads, outages });
  };

  it("conserves requests without and with an outage", () => {
    expectConserved(run());
    expectConserved(run([{ nodeId: "api-1", offAt: 20, onAt: 40 }]));
  });

  it("gives identical output for identical input", () => {
    const outages = [{ nodeId: "api-1", offAt: 20, onAt: 40 }];
    expect(JSON.stringify(run(outages))).toBe(JSON.stringify(run(outages)));
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it("conserves requests in a fixture with slow work inside the request and an outage", () => {
    const built = fixtureDesign("lab-autograder", "bad-sync-grading");
    const r = simulateLoad({
      nodes: built.nodes,
      edges: built.edges,
      features: built.features,
      scenario: defaultScenario(built.brief),
      loads: featureLoads(built.features, built.brief),
      outages: [{ nodeId: "api-1", offAt: 2400, onAt: 3000 }],
    });
    expectConserved(r);
  });
});
