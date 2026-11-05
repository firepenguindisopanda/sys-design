import { describe, expect, it } from "vitest";
import { design, fixtureDesign, requirement } from "@/test/loadsim-designs";
import { buildFlowGraph, databaseStations, reachShares } from "./graph";
import type { FlowGraph } from "./types";

function graphOf(built: ReturnType<typeof fixtureDesign> | ReturnType<typeof design>): FlowGraph {
  return buildFlowGraph(built.nodes, built.edges, built.features);
}

function classOf(graph: FlowGraph, clientId: string, featureId: string, op: "read" | "write") {
  const found = graph.classes.find((c) => c.clientId === clientId && c.featureId === featureId && c.op === op);
  if (!found) throw new Error(`no class ${clientId}/${featureId}/${op}`);
  return found;
}

const stateless = { resources: { memoryGb: 0.5, vcpus: 0.5, storageGb: 0 } };

describe("pools and load balancing", () => {
  const graph = graphOf(fixtureDesign("link-shortener", "good"));

  it("treats compute behind one load balancer as one pool", () => {
    expect(graph.pools).toEqual([["api-1", "api-2"]]);
  });

  it("serves every feature placed in the pool on every instance, split evenly", () => {
    // Create link is placed on api-1 and Redirect on api-2; both instances serve both.
    for (const feature of ["create-link", "redirect"]) {
      const shares = reachShares(classOf(graph, "phone", feature, "read"));
      expect(shares.lb).toBeCloseTo(1, 9);
      expect(shares["api-1"]).toBeCloseTo(0.5, 9);
      expect(shares["api-2"]).toBeCloseTo(0.5, 9);
    }
  });

  it("gives three instances behind one balancer a third each", () => {
    const built = design(
      [requirement("ping", { targetRpm: 60, computeMsPerRequest: 10, ...stateless })],
      [
        ["desktop", "desktop"],
        ["lb", "load_balancer"],
        ["p1", "paas"],
        ["p2", "paas"],
        ["p3", "paas"],
      ],
      ["desktop -> lb : http", "lb -> p1 : http", "lb -> p2 : http", "lb -> p3 : http"],
      { ping: "p1" },
    );
    const g = graphOf(built);
    expect(g.pools).toEqual([["p1", "p2", "p3"]]);
    const shares = reachShares(classOf(g, "desktop", "ping", "read"));
    for (const id of ["p1", "p2", "p3"]) expect(shares[id]).toBeCloseTo(1 / 3, 9);
  });
});

describe("routes", () => {
  it("fails a client's requests for a feature no reachable instance runs", () => {
    const g = graphOf(fixtureDesign("link-shortener", "bad-no-load-balancer"));
    expect(g.pools).toEqual([["api-1"], ["api-2"]]);
    // The phone reaches only Link API 1, which runs Create link, not Redirect.
    const phoneRedirect = classOf(g, "phone", "redirect", "read");
    expect(phoneRedirect.outcome).toBe("no-route");
    expect(phoneRedirect.reason).toContain("Student phone");
    expect(phoneRedirect.reason).toContain("Redirect");
    const labRedirect = classOf(g, "lab-pc", "redirect", "read");
    expect(labRedirect.outcome).toBe("routed");
    expect(reachShares(labRedirect)["api-2"]).toBeCloseTo(1, 9);
  });

  it("fails every client's requests for an unplaced feature", () => {
    const built = fixtureDesign("link-shortener", "good");
    const features = built.features.map((f) => (f.id === "redirect" ? { ...f, placedOnNodeId: null } : f));
    const g = buildFlowGraph(built.nodes, built.edges, features);
    expect(classOf(g, "phone", "redirect", "read").outcome).toBe("no-route");
    expect(classOf(g, "lab-pc", "redirect", "read").outcome).toBe("no-route");
    expect(classOf(g, "phone", "create-link", "read").outcome).toBe("routed");
  });
});

describe("which clients send requests (SPEC-loadsim-routing.md)", () => {
  const ping = () => requirement("ping", { targetRpm: 60, computeMsPerRequest: 10, ...stateless });
  const sends = (g: FlowGraph, clientId: string) => g.classes.some((c) => c.clientId === clientId);

  it("leaves out a client that only receives pushes, with a note", () => {
    const g = graphOf(fixtureDesign("lab-monitor", "good"));
    expect(sends(g, "phone")).toBe(false);
    expect(sends(g, "lab-pc")).toBe(true);
    expect(sends(g, "laptop")).toBe(true);
    expect(g.notes).toContain("Technician phone only receives pushes, so it sends no requests here.");
  });

  it("leaves out a client that only talks to parts not simulated yet, with a note", () => {
    const built = design(
      [ping()],
      [
        ["desktop", "desktop"],
        ["iot", "iot", {}, "Campus IoT"],
        ["vm", "vm"],
        ["q", "message_queue", {}, "Upload events"],
      ],
      ["desktop -> vm : http", "iot -> q : websocket", "vm -> q : http"],
      { ping: "vm" },
    );
    const g = graphOf(built);
    expect(sends(g, "iot")).toBe(false);
    expect(sends(g, "desktop")).toBe(true);
    expect(g.notes).toContain(
      "Campus IoT only talks to Upload events (queue), which isn't simulated yet, so it sends no requests here.",
    );
  });

  it("still sends from a client with no edges, and fails its requests", () => {
    const built = design(
      [ping()],
      [
        ["desktop", "desktop"],
        ["phone", "mobile"],
        ["vm", "vm"],
      ],
      ["desktop -> vm : http"],
      { ping: "vm" },
    );
    expect(classOf(graphOf(built), "phone", "ping", "read").outcome).toBe("no-route");
  });

  it("still sends from a client wired only to a database, and fails its requests", () => {
    const built = design(
      [ping()],
      [
        ["desktop", "desktop"],
        ["phone", "mobile"],
        ["vm", "vm"],
        ["db", "database"],
      ],
      ["desktop -> vm : http", "phone -> db : db", "vm -> db : db"],
      { ping: "vm" },
    );
    expect(classOf(graphOf(built), "phone", "ping", "read").outcome).toBe("no-route");
  });

  it("passes requests through a CDN and static hosting on the way to compute", () => {
    const built = design(
      [ping()],
      [
        ["phone", "mobile"],
        ["cdn", "cdn"],
        ["static", "static_hosting"],
        ["lb", "load_balancer"],
        ["vm", "vm"],
      ],
      ["phone -> cdn : http", "cdn -> static : http", "static -> lb : http", "lb -> vm : http"],
      { ping: "vm" },
    );
    const g = graphOf(built);
    const cls = classOf(g, "phone", "ping", "read");
    expect(cls.outcome).toBe("routed");
    const shares = reachShares(cls);
    for (const id of ["cdn", "static", "lb", "vm"]) expect(shares[id]).toBeCloseTo(1, 9);
    // A CDN doesn't pool the compute behind it.
    expect(g.pools).toEqual([["vm"]]);
  });
});

describe("data stages", () => {
  it("sends reads through the cache, misses to the database, and writes straight to it", () => {
    const g = graphOf(fixtureDesign("link-shortener", "good"));
    const read = reachShares(classOf(g, "phone", "redirect", "read"));
    expect(read.cache).toBeCloseTo(1, 9);
    expect(read.db).toBeCloseTo(0.1, 9);
    const write = reachShares(classOf(g, "phone", "redirect", "write"));
    expect(write.cache ?? 0).toBe(0);
    expect(write.db).toBeCloseTo(1, 9);
  });

  it("sends every read to the database without a cache", () => {
    const g = graphOf(fixtureDesign("link-shortener", "bad-no-cache"));
    const read = reachShares(classOf(g, "phone", "redirect", "read"));
    expect(read.db).toBeCloseTo(1, 9);
  });

  it("ends a stateless feature at compute", () => {
    const built = design(
      [requirement("ping", { targetRpm: 60, computeMsPerRequest: 10, ...stateless })],
      [
        ["desktop", "desktop"],
        ["vm", "vm"],
        ["db", "database"],
      ],
      ["desktop -> vm : http", "vm -> db : db"],
      { ping: "vm" },
    );
    const shares = reachShares(classOf(graphOf(built), "desktop", "ping", "read"));
    expect(shares.vm).toBeCloseTo(1, 9);
    expect(shares.db ?? 0).toBe(0);
  });

  it("spreads reads over every copy of every shard and writes over the primaries", () => {
    const config = { kind: "database" as const, engine: "relational" as const, replicas: 2, shards: 2, storageGb: 50 };
    const reads = databaseStations("db", config, "read");
    const writes = databaseStations("db", config, "write");
    expect(reads).toHaveLength(4);
    for (const s of reads) expect(s.fraction).toBeCloseTo(0.25, 9);
    expect(writes).toHaveLength(2);
    for (const s of writes) expect(s.fraction).toBeCloseTo(0.5, 9);
    const readIds = new Set(reads.map((s) => s.id));
    expect(writes.every((s) => readIds.has(s.id))).toBe(true);
  });
});

describe("what isn't simulated yet", () => {
  const ids = (g: FlowGraph) => g.notSimulated.map((n) => n.id).sort();

  it("names the queue, the worker and autoscaling in the registration design", () => {
    const g = graphOf(fixtureDesign("course-registration", "good"));
    expect(ids(g)).toEqual(["allocator", "autoscaling", "claims"]);
    expect(g.notSimulated.find((n) => n.id === "claims")!.text).toContain("Seat claims");
  });

  it("names only autoscaling in the link shortener", () => {
    expect(ids(graphOf(fixtureDesign("link-shortener", "good")))).toEqual(["autoscaling"]);
  });

  it("names push edges and client edges to a database", () => {
    const built = design(
      [requirement("feed", { targetRpm: 60, computeMsPerRequest: 10 })],
      [
        ["desktop", "desktop"],
        ["vm", "vm"],
        ["db", "database"],
      ],
      ["desktop -> vm : http", "vm -> desktop : sse", "desktop -> db : db", "vm -> db : db"],
      { feed: "vm" },
    );
    expect(ids(graphOf(built))).toEqual(["desktop->db", "vm->desktop"]);
  });

  it("names features whose slow work, polling or files aren't simulated", () => {
    const built = design(
      [requirement("grade", { targetRpm: 60, computeMsPerRequest: 10, backgroundWorkMs: 3000 })],
      [
        ["desktop", "desktop"],
        ["vm", "vm"],
      ],
      ["desktop -> vm : http"],
      { grade: "vm" },
    );
    expect(ids(graphOf(built))).toEqual(["grade"]);
  });
});
