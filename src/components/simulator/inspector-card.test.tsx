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
