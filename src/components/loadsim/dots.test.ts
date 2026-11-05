import { describe, expect, it } from "vitest";
import { MAX_DOTS_PER_EDGE, MAX_DOTS_TOTAL, capTotal, dotCount, dotFractions, ratePerDot, redCount } from "./dots";

describe("ratePerDot", () => {
  it("rounds up to a 1, 2 or 5 so the busiest edge shows at most 12 dots", () => {
    expect(MAX_DOTS_PER_EDGE).toBe(12);
    expect(ratePerDot(167)).toBe(20); // 167 / 12 = 13.9
    expect(ratePerDot(12)).toBe(1);
    expect(ratePerDot(50)).toBe(5);
    expect(ratePerDot(2_000)).toBe(200);
  });

  it("is 1 when nothing moves", () => {
    expect(ratePerDot(0)).toBe(1);
  });
});

describe("dotCount", () => {
  it("is proportional to the rate, at least one while anything flows, and capped", () => {
    expect(dotCount(0, 20)).toBe(0);
    expect(dotCount(0.01, 20)).toBe(1);
    expect(dotCount(167, 20)).toBe(9);
    expect(dotCount(10_000, 20)).toBe(12);
  });
});

describe("capTotal", () => {
  it("leaves counts alone under the cap", () => {
    expect(capTotal([3, 4, 0], MAX_DOTS_TOTAL)).toEqual([3, 4, 0]);
  });

  it("scales counts down to the cap, keeping one dot on every busy edge", () => {
    const counts = Array.from({ length: 40 }, () => 12); // 480
    const capped = capTotal(counts, 300);
    expect(capped.reduce((s, c) => s + c, 0)).toBeLessThanOrEqual(300);
    expect(capped.every((c) => c >= 1)).toBe(true);
    expect(capTotal([100, 1, 0], 20)).toEqual([19, 1, 0]);
  });
});

describe("dotFractions", () => {
  it("spaces dots evenly along the edge, shifted by the phase", () => {
    expect(dotFractions(4, 0)).toEqual([0, 0.25, 0.5, 0.75]);
    const shifted = dotFractions(4, 0.1);
    [0.1, 0.35, 0.6, 0.85].forEach((f, i) => expect(shifted[i]).toBeCloseTo(f, 9));
  });

  it("wraps past the end of the edge", () => {
    const wrapped = dotFractions(2, 0.75);
    expect(wrapped[0]).toBeCloseTo(0.75, 9);
    expect(wrapped[1]).toBeCloseTo(0.25, 9);
  });
});

describe("redCount", () => {
  it("colours the share that failed", () => {
    expect(redCount(10, 0)).toBe(0);
    expect(redCount(10, 0.5)).toBe(5);
    expect(redCount(10, 1)).toBe(10);
    expect(redCount(3, 0.1)).toBe(0);
    expect(redCount(3, 0.2)).toBe(1);
  });
});
