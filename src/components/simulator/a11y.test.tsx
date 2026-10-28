import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadChallenges } from "@/lib/challenges/load";
import { useSimulatorStore } from "@/lib/store";
import { PendingProtocolPicker } from "./edge-inspector";
import { RequirementsPanel } from "./requirements-panel";

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
  // Zustand renders on the server from getInitialState(), which setState never touches,
  // so copy the live state into that object before rendering and put it back afterwards.
  const initial = useSimulatorStore.getInitialState();
  const saved = { ...initial };
  const render = (ui: React.ReactElement) => {
    Object.assign(initial, store());
    return renderToStaticMarkup(ui);
  };

  beforeEach(() => store().loadDemo());
  afterEach(() => {
    Object.assign(initial, saved);
    store().loadDemo();
  });

  const panel = () => render(<RequirementsPanel />);

  it("names every control in the sandbox requirements panel", () => {
    expect(unnamedControls(panel())).toEqual([]);
  });

  it("names every control in the node inspector", () => {
    const paas = store().nodes.find((n) => n.data.componentKind === "paas")!;
    useSimulatorStore.setState({ selectedNodeId: paas.id, selectedEdgeId: null });
    const html = panel();
    expect(html).toContain("Selected node");
    expect(unnamedControls(html)).toEqual([]);
  });

  it("names every control in the database node inspector", () => {
    const db = store().nodes.find((n) => n.data.componentKind === "database")!;
    useSimulatorStore.setState({ selectedNodeId: db.id, selectedEdgeId: null });
    const html = panel();
    expect(html).toContain("Shards");
    expect(unnamedControls(html)).toEqual([]);
  });

  it("names every control in the edge inspector", () => {
    useSimulatorStore.setState({ selectedNodeId: null, selectedEdgeId: store().edges[0].id });
    const html = panel();
    expect(html).toContain("Selected connection");
    expect(unnamedControls(html)).toEqual([]);
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
