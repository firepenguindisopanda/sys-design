import { beforeEach, describe, expect, it } from "vitest";
import { useSimulatorStore } from "@/lib/store";
import { renderWithStore as render } from "@/test/render-with-store";
import { InspectorCard } from "./inspector-card";

const store = () => useSimulatorStore.getState();
const node = (kind: string) => store().nodes.find((n) => n.data.componentKind === kind)!;
const card = () => render(<InspectorCard onClose={() => {}} />);

describe("InspectorCard", () => {
  beforeEach(() => store().loadDemo());

  it("renders nothing with nothing selected", () => {
    useSimulatorStore.setState({ selectedNodeId: null, selectedEdgeId: null });
    expect(card()).toBe("");
  });

  it("shows the selected node with its fields, close and delete", () => {
    useSimulatorStore.setState({ selectedNodeId: node("paas").id, selectedEdgeId: null });
    const html = card();
    const heading = /<h2 id="([^"]+)"[^>]*>Selected node<\/h2>/.exec(html);
    expect(heading).not.toBeNull();
    expect(html).toMatch(new RegExp(`<section[^>]*aria-labelledby="${heading![1]}"`));
    expect(html).toContain("Programme API");
    expect(html).toMatch(/<label[^>]*>Name<\/label>/);
    expect(html).toContain('aria-label="Close inspector"');
    expect(html).toMatch(/<button[^>]*>[\s\S]*?Delete<\/button>/);
  });

  it("shows the selected connection", () => {
    const api = node("paas").id;
    const db = node("database").id;
    const edge = store().edges.find((e) => e.source === api && e.target === db)!;
    useSimulatorStore.setState({ selectedNodeId: null, selectedEdgeId: edge.id });
    const html = card();
    expect(html).toContain("Selected connection");
    expect(html).toContain("Programme API → Programme Graph DB");
    expect(html).toMatch(/<label[^>]*>Protocol<\/label>/);
  });

  it("renders nothing when the selected node no longer exists", () => {
    useSimulatorStore.setState({ selectedNodeId: "gone", selectedEdgeId: null });
    expect(card()).toBe("");
  });
});

// SPEC-config-bounds.md: the number fields take their limits from CONFIG_LIMITS.
describe("number fields show the shared limits", () => {
  beforeEach(() => store().loadDemo());

  /** The <input> whose id ends with `suffix`, as rendered. */
  const input = (html: string, suffix: string) => {
    const match = new RegExp(`<input[^>]*id="[^"]*-${suffix}"[^>]*>`).exec(html);
    if (!match) throw new Error(`no input ending ${suffix}`);
    return match[0];
  };

  it("database replicas and shards", () => {
    useSimulatorStore.setState({ selectedNodeId: node("database").id, selectedEdgeId: null });
    const html = card();
    expect(input(html, "replicas")).toMatch(/min="1"/);
    expect(input(html, "replicas")).toMatch(/max="8"/);
    expect(input(html, "shards")).toMatch(/max="16"/);
  });

  it("compute vCPUs", () => {
    useSimulatorStore.setState({ selectedNodeId: node("paas").id, selectedEdgeId: null });
    const vcpus = input(card(), "vcpus");
    expect(vcpus).toMatch(/min="0.5"/);
    expect(vcpus).toMatch(/max="64"/);
    expect(vcpus).toMatch(/step="0.5"/);
  });

  it("cache memory", () => {
    useSimulatorStore.setState({ selectedNodeId: node("cache").id, selectedEdgeId: null });
    const memory = input(card(), "memory-gb");
    expect(memory).toMatch(/min="0.5"/);
    expect(memory).toMatch(/max="256"/);
  });
});
