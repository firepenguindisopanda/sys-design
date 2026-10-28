import { beforeEach, describe, expect, it } from "vitest";
import { useSimulatorStore } from "@/lib/store";
import { edgeAriaLabel, nodeAriaLabel } from "./flow-labels";

const store = () => useSimulatorStore.getState();

function demoEdge(source: string, target: string) {
  const { nodes, edges } = store();
  const id = (label: string) => nodes.find((n) => n.data.label === label)!.id;
  return edges.find((e) => e.source === id(source) && e.target === id(target))!;
}

describe("canvas accessible names", () => {
  beforeEach(() => store().loadDemo());

  it("names a node by its label and catalog label", () => {
    const paas = store().nodes.find((n) => n.data.label === "Programme API")!;
    expect(nodeAriaLabel(paas)).toBe("Programme API, PaaS / App Platform");
  });

  it("doesn't repeat a label that is already the catalog label", () => {
    const cdn = store().nodes.find((n) => n.data.componentKind === "cdn")!;
    expect(cdn.data.label).toBe("CDN");
    expect(nodeAriaLabel(cdn)).toBe("CDN");
  });

  it("names an edge by protocol and endpoint labels", () => {
    const edge = demoEdge("Programme API", "Programme Graph DB");
    expect(edgeAriaLabel(edge, store().nodes)).toBe(
      "DB from Programme API to Programme Graph DB",
    );
  });

  it("falls back to the node id when an endpoint is missing", () => {
    const edge = { ...demoEdge("Programme API", "Programme Graph DB"), target: "gone-1" };
    expect(edgeAriaLabel(edge, store().nodes)).toBe("DB from Programme API to gone-1");
  });

  it("leaves the store's nodes and edges without an ariaLabel", () => {
    const { nodes, edges } = store();
    for (const n of nodes) nodeAriaLabel(n);
    for (const e of edges) edgeAriaLabel(e, nodes);
    expect(store().nodes.some((n) => "ariaLabel" in n)).toBe(false);
    expect(store().edges.some((e) => "ariaLabel" in e)).toBe(false);
  });
});
