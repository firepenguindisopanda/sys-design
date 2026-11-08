import type { Edge } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { COMPONENT_CATALOG } from "./catalog";
import { COLUMNS, countCrossings, layoutByRole, type Positions } from "./layout";
import { useSimulatorStore, type SimNode } from "./store";
import type { ComponentKind } from "./types";
import { generateDesign } from "@/test/gen-designs";
import { fixtureDesign } from "@/test/loadsim-designs";

const node = (id: string, kind: ComponentKind): SimNode =>
  ({
    id,
    type: "designNode",
    position: { x: 0, y: 0 },
    data: { label: id, componentKind: kind, purpose: "", config: { kind } },
  }) as unknown as SimNode;
const edge = (source: string, target: string): Edge => ({ id: `${source}-${target}`, source, target });

/** Each node's column index, counting distinct x values left to right. */
function columnOf(positions: Positions): Map<string, number> {
  const xs = [...new Set([...positions.values()].map((p) => p.x))].sort((a, b) => a - b);
  return new Map([...positions].map(([id, p]) => [id, xs.indexOf(p.x)]));
}

/** Where an import puts nodes without saved positions today (src/lib/challenges/design.ts). */
const importGrid = (nodes: readonly SimNode[]): Positions =>
  new Map(nodes.map((n, i) => [n.id, { x: (i % 4) * 220, y: Math.floor(i / 4) * 140 }]));

/** Nodes drawn as 220 × 60 boxes never overlap. */
function overlaps(positions: Positions): string[] {
  const all = [...positions];
  const found: string[] = [];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const [a, pa] = all[i];
      const [b, pb] = all[j];
      if (Math.abs(pa.x - pb.x) < 220 && Math.abs(pa.y - pb.y) < 60) found.push(`${a} and ${b}`);
    }
  }
  return found;
}

describe("layoutByRole (SPEC-auto-layout.md)", () => {
  it("has a column for every kind in the catalog", () => {
    const placed = COLUMNS.flat();
    for (const item of COMPONENT_CATALOG) expect(placed, item.kind).toContain(item.kind);
  });

  it("puts each kind in its role's column, left to right, skipping empty columns", () => {
    const nodes = [
      node("db", "database"),
      node("phone", "mobile"),
      node("api", "paas"),
      node("lb", "load_balancer"),
      node("queue", "message_queue"),
      node("worker", "task_worker"),
      node("pay", "external_api"),
    ];
    const edges = [edge("phone", "lb"), edge("lb", "api"), edge("api", "db"), edge("api", "queue"), edge("queue", "worker")];
    const columns = columnOf(layoutByRole(nodes, edges));
    // No edge column here (no CDN or static hosting), so the load balancer is second.
    expect(Object.fromEntries(columns)).toEqual({ phone: 0, lb: 1, api: 2, queue: 3, worker: 4, db: 5, pay: 6 });
  });

  it("gives every node a whole-number position", () => {
    const nodes = [node("a", "mobile"), node("b", "paas"), node("c", "paas"), node("d", "database")];
    const positions = layoutByRole(nodes, [edge("a", "b"), edge("a", "c"), edge("b", "d")]);
    expect(positions.size).toBe(4);
    for (const p of positions.values()) {
      expect(Number.isInteger(p.x)).toBe(true);
      expect(Number.isInteger(p.y)).toBe(true);
    }
  });

  it("gives the same positions for the same design", () => {
    const d = generateDesign({ seed: 3, shape: "random", nodes: 40 });
    expect([...layoutByRole(d.nodes, d.edges)]).toEqual([...layoutByRole(d.nodes, d.edges)]);
  });

  it("never overlaps two nodes", () => {
    for (const d of [generateDesign({ seed: 1, shape: "app", nodes: 200 }), generateDesign({ seed: 1, shape: "random", nodes: 200 })]) {
      expect(overlaps(layoutByRole(d.nodes, d.edges)), d.description).toEqual([]);
    }
  });

  it("keeps a long column as one column", () => {
    const dbs = Array.from({ length: 25 }, (_, i) => node(`db${i}`, "database"));
    const positions = layoutByRole([node("phone", "mobile"), ...dbs], []);
    expect(new Set(dbs.map((n) => positions.get(n.id)!.x)).size).toBe(1);
  });

  it("crosses fewer edges for ordering each column, and fewer than the import grid", () => {
    useSimulatorStore.getState().loadDemo();
    const demo = useSimulatorStore.getState();
    const designs = [
      ["chat app", fixtureDesign("chat-app", "good")],
      ["BeUWI demo", demo],
      ["app 30", generateDesign({ seed: 3, shape: "app", nodes: 30 })],
      ["app 200", generateDesign({ seed: 1, shape: "app", nodes: 200 })],
      ["random 200", generateDesign({ seed: 1, shape: "random", nodes: 200 })],
    ] as const;
    for (const [name, d] of designs) {
      const ordered = countCrossings(layoutByRole(d.nodes, d.edges), d.edges);
      const unordered = countCrossings(layoutByRole(d.nodes, d.edges, { sweeps: 0 }), d.edges);
      expect(ordered, `${name}: ordered ${ordered} against unordered ${unordered}`).toBeLessThanOrEqual(unordered);
      // Not the chat app: both its servers connect to both the cache and the database, which
      // between two columns always crosses once; its 8 nodes miss each other on the grid.
      if (name === "chat app") continue;
      const grid = countCrossings(importGrid(d.nodes), d.edges);
      expect(ordered, `${name}: ${ordered} crossings against ${grid} on the grid`).toBeLessThan(grid);
    }
  });

  it("keeps the chat app's two servers side by side in the compute column", () => {
    const chat = fixtureDesign("chat-app", "good");
    const columns = columnOf(layoutByRole(chat.nodes, chat.edges));
    expect(columns.get("chat-1")).toBe(columns.get("chat-2"));
    expect(columns.get("phone")).toBe(0);
    expect(columns.get("db")).toBeGreaterThan(columns.get("bus")!);
  });

  it("copes with self-loops, cycles, unconnected nodes and an empty design", () => {
    const nodes = [node("a", "paas"), node("b", "paas"), node("lonely", "cache")];
    const positions = layoutByRole(nodes, [edge("a", "a"), edge("a", "b"), edge("b", "a"), edge("a", "ghost")]);
    expect(positions.size).toBe(3);
    expect(layoutByRole([], []).size).toBe(0);
  });
});

describe("countCrossings", () => {
  it("counts two edges that cross, and not two that share an end", () => {
    const positions: Positions = new Map([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 300, y: 200 }],
      ["c", { x: 0, y: 200 }],
      ["d", { x: 300, y: 0 }],
    ]);
    expect(countCrossings(positions, [edge("a", "b"), edge("c", "d")])).toBe(1);
    expect(countCrossings(positions, [edge("a", "b"), edge("a", "d")])).toBe(0);
  });
});
