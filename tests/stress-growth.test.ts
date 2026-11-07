import { describe, expect, it } from "vitest";
import { buildFlowGraph } from "@/lib/loadsim/graph";
import { featureLoads } from "@/lib/loadsim/scenario";
import type { FlowGraph, PathStep } from "@/lib/loadsim/types";
import { generateDesign } from "@/test/gen-designs";

// SPEC-stress-harness.md: how the load model's routes grow, as counts rather than times, so
// the result is the same on any machine. Only flow graphs are built; the model never runs.
//
// The flow graph holds one tree of steps per class of requests, with a branch for every way
// on. Stacked layers of load balancers multiply the branches, so the steps grow with the
// number of paths (4× per layer of 4), not with nodes and edges, and the model's time grows
// with them (CAPABILITY-MAP-stress.md: 36 s at 6 layers). If `loadsim-route-scale` changes
// how routes are held, it updates `routeSteps` in the same change.

/** Every step under every class's root. */
function routeSteps(graph: FlowGraph): number {
  const count = (step: PathStep): number => 1 + step.next.reduce((n, next) => n + count(next.step), 0);
  return graph.classes.reduce((n, c) => n + (c.root ? count(c.root) : 0), 0);
}

function stackedSteps(layers: number): number {
  const d = generateDesign({ shape: "stacked", layers, width: 4 });
  return routeSteps(buildFlowGraph(d.nodes, d.edges, d.features, featureLoads(d.features, null)));
}

describe("load model routes through stacked load balancers", () => {
  // Guards the count itself: a helper that undercounted could make the pin below pass.
  it("today: 26, 106 and 426 steps for 1, 2 and 3 layers of 4", () => {
    expect([1, 2, 3].map(stackedSteps)).toEqual([26, 106, 426]);
  });

  it.fails("[loadsim-route-scale] route steps grow with nodes, not paths", () => {
    // From 4 to 5 layers the design grows from 19 to 23 nodes (1.2×). Today the steps grow 4×.
    expect(stackedSteps(5) / stackedSteps(4)).toBeLessThanOrEqual(1.5);
  });
});
