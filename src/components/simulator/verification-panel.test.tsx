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

function loadFixture(
  brief: Parameters<typeof buildDesign>[0],
  fixture: Parameters<typeof buildDesign>[1],
) {
  store().startChallenge(brief);
  const { nodes, edges, features } = buildDesign(brief, fixture);
  useSimulatorStore.setState({ nodes, edges, features });
}
