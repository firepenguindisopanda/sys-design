import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildDesign } from "@/lib/challenges/design";
import { loadChallenges } from "@/lib/challenges/load";
import { countResults, orderResults } from "@/lib/results";
import { useSimulatorStore } from "@/lib/store";
import { renderWithStore } from "@/test/render-with-store";
import { VerificationPanel } from "./verification-panel";

const store = () => useSimulatorStore.getState();
const render = () => renderWithStore(<VerificationPanel />);
const challenges = loadChallenges(path.join(process.cwd(), "challenges"));

/** Where a row's title starts in the markup, or -1. */
const at = (html: string, title: string) => html.indexOf(`>${title}<`);

/** The opening tag of the element with this id. */
const tagWithId = (html: string, id: string) =>
  new RegExp(`<[^>]*\\sid="${id}"[^>]*>`).exec(html)?.[0] ?? "";

describe("VerificationPanel", () => {
  beforeEach(() => store().loadDemo());

  it("shows only the header and the Run button before a run", () => {
    const html = render();
    expect(html).toContain("Verification run");
    expect(html).toContain("Run simulation");
    expect(html).not.toContain("<li");
  });

  it("puts failures and warnings first and hides the passes after a run", () => {
    store().runVerification();
    const { verification, ruleResults } = store();
    const rows = orderResults(verification!.checks, ruleResults);
    const counts = countResults(rows);
    const html = render();

    expect(counts.fail + counts.warn).toBeGreaterThan(0);
    expect(html).toContain("passed");
    expect(html).toContain(`Show ${counts.pass} passed`);
    expect(html).toContain("Hide results");
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="verification-results"');
    // Each row says its status in words, not only with its icon.
    expect(html).toContain(counts.fail > 0 ? "Failed: </span>" : "Warning: </span>");

    const shown = rows.filter((r) => r.status !== "pass");
    const positions = shown.map((r) => at(html, r.title));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    for (const r of rows.filter((r) => r.status === "pass")) {
      expect(at(html, r.title)).toBe(-1);
    }
  });

  it("announces the counts", () => {
    store().runVerification();
    const counts = countResults(orderResults(store().verification!.checks, null));
    expect(render()).toContain(`Run finished: `);
    expect(render()).toContain(`${counts.pass} passed.`);
  });

  it("shows the passes, with no toggle, when everything passes", () => {
    const passing = challenges
      .flatMap((c) => c.fixtures.map((f) => ({ brief: c.brief, fixture: f })))
      .find(({ brief, fixture }) => {
        loadFixture(brief, fixture);
        store().runVerification();
        const { verification, ruleResults } = store();
        return orderResults(verification!.checks, ruleResults).every((r) => r.status === "pass");
      });
    expect(passing).toBeDefined();

    const { verification, ruleResults } = store();
    const rows = orderResults(verification!.checks, ruleResults);
    const html = render();
    for (const r of rows) expect(at(html, r.title)).toBeGreaterThan(-1);
    expect(html).not.toMatch(/Show \d+ passed/);
    expect(html).not.toContain("Hide passed");
    // The rows' sr-only status text is absolutely positioned; a positioned scroll box keeps
    // it inside, or a long list of passes makes the whole page scroll.
    expect(tagWithId(html, "verification-results")).toMatch(/class="[^"]*\brelative\b/);
  });

  it("marks the results as old after a change", () => {
    store().runVerification();
    expect(render()).not.toContain("Design changed since this run");
    store().addComponent("vm");
    const html = render();
    expect(html).toContain("Design changed since this run.");
    expect(html).toContain("(old)");
    expect(tagWithId(html, "verification-results")).toContain('data-stale="true"');
    expect(html).toContain("border-dashed");
  });
});

describe("VerificationPanel hints", () => {
  const foodGuide = challenges.find((c) => c.brief.id === "campus-food-guide")!.brief;
  const required = foodGuide.rules.filter((r) => r.type === "edge" && r.mode === "required");
  /** A phrase from each rule's why, free of characters React escapes. */
  const whyPhrases = [
    "host them as static files behind a CDN",
    "keeps copies close to them",
    "keep them in a cache so the database only handles changes",
  ];

  beforeEach(() => {
    store().startChallenge(foodGuide);
    store().runVerification();
  });

  it("names none of the unmet rules after a first run", () => {
    expect(required).toHaveLength(3);
    const html = render();
    for (const r of required) expect(html).not.toContain(r.title);
    for (const w of whyPhrases) expect(html).not.toContain(w);
    expect(html).not.toContain("Needs a");
    expect(html).toContain("3 scenario checks not met yet");
    expect(html).toContain("Show a hint");
  });

  it("counts the hidden rules as failed", () => {
    const { verification, ruleResults } = store();
    const counts = countResults(orderResults(verification!.checks, ruleResults));
    const engineFails = verification!.checks.filter((c) => c.status === "fail").length;
    expect(counts.fail).toBe(engineFails + 3);
    expect(render()).toContain(`${counts.fail} failed`);
    expect(verification!.overall).toBe("fail");
  });

  it("reveals the title, then why, then the fix", () => {
    store().revealNextHint();
    let html = render();
    expect(html).toContain("Site files served by a CDN");
    expect(html).not.toContain(whyPhrases[0]);
    expect(html).toContain("Why?");
    expect(html).toContain("2 scenario checks not met yet");
    // The hint announcer is set by the buttons' click handlers, which static markup can't run.
    expect(tagWithId(html, "hint-announcement")).toContain('aria-live="polite"');

    store().advanceHint("pages-on-cdn");
    html = render();
    expect(html).toContain(whyPhrases[0]);
    expect(html).not.toContain("Needs a");
    expect(html).toContain("Show the fix");

    store().advanceHint("pages-on-cdn");
    html = render();
    expect(html).toContain("Needs a cdn → static_hosting connection.");
    expect(html).toContain("Hints used: 3");
  });

  it("shows a forbidden rule's violation in full at once", () => {
    store().addComponent("desktop");
    store().addComponent("database");
    const [client, db] = store().nodes;
    store().onConnect({ source: client.id, target: db.id, sourceHandle: null, targetHandle: null });
    store().runVerification();
    const html = render();
    expect(html).toContain("No client talks to the database");
    expect(html).toContain("Clients reach data through compute, never directly. Remove ");
  });
});

function loadFixture(
  brief: Parameters<typeof buildDesign>[0],
  fixture: Parameters<typeof buildDesign>[1],
) {
  store().startChallenge(brief);
  const { nodes, edges, features } = buildDesign(brief, fixture);
  useSimulatorStore.setState({ nodes, edges, features });
}
