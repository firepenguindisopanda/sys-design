import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defaultScenario } from "@/lib/loadsim/scenario";
import { fixtureDesign, runDesign } from "@/test/loadsim-designs";
import { NodeStatsTable } from "./node-stats-table";
import { RunSummary, announcementFor } from "./run-summary";

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
    expect(t).toContain("91.5%");
    expect(t).toContain("Failed");
    expect(t).toContain("Timed out waiting at Registration DB.");
    expect(t).toContain("Registration DB saturated at 0:00");
    expect(t).toContain("p50");
    expect(t).toContain("p95");
    expect(t).toContain("Not simulated yet");
    expect(t).toContain("Seat claims (queue)");
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
    expect(t).toMatch(/Registration DB 129% .* 0:00/);
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
    expect(announcementFor(last - 1, last, run)).toBe("Playback finished: 91.5% of requests served.");
    expect(announcementFor(last, last, run)).toBeNull();
  });
});
