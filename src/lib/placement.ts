import type { ComponentKind, EdgeProtocol } from "./types";

type Point = { x: number; y: number };
type Size = { width: number; height: number };

/** A new node's size before React Flow has measured it. */
export const DEFAULT_NODE_SIZE: Size = { width: 200, height: 70 };

/** The drag type the component library sets; its data is a ComponentKind. */
export const LIBRARY_DRAG_TYPE = "application/x-sesim-kind";

const STEP = 24;
const MAX_STEPS = 20;

/**
 * Top-left for a new node centred on `centre`, stepped down and to the right until its
 * box clears every node's box. After MAX_STEPS it settles for the last spot tried.
 */
export function freeSpot(
  centre: Point,
  nodes: { position: Point; measured?: Partial<Size> }[],
  size: Size = DEFAULT_NODE_SIZE,
): Point {
  const boxes = nodes.map((n) => ({
    x: n.position.x,
    y: n.position.y,
    width: n.measured?.width ?? size.width,
    height: n.measured?.height ?? size.height,
  }));
  const start = { x: centre.x - size.width / 2, y: centre.y - size.height / 2 };
  let spot = start;
  for (let i = 0; i <= MAX_STEPS; i++) {
    spot = { x: start.x + i * STEP, y: start.y + i * STEP };
    const clear = boxes.every(
      (b) =>
        spot.x >= b.x + b.width ||
        b.x >= spot.x + size.width ||
        spot.y >= b.y + b.height ||
        b.y >= spot.y + size.height,
    );
    if (clear) return spot;
  }
  return spot;
}

const DATA_STORES: ComponentKind[] = ["database", "cache"];

/**
 * Protocol for an edge drawn by hand: DB into or out of a database or cache, otherwise
 * the student's pick. Never chooses a push or real-time protocol for them.
 */
export function defaultProtocol(
  sourceKind: ComponentKind | undefined,
  targetKind: ComponentKind | undefined,
  picked: EdgeProtocol,
): EdgeProtocol {
  if (sourceKind && DATA_STORES.includes(sourceKind)) return "db";
  if (targetKind && DATA_STORES.includes(targetKind)) return "db";
  return picked;
}
