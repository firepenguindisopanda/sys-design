import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScenarioControls, parseScenarioField } from "./scenario-controls";

const defaults = { requests: 100_000, windowSeconds: 1200, shape: "spike" as const };
const noop = () => {};

describe("parseScenarioField", () => {
  it("reads requests, allowing thousands separators, within 1,000 to 1,000,000", () => {
    expect(parseScenarioField("requests", "50000")).toBe(50_000);
    expect(parseScenarioField("requests", "50,000")).toBe(50_000);
    expect(parseScenarioField("requests", "5")).toBe(1_000);
    expect(parseScenarioField("requests", "2000000")).toBe(1_000_000);
    expect(parseScenarioField("requests", "abc")).toBeNull();
    expect(parseScenarioField("requests", "")).toBeNull();
  });

  it("reads the window in minutes and gives seconds, within 1 to 60 minutes", () => {
    expect(parseScenarioField("windowMinutes", "10")).toBe(600);
    expect(parseScenarioField("windowMinutes", "2.5")).toBe(150);
    expect(parseScenarioField("windowMinutes", "0")).toBe(60);
    expect(parseScenarioField("windowMinutes", "90")).toBe(3_600);
    expect(parseScenarioField("windowMinutes", "-")).toBeNull();
  });
});

describe("ScenarioControls", () => {
  it("names every field and shows the scenario", () => {
    const html = renderToStaticMarkup(<ScenarioControls scenario={defaults} defaults={defaults} onChange={noop} />);
    for (const [label, id] of [
      ["Requests", "load-requests"],
      ["Window (minutes)", "load-window"],
      ["Shape", "load-shape"],
    ]) {
      expect(html).toContain(`for="${id}"`);
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(label);
    }
    expect(html).toContain('value="100,000"');
    expect(html).toContain('value="20"');
    expect(html).toMatch(/<option value="spike" selected="">/);
  });

  it("offers a reset only when the scenario differs from the brief's", () => {
    // The opening tag of the button whose content includes the reset text.
    const resetTag = (html: string) => /<button([^>]*)>(?:(?!<\/button>)[\s\S])*Reset to brief default/.exec(html)?.[1];
    const same = renderToStaticMarkup(<ScenarioControls scenario={defaults} defaults={defaults} onChange={noop} />);
    expect(resetTag(same)).toContain('disabled=""');
    const changed = renderToStaticMarkup(
      <ScenarioControls scenario={{ ...defaults, shape: "steady" }} defaults={defaults} onChange={noop} />,
    );
    expect(resetTag(changed)).toBeDefined();
    // Its classes mention "disabled:" styles; only the attribute matters.
    expect(resetTag(changed)).not.toMatch(/\sdisabled=""/);
  });

  it("says 'sandbox default' without a brief", () => {
    const html = renderToStaticMarkup(
      <ScenarioControls scenario={defaults} defaults={defaults} onChange={noop} sandbox />,
    );
    expect(html).toContain("Reset to sandbox default");
  });
});
