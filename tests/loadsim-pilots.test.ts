import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { defaultScenario, featureLoads } from "@/lib/loadsim/scenario";
import { design, fixtureDesign, requirement, runDesign } from "@/test/loadsim-designs";
import { simulateLoad } from "@/lib/loadsim/model";
import type { Outage } from "@/lib/loadsim/outages";

// Calibration of the load simulation on its two pilot briefs (SPEC-dataflow-sim.md), each
// under its brief's default scenario. Capacities are realistic, and each brief's `dbMs`
// is a realistic cost for that query; neither is raised just to make a flaw show.
function run(briefId: string, fixture: string) {
  const built = fixtureDesign(briefId, fixture);
  return runDesign(built, defaultScenario(built.brief), { brief: built.brief }).summary;
}

/**
 * A design under the generic default load, as if its brief had no `load` block: 100,000
 * requests over 20 minutes in a spike, with default per-feature figures. The cascade demos
 * below were written against it, before their briefs got their own blocks
 * (SPEC-brief-load-rollout.md), and still test the same mechanics.
 */
function runGeneric(built: ReturnType<typeof fixtureDesign>) {
  return runDesign(built, defaultScenario(null), { loads: featureLoads(built.features, { ...built.brief, load: undefined }) });
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

// SPEC-loadsim-failures.md: the pilot table, each under its brief's default load.
describe("switching components off", () => {
  function runWith(briefId: string, fixture: string, outages: Outage[]) {
    const built = fixtureDesign(briefId, fixture);
    return simulateLoad({
      nodes: built.nodes,
      edges: built.edges,
      features: built.features,
      scenario: defaultScenario(built.brief),
      loads: featureLoads(built.features, built.brief),
      outages,
    }).summary;
  }
  const switchedOffAt = (s: ReturnType<typeof runWith>, nodeId: string) =>
    s.failures.filter((f) => f.reason === "switched-off" && f.nodeId === nodeId).reduce((n, f) => n + f.count, 0);

  it("link-shortener/good: an API instance off during the spike saturates the other (N+1)", () => {
    // Decided in Task 3: each instance runs at 65% in the spike, so one alone needs 130%.
    const s = runWith("link-shortener", "good", [{ nodeId: "api-1", offAt: 120, onAt: null }]);
    expect(switchedOffAt(s, "api-1")).toBeGreaterThan(0);
    expect(s.perNode["api-2"].peakUtilisation).toBeGreaterThanOrEqual(1);
    expect(s.failures.some((f) => f.reason === "timed-out" && f.nodeId === "api-2")).toBe(true);
  });

  it("link-shortener/good: an API instance off after the spike fails only for the health check", () => {
    const s = runWith("link-shortener", "good", [{ nodeId: "api-1", offAt: 400, onAt: null }]);
    expect(switchedOffAt(s, "api-1")).toBeGreaterThan(0);
    expect(s.perNode["api-2"].peakUtilisation).toBeLessThan(1);
    expect(s.served / s.requests).toBeGreaterThanOrEqual(0.99);
  });

  it("link-shortener/bad-no-load-balancer: an API instance off fails everything that needs it", () => {
    const outage = [{ nodeId: "api-2", offAt: 120, onAt: null }];
    const bad = runWith("link-shortener", "bad-no-load-balancer", outage);
    const good = runWith("link-shortener", "good", [{ nodeId: "api-2", offAt: 120, onAt: null }]);
    expect(switchedOffAt(bad, "api-2")).toBeGreaterThan(10 * switchedOffAt(good, "api-2"));
  });

  it("link-shortener: a database off loses writes for the failover with a replica, everything without", () => {
    const outage = [{ nodeId: "db", offAt: 120, onAt: 180 }];
    const good = runWith("link-shortener", "good", outage);
    const single = runWith("link-shortener", "bad-single-db-replica", outage);
    expect(switchedOffAt(good, "db")).toBeGreaterThan(0);
    expect(switchedOffAt(single, "db")).toBeGreaterThan(5 * switchedOffAt(good, "db"));
  });

  it("course-registration/good: the cache off saturates the database", () => {
    const s = runWith("course-registration", "good", [{ nodeId: "cache", offAt: 120, onAt: null }]);
    const calm = run("course-registration", "good");
    expect(s.perNode.db.peakUtilisation).toBeGreaterThanOrEqual(1);
    expect(calm.perNode.db.peakUtilisation).toBeLessThan(1);
  });

  it("course-registration/good: the cache back at 4:00 leaves the database busy while it warms up", () => {
    const built = fixtureDesign("course-registration", "good");
    const r = simulateLoad({
      nodes: built.nodes,
      edges: built.edges,
      features: built.features,
      scenario: defaultScenario(built.brief),
      loads: featureLoads(built.features, built.brief),
      outages: [{ nodeId: "cache", offAt: 120, onAt: 240 }],
    });
    const dbAt = (seconds: number) => r.frames[Math.round(seconds / r.dtSeconds)].nodes.db.arrivals;
    // Still in the spike (it lasts 5 minutes): just after 4:00 the database has far more
    // reads than once the cache has warmed up.
    expect(dbAt(244)).toBeGreaterThan(2 * dbAt(280));
  });

  it("lab-autograder/good: the workers off from 40:00 to 50:00 let the queue grow, and lose nothing", () => {
    const s = runWith("lab-autograder", "good", [{ nodeId: "sandbox", offAt: 2400, onAt: 3000 }]);
    const calm = run("lab-autograder", "good");
    const jobs = s.jobs!;
    expect(jobs.perQueue.jobs.peakBacklog).toBeGreaterThan(calm.jobs!.perQueue.jobs.peakBacklog);
    expect(jobs.neverDone).toBeLessThan(0.5);
    expect(Math.abs(jobs.done + jobs.stillWaiting - jobs.queued)).toBeLessThan(0.5);
  });

  it("every pilot with no outages is unchanged", () => {
    for (const [briefId, fixture] of [
      ["link-shortener", "good"],
      ["course-registration", "good"],
      ["lab-autograder", "good"],
      ["lab-monitor", "good"],
    ]) {
      expect(JSON.stringify(runWith(briefId, fixture, []))).toBe(JSON.stringify(run(briefId, fixture)));
    }
  });
});

// SPEC-loadsim-cascades.md: the pilot table, each under its brief's default load.
describe("slow work and cascades", () => {
  const failedThere = (s: ReturnType<typeof run>, nodeIds: string[], reasons = ["timed-out", "too-slow"]) =>
    s.failures.filter((f) => f.nodeId !== null && nodeIds.includes(f.nodeId) && reasons.includes(f.reason)).reduce((n, f) => n + f.count, 0);

  describe("lab-autograder: grading inside the request", () => {
    // Submit solution's 3 s of grading is CPU (slowWork: cpu), split over two 2-vCPU
    // instances (1,400 ms of CPU a second each). The average request costs
    // (300 × 15 + 200 × 3,040 + 600 × 10) ÷ 1,100 ≈ 562 ms of CPU, so each instance
    // saturates once the ramp reaches about 2 × 1,400 ÷ 562 ≈ 5 requests a second: at
    // about 30:36 of the hour (step 306 of 600). Slots never bind first: a 3 s hold allows
    // about 26 a second per instance.
    let cached: { bad: ReturnType<typeof run>; good: ReturnType<typeof run>; runBad: ReturnType<typeof runDesign> } | null = null;
    const get = () => {
      if (cached) return cached;
      const built = fixtureDesign("lab-autograder", "bad-sync-grading");
      const runBad = runDesign(built, defaultScenario(built.brief), { brief: built.brief });
      return (cached = { bad: runBad.summary, good: run("lab-autograder", "good"), runBad });
    };

    it("saturates the API instances before the deadline, at about 30:36", () => {
      const { bad } = get();
      for (const id of ["api-1", "api-2"]) {
        expect(bad.perNode[id].firstSaturatedAt).not.toBeNull();
        expect(bad.perNode[id].firstSaturatedAt!).toBeGreaterThan(1750);
        expect(bad.perNode[id].firstSaturatedAt!).toBeLessThan(1950);
      }
    });

    it("records CPU as the limit that binds there", () => {
      const { runBad } = get();
      expect(runBad.frames.some((f) => f.nodes["api-1"].limit === "cpu")).toBe(true);
    });

    it("times requests out at the API instances", () => {
      expect(failedThere(get().bad, ["api-1", "api-2"])).toBeGreaterThan(0);
    });

    it("fails Browse exercises and View result too: more fail than every submission", () => {
      // 200 of 1,100 req/min are submissions: 3,200 of the 17,600 requests.
      const { bad, good } = get();
      expect(good.failed).toBeLessThan(0.5);
      expect(bad.failed).toBeGreaterThan(3200);
    });
  });

  describe("notification-system: sending pushes inside the request (generic default load)", () => {
    // The slot cascade's demo (moved here from the autograder in Task 1). Under the generic
    // default load (runGeneric), with the brief's 2 s of slow work per push. In the spike,
    // 166.7 req/s split over two instances: each gets 83.3, of which Fan out alert is
    // 1,500 ÷ 1,650, about 75.8. Each holds a slot for its 2 s of waiting plus 15 ms of
    // compute, so Fan out alone needs 75.8 × 2.02 ≈ 153 slots against 80. CPU is about
    // 95% offered, so slots bind from the first step. After the spike (55.6 req/s) Fan out
    // needs about 51 slots, so nothing binds once the backlog has drained.
    const r = runGeneric(fixtureDesign("notification-system", "bad-sync-delivery"));

    it("runs both API instances out of slots from 0:00, only during the spike", () => {
      for (const id of ["api-1", "api-2"]) {
        expect(r.frames[0].nodes[id].limit).toBe("slots");
        expect(r.frames[100].nodes[id].limit).toBe("slots");
        expect(r.frames[400].nodes[id].limit).toBeUndefined();
      }
    });

    it("says Fan out alert held the slots, and the other features failed there too", () => {
      for (const n of [1, 2]) {
        expect(
          r.summary.notes.some((note) =>
            new RegExp(
              `^Alerts API ${n} ran out of request slots at 0:00: Fan out alert's .*\\b2 s\\b.* held them\\. ` +
                "Requests for (Publish alert and Alert preferences|Alert preferences and Publish alert) timed out there too\\.$",
            ).test(note),
          ),
        ).toBe(true);
      }
    });

    it("advises more instances or a queue, not more vCPUs, when slots run out first", () => {
      // More vCPUs don't add slots: each instance still holds 80 requests at once.
      expect(r.summary.firstSaturation?.note).toBe(
        "Alerts API 1 saturated at 0:00: all 80 of its request slots are held. Move the slow work to a queue, or add instances behind a load balancer.",
      );
    });

    it("keeps the vCPU advice where the CPU runs out (autograder)", () => {
      const grading = fixtureDesign("lab-autograder", "bad-sync-grading");
      const note = runDesign(grading, defaultScenario(grading.brief), { brief: grading.brief }).summary.firstSaturation?.note;
      expect(note).toMatch(/^Lab API 1 saturated at 30:36: its instances can't keep up\. Add instances behind a load balancer, or give them more vCPUs\.$/);
    });
  });

  describe("course-registration: no cache", () => {
    // Today (a844a4d): 7,440 requests time out at the database, whose backlog peaks at 708.
    const s = run("course-registration", "bad-no-cache");
    const built = fixtureDesign("course-registration", "bad-no-cache");
    const r = runDesign(built, defaultScenario(built.brief), { brief: built.brief });

    it("times requests out at the API instances, whose database connections run out", () => {
      expect(failedThere(s, ["api-1", "api-2"])).toBeGreaterThan(0);
      expect(r.frames.some((f) => f.nodes["api-1"].limit === "connections")).toBe(true);
      expect(r.frames.some((f) => f.nodes["api-2"].limit === "connections")).toBe(true);
    });

    it("leaves the database a smaller backlog than today", () => {
      expect(s.perNode.db.peakBacklog).toBeLessThan(708);
    });

    it("still saturates the database first, and still fails at least 5%", () => {
      expect(s.firstSaturation?.nodeId).toBe("db");
      expect(s.failed / s.requests).toBeGreaterThanOrEqual(0.05);
    });
  });

  describe("unchanged pilots: no limit binds, and no answer passes 5 s", () => {
    // Measured on main at a844a4d, before this module: tests/loadsim-unchanged-baseline.json.
    const baseline = JSON.parse(readFileSync(path.resolve(__dirname, "loadsim-unchanged-baseline.json"), "utf8")) as {
      designs: Record<string, unknown>;
    };
    it.each(Object.keys(baseline.designs))("%s", (key) => {
      const [briefId, fixture] = key.split("/");
      const s = run(briefId, fixture);
      expect({
        served: s.served,
        failed: s.failed,
        p50Ms: s.p50Ms,
        p95Ms: s.p95Ms,
        failures: s.failures.map((g) => ({ nodeId: g.nodeId, reason: g.reason, count: g.count })),
        peakUtilisation: Object.fromEntries(Object.entries(s.perNode).map(([id, n]) => [id, n.peakUtilisation])),
      }).toEqual(baseline.designs[key]);
    });
  });

  describe("lecture-video-library: transcoding inside the request (generic default load)", () => {
    it("fails every Upload recording request as too-slow: 60 s of slow work", () => {
      // Uploads alone, at under one a second, so nothing else is busy.
      const built = fixtureDesign("lecture-video-library", "bad-sync-transcode");
      const loads = featureLoads(built.features, { ...built.brief, load: undefined });
      for (const id of Object.keys(loads)) loads[id] = { ...loads[id], share: id === "upload-recording" ? 1 : 0 };
      const s = runDesign(built, { requests: 1000, windowSeconds: 1200, shape: "steady" }, { loads }).summary;
      expect(s.served).toBeLessThan(0.5);
      expect(failedThere(s, ["api-1", "api-2"], ["too-slow"])).toBeCloseTo(1000, 0);
    });

    it("fails them as too-slow at the API under the generic default load too", () => {
      // 10 of 1,310 req/min are uploads: about 763 of the 100,000 requests.
      const s = runGeneric(fixtureDesign("lecture-video-library", "bad-sync-transcode")).summary;
      expect(failedThere(s, ["api-1", "api-2"], ["too-slow"])).toBeGreaterThan(0.9 * 763);
      expect(s.p95Ms).toBeLessThan(5000);
    });
  });

  describe("a hand-built external call of apiMs: 2000", () => {
    // Two instances behind a balancer, 200 requests a second: each is offered 100 and
    // admits at most 80 slots ÷ 2.01 s ≈ 40, whether it has 8 vCPUs or 32.
    const callDesign = (vcpus: number) =>
      design(
        [requirement("ask", { name: "Ask", targetRpm: 60, computeMsPerRequest: 10, resources: { memoryGb: 0.5, vcpus: 0.5, storageGb: 0 } })],
        [
          ["desktop", "desktop"],
          ["lb", "load_balancer"],
          ["api-1", "vm", { capacity: { vcpus } }],
          ["api-2", "vm", { capacity: { vcpus } }],
          ["llm", "external_api"],
        ],
        ["desktop -> lb : http", "lb -> api-1 : http", "lb -> api-2 : http", "api-1 -> llm : http", "api-2 -> llm : http"],
        { ask: "api-1" },
      );
    const loads = { ask: { share: 1, writeShare: 0, readDbMs: 3, writeDbMs: 8, batch: 1, slowWork: "wait" as const, apiMs: 2000, slowMs: null } };

    it.each([8, 32])("caps each instance at about 40 req/s with %i vCPUs", (vcpus) => {
      const r = runDesign(callDesign(vcpus), { requests: 200 * 60, windowSeconds: 60, shape: "steady" }, { loads });
      for (const id of ["api-1", "api-2"]) {
        const rates = r.frames.slice(300, 600).map((f) => f.nodes[id].served / r.dtSeconds);
        expect(Math.min(...rates)).toBeGreaterThan(38);
        expect(Math.max(...rates)).toBeLessThan(41);
      }
    });
  });
});
