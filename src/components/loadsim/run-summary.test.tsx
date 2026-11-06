import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { simulateLoad } from "@/lib/loadsim/model";
import { defaultScenario, featureLoads } from "@/lib/loadsim/scenario";
import { design, fixtureDesign, requirement, runDesign } from "@/test/loadsim-designs";
import { NodeStatsTable } from "./node-stats-table";
import { RunSummary, announcementFor } from "./run-summary";
import type { FeatureLoad } from "@/lib/loadsim/types";

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

function runOf(briefId: string, fixture: string) {
  const built = fixtureDesign(briefId, fixture);
  return { built, run: runDesign(built, defaultScenario(built.brief), { brief: built.brief }) };
}

describe("RunSummary", () => {
  it("tells the story of a saturated database, with what isn't simulated", () => {
    const { run } = runOf("course-registration", "bad-no-cache");
    const t = text(renderToStaticMarkup(<RunSummary run={run} />));
    expect(t).toContain("Served");
    // 91.5% before SPEC-loadsim-queues.md: enrolment writes now wait as jobs instead of timing out.
    // 92.6% before SPEC-loadsim-cascades.md: the API instances run out of database connections,
    // and requests give up once their answer would take over 5 s.
    expect(t).toContain("90.4%");
    expect(t).toContain("Failed");
    expect(t).toContain("Timed out waiting at Registration DB.");
    expect(t).toContain("Registration DB saturated at 0:00");
    expect(t).toContain("p50");
    expect(t).toContain("p95");
    expect(t).toContain("Not simulated yet");
    // Since SPEC-loadsim-queues.md the queue and worker are simulated; autoscaling isn't.
    expect(t).toContain("Autoscaling isn't simulated yet");
    expect(t).not.toContain("Seat claims (queue)");
  });

  it("has a Background jobs block with the counts, times and the queue's story", () => {
    const { run } = runOf("lab-autograder", "good");
    const t = text(renderToStaticMarkup(<RunSummary run={run} />));
    expect(t).toContain("Background jobs");
    expect(t).toMatch(/Queued [\d,]+/);
    expect(t).toMatch(/Done [\d,]+/);
    expect(t).toContain("Typical time to done");
    expect(t).toContain("Slowest 5%");
    expect(t).toMatch(/Sandbox workers fell behind at \d+:\d\d\. The queue peaked at [\d,]+ jobs and was empty again by \d+:\d\d\./);
  });

  it("says when jobs are never done", () => {
    const { run } = runOf("lab-autograder", "bad-no-worker");
    const t = text(renderToStaticMarkup(<RunSummary run={run} />));
    expect(t).toMatch(/Never done [\d,]+/);
    expect(t).toMatch(/Grading jobs has no worker reading it, so [\d,]+ jobs were never done\./);
  });

  it("has no Background jobs block without jobs", () => {
    const { run } = runOf("link-shortener", "good");
    expect(text(renderToStaticMarkup(<RunSummary run={run} />))).not.toContain("Background jobs");
  });

  it("names the busiest component and the cache estimate when nothing saturates", () => {
    const { run } = runOf("link-shortener", "bad-no-cache");
    const t = text(renderToStaticMarkup(<RunSummary run={run} />));
    expect(t).toContain("100%");
    expect(t).toContain(run.summary.busiest!.note);
    expect(t).toContain("A cache in front would bring it to about");
    expect(t).not.toContain("Timed out");
  });

  it("doesn't repeat the busiest database when its cache note says the same", () => {
    const built = fixtureDesign("course-registration", "bad-no-cache");
    const run = runDesign(built, { ...defaultScenario(built.brief), shape: "steady" }, { brief: built.brief });
    expect(run.summary.busiest?.nodeId).toBe("db");
    const t = text(renderToStaticMarkup(<RunSummary run={run} />));
    expect(t.match(/Registration DB peaked at/g)).toHaveLength(1);
    expect(t).toContain("A cache in front would bring it to about");
  });

  it("lists requests with no route by what they were", () => {
    const { run } = runOf("link-shortener", "bad-no-load-balancer");
    const t = text(renderToStaticMarkup(<RunSummary run={run} />));
    expect(t).toContain("Student phone can't reach an instance running Redirect.");
  });
});

describe("NodeStatsTable", () => {
  it("has a caption, headers and a row per component that serves requests", () => {
    const { built, run } = runOf("link-shortener", "good");
    const html = renderToStaticMarkup(<NodeStatsTable run={run} nodes={built.nodes} />);
    expect(html).toContain("<caption");
    for (const h of ["Component", "Peak busy", "Peak waiting", "Served", "Failed", "First saturated"]) {
      expect(html).toMatch(new RegExp(`<th[^>]*scope="col"[^>]*>${h}</th>`));
    }
    // Load balancer, two APIs, cache, database; clients send rather than serve.
    expect(html.match(/<tr/g)!.length).toBe(1 + 5);
    expect(html).toMatch(/<th[^>]*scope="row"[^>]*>Links DB<\/th>/);
  });

  it("shows when a component first saturated", () => {
    const { built, run } = runOf("course-registration", "bad-no-cache");
    const t = text(renderToStaticMarkup(<NodeStatsTable run={run} nodes={built.nodes} />));
    // 129% before SPEC-loadsim-cascades.md: the API instances' connection pools now hold back
    // what reaches the database.
    expect(t).toMatch(/Registration DB 107% .* 0:00/);
  });

  it("gives a queue its peak backlog and when its workers fell behind", () => {
    const { built, run } = runOf("lab-autograder", "good");
    const q = run.summary.jobs!.perQueue.jobs;
    const t = text(renderToStaticMarkup(<NodeStatsTable run={run} nodes={built.nodes} />));
    const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    expect(t).toContain(`Grading jobs`);
    expect(t).toContain(Math.round(q.peakBacklog).toLocaleString("en"));
    expect(t).toContain(clock(q.fellBehindAt!));
    expect(t).not.toContain("not simulated");
  });
});

describe("with an outage (SPEC-loadsim-failures.md)", () => {
  const built = fixtureDesign("link-shortener", "good");
  const run = simulateLoad({
    nodes: built.nodes,
    edges: built.edges,
    features: built.features,
    scenario: defaultScenario(built.brief),
    loads: featureLoads(built.features, built.brief),
    outages: [{ nodeId: "api-1", offAt: 60, onAt: 180 }],
  });

  it("puts the outage's note first in the summary", () => {
    const t = text(renderToStaticMarkup(<RunSummary run={run} />));
    expect(t).toContain(run.summary.outages[0].note);
    expect(t.indexOf(run.summary.outages[0].note)).toBeLessThan(t.indexOf("Not simulated yet"));
  });

  it("adds a Failed while off column to the table", () => {
    const html = renderToStaticMarkup(<NodeStatsTable run={run} nodes={built.nodes} />);
    expect(html).toMatch(/<th[^>]*scope="col"[^>]*>Failed while off<\/th>/);
    const count = Math.round(run.summary.perNode["api-1"].failedWhileOff).toLocaleString("en");
    expect(text(html)).toMatch(new RegExp(`Link API 1 .*\\b${count}\\b`));
  });
});

describe("announcementFor", () => {
  const { run } = runOf("course-registration", "bad-no-cache");

  it("announces the first saturation when playback reaches it", () => {
    expect(announcementFor(-1, 0, run)).toBe("Registration DB saturated at 0:00.");
    expect(announcementFor(3, 4, run)).toBeNull();
  });

  it("announces the end of playback with the share served", () => {
    const last = run.frames.length - 1;
    // With enrolments on a queue (SPEC-loadsim-queues.md), the jobs done are announced too.
    expect(announcementFor(last - 1, last, run)).toBe(
      // 92.6% before SPEC-loadsim-cascades.md (see the RunSummary test above).
      "Playback finished: 90.4% of requests served, 15,000 of 15,000 jobs done.",
    );
    expect(announcementFor(last, last, run)).toBeNull();
  });
});

describe("announcementFor, with background jobs (SPEC-loadsim-queues.md)", () => {
  // One worker slot at 100 ms a job against 20 jobs a second for a minute: about 600 jobs
  // are still waiting when requests stop, so the run drains for about another minute.
  const backlog = () =>
    runDesign(
      design(
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
          ["q", "message_queue"],
          ["w", "task_worker", { concurrency: 1 }],
        ],
        ["desktop -> vm : http", "vm -> q : http", "q -> w : http"],
        { grade: "vm" },
      ),
      { requests: 1200, windowSeconds: 60, shape: "steady" },
    );

  it("says when requests stop and the queues start to drain", () => {
    const run = backlog();
    const end = run.windowSteps;
    expect(announcementFor(end - 1, end, run)).toBe("Requests stopped arriving; the queues are draining.");
    expect(announcementFor(end, end + 1, run)).toBeNull();
  });

  it("adds the jobs done to the end of playback", () => {
    const run = backlog();
    const last = run.frames.length - 1;
    expect(announcementFor(last - 1, last, run)).toBe(
      "Playback finished: 100% of requests served, 1,200 of 1,200 jobs done.",
    );
  });

  it("says nothing about draining when nothing waits on a queue", () => {
    const { run } = runOf("link-shortener", "good");
    const end = run.windowSteps;
    expect(announcementFor(end - 1, end, run) ?? "").not.toContain("draining");
  });
});

describe("slow work and cascades (SPEC-loadsim-cascades.md)", () => {
  const stateless = { resources: { memoryGb: 0.5, vcpus: 0.5, storageGb: 0 } };
  const load = (o: Partial<FeatureLoad>): FeatureLoad => ({
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

  it("lists too-slow failures at the instance where the client gave up", () => {
    // 20 + 10 + 6,000 ms: every answer takes over 5 s.
    const built = design(
      [requirement("grade", { name: "Grade", targetRpm: 60, computeMsPerRequest: 10, backgroundWorkMs: 6000, ...stateless })],
      [
        ["desktop", "desktop"],
        ["vm", "vm", { capacity: { vcpus: 8 } }, "Grading API"],
      ],
      ["desktop -> vm : http"],
      { grade: "vm" },
    );
    const run = runDesign(built, { requests: 60, windowSeconds: 60, shape: "steady" }, { loads: { grade: load({}) } });
    expect(text(renderToStaticMarkup(<RunSummary run={run} />))).toContain("Gave up on Grading API: answers took over 5 s.");
  });

  it("tells a slot cascade: the feature holding the slots, and the others that failed there", () => {
    // Ask makes a 2 s call and Look doesn't; both share one instance at 100 a second each.
    // Ask's holds use 100 × 2.01 = 201 slot-seconds a second against 80, so Look waits too.
    const built = design(
      [
        requirement("ask", { name: "Ask", targetRpm: 60, computeMsPerRequest: 10, ...stateless }),
        requirement("look", { name: "Look", targetRpm: 60, computeMsPerRequest: 10, ...stateless }),
      ],
      [
        ["desktop", "desktop"],
        ["vm", "vm", { capacity: { vcpus: 8 } }, "Help API"],
        ["llm", "external_api", {}, "AI API"],
      ],
      ["desktop -> vm : http", "vm -> llm : http"],
      { ask: "vm", look: "vm" },
    );
    const loads = { ask: load({ share: 0.5, apiMs: 2000 }), look: load({ share: 0.5 }) };
    const run = runDesign(built, { requests: 200 * 60, windowSeconds: 60, shape: "steady" }, { loads });
    const t = text(renderToStaticMarkup(<RunSummary run={run} />));
    expect(t).toMatch(/Help API ran out of request slots at 0:00: Ask's .*\b2 s\b.* held them\. Requests for Look timed out there too\./);
    expect(t).not.toContain("database connections were all busy");
  });

  it("tells a connection cascade, naming the saturated database", () => {
    const { run } = runOf("course-registration", "bad-no-cache");
    const t = text(renderToStaticMarkup(<RunSummary run={run} />));
    expect(t).toMatch(
      /Registration API [12]'s database connections were all busy from \d+:\d\d, because Registration DB was saturated\. [\d,]+ requests timed out there, not at the database./,
    );
  });

  it("tells no cascade when only CPU bound, or nothing did", () => {
    // One vCPU at twice its capacity: CPU binds, never slots or connections.
    const cpuBound = runDesign(
      design(
        [requirement("ping", { targetRpm: 60, computeMsPerRequest: 10, ...stateless })],
        [
          ["desktop", "desktop"],
          ["vm", "vm", { capacity: { vcpus: 1 } }],
        ],
        ["desktop -> vm : http"],
        { ping: "vm" },
      ),
      { requests: 8_400, windowSeconds: 60, shape: "steady" },
    );
    for (const run of [cpuBound, runOf("link-shortener", "good").run]) {
      const t = text(renderToStaticMarkup(<RunSummary run={run} />));
      expect(t).not.toContain("ran out of request slots");
      expect(t).not.toContain("database connections were all busy");
    }
  });
});
