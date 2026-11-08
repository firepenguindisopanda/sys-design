import type { Edge } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { canvasElements, createElementCache, type ElementCache } from "./canvas-elements";
import type { SimNode } from "@/lib/store";

const node = (id: string, label = id): SimNode =>
  ({
    id,
    type: "designNode",
    position: { x: 0, y: 0 },
    data: { componentKind: "cache", label },
  }) as unknown as SimNode;
const edge = (id: string, source: string, target: string, animated = false): Edge => ({
  id,
  source,
  target,
  animated,
  data: { protocol: animated ? "websocket" : "http" },
});

const NODES = [node("a"), node("b"), node("c")];
const EDGES = [edge("ab", "a", "b", true), edge("bc", "b", "c"), edge("ca", "c", "a")];

function run(
  cache: ElementCache,
  nodes: SimNode[],
  edges: Edge[],
  sel: { node?: string | null; edge?: string | null } = {},
  still = false,
) {
  return canvasElements(cache, nodes, edges, sel.node ?? null, sel.edge ?? null, still);
}

describe("canvasElements", () => {
  it("builds what the canvas used to", () => {
    const out = run(createElementCache(), NODES, EDGES, { node: "a", edge: "bc" });
    expect(out.nodes[0]).toMatchObject({ id: "a", ariaLabel: "a, Cache / Memory Store", selected: true });
    expect(out.nodes[1].selected).toBe(false);
    expect(out.edges[0]).toMatchObject({ ariaLabel: "WS from a to b", selected: false });
    expect(out.edges[0].style).toEqual({ stroke: "#64748b", strokeWidth: 1.5 });
    expect(out.edges[1].style).toEqual({ stroke: "#0f766e", strokeWidth: 2.5 });
  });

  it("returns the same objects for the same input", () => {
    const cache = createElementCache();
    const first = run(cache, NODES, EDGES);
    const second = run(cache, NODES, EDGES);
    first.nodes.forEach((n, i) => expect(second.nodes[i]).toBe(n));
    first.edges.forEach((e, i) => expect(second.edges[i]).toBe(e));
  });

  it("renews only the moved node when it moves", () => {
    const cache = createElementCache();
    const first = run(cache, NODES, EDGES);
    const moved = [NODES[0], { ...NODES[1], position: { x: 5, y: 5 } } as SimNode, NODES[2]];
    const second = run(cache, moved, EDGES);
    expect(second.nodes[0]).toBe(first.nodes[0]);
    expect(second.nodes[1]).not.toBe(first.nodes[1]);
    expect(second.nodes[2]).toBe(first.nodes[2]);
    second.edges.forEach((e, i) => expect(e).toBe(first.edges[i]));
    // The whole list too: a new array makes React Flow re-process every edge.
    expect(second.edges).toBe(first.edges);
    expect(second.nodes).not.toBe(first.nodes);
  });

  it("gives a new list when an edge is added or removed", () => {
    const cache = createElementCache();
    const first = run(cache, NODES, EDGES);
    expect(run(cache, NODES, EDGES.slice(0, 2)).edges).not.toBe(first.edges);
    const third = run(cache, NODES, EDGES);
    expect(third.edges).toHaveLength(3);
    expect(run(cache, NODES, EDGES).edges).toBe(third.edges);
  });

  it("renews a renamed node and its edges only", () => {
    const cache = createElementCache();
    const first = run(cache, NODES, EDGES);
    const second = run(cache, [NODES[0], node("b", "Bee"), NODES[2]], EDGES);
    expect(second.nodes[1]).not.toBe(first.nodes[1]);
    expect(second.edges[0]).not.toBe(first.edges[0]); // a -> b
    expect(second.edges[1]).not.toBe(first.edges[1]); // b -> c
    expect(second.edges[2]).toBe(first.edges[2]); // c -> a
    expect(second.edges[0].ariaLabel).toBe("WS from a to Bee");
  });

  it("renews only the old and new selection", () => {
    const cache = createElementCache();
    const first = run(cache, NODES, EDGES, { node: "a", edge: "ab" });
    const second = run(cache, NODES, EDGES, { node: "b", edge: "bc" });
    expect(second.nodes[0]).not.toBe(first.nodes[0]);
    expect(second.nodes[1]).not.toBe(first.nodes[1]);
    expect(second.nodes[2]).toBe(first.nodes[2]);
    expect(second.edges[0]).not.toBe(first.edges[0]);
    expect(second.edges[1]).not.toBe(first.edges[1]);
    expect(second.edges[2]).toBe(first.edges[2]);
  });

  it("marks animated edges still, and renews them when the flag changes", () => {
    const cache = createElementCache();
    const moving = run(cache, NODES, EDGES);
    expect(moving.edges[0].className).toBeUndefined();
    const still = run(cache, NODES, EDGES, {}, true);
    expect(still.edges[0].className).toBe("still");
    expect(still.edges[0]).not.toBe(moving.edges[0]);
    expect(still.edges[1].className).toBeUndefined();
  });

  it("keeps an existing className", () => {
    const edges = [{ ...edge("ab", "a", "b", true), className: "mine" }];
    expect(run(createElementCache(), NODES, edges, {}, true).edges[0].className).toBe("mine still");
  });
});
