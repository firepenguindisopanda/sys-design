import type { Edge, XYPosition } from "@xyflow/react";
import type { SimNode } from "./store";
import type { ComponentKind } from "./types";

// Lays a design out in columns by role, left to right (SPEC-auto-layout.md): clients, then
// what they reach first, through to data and outside services. The same columns for every
// design, so students learn where things go. Requests flow left to right, matching the
// nodes' handles: connections arrive on a node's left and leave from its right.
//
// Long columns don't wrap. Cutting a 40-node column into sub-columns broke the row
// alignment between columns and more than doubled the crossings on app 200 (8,365 against
// 1,238 unwrapped, and 3,694 on the import grid; 2026-11-08). Tall columns still fit the
// fitted view.

/** Columns left to right; a kind's column is its role. Workers follow the queues they read. */
export const COLUMNS: readonly (readonly ComponentKind[])[] = [
  ["mobile", "desktop", "iot"],
  ["cdn", "static_hosting"],
  ["load_balancer"],
  ["vm", "paas", "functions", "edge"],
  ["message_queue"],
  ["task_worker"],
  ["database", "cache", "object_storage"],
  ["external_api"],
];

export type Positions = Map<string, XYPosition>;

const COLUMN_GAP = 300;
const ROW_GAP = 110;
/** Barycentre sweeps, alternating direction; 30 instead of 8 cut app 200's crossings by 3%. */
const SWEEPS = 8;

const COLUMN_OF = new Map<string, number>(COLUMNS.flatMap((kinds, i) => kinds.map((k) => [k, i] as const)));
/** A kind added to the catalog but not to `COLUMNS` goes with compute until it's placed. */
const FALLBACK_COLUMN = COLUMN_OF.get("paas")!;

/** A position for every node: role columns, each ordered to cut crossings. */
export function layoutByRole(
  nodes: readonly SimNode[],
  edges: readonly Edge[],
  /** For tests: `sweeps: 0` leaves each column in the design's own order */
  options: { sweeps?: number } = {},
): Positions {
  const column = new Map(nodes.map((n) => [n.id, COLUMN_OF.get(n.data.componentKind) ?? FALLBACK_COLUMN]));
  // Empty columns are skipped, so a design without queues has no gap.
  const used = [...new Set(column.values())].sort((a, b) => a - b);
  const layerOf = (id: string) => used.indexOf(column.get(id)!);
  const layers: string[][] = used.map(() => []);
  for (const n of nodes) layers[layerOf(n.id)].push(n.id);

  // Neighbours in other columns; one in the same column says nothing about the order.
  const neighbours = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (e.source === e.target || !column.has(e.source) || !column.has(e.target)) continue;
    if (layerOf(e.source) === layerOf(e.target)) continue;
    neighbours.get(e.source)!.push(e.target);
    neighbours.get(e.target)!.push(e.source);
  }

  // Barycentre ordering: each node moves towards the average row of its neighbours. The
  // sort is stable, so ties keep the current order and the result is the same every time.
  // A pass can make things worse (app 30 went from 46 crossings to 54), so the best
  // ordering seen, starting with the design's own, is the one kept.
  const row = new Map<string, number>();
  const placeRows = () => layers.forEach((l) => l.forEach((id, i) => row.set(id, i - (l.length - 1) / 2)));
  const crossingsNow = () => countCrossings(coordinates(layers), edges);
  placeRows();
  let best = layers.map((l) => [...l]);
  let fewest = crossingsNow();
  for (let sweep = 0; sweep < (options.sweeps ?? SWEEPS) && fewest > 0; sweep++) {
    const order = layers.map((_, i) => (sweep % 2 === 0 ? i : layers.length - 1 - i));
    for (const li of order) {
      const centre = (id: string) => {
        const ns = neighbours.get(id)!;
        return ns.length === 0 ? row.get(id)! : ns.reduce((sum, n) => sum + row.get(n)!, 0) / ns.length;
      };
      const centres = new Map(layers[li].map((id) => [id, centre(id)]));
      layers[li] = [...layers[li]].sort((a, b) => centres.get(a)! - centres.get(b)!);
      placeRows();
    }
    const crossings = crossingsNow();
    if (crossings < fewest) {
      fewest = crossings;
      best = layers.map((l) => [...l]);
    }
  }
  return coordinates(best);
}

/** Each column centred on y = 0. */
function coordinates(layers: readonly (readonly string[])[]): Positions {
  const positions: Positions = new Map();
  layers.forEach((layer, li) =>
    layer.forEach((id, i) => positions.set(id, { x: li * COLUMN_GAP, y: Math.round((i - (layer.length - 1) / 2) * ROW_GAP) })),
  );
  return positions;
}

/** A node's centre, for drawing an edge as a straight line between centres. */
const centreOf = (p: XYPosition) => ({ x: p.x + 110, y: p.y + 30 });

/**
 * How many pairs of edges cross, drawing each as a straight line between node centres.
 * The canvas draws stepped lines, so this approximates; it's for comparing layouts.
 * Edges that share a node don't count, nor do self-loops.
 */
export function countCrossings(positions: Positions, edges: readonly Edge[]): number {
  const segments = edges
    .filter((e) => e.source !== e.target && positions.has(e.source) && positions.has(e.target))
    .map((e) => ({ ends: [e.source, e.target], a: centreOf(positions.get(e.source)!), b: centreOf(positions.get(e.target)!) }));
  const side = (p: XYPosition, q: XYPosition, r: XYPosition) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  let count = 0;
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const s = segments[i];
      const t = segments[j];
      if (s.ends.some((id) => t.ends.includes(id))) continue;
      if (side(s.a, s.b, t.a) * side(s.a, s.b, t.b) < 0 && side(t.a, t.b, s.a) * side(t.a, t.b, s.b) < 0) count++;
    }
  }
  return count;
}
