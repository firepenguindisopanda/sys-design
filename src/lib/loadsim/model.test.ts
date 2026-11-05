import { describe, expect, it } from "vitest";
import { challenges, design, fixtureDesign, requirement, runDesign } from "@/test/loadsim-designs";
import { buildDesign } from "@/lib/challenges/design";
import { queueingFactor } from "./model";
import { defaultScenario } from "./scenario";
import type { PathStep, Scenario } from "./types";

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

  it.each(cases)("%s: jobs queued = done + still waiting + never done", (_, brief, fixture) => {
    const run = runDesign(buildDesign(brief, fixture), defaultScenario(brief), { brief });
    const { jobs } = run.summary;
    // A design has jobs exactly when some request's path reaches a queue; a design with job
    // paths but no jobs would otherwise pass this check unseen.
    const hasJobPath = (step: PathStep | null): boolean => !!step && (!!step.job || step.next.some((n) => hasJobPath(n.step)));
    expect(jobs !== null).toBe(run.graph.classes.some((c) => hasJobPath(c.root)));
    if (!jobs) return;
    expect(Math.abs(jobs.done + jobs.stillWaiting + jobs.neverDone - jobs.queued)).toBeLessThan(0.5);
    for (const q of Object.values(jobs.perQueue)) {
      expect(Math.abs(q.done + q.stillWaiting + q.neverDone - q.queued)).toBeLessThan(0.5);
    }
  });
});

describe("queues and workers (SPEC-loadsim-queues.md)", () => {
  // A desktop → one VM → a queue → one worker with one slot. The feature is stateless with
  // 95 ms of slow work, so a job costs 5 + 95 = 100 ms and the worker does 10 jobs a second.
  function backlogDesign() {
    return design(
      [
        requirement("grade", {
          targetRpm: 60,
          computeMsPerRequest: 10,
          backgroundWorkMs: 95,
          resources: { memoryGb: 0.5, vcpus: 0.5, storageGb: 0 },
        }),
      ],
      [
        ["desktop", "desktop"],
        ["vm", "vm", { capacity: { vcpus: 2 } }],
        ["q", "message_queue", {}, "Grading jobs"],
        ["w", "task_worker", { concurrency: 1 }, "Graders"],
      ],
      ["desktop -> vm : http", "vm -> q : http", "q -> w : http"],
      { grade: "vm" },
    );
  }
  const minute = (perSecond: number): Scenario => ({ requests: perSecond * 60, windowSeconds: 60, shape: "steady" });

  describe("20 jobs a second for a minute, against 10 a second (worked by hand)", () => {
    // Run once, on first use, so a failure here can't stop the file's other tests loading.
    let cached: ReturnType<typeof runDesign> | null = null;
    const get = () => {
      const run = (cached ??= runDesign(backlogDesign(), minute(20)));
      const jobs = run.summary.jobs!;
      return { run, summary: run.summary, jobs, q: jobs.perQueue.q };
    };

    it("answers every request at the queue, with no worker time in the answer", () => {
      const { summary } = get();
      expect(summary.failed).toBeLessThan(0.5);
      expect(Math.abs(summary.served - 1200)).toBeLessThan(0.5);
      // 20 ms from the desktop, 10 ms of compute, 1 ms hop and 2 ms to enqueue.
      expect(summary.p95Ms).toBeLessThan(60);
    });

    it("grows the backlog by about 10 a second, to about 600 at the end of the window", () => {
      const { run, q } = get();
      const atWindowEnd = run.frames[run.windowSteps - 1].nodes.q.backlog;
      expect(atWindowEnd).toBeGreaterThan(560);
      expect(atWindowEnd).toBeLessThan(640);
      expect(q.peakBacklog).toBeGreaterThan(560);
      expect(q.peakAt).toBeGreaterThan(55);
      expect(q.peakAt).toBeLessThan(65);
    });

    it("drains in about another minute and does every job", () => {
      const { jobs, q } = get();
      expect(q.emptyAt).not.toBeNull();
      expect(q.emptyAt!).toBeGreaterThan(110);
      expect(q.emptyAt!).toBeLessThan(130);
      expect(Math.abs(jobs.queued - 1200)).toBeLessThan(0.5);
      expect(Math.abs(jobs.done - 1200)).toBeLessThan(0.5);
      expect(jobs.stillWaiting).toBeLessThan(0.5);
      expect(jobs.neverDone).toBeLessThan(0.5);
    });

    it("says when the workers fell behind, and the last jobs waited about a minute", () => {
      const { jobs, q } = get();
      expect(q.fellBehindAt).not.toBeNull();
      expect(q.fellBehindAt!).toBeLessThan(1);
      expect(jobs.p95Ms).toBeGreaterThan(30_000);
      expect(jobs.p95Ms).toBeLessThan(75_000);
    });

    it("reports the backlog on the queue and the work on the worker, never as first to saturate", () => {
      const { summary } = get();
      expect(summary.perNode.q.peakBacklog).toBeGreaterThan(560);
      expect(summary.perNode.w.peakUtilisation).toBeGreaterThanOrEqual(1);
      expect(summary.perNode.w.served).toBeGreaterThan(1199);
      expect(summary.firstSaturation).toBeNull();
    });

    it("moves jobs along the edges into and out of the queue, for the dots", () => {
      const { run } = get();
      const mid = run.frames[300].edges;
      // 20 a second in steps of 0.1 s: 2 a step into the queue, 1 a step out to the worker.
      expect(mid["vm->q"].volume).toBeCloseTo(2, 1);
      expect(mid["q->w"].volume).toBeCloseTo(1, 1);
      // In the drain, nothing new arrives but the worker keeps taking jobs.
      const draining = run.frames[run.windowSteps + 100].edges;
      expect(draining["vm->q"]?.volume ?? 0).toBeLessThan(1e-6);
      expect(draining["q->w"].volume).toBeCloseTo(1, 1);
    });

    it("tells the queue's story in a note", () => {
      const { summary } = get();
      expect(summary.notes.some((n) => /^Graders fell behind at 0:00\. The queue peaked at \d[\d,]* jobs and was empty again by (1:5\d|2:0\d)\.$/.test(n))).toBe(true);
    });
  });

  it("stops draining after one more window and counts the rest as still waiting", () => {
    // 40 a second for a minute: 2,400 jobs, 600 done in the window, 600 more in the drain.
    const { summary } = runDesign(backlogDesign(), minute(40));
    const jobs = summary.jobs!;
    expect(jobs.stillWaiting).toBeGreaterThan(1100);
    expect(jobs.stillWaiting).toBeLessThan(1300);
    expect(summary.failed).toBeLessThan(0.5);
  });

  it("never does the jobs on a queue nobody reads, and says so", () => {
    const built = fixtureDesign("lab-autograder", "bad-no-worker");
    const { summary } = runDesign(built, defaultScenario(built.brief), { brief: built.brief });
    const jobs = summary.jobs!;
    expect(jobs.queued).toBeGreaterThan(0);
    expect(jobs.done).toBeLessThan(0.5);
    expect(Math.abs(jobs.neverDone - jobs.queued)).toBeLessThan(0.5);
    expect(summary.notes.some((n) => /^Grading jobs has no worker reading it, so [\d,]+ jobs were never done\.$/.test(n))).toBe(
      true,
    );
  });

  describe("writes from workers", () => {
    // desktop → VM → queue → worker → database; one storing feature, all writes.
    function writesDesign(extra: string[] = [], reqs = [requirement("save", { targetRpm: 60, computeMsPerRequest: 5 })]) {
      return design(
        reqs,
        [
          ["desktop", "desktop"],
          ["vm", "vm", { capacity: { vcpus: 4 } }],
          ["q", "message_queue"],
          ["w", "task_worker", { concurrency: 50 }],
          ["db", "database"],
        ],
        ["desktop -> vm : http", "vm -> q : http", "q -> w : http", "w -> db : db", ...extra],
        { save: "vm", ...(reqs.length > 1 ? { look: "vm" } : {}) },
      );
    }
    const allWrites = (batch: number) => ({ save: { share: 1, writeShare: 1, readDbMs: 3, writeDbMs: 8, batch } });

    it("divides the database's write work by the batch", () => {
      const steady: Scenario = { requests: 3000, windowSeconds: 60, shape: "steady" };
      const one = runDesign(writesDesign(), steady, { loads: allWrites(1) }).summary.perNode.db.peakUtilisation;
      const ten = runDesign(writesDesign(), steady, { loads: allWrites(10) }).summary.perNode.db.peakUtilisation;
      expect(one).toBeGreaterThan(0);
      expect(ten / one).toBeCloseTo(0.1, 2);
    });

    it("moves the workers' writes along the worker → database edge", () => {
      const steady: Scenario = { requests: 3000, windowSeconds: 60, shape: "steady" };
      const run = runDesign(writesDesign(), steady, { loads: allWrites(10) });
      // 50 jobs a second, 5 a step; the edge carries jobs, so batching doesn't thin the dots.
      expect(run.frames[300].edges["w->db"].volume).toBeCloseTo(5, 1);
    });

    it("never times out a job at a saturated database, but still times out requests stuck behind them", () => {
      // 400 writes a second against about 175 the database can take; Look reads the same database.
      const built = writesDesign(
        ["vm -> db : db"],
        [
          requirement("save", { targetRpm: 60, computeMsPerRequest: 5 }),
          requirement("look", { targetRpm: 6, computeMsPerRequest: 5 }),
        ],
      );
      const loads = {
        save: { share: 400 / 410, writeShare: 1, readDbMs: 3, writeDbMs: 8, batch: 1 },
        look: { share: 10 / 410, writeShare: 0, readDbMs: 3, writeDbMs: 8, batch: 1 },
      };
      const { summary } = runDesign(built, { requests: 410 * 60, windowSeconds: 60, shape: "steady" }, { loads });
      const jobs = summary.jobs!;
      expect(Math.abs(jobs.done + jobs.stillWaiting - jobs.queued)).toBeLessThan(0.5);
      expect(jobs.neverDone).toBeLessThan(0.5);
      expect(summary.failures.some((f) => f.reason === "timed-out" && f.nodeId === "db")).toBe(true);
      // Every timed-out request was a Look read: Save's requests were answered at the queue.
      expect(summary.failed).toBeLessThanOrEqual(10 * 60 + 0.5);
    });
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
