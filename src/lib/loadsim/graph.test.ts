import type { Edge } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { buildDesign } from "@/lib/challenges/design";
import type { Brief } from "@/lib/challenges/types";
import { useSimulatorStore } from "@/lib/store";
import type { FeatureBlock } from "@/lib/types";
import { generateDesign } from "@/test/gen-designs";
import { challenges, design, fixtureDesign, requirement } from "@/test/loadsim-designs";
import { ROUTE_BUDGET } from "./capacities";
import { buildFlowGraph, databaseStations, reachShares, TooManyRoutesError } from "./graph";
import { featureLoads } from "./scenario";
import type { FlowGraph, PathStep, SimNode } from "./types";

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
      // Reworded in SPEC-loadsim-queues.md: queues are simulated behind compute now.
      "Campus IoT only talks to Upload events (queue), and requests straight from a client to it aren't simulated yet, so it sends no requests here.",
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

describe("jobs: queues and workers (SPEC-loadsim-queues.md)", () => {
  /** Every root-to-leaf path, as node ids, with `*` on steps that are part of the job. */
  function paths(cls: { root: PathStep | null }): string[][] {
    const out: string[][] = [];
    const walk = (step: PathStep, acc: string[]) => {
      const here = [...acc, step.job ? `${step.nodeId}*` : step.nodeId];
      if (step.next.length === 0) out.push(here);
      for (const n of step.next) walk(n.step, here);
    };
    if (cls.root) walk(cls.root, []);
    return out;
  }
  /** Each worker's share of the slow work on a class's paths, by node id. */
  function slowMs(cls: { root: PathStep | null }): Record<string, number> {
    const found: Record<string, number> = {};
    const walk = (step: PathStep) => {
      if (step.slowMs !== undefined) found[step.nodeId] = step.slowMs;
      for (const n of step.next) walk(n.step);
    };
    if (cls.root) walk(cls.root);
    return found;
  }

  it("puts enrolment writes on the queue and leaves reads on the cache path (course registration)", () => {
    const g = graphOf(fixtureDesign("course-registration", "good"));
    for (const p of paths(classOf(g, "phone", "enrol", "write"))) {
      expect(p).toEqual(["phone", "lb", expect.stringMatching(/^api-[12]$/), "claims*", "allocator*", "db*"]);
    }
    for (const p of paths(classOf(g, "phone", "browse-sections", "read"))) {
      expect(p.some((id) => id.endsWith("*"))).toBe(false);
      expect(p).toContain("cache");
    }
    // Enrol's reads have no slow work, so they aren't jobs.
    expect(paths(classOf(g, "phone", "enrol", "read")).flat().some((id) => id.endsWith("*"))).toBe(false);
  });

  it("makes every request of a slow-work feature a job, reads included (autograder)", () => {
    const g = graphOf(fixtureDesign("lab-autograder", "good"));
    for (const op of ["read", "write"] as const) {
      const cls = classOf(g, "laptop", "submit-solution", op);
      for (const p of paths(cls)) expect(p.slice(-3)).toEqual(["jobs*", "sandbox*", "db*"]);
      expect(slowMs(cls)).toEqual({ sandbox: 3000 });
    }
    // Browse exercises has no slow work: its reads stay off the queue.
    expect(paths(classOf(g, "laptop", "browse-exercises", "read")).flat()).not.toContain("jobs*");
  });

  it("ends a job at a queue nobody reads", () => {
    const g = graphOf(fixtureDesign("lab-autograder", "bad-no-worker"));
    for (const p of paths(classOf(g, "laptop", "submit-solution", "write"))) expect(p.at(-1)).toBe("jobs*");
  });

  it("ends a job at a worker with nowhere to put results, with a note", () => {
    const g = graphOf(fixtureDesign("lab-autograder", "bad-results-not-stored"));
    for (const p of paths(classOf(g, "laptop", "submit-solution", "write"))) expect(p.at(-1)).toBe("sandbox*");
    expect(g.notes).toContain("Sandbox workers' results go nowhere: no database.");
  });

  it("ends a job at push workers without the 'results go nowhere' note (notifications)", () => {
    const g = graphOf(fixtureDesign("notification-system", "good"));
    const sends = g.classes.filter((c) => c.clientId === "staff-pc" && paths(c).flat().includes("worker*"));
    expect(sends.length).toBeGreaterThan(0);
    for (const c of sends) for (const p of paths(c)) expect(p.at(-1)).toBe("worker*");
    expect(g.notes.some((n) => n.includes("results go nowhere"))).toBe(false);
  });

  it("passes a job through every stage and splits the slow work between them (link checker)", () => {
    const g = graphOf(fixtureDesign("course-link-checker", "good"));
    const cls = classOf(g, "lecturer-pc", "start-check", "write");
    for (const p of paths(cls)) {
      expect(p.slice(-5)).toEqual(["pages*", "fetchers*", "links*", "checkers*", "db*"]);
    }
    expect(slowMs(cls)).toEqual({ fetchers: 30000, checkers: 30000 });
  });

  it("doesn't follow a pub/sub topic: writes go to the database as before (chat)", () => {
    const g = graphOf(fixtureDesign("chat-app", "good"));
    expect(g.classes.flatMap((c) => paths(c)).flat()).not.toContain("bus*");
    expect(g.classes.flatMap((c) => paths(c)).flat()).not.toContain("bus");
    // Send message's writes still go from the chat servers straight to the database.
    const writes = g.classes.filter((c) => c.featureId === "send-message" && c.op === "write" && c.outcome === "routed");
    expect(writes.length).toBeGreaterThan(0);
    for (const c of writes) {
      for (const p of paths(c)) {
        expect(p.at(-1)).toBe("db");
        expect(p.at(-2)).toMatch(/^chat-[12]$/);
      }
    }
  });

  it("uses each instance's own queue edges: an instance without one keeps the old path", () => {
    // p1 and p2 share a balancer, but only p1 has an edge to the queue.
    const built = design(
      [requirement("save", { targetRpm: 60, computeMsPerRequest: 10 })],
      [
        ["desktop", "desktop"],
        ["lb", "load_balancer"],
        ["p1", "paas"],
        ["p2", "paas"],
        ["q", "message_queue"],
        ["w", "task_worker"],
        ["db", "database"],
      ],
      ["desktop -> lb : http", "lb -> p1 : http", "lb -> p2 : http", "p1 -> q : http", "q -> w : http", "w -> db : db", "p1 -> db : db", "p2 -> db : db"],
      { save: "p1" },
    );
    const byInstance = Object.fromEntries(paths(classOf(graphOf(built), "desktop", "save", "write")).map((p) => [p[2], p]));
    expect(byInstance.p1).toEqual(["desktop", "lb", "p1", "q*", "w*", "db*"]);
    expect(byInstance.p2).toEqual(["desktop", "lb", "p2", "db"]);
  });

  it("splits a queue's jobs evenly between its workers", () => {
    const built = design(
      [requirement("save", { targetRpm: 60, computeMsPerRequest: 10 })],
      [
        ["desktop", "desktop"],
        ["vm", "vm"],
        ["q", "message_queue"],
        ["w1", "task_worker"],
        ["w2", "task_worker"],
        ["db", "database"],
      ],
      ["desktop -> vm : http", "vm -> q : http", "q -> w1 : http", "q -> w2 : http", "w1 -> db : db", "w2 -> db : db"],
      { save: "vm" },
    );
    const shares = reachShares(classOf(graphOf(built), "desktop", "save", "write"));
    expect(shares.q).toBeCloseTo(1, 9);
    expect(shares.w1).toBeCloseTo(0.5, 9);
    expect(shares.w2).toBeCloseTo(0.5, 9);
    expect(shares.db).toBeCloseTo(1, 9);
  });

  it("gives a design without a queue exactly the paths it had (link shortener)", () => {
    // Recorded before loadsim-queues; any change here means a no-queue design moved.
    expect(JSON.stringify(graphOf(fixtureDesign("link-shortener", "good")).classes)).toMatchSnapshot();
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

  it("names only autoscaling in the registration design, now its queue and worker are simulated", () => {
    // SPEC-loadsim-queues.md: before, this listed `claims` and `allocator` too.
    expect(ids(graphOf(fixtureDesign("course-registration", "good")))).toEqual(["autoscaling"]);
  });

  it("doesn't list slow work: a queue's workers do it, or the request does it inline", () => {
    // SPEC-loadsim-cascades.md: before, slow work inside the request was listed, as
    // "Submit solution: its slow work isn't simulated yet." in bad-sync-grading.
    const queued = graphOf(fixtureDesign("lab-autograder", "good"));
    expect(queued.notSimulated.find((n) => n.id === "submit-solution")).toBeUndefined();
    const inline = graphOf(fixtureDesign("lab-autograder", "bad-sync-grading"));
    expect(inline.notSimulated.find((n) => n.id === "submit-solution")).toBeUndefined();
    expect(ids(inline)).toEqual(["autoscaling"]);
  });

  it("names a pub/sub topic as not simulated", () => {
    const g = graphOf(fixtureDesign("chat-app", "good"));
    expect(g.notSimulated.find((n) => n.id === "bus")?.text).toBe("Room events (pub/sub): not simulated yet.");
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

  it("names features whose polling or files aren't simulated, but not their slow work", () => {
    // SPEC-loadsim-cascades.md: slow work inside the request is simulated now.
    const built = design(
      [
        requirement("grade", { targetRpm: 60, computeMsPerRequest: 10, backgroundWorkMs: 3000 }),
        requirement("watch", { targetRpm: 60, computeMsPerRequest: 10, backgroundWorkMs: 3000, pollingRpm: 120 }),
      ],
      [
        ["desktop", "desktop"],
        ["vm", "vm"],
      ],
      ["desktop -> vm : http"],
      { grade: "vm", watch: "vm" },
    );
    const g = graphOf(built);
    expect(ids(g)).toEqual(["watch"]);
    expect(g.notSimulated.find((n) => n.id === "watch")?.text).toBe("watch: its polling isn't simulated yet.");
  });
});

describe("slow work and external calls on compute steps (SPEC-loadsim-cascades.md)", () => {
  /** Every step of a feature's paths at these nodes. */
  function stepsAt(g: FlowGraph, featureId: string, nodeIds: string[]): PathStep[] {
    const found: PathStep[] = [];
    const walk = (s: PathStep) => {
      if (nodeIds.includes(s.nodeId)) found.push(s);
      for (const n of s.next) walk(n.step);
    };
    for (const c of g.classes) if (c.featureId === featureId && c.root) walk(c.root);
    return found;
  }
  const apis = ["api-1", "api-2"];

  it("marks slow work done inside the request on its compute steps (autograder without the queue)", () => {
    const bad = graphOf(fixtureDesign("lab-autograder", "bad-sync-grading"));
    const submit = stepsAt(bad, "submit-solution", apis);
    expect(submit.length).toBeGreaterThan(0);
    for (const s of submit) expect(s.inlineSlowMs).toBe(3000);
    const browse = stepsAt(bad, "browse-exercises", apis);
    expect(browse.length).toBeGreaterThan(0);
    for (const s of browse) expect(s.inlineSlowMs ?? 0).toBe(0);
  });

  describe("slowMs: the slow work's realistic time on the load page (SPEC-brief-load-rollout.md)", () => {
    /** The autograder's graph with Submit solution's slow work set to `slowMs`. */
    function withSlowMs(fixture: string, slowMs?: number) {
      const built = fixtureDesign("lab-autograder", fixture);
      const brief = { ...built.brief, load: { features: { "submit-solution": slowMs === undefined ? {} : { slowMs } } } };
      return buildFlowGraph(built.nodes, built.edges, built.features, featureLoads(built.features, brief));
    }
    /** The slow work each worker step does for a feature, by node id. */
    function jobSlowMs(g: FlowGraph, featureId: string): Record<string, number> {
      const found: Record<string, number> = {};
      const walk = (s: PathStep) => {
        if (s.slowMs !== undefined) found[s.nodeId] = s.slowMs;
        for (const n of s.next) walk(n.step);
      };
      for (const c of g.classes) if (c.featureId === featureId && c.root) walk(c.root);
      return found;
    }

    it("gives a job's worker the slowMs, not backgroundWorkMs", () => {
      expect(jobSlowMs(withSlowMs("good", 1500), "submit-solution")).toEqual({ sandbox: 1500 });
      expect(jobSlowMs(withSlowMs("good"), "submit-solution")).toEqual({ sandbox: 3000 });
    });

    it("marks slow work done inside the request with the slowMs", () => {
      const submit = stepsAt(withSlowMs("bad-sync-grading", 1500), "submit-solution", apis);
      expect(submit.length).toBeGreaterThan(0);
      for (const s of submit) expect(s.inlineSlowMs).toBe(1500);
    });

    it("splits the slowMs between a job's stages (link checker)", () => {
      const built = fixtureDesign("course-link-checker", "good");
      const brief = { ...built.brief, load: { features: { "start-check": { slowMs: 20_000 } } } };
      const g = buildFlowGraph(built.nodes, built.edges, built.features, featureLoads(built.features, brief));
      expect(jobSlowMs(g, "start-check")).toEqual({ fetchers: 10_000, checkers: 10_000 });
    });
  });

  it("leaves slow work that goes to a queue unmarked: the workers do it (autograder)", () => {
    const good = graphOf(fixtureDesign("lab-autograder", "good"));
    const submit = stepsAt(good, "submit-solution", apis);
    expect(submit.length).toBeGreaterThan(0);
    for (const s of submit) expect(s.inlineSlowMs ?? 0).toBe(0);
  });

  it("marks compute steps on an instance with an edge to an external API, and only those", () => {
    const built = design(
      [
        requirement("ask", { targetRpm: 60, computeMsPerRequest: 10, ...stateless }),
        requirement("look", { targetRpm: 60, computeMsPerRequest: 10, ...stateless }),
      ],
      [
        ["desktop", "desktop"],
        ["calls", "vm"],
        ["plain", "vm"],
        ["llm", "external_api"],
      ],
      ["desktop -> calls : http", "desktop -> plain : http", "calls -> llm : http"],
      { ask: "calls", look: "plain" },
    );
    const g = graphOf(built);
    const ask = stepsAt(g, "ask", ["calls"]);
    expect(ask).toHaveLength(1);
    expect(ask[0].callsApi).toBe(true);
    const look = stepsAt(g, "look", ["plain"]);
    expect(look).toHaveLength(1);
    expect(look[0].callsApi ?? false).toBe(false);
    for (const s of stepsAt(g, "ask", ["desktop"])) expect(s.callsApi ?? false).toBe(false);
  });
});

// SPEC-loadsim-route-scale.md: building stops once a design passes the route budget.
describe("route budget", () => {
  const steps = (g: FlowGraph) => {
    const count = (s: PathStep): number => 1 + s.next.reduce((n, x) => n + count(x.step), 0);
    return g.classes.reduce((n, c) => n + (c.root ? count(c.root) : 0), 0);
  };
  const stacked = (layers: number) => generateDesign({ shape: "stacked", layers, width: 4 });

  it("is 2,000 route steps", () => {
    expect(ROUTE_BUDGET).toBe(2_000);
  });

  it.each([5, 12])("refuses %i stacked layers of 4 within 100 ms", (layers) => {
    const d = stacked(layers);
    const start = performance.now();
    expect(() => buildFlowGraph(d.nodes, d.edges, d.features)).toThrow(TooManyRoutesError);
    expect(performance.now() - start).toBeLessThan(100);
  });

  // Found while building: paths that dead-end make no steps, so only counting the ways
  // tried stops 12 layers in front of compute that doesn't run the feature (4^12 paths).
  it("refuses 12 stacked layers whose paths all dead-end, within 100 ms", () => {
    const d = stacked(12);
    const api = d.nodes.find((n) => n.id === "api")!;
    const nodes = [...d.nodes, { ...api, id: "elsewhere" }];
    const features = d.features.map((f) => ({ ...f, placedOnNodeId: "elsewhere" }));
    const start = performance.now();
    expect(() => buildFlowGraph(nodes, d.edges, features)).toThrow(TooManyRoutesError);
    expect(performance.now() - start).toBeLessThan(100);
  });

  it("names the budget in the error", () => {
    const d = stacked(5);
    try {
      buildFlowGraph(d.nodes, d.edges, d.features);
      throw new Error("expected a throw");
    } catch (e) {
      expect(e).toBeInstanceOf(TooManyRoutesError);
      expect((e as TooManyRoutesError).budget).toBe(2_000);
      expect((e as Error).message).toBe("More than 2000 route steps");
    }
  });

  it("still builds 4 stacked layers of 4, with 1,706 steps", () => {
    const d = stacked(4);
    expect(steps(buildFlowGraph(d.nodes, d.edges, d.features))).toBe(1_706);
  });

  // Every place that makes a route step is counted: a design builds with its own step count
  // as the budget, and throws with one less. A step made but not counted would let the
  // second build through.
  it("counts every step exactly", () => {
    const designs: [string, { nodes: SimNode[]; edges: Edge[]; features: FeatureBlock[] }, Brief | null][] = [
      ...challenges.flatMap((c) => c.fixtures.map((f) => [`${c.brief.id}/${f.name}`, buildDesign(c.brief, f), c.brief] as [string, ReturnType<typeof buildDesign>, Brief])),
      ...(["loadDemo", "loadFanInDemo"] as const).map((load): [string, ReturnType<typeof buildDesign>, null] => {
        useSimulatorStore.getState()[load]();
        const s = useSimulatorStore.getState();
        return [load, { nodes: s.nodes, edges: s.edges, features: s.features, nfr: s.nfr }, null];
      }),
      ...(["random", "app"] as const).flatMap((shape) =>
        Array.from({ length: 50 }, (_, i): [string, ReturnType<typeof buildDesign>, null] => {
          const d = generateDesign({ seed: i + 1, shape });
          return [d.description, d, null];
        }),
      ),
    ];
    let checked = 0;
    for (const [name, d, brief] of designs) {
      const loads = featureLoads(d.features, brief);
      const n = steps(buildFlowGraph(d.nodes, d.edges, d.features, loads, 1_000_000));
      if (n === 0) continue;
      expect(() => buildFlowGraph(d.nodes, d.edges, d.features, loads, n), name).not.toThrow();
      expect(() => buildFlowGraph(d.nodes, d.edges, d.features, loads, n - 1), name).toThrow(TooManyRoutesError);
      checked++;
    }
    expect(checked).toBeGreaterThan(150);
  }, 30_000);
});
