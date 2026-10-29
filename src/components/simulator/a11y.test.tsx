import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { loadChallenges } from "@/lib/challenges/load";
import { useSimulatorStore } from "@/lib/store";
import { renderWithStore as render } from "@/test/render-with-store";
import { PendingProtocolPicker } from "./edge-inspector";
import { InspectorCard } from "./inspector-card";
import { RequirementsPanel } from "./requirements-panel";
import { VerificationPanel } from "./verification-panel";

const store = () => useSimulatorStore.getState();

const brief = loadChallenges(path.join(process.cwd(), "challenges")).find(
  (c) => c.brief.id === "link-shortener",
)!.brief;

/** The value of `name="…"` in one tag's attribute string, if present. */
function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

/**
 * Inputs and buttons a screen reader can't name. An input needs an aria-label or an id
 * some `<label for>` points at; a button needs an aria-label or some text. A select
 * trigger (`role="combobox"`) needs a label too: its text is the value, not the field.
 * Regexes, not a DOM: the project runs vitest in node and these are the only shapes it
 * renders.
 */
function unnamedControls(html: string): string[] {
  const labelled = new Set(
    [...html.matchAll(/<label\b[^>]*\sfor="([^"]*)"/g)].map((m) => m[1]),
  );
  const unnamed: string[] = [];
  for (const [tag] of html.matchAll(/<input\b[^>]*>/g)) {
    if (attr(tag, "type") === "hidden" || attr(tag, "aria-hidden") === "true") continue;
    const id = attr(tag, "id");
    if (attr(tag, "aria-label") || (id && labelled.has(id))) continue;
    unnamed.push(tag);
  }
  for (const [whole, open, inner] of html.matchAll(/(<button\b[^>]*>)([\s\S]*?)<\/button>/g)) {
    const id = attr(open, "id");
    if (attr(open, "aria-label") || (id && labelled.has(id))) continue;
    if (attr(open, "role") !== "combobox" && inner.replace(/<[^>]+>/g, "").trim()) continue;
    unnamed.push(whole);
  }
  return unnamed;
}

describe("unnamedControls", () => {
  it("flags a bare input and an icon-only button", () => {
    const html = '<input type="number"/><button type="button"><svg></svg></button>';
    expect(unnamedControls(html)).toHaveLength(2);
  });

  it("flags a select trigger that only shows its value", () => {
    expect(unnamedControls('<button role="combobox"><span>http</span></button>')).toHaveLength(1);
  });

  it("accepts labelled inputs and named buttons", () => {
    const html =
      '<label for="a">A</label><input id="a"/><input aria-label="B"/>' +
      '<button aria-label="C"><svg></svg></button><button>D</button>';
    expect(unnamedControls(html)).toEqual([]);
  });
});

describe("accessible names", () => {
  beforeEach(() => store().loadDemo());

  const panel = () => render(<RequirementsPanel />);
  const card = () => render(<InspectorCard onClose={() => {}} />);

  it("names every control in the sandbox requirements panel", () => {
    expect(unnamedControls(panel())).toEqual([]);
  });

  it("names every control in the node inspector", () => {
    const paas = store().nodes.find((n) => n.data.componentKind === "paas")!;
    useSimulatorStore.setState({ selectedNodeId: paas.id, selectedEdgeId: null });
    const html = card();
    expect(html).toContain("Selected node");
    expect(html).toContain('aria-label="Close inspector"');
    expect(unnamedControls(html)).toEqual([]);
  });

  it("names every control in the database node inspector", () => {
    const db = store().nodes.find((n) => n.data.componentKind === "database")!;
    useSimulatorStore.setState({ selectedNodeId: db.id, selectedEdgeId: null });
    const html = card();
    expect(html).toContain("Shards");
    expect(unnamedControls(html)).toEqual([]);
  });

  it("names every control in the edge inspector", () => {
    useSimulatorStore.setState({ selectedNodeId: null, selectedEdgeId: store().edges[0].id });
    const html = card();
    expect(html).toContain("Selected connection");
    expect(unnamedControls(html)).toEqual([]);
  });

  it("leaves the inspectors out of the requirements panel", () => {
    const paas = store().nodes.find((n) => n.data.componentKind === "paas")!;
    useSimulatorStore.setState({ selectedNodeId: paas.id, selectedEdgeId: null });
    expect(panel()).not.toContain("Selected node");
  });

  it("names every control in a challenge", () => {
    store().startChallenge(brief);
    const html = panel();
    expect(html).toContain("Set by the challenge brief");
    expect(unnamedControls(html)).toEqual([]);
  });

  it("names the new-link protocol picker", () => {
    expect(unnamedControls(render(<PendingProtocolPicker />))).toEqual([]);
  });
});

describe("results panel hint names", () => {
  const foodGuide = loadChallenges(path.join(process.cwd(), "challenges")).find(
    (c) => c.brief.id === "campus-food-guide",
  )!.brief;

  it("names the hint buttons", () => {
    store().startChallenge(foodGuide);
    store().runVerification();
    store().revealNextHint();
    let html = render(<VerificationPanel />);
    expect(html).toContain("Show a hint");
    expect(html).toContain("Why?");
    expect(unnamedControls(html)).toEqual([]);
    store().advanceHint("pages-on-cdn");
    html = render(<VerificationPanel />);
    expect(html).toContain("Show the fix");
    expect(unnamedControls(html)).toEqual([]);
  });
});

describe("connection inspector names", () => {
  beforeEach(() => store().loadDemo());

  /** The text inside the select trigger with this id suffix. */
  function trigger(html: string, suffix: string): string {
    const m = new RegExp(`<button\\b[^>]*\\sid="[^"]*-${suffix}"[^>]*>([\\s\\S]*?)</button>`).exec(html);
    if (!m) throw new Error(`no ${suffix} trigger`);
    return m[1].replace(/<[^>]+>/g, "");
  }

  it("shows node and protocol names, not ids, in the triggers", () => {
    const api = store().nodes.find((n) => n.data.label === "Programme API")!;
    const db = store().nodes.find((n) => n.data.label === "Programme Graph DB")!;
    const edge = store().edges.find((e) => e.source === api.id && e.target === db.id)!;
    useSimulatorStore.setState({ selectedNodeId: null, selectedEdgeId: edge.id });
    const html = render(<InspectorCard onClose={() => {}} />);

    expect(trigger(html, "from")).toContain("Programme API");
    expect(trigger(html, "to")).toContain("Programme Graph DB");
    expect(trigger(html, "protocol")).toContain("Database protocol");
    for (const part of ["from", "to", "protocol"]) {
      expect(trigger(html, part)).not.toMatch(/paas-|database-|^db$/);
    }
    expect(unnamedControls(html)).toEqual([]);
  });
});
