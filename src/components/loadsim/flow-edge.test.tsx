import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LoadRun } from "@/lib/loadsim/types";
import { createPlaybackStore } from "./playback";
import { FlowEdgeBody, edgeAtStep, edgeWidth, formatRate } from "./flow-edge";

const props = { id: "e1", path: "M0,0 L100,0", labelX: 50, labelY: 0, failedShare: 0, maxRate: 200 };

describe("edgeWidth", () => {
  it("grows with the rate, from a thin line to a thick one", () => {
    expect(edgeWidth(0, 200)).toBe(1.5);
    expect(edgeWidth(200, 200)).toBe(6);
    expect(edgeWidth(100, 200)).toBeGreaterThan(1.5);
    expect(edgeWidth(100, 200)).toBeLessThan(6);
    expect(edgeWidth(50, 0)).toBe(1.5);
  });
});

describe("formatRate", () => {
  it("rounds rates for labels", () => {
    expect(formatRate(166.7)).toBe("167 req/s");
    expect(formatRate(2.34)).toBe("2.3 req/s");
    expect(formatRate(0)).toBe("0 req/s");
    expect(formatRate(1234)).toBe("1,234 req/s");
  });
});

describe("FlowEdgeBody", () => {
  it("has a group for moving dots", () => {
    const html = renderToStaticMarkup(
      <svg>
        <FlowEdgeBody {...props} ratePerSecond={167} reducedMotion={false} />
      </svg>,
    );
    expect(html).toContain('data-dots="e1"');
    expect(html).not.toContain("req/s");
  });

  it("shows the rate as text instead of dots under reduced motion", () => {
    const html = renderToStaticMarkup(
      <svg>
        <FlowEdgeBody {...props} ratePerSecond={167} reducedMotion />
      </svg>,
    );
    expect(html).not.toContain("data-dots");
    expect(html).not.toContain("<circle");
    expect(html).toContain("167 req/s");
  });

  it("leaves out the label on an edge that carries nothing in the whole run", () => {
    const html = renderToStaticMarkup(
      <svg>
        <FlowEdgeBody {...props} ratePerSecond={0} reducedMotion active={false} />
      </svg>,
    );
    expect(html).not.toContain("req/s");
  });

  it("marks failures in the label under reduced motion", () => {
    const html = renderToStaticMarkup(
      <svg>
        <FlowEdgeBody {...props} ratePerSecond={167} failedShare={0.25} reducedMotion />
      </svg>,
    );
    expect(html).toContain("167 req/s · 25% fail");
  });
});

describe("edgeAtStep (the edge's selectors, SPEC-canvas-render-scale.md fix 5)", () => {
  const frame = (volume: number, failedShare: number, other = 1) => ({
    nodes: {},
    edges: { e1: { volume, failedShare }, e2: { volume: other, failedShare: 0 } },
  });
  const run = { frames: [frame(10, 0), frame(10, 0, 99), frame(20, 0.5), frame(20, 0.5)] } as unknown as LoadRun;

  it("returns the edge's own values at the step, and zero outside the run", () => {
    expect(edgeAtStep(run, 2, "e1")).toEqual({ volume: 20, failedShare: 0.5 });
    expect(edgeAtStep(run, 9, "e1")).toEqual({ volume: 0, failedShare: 0 });
    expect(edgeAtStep(run, 0, "missing")).toEqual({ volume: 0, failedShare: 0 });
  });

  it("selects equal primitives across steps that change nothing it draws, and different ones when it changes", () => {
    expect(edgeAtStep(run, 0, "e1").volume).toBe(edgeAtStep(run, 1, "e1").volume);
    expect(edgeAtStep(run, 2, "e1").failedShare).toBe(edgeAtStep(run, 3, "e1").failedShare);
    expect(edgeAtStep(run, 1, "e1").volume).not.toBe(edgeAtStep(run, 2, "e1").volume);
    expect(edgeAtStep(run, 1, "e1").failedShare).not.toBe(edgeAtStep(run, 2, "e1").failedShare);
  });

  it("notifies a subscriber only when the selected value changes while the step moves every time", () => {
    // zustand's useStore re-renders a component when its selection changes under Object.is;
    // counting those changes is the render count, without a DOM.
    const store = createPlaybackStore();
    store.getState().reset(4);
    let renders = 0;
    let last = edgeAtStep(run, store.getState().step, "e1").volume;
    store.subscribe((s) => {
      const next = edgeAtStep(run, s.step, "e1").volume;
      if (!Object.is(next, last)) renders++;
      last = next;
    });
    for (let step = 1; step < 4; step++) store.getState().seek(step);
    expect(renders).toBe(1); // only 1 -> 2 changes the volume
  });
});
