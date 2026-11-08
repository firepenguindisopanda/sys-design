import type { Edge } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { MAX_ANIMATED_EDGES, animateRealtime } from "./edges";

const edges = (animated: number, plain = 0): Edge[] => [
  ...Array.from({ length: animated }, (_, i) => ({ id: `a${i}`, source: "x", target: "y", animated: true })),
  ...Array.from({ length: plain }, (_, i) => ({ id: `p${i}`, source: "x", target: "y" })),
];

describe("animateRealtime", () => {
  it("allows up to the limit", () => {
    expect(MAX_ANIMATED_EDGES).toBe(20);
    expect(animateRealtime(edges(20))).toBe(true);
  });
  it("stops past the limit", () => {
    expect(animateRealtime(edges(21))).toBe(false);
  });
  it("is fine with no edges", () => {
    expect(animateRealtime([])).toBe(true);
  });
  it("counts only animated edges", () => {
    expect(animateRealtime(edges(20, 500))).toBe(true);
  });
});
