import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REDUCED = "(prefers-reduced-motion: reduce)";

/** A stand-in for MediaQueryList: a real EventTarget, so dispatchEvent reaches listeners. */
class FakeQuery extends EventTarget {
  matches = false;
}

async function loadModule() {
  vi.resetModules();
  return import("./sim-context");
}

describe("reduced-motion query", () => {
  let query: FakeQuery;
  let matchMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    query = new FakeQuery();
    matchMedia = vi.fn(() => query);
    vi.stubGlobal("window", { matchMedia });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls matchMedia once across many snapshot reads", async () => {
    const { reducedMotionSnapshot } = await loadModule();

    for (let i = 0; i < 1000; i++) reducedMotionSnapshot();

    expect(matchMedia).toHaveBeenCalledTimes(1);
    expect(matchMedia).toHaveBeenCalledWith(REDUCED);
  });

  it("reads .matches from the cached query, so a changed preference shows up", async () => {
    const { reducedMotionSnapshot } = await loadModule();

    expect(reducedMotionSnapshot()).toBe(false);
    query.matches = true;
    expect(reducedMotionSnapshot()).toBe(true);
    expect(matchMedia).toHaveBeenCalledTimes(1);
  });

  it("sends a change event to a subscriber added through subscribe", async () => {
    const { subscribeReducedMotion } = await loadModule();
    const onChange = vi.fn();

    const unsubscribe = subscribeReducedMotion(onChange);
    query.matches = true;
    query.dispatchEvent(new Event("change"));

    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
    query.dispatchEvent(new Event("change"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(matchMedia).toHaveBeenCalledTimes(1);
  });

  it("returns false and does not throw without a window (server)", async () => {
    vi.unstubAllGlobals();
    const { reducedMotionSnapshot, subscribeReducedMotion } = await loadModule();

    expect(() => reducedMotionSnapshot()).not.toThrow();
    expect(reducedMotionSnapshot()).toBe(false);
    expect(() => subscribeReducedMotion(() => {})()).not.toThrow();
  });
});
