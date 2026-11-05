import { describe, expect, it } from "vitest";
import { fixtureDesign } from "@/test/loadsim-designs";
import { simEdges, simNodes } from "./sim-elements";

describe("simNodes", () => {
  const d = fixtureDesign("link-shortener", "good");
  const nodes = simNodes(d.nodes);

  it("keeps each node's id and position, with its label and kind for the gauge", () => {
    expect(nodes.map((n) => n.id)).toEqual(d.nodes.map((n) => n.id));
    expect(nodes.map((n) => n.position)).toEqual(d.nodes.map((n) => n.position));
    expect(nodes[0].data).toEqual({ label: "Student phone", kind: "mobile" });
    expect(nodes.every((n) => n.type === "load")).toBe(true);
  });

  it("can be dragged to tidy the layout, but not selected or connected", () => {
    expect(nodes.every((n) => n.draggable === true && n.selectable === false && n.connectable === false)).toBe(true);
  });

  it("copies positions, so moving a node never changes the design handed over", () => {
    nodes[0].position.x += 100;
    expect(d.nodes[0].position.x).not.toBe(nodes[0].position.x);
  });
});

describe("simEdges", () => {
  it("draws every connection as a flow edge named by its nodes", () => {
    const d = fixtureDesign("link-shortener", "good");
    const edges = simEdges(d.edges, d.nodes);
    expect(edges.map((e) => e.id)).toEqual(d.edges.map((e) => e.id));
    expect(edges.every((e) => e.type === "flow" && e.selectable === false && e.focusable === false)).toBe(true);
    expect(edges.find((e) => e.id === "api-1->db")!.ariaLabel).toBe("DB from Link API 1 to Links DB");
  });
});
