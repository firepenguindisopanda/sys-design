import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { simulateLoad } from "@/lib/loadsim/model";
import { defaultScenario, featureLoads } from "@/lib/loadsim/scenario";
import { design, fixtureDesign, requirement, runDesign } from "@/test/loadsim-designs";
import { LoadNodeBody, gaugeBand, nodeStatus, nodeStatusAt } from "./load-node";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("gaugeBand", () => {
  it("is ok under 70%, busy to 99%, and saturated from 100%", () => {
    expect(gaugeBand(0.5)).toBe("ok");
    expect(gaugeBand(0.85)).toBe("busy");
    expect(gaugeBand(0.999)).toBe("busy");
    expect(gaugeBand(1)).toBe("saturated");
    expect(gaugeBand(1.2)).toBe("saturated");
  });
});

describe("nodeStatus", () => {
  const base = { kind: "database", utilisation: 0, failedSoFar: 0, ratePerSecond: 0, notSimulated: false };

  it("says how busy a component is, in words", () => {
    expect(nodeStatus({ ...base, utilisation: 0.5, ratePerSecond: 80 })).toBe("50% busy");
    expect(nodeStatus({ ...base, utilisation: 0.92, ratePerSecond: 80 })).toBe("92% busy");
  });

  it("says when it's saturated and how many have failed so far", () => {
    expect(nodeStatus({ ...base, utilisation: 1.2, ratePerSecond: 80 })).toBe("Saturated");
    expect(nodeStatus({ ...base, utilisation: 1.2, failedSoFar: 1204.4, ratePerSecond: 80 })).toBe(
      "Saturated · 1,204 failed",
    );
    expect(nodeStatus({ ...base, utilisation: 0.4, failedSoFar: 30, ratePerSecond: 80 })).toBe("40% busy · 30 failed");
  });

  it("says what clients send, and marks parts that aren't simulated or get no traffic", () => {
    expect(nodeStatus({ ...base, kind: "mobile", ratePerSecond: 83.4 })).toBe("Sending 83 req/s");
    expect(nodeStatus({ ...base, kind: "message_queue", notSimulated: true })).toBe("Not simulated yet");
    expect(nodeStatus(base)).toBe("No traffic");
  });

  it("says how many jobs wait on a queue, and when nobody reads it (SPEC-loadsim-queues.md)", () => {
    const queue = { ...base, kind: "message_queue" };
    expect(nodeStatus({ ...queue, waiting: 0 })).toBe("Empty");
    expect(nodeStatus({ ...queue, waiting: 0.3 })).toBe("Empty");
    expect(nodeStatus({ ...queue, waiting: 312.4 })).toBe("312 waiting");
    expect(nodeStatus({ ...queue, waiting: 3400, unread: true })).toBe("3,400 waiting · nobody reads it");
  });

  it("says how busy a worker is and how many of its slots are in use", () => {
    const worker = { ...base, kind: "task_worker", concurrency: 4 };
    expect(nodeStatus({ ...worker, utilisation: 1.6 })).toBe("100% busy · 4 of 4 slots");
    expect(nodeStatus({ ...worker, utilisation: 0.5 })).toBe("50% busy · 2 of 4 slots");
    expect(nodeStatus({ ...worker, utilisation: 0.1 })).toBe("10% busy · 1 of 4 slots");
    expect(nodeStatus({ ...worker, utilisation: 0 })).toBe("No traffic");
  });

  it("reads a real run's queue and worker frames (autograder)", () => {
    const run = (fixture: string) => {
      const built = fixtureDesign("lab-autograder", fixture);
      return runDesign(built, defaultScenario(built.brief), { brief: built.brief });
    };
    const good = run("good");
    const peakStep = good.frames.findIndex((f) => f.nodes.jobs.backlog === Math.max(...good.frames.map((g) => g.nodes.jobs.backlog)));
    expect(nodeStatusAt(good, "jobs", "message_queue", peakStep, 0, false)).toMatch(/^[\d,]+ waiting$/);
    expect(nodeStatusAt(good, "jobs", "message_queue", good.frames.length - 1, 0, false)).toBe("Empty");
    expect(nodeStatusAt(good, "sandbox", "task_worker", peakStep, 0, false)).toBe("100% busy · 4 of 4 slots");

    const unread = run("bad-no-worker");
    expect(nodeStatusAt(unread, "jobs", "message_queue", unread.frames.length - 1, 0, false)).toMatch(
      /^[\d,]+ waiting · nobody reads it$/,
    );
  });

  it("says when a component is off (SPEC-loadsim-failures.md)", () => {
    const api = { ...base, kind: "paas", utilisation: 0.4 };
    expect(nodeStatus({ ...api, off: "routed", offSince: 252 })).toBe("Off · still getting requests");
    expect(nodeStatus({ ...api, off: "noticed", offSince: 252 })).toBe("Off since 4:12");
  });

  it("reads a real run's outage (an API instance off at 1:00)", () => {
    const built = fixtureDesign("link-shortener", "good");
    const run = simulateLoad({
      nodes: built.nodes,
      edges: built.edges,
      features: built.features,
      scenario: defaultScenario(built.brief),
      loads: featureLoads(built.features, built.brief),
      outages: [{ nodeId: "api-1", offAt: 60, onAt: null }],
    });
    const step = (s: number) => Math.round(s / run.dtSeconds);
    expect(nodeStatusAt(run, "api-1", "paas", step(62), 0, false)).toBe("Off · still getting requests");
    expect(nodeStatusAt(run, "api-1", "paas", step(90), 0, false)).toBe("Off since 1:00");
    expect(nodeStatusAt(run, "api-1", "paas", step(30), 0, false)).toMatch(/% busy$/);
  });

  it("names the limit that binds, then any failures, in one format (SPEC-loadsim-cascades.md)", () => {
    const api = { ...base, kind: "paas", ratePerSecond: 80 };
    expect(nodeStatus({ ...api, utilisation: 1.2, limit: "cpu" })).toBe("Saturated");
    expect(nodeStatus({ ...api, utilisation: 1.2, limit: "cpu", failedSoFar: 1204 })).toBe("Saturated · 1,204 failed");
    expect(nodeStatus({ ...api, utilisation: 0.3, limit: "slots" })).toBe("Saturated · 80 of 80 slots");
    expect(nodeStatus({ ...api, utilisation: 0.3, limit: "slots", failedSoFar: 1204 })).toBe(
      "Saturated · 80 of 80 slots · 1,204 failed",
    );
    expect(nodeStatus({ ...api, utilisation: 0.3, limit: "connections" })).toBe("Waiting for a database connection");
    expect(nodeStatus({ ...api, utilisation: 0.3, limit: "connections", failedSoFar: 1204 })).toBe(
      "Waiting for a database connection · 1,204 failed",
    );
    // No limit binding: today's text.
    expect(nodeStatus({ ...api, utilisation: 0.3, failedSoFar: 30 })).toBe("30% busy · 30 failed");
  });

  it("reads the binding limit from a real run's frames", () => {
    // Connections: course registration without its cache (the database backs up into the API).
    const built = fixtureDesign("course-registration", "bad-no-cache");
    const reg = runDesign(built, defaultScenario(built.brief), { brief: built.brief });
    const connStep = reg.frames.findIndex((f) => f.nodes["api-1"].limit === "connections");
    expect(connStep).toBeGreaterThanOrEqual(0);
    expect(nodeStatusAt(reg, "api-1", "paas", connStep, 12, false)).toBe("Waiting for a database connection · 12 failed");

    // Slots: one instance whose every request makes a 2 s external call, at 100 a second.
    const calls = design(
      [requirement("ask", { name: "Ask", targetRpm: 60, computeMsPerRequest: 10, resources: { memoryGb: 0.5, vcpus: 0.5, storageGb: 0 } })],
      [
        ["desktop", "desktop"],
        ["vm", "vm", { capacity: { vcpus: 8 } }],
        ["llm", "external_api"],
      ],
      ["desktop -> vm : http", "vm -> llm : http"],
      { ask: "vm" },
    );
    const loads = { ask: { share: 1, writeShare: 0, readDbMs: 3, writeDbMs: 8, batch: 1, slowWork: "wait" as const, apiMs: 2000 } };
    const run = runDesign(calls, { requests: 6000, windowSeconds: 60, shape: "steady" }, { loads });
    expect(nodeStatusAt(run, "vm", "vm", 400, 0, false)).toBe("Saturated · 80 of 80 slots");
  });

  it("shows a light load as at least 1%", () => {
    expect(nodeStatus({ ...base, utilisation: 0.002, ratePerSecond: 1 })).toBe("1% busy");
  });
});

describe("LoadNodeBody", () => {
  it("shows the label, a gauge in its band and the status text, and names itself from both", () => {
    const html = renderToStaticMarkup(
      <LoadNodeBody label="Registration DB" kind="database" utilisation={1.29} status="Saturated · 1,204 failed" />,
    );
    expect(text(html)).toContain("Registration DB");
    expect(text(html)).toContain("Saturated · 1,204 failed");
    expect(html).toContain('data-band="saturated"');
    expect(html).toContain('aria-label="Registration DB: Saturated · 1,204 failed"');
  });

  it("fills the gauge in proportion, capped at full", () => {
    const half = renderToStaticMarkup(<LoadNodeBody label="API" kind="paas" utilisation={0.5} status="50% busy" />);
    expect(half).toContain("width:50%");
    expect(half).toContain('data-band="ok"');
    const over = renderToStaticMarkup(<LoadNodeBody label="API" kind="paas" utilisation={1.5} status="Saturated" />);
    expect(over).toContain("width:100%");
  });

  it("has a power button for a component that can be switched off, kept off the drag handle", () => {
    const on = renderToStaticMarkup(
      <LoadNodeBody label="Lab API 1" kind="paas" utilisation={0.4} status="40% busy" off={false} onToggle={() => {}} />,
    );
    expect(on).toMatch(/<button[^>]*aria-label="Switch off Lab API 1"/);
    expect(on).toMatch(/<button[^>]*class="[^"]*\bnodrag\b/);
    const offNow = renderToStaticMarkup(
      <LoadNodeBody label="Lab API 1" kind="paas" utilisation={0} status="Off since 4:12" off onToggle={() => {}} />,
    );
    expect(offNow).toMatch(/<button[^>]*aria-label="Bring back Lab API 1"/);
    expect(offNow).toContain('data-band="off"');
  });

  it("has no power button for a managed service", () => {
    for (const kind of ["load_balancer", "message_queue", "cdn"]) {
      const html = renderToStaticMarkup(
        <LoadNodeBody label="Managed" kind={kind} utilisation={0.1} status="10% busy" off={false} onToggle={() => {}} />,
      );
      expect(html).not.toContain("<button");
    }
  });

  it("has no gauge for a client", () => {
    const html = renderToStaticMarkup(<LoadNodeBody label="Phone" kind="mobile" utilisation={0} status="Sending 83 req/s" />);
    expect(html).not.toContain("data-band");
  });
});
