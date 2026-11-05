import { describe, expect, it } from "vitest";
import { design, requirement } from "@/test/loadsim-designs";
import { canSwitchOff, nodeState, toggleOutage, validateOutages, type Outage } from "./outages";

// SPEC-loadsim-failures.md: which components can be switched off, what "off" means for
// each at any moment, and what pressing the power button does.

const built = design(
  [requirement("ping", { targetRpm: 60, computeMsPerRequest: 10 })],
  [
    ["desktop", "desktop"],
    ["lb", "load_balancer"],
    ["p1", "paas"],
    ["p2", "paas"],
    ["db2", "database", { replicas: 2 }],
    ["db1", "database", { replicas: 1 }],
    ["cache", "cache"],
    ["q", "message_queue"],
    ["w", "task_worker"],
    ["cdn", "cdn"],
    ["static", "static_hosting"],
    ["api", "external_api"],
  ],
  ["desktop -> lb : http", "lb -> p1 : http", "lb -> p2 : http"],
  { ping: "p1" },
);
const node = (id: string) => built.nodes.find((n) => n.id === id)!;
const off = (nodeId: string, offAt: number, onAt: number | null = null): Outage => ({ nodeId, offAt, onAt });

describe("canSwitchOff", () => {
  it("allows compute instances, databases, caches and workers", () => {
    for (const id of ["p1", "db2", "cache", "w"]) expect(canSwitchOff(node(id).data.componentKind)).toBe(true);
  });

  it("leaves out managed services and clients", () => {
    for (const id of ["lb", "q", "cdn", "static", "api", "desktop"]) {
      expect(canSwitchOff(node(id).data.componentKind)).toBe(false);
    }
  });
});

describe("validateOutages", () => {
  it("accepts a valid list", () => {
    expect(validateOutages(built.nodes, [off("p1", 10, 20), off("p1", 30), off("db2", 0, 5)])).toBeNull();
    expect(validateOutages(built.nodes, [])).toBeNull();
  });

  it.each([
    ["an unknown node", [off("nope", 10)], /nope/],
    ["a load balancer", [off("lb", 10)], /can't be switched off/],
    ["a queue", [off("q", 10)], /can't be switched off/],
    ["a negative start", [off("p1", -1)], /p1/],
    ["an end before the start", [off("p1", 20, 20)], /p1/],
    ["overlapping outages on one node", [off("p1", 10, 30), off("p1", 20, 40)], /overlap/],
    ["an open outage followed by another", [off("p1", 10), off("p1", 20, 30)], /overlap/],
  ])("rejects %s", (_, outages, message) => {
    expect(validateOutages(built.nodes, outages)).toMatch(message);
  });
});

describe("nodeState", () => {
  it("keeps an instance routable for the 10 s health check after it goes off, and after it's back", () => {
    const outages = [off("p1", 100, 200)];
    const at = (t: number) => nodeState(outages, node("p1"), t);
    expect(at(99)).toMatchObject({ down: false, routable: true });
    expect(at(100)).toMatchObject({ down: true, routable: true });
    expect(at(109.9)).toMatchObject({ down: true, routable: true });
    expect(at(110)).toMatchObject({ down: true, routable: false });
    expect(at(200)).toMatchObject({ down: false, routable: false });
    expect(at(210)).toMatchObject({ down: false, routable: true });
  });

  it("fails a two-copy database's writes for the 30 s failover, then keeps the replica as primary", () => {
    const outages = [off("db2", 100, 200)];
    const at = (t: number) => nodeState(outages, node("db2"), t);
    expect(at(99)).toMatchObject({ down: false, writesFail: false, primaryCopy: 0 });
    expect(at(100)).toMatchObject({ down: true, writesFail: true, primaryCopy: 0 });
    expect(at(129.9)).toMatchObject({ writesFail: true });
    expect(at(130)).toMatchObject({ down: true, writesFail: false, primaryCopy: 1 });
    expect(at(250)).toMatchObject({ down: false, writesFail: false, primaryCopy: 1 });
  });

  it("fails a one-copy database's writes for the whole outage", () => {
    const outages = [off("db1", 100, 200)];
    const at = (t: number) => nodeState(outages, node("db1"), t);
    expect(at(150)).toMatchObject({ down: true, writesFail: true, primaryCopy: 0 });
    expect(at(199)).toMatchObject({ writesFail: true });
    expect(at(200)).toMatchObject({ down: false, writesFail: false, primaryCopy: 0 });
  });

  it("brings a cache back empty and warms it up over 30 s", () => {
    const outages = [off("cache", 100, 200)];
    const hit = (t: number) => nodeState(outages, node("cache"), t).hitRatio;
    expect(hit(50)).toBeCloseTo(0.9, 9);
    expect(hit(150)).toBe(0);
    expect(hit(215)).toBeCloseTo(0.45, 9);
    expect(hit(230)).toBeCloseTo(0.9, 9);
    expect(hit(400)).toBeCloseTo(0.9, 9);
  });

  it("says a node with no outages is up", () => {
    expect(nodeState([], node("p1"), 10)).toMatchObject({ down: false, routable: true });
  });
});

describe("toggleOutage", () => {
  it("switches off, then brings back, as one closed outage", () => {
    const once = toggleOutage([], "p1", 100);
    expect(once).toEqual([off("p1", 100)]);
    expect(toggleOutage(once, "p1", 160)).toEqual([off("p1", 100, 160)]);
  });

  it("brings a node back inside an outage and drops that node's later outages", () => {
    const outages = [off("p1", 100, 200), off("p1", 300), off("db2", 50)];
    expect(toggleOutage(outages, "p1", 150)).toEqual([off("db2", 50), off("p1", 100, 150)]);
  });

  it("switches off between two outages until the next one begins", () => {
    const outages = [off("p1", 100, 200), off("p1", 300, 400)];
    expect(toggleOutage(outages, "p1", 250)).toEqual([off("p1", 100, 200), off("p1", 250, 300), off("p1", 300, 400)]);
  });

  it("returns a list validateOutages accepts", () => {
    let outages: Outage[] = [];
    for (const [id, t] of [["p1", 10], ["db2", 20], ["p1", 30], ["p1", 5], ["cache", 40]] as const) {
      outages = toggleOutage(outages, id, t);
      expect(validateOutages(built.nodes, outages)).toBeNull();
    }
  });
});
