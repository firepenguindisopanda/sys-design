import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FlowEdgeBody, edgeWidth, formatRate } from "./flow-edge";

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
