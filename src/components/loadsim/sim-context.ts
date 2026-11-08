"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import type { LoadRun } from "@/lib/loadsim/types";
import type { DotAnimator } from "./dot-animator";

/** What the canvas's nodes and edges read besides the playback step. */
export type SimContextValue = {
  run: LoadRun;
  /** Requests failed so far, per node, by step */
  failedSoFar: Record<string, Float64Array>;
  /** The busiest edge's rate in the run, for edge widths */
  maxRate: number;
  /** Ids of nodes this version doesn't simulate */
  notSimulated: Set<string>;
  /** Ids of edges that carry traffic at some point in the run */
  activeEdges: Set<string>;
  animator: DotAnimator | null;
  /** Switch a component off, or bring it back, at the current playback time (SPEC-loadsim-failures.md) */
  toggle?: (nodeId: string) => void;
};

export const SimContext = createContext<SimContextValue | null>(null);

export function useSim(): SimContextValue {
  const value = useContext(SimContext);
  if (!value) throw new Error("useSim needs a SimContext provider");
  return value;
}

const REDUCED = "(prefers-reduced-motion: reduce)";

// Every FlowEdge reads this on every render, so keep one query object instead of
// calling matchMedia each time (SPEC-canvas-render-scale.md, fix 4). Made lazily:
// this module is imported on the server, where there is no window.
let reducedQuery: MediaQueryList | null = null;

function getReducedQuery(): MediaQueryList | null {
  if (typeof window === "undefined") return null;
  reducedQuery ??= window.matchMedia(REDUCED);
  return reducedQuery;
}

export function subscribeReducedMotion(onChange: () => void): () => void {
  const query = getReducedQuery();
  if (!query) return () => {};
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function reducedMotionSnapshot(): boolean {
  return getReducedQuery()?.matches ?? false;
}

/** True when the viewer asked for less motion; false on the server. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, reducedMotionSnapshot, () => false);
}
