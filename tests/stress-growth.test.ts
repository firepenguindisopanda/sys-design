import { describe, expect, it } from "vitest";
import { buildFlowGraph, TooManyRoutesError } from "@/lib/loadsim/graph";
import { featureLoads } from "@/lib/loadsim/scenario";
import type { FlowGraph, PathStep } from "@/lib/loadsim/types";
import { generateDesign } from "@/test/gen-designs";

// SPEC-stress-harness.md: how the load model's routes grow, as counts rather than times, so
// the result is the same on any machine. Only flow graphs are built; the model never runs.
//
// The flow graph holds one tree of steps per class of requests, with a branch for every way
// on. Stacked layers of load balancers multiply the branches, so the steps grow with the
// number of paths (4× per layer of 4), not with nodes and edges. Since loadsim-route-scale
// (SPEC-loadsim-route-scale.md), building stops past a budget of 2,000 steps, so a design
// that would take the model seconds or minutes is refused instead.

/** Every step under every class's root. */
function routeSteps(graph: FlowGraph): number {
  const count = (step: PathStep): number => 1 + step.next.reduce((n, next) => n + count(next.step), 0);
  return graph.classes.reduce((n, c) => n + (c.root ? count(c.root) : 0), 0);
}

const stacked = (layers: number) => generateDesign({ shape: "stacked", layers, width: 4 });

function stackedSteps(layers: number): number {
  const d = stacked(layers);
  return routeSteps(buildFlowGraph(d.nodes, d.edges, d.features, featureLoads(d.features, null)));
}

describe("load model routes through stacked load balancers", () => {
  // Guards the count itself, so the budget tests below measure what they say.
  it("26, 106, 426 and 1,706 steps for 1 to 4 layers of 4", () => {
    expect([1, 2, 3, 4].map(stackedSteps)).toEqual([26, 106, 426, 1_706]);
  });

  it.each([5, 7, 12])("%i layers are refused while building, within 100 ms", (layers) => {
    const d = stacked(layers);
    const start = performance.now();
    expect(() => buildFlowGraph(d.nodes, d.edges, d.features, featureLoads(d.features, null))).toThrow(
      TooManyRoutesError,
    );
    expect(performance.now() - start).toBeLessThan(100);
  });
});
