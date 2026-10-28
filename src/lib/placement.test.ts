import { describe, expect, it } from "vitest";
import { defaultProtocol, freeSpot } from "./placement";

const centre = { x: 500, y: 300 };
/** A default-sized node at a top-left position. */
const at = (x: number, y: number, measured?: { width: number; height: number }) => ({
  position: { x, y },
  measured,
});

describe("freeSpot", () => {
  it("centres the default box on an empty canvas", () => {
    expect(freeSpot(centre, [])).toEqual({ x: 400, y: 265 });
  });

  it("steps down and to the right past a node over the centre", () => {
    // A 70 px tall box still overlaps one or two 24 px steps down; the third clears it.
    expect(freeSpot(centre, [at(400, 265)])).toEqual({ x: 472, y: 337 });
  });

  it("steps past a column of nodes on the diagonal", () => {
    // Each blocks its own step, and its box also covers the next few steps.
    const nodes = [0, 1, 2, 3].map((i) => at(400 + i * 24, 265 + i * 24));
    const spot = freeSpot(centre, nodes);
    expect(spot.x).toBeGreaterThan(400 + 3 * 24);
    for (const n of nodes) {
      const overlaps =
        spot.x < n.position.x + 200 &&
        n.position.x < spot.x + 200 &&
        spot.y < n.position.y + 70 &&
        n.position.y < spot.y + 70;
      expect(overlaps).toBe(false);
    }
  });

  it("gives up after 20 steps and returns the last spot", () => {
    const nodes = Array.from({ length: 21 }, (_, i) => at(400 + i * 24, 265 + i * 24));
    expect(freeSpot(centre, nodes)).toEqual({ x: 400 + 20 * 24, y: 265 + 20 * 24 });
  });

  it("uses a node's measured size when it has one", () => {
    // 100 px left of the candidate: a default-sized box ends at 400, a 400 px one doesn't.
    const small = at(200, 265);
    const big = at(200, 265, { width: 400, height: 200 });
    expect(freeSpot(centre, [small])).toEqual({ x: 400, y: 265 });
    expect(freeSpot(centre, [big])).not.toEqual({ x: 400, y: 265 });
  });
});

describe("defaultProtocol", () => {
  it("gives db for an edge to or from a database", () => {
    expect(defaultProtocol("paas", "database", "http")).toBe("db");
    expect(defaultProtocol("database", "paas", "http")).toBe("db");
  });

  it("gives db for an edge to a cache", () => {
    expect(defaultProtocol("vm", "cache", "websocket")).toBe("db");
  });

  it("keeps the pick between other kinds", () => {
    expect(defaultProtocol("mobile", "paas", "http")).toBe("http");
    expect(defaultProtocol("paas", "object_storage", "http")).toBe("http");
  });

  it("never replaces a push or real-time pick", () => {
    expect(defaultProtocol("paas", "mobile", "sse")).toBe("sse");
    expect(defaultProtocol("paas", "mobile", "web_push")).toBe("web_push");
  });
});
