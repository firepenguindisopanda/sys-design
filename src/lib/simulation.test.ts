import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { COMPONENT_CATALOG } from "./catalog";
import { createStyledEdge } from "./edges";
import { runVerification } from "./simulation";
import type { ComponentKind, DesignNodeData, EdgeProtocol, FeatureBlock } from "./types";

function node(id: string, kind: ComponentKind, config: object = {}): Node<DesignNodeData> {
  const item = COMPONENT_CATALOG.find((c) => c.kind === kind)!;
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      label: id,
      componentKind: kind,
      purpose: "",
      config: { ...structuredClone(item.defaultConfig), ...config } as DesignNodeData["config"],
    },
  };
}

function edge(source: string, target: string, protocol: EdgeProtocol = "http"): Edge {
  return createStyledEdge({ id: `${source}->${target}`, source, target }, protocol);
}

function feature(placedOnNodeId: string): FeatureBlock {
  return {
    id: "f",
    name: "Read",
    description: "",
    resources: { memoryGb: 1, vcpus: 1, storageGb: 1 },
    targetRpm: 100,
    computeMsPerRequest: 20,
    placedOnNodeId,
  };
}

const NFR = { maxLatencyMs: 500, minThroughputRpm: 0, minAvailabilityPct: 90, maxMonthlyCostUsd: null };

function verify(nodes: Node<DesignNodeData>[], edges: Edge[]) {
  const result = runVerification(nodes, edges, [feature("api-1")], NFR);
  const status = (id: string) => result.checks.find((c) => c.id === id)?.status;
  return { result, status };
}

// phone → (lb) → api-1, api-2 → db, the shape most tests below vary.
const base = () => ({
  nodes: [
    node("phone", "mobile"),
    node("lb", "load_balancer"),
    node("api-1", "paas"),
    node("api-2", "paas"),
    node("db", "database", { replicas: 2 }),
  ],
  edges: [
    edge("phone", "lb"),
    edge("lb", "api-1"),
    edge("lb", "api-2"),
    edge("api-1", "db", "db"),
    edge("api-2", "db", "db"),
  ],
});

describe("load balancer credit", () => {
  it("counts a load balancer that forwards to compute", () => {
    const { nodes, edges } = base();
    const { result, status } = verify(nodes, edges);
    expect(status("topo-lb")).toBeUndefined();
    expect(result.estimatedAvailabilityPct).toBe(99.9);
  });

  it("ignores a load balancer with no edge to compute", () => {
    const { nodes } = base();
    // The phone reaches the LB, but the LB forwards nowhere; compute is reached directly.
    const edges = [
      edge("phone", "lb"),
      edge("phone", "api-1"),
      edge("phone", "api-2"),
      edge("api-1", "db", "db"),
      edge("api-2", "db", "db"),
    ];
    const { result, status } = verify(nodes, edges);
    expect(status("topo-lb")).toBe("warn");
    expect(result.estimatedAvailabilityPct).toBe(98.5);
  });

  it("ignores a load balancer nothing reaches", () => {
    const { nodes } = base();
    const edges = [
      edge("lb", "api-1"),
      edge("phone", "api-1"),
      edge("phone", "api-2"),
      edge("api-1", "db", "db"),
      edge("api-2", "db", "db"),
    ];
    expect(verify(nodes, edges).status("topo-lb")).toBe("warn");
  });
});

describe("cache credit", () => {
  const withCache = (connected: boolean) => {
    const { nodes, edges } = base();
    nodes.push(node("cache", "cache", { memoryGb: 4 }));
    if (connected) edges.push(edge("api-1", "cache", "db"));
    return verify(nodes, edges);
  };

  it("adds read capacity and the cache-aside bonus when connected", () => {
    const { result, status } = withCache(true);
    expect(status("topo-cache-ok")).toBe("pass");
    expect(result.estimatedThroughputRpm).toBe(460 + 4 * 200);
  });

  it("adds nothing when unconnected", () => {
    const connected = withCache(true).result;
    const { result, status } = withCache(false);
    expect(status("topo-cache")).toBe("warn");
    expect(status("topo-cache-ok")).toBeUndefined();
    expect(result.estimatedThroughputRpm).toBe(460);
    expect(result.estimatedLatencyMs).toBeGreaterThan(connected.estimatedLatencyMs);
  });
});

describe("CDN credit", () => {
  it("only removes the static hosting penalty when the CDN is connected", () => {
    const build = (connected: boolean) => {
      const { nodes, edges } = base();
      nodes.push(node("site", "static_hosting"), node("cdn", "cdn"));
      edges.push(edge("phone", "site"));
      if (connected) edges.push(edge("phone", "cdn"), edge("cdn", "site"));
      return verify(nodes, edges);
    };
    expect(build(true).status("topo-cdn")).toBeUndefined();
    expect(build(false).status("topo-cdn")).toBe("warn");
  });
});

describe("queue credit", () => {
  const build = (queueEdges: Edge[]) => {
    const { nodes, edges } = base();
    nodes.push(node("jobs", "message_queue"), node("worker", "task_worker"), node("iot", "iot"));
    return verify(nodes, [...edges, ...queueEdges]);
  };

  it("passes topo-queue and adds availability with a producer and a consumer", () => {
    const { result, status } = build([edge("api-1", "jobs"), edge("jobs", "worker")]);
    expect(status("topo-queue")).toBe("pass");
    expect(result.estimatedAvailabilityPct).toBe(99.95);
  });

  it("warns and earns nothing when the queue has no consumer", () => {
    const { result, status } = build([edge("api-1", "jobs")]);
    expect(status("topo-queue")).toBe("warn");
    expect(result.estimatedAvailabilityPct).toBe(99.9);
  });

  it("warns when nothing on a request path reaches the queue", () => {
    expect(build([edge("jobs", "worker")]).status("topo-queue")).toBe("warn");
  });

  it("counts a two-way WebSocket as a consumer", () => {
    expect(build([edge("iot", "jobs", "websocket")]).status("topo-queue")).toBe("pass");
  });

  it("reports nothing when there is no queue", () => {
    const { nodes, edges } = base();
    expect(verify(nodes, edges).status("topo-queue")).toBeUndefined();
  });
});

describe("topo-reachable", () => {
  it("passes when every component is on a request path", () => {
    const { nodes, edges } = base();
    const { result, status } = verify(nodes, edges);
    expect(status("topo-reachable")).toBe("pass");
    expect(result.checks.find((c) => c.id === "topo-reachable")?.detail).toBe(
      "Every component is on a request path.",
    );
  });

  it("warns, naming them, when components without features are disconnected", () => {
    const { nodes, edges } = base();
    nodes.push(node("cache", "cache"), node("cdn", "cdn"));
    const check = verify(nodes, edges).result.checks.find((c) => c.id === "topo-reachable")!;
    expect(check.status).toBe("warn");
    expect(check.detail).toBe("cache, cdn aren't on any request path, so they earn no credit.");
  });

  it("fails when compute hosting a feature can't be reached", () => {
    const { nodes, edges } = base();
    // Remove lb -> api-1: api-1 hosts the feature and is now cut off.
    const cut = edges.filter((e) => e.id !== "lb->api-1");
    const check = verify(nodes, cut).result.checks.find((c) => c.id === "topo-reachable")!;
    expect(check.status).toBe("fail");
    expect(check.detail).toBe(
      "No request path reaches api-1. Connect it to a client, directly or through a load balancer.",
    );
  });

  it("names every stranded compute node, in the plural", () => {
    const { nodes } = base();
    const features = [feature("api-1"), { ...feature("api-2"), id: "g" }];
    const result = runVerification(nodes, [edge("phone", "lb")], features, NFR);
    expect(result.checks.find((c) => c.id === "topo-reachable")?.detail).toBe(
      "No request path reaches api-1, api-2. Connect them to a client, directly or through a load balancer.",
    );
  });

  it("uses nodes with no incoming edges as roots when there are no clients", () => {
    const nodes = [node("api-1", "vm"), node("db", "database")];
    expect(verify(nodes, [edge("api-1", "db", "db")]).status("topo-reachable")).toBe("pass");
  });

  it("is not reported for an empty canvas", () => {
    expect(verify([], []).status("topo-reachable")).toBeUndefined();
  });
});

describe("topo-data-store", () => {
  const dataStore = (nodes: Node<DesignNodeData>[], edges: Edge[], features = [feature("api-1")]) =>
    runVerification(nodes, edges, features, NFR).checks.find((c) => c.id === "topo-data-store");

  const noDb = () => {
    const { nodes, edges } = base();
    return {
      nodes: nodes.filter((n) => n.id !== "db"),
      edges: edges.filter((e) => e.target !== "db"),
    };
  };

  it("passes with a reachable database", () => {
    const { nodes, edges } = base();
    expect(dataStore(nodes, edges)).toMatchObject({ status: "pass", detail: "Data has a durable store." });
  });

  it("fails with no data store, naming the features that store data", () => {
    const { nodes, edges } = noDb();
    const features = [feature("api-1"), { ...feature("api-2"), id: "g", name: "Write" }];
    expect(dataStore(nodes, edges, features)).toMatchObject({
      status: "fail",
      detail:
        "Read and Write store data, but no database or object storage is on a request path. Data kept on app servers is lost when they restart or scale.",
    });
  });

  it("passes with reachable object storage only", () => {
    const { nodes, edges } = noDb();
    nodes.push(node("files", "object_storage"));
    edges.push(edge("api-1", "files"));
    expect(dataStore(nodes, edges)?.status).toBe("pass");
  });

  it("fails when the only database is unreachable", () => {
    const { nodes, edges } = base();
    const cut = edges.filter((e) => e.target !== "db");
    expect(dataStore(nodes, cut)?.status).toBe("fail");
  });

  it("passes when every placed feature is stateless", () => {
    const { nodes, edges } = noDb();
    const stateless = { ...feature("api-1"), resources: { memoryGb: 1, vcpus: 1, storageGb: 0 } };
    expect(dataStore(nodes, edges, [stateless])).toMatchObject({
      status: "pass",
      detail: "Placed features don't store data.",
    });
  });

  it("is not reported when no feature is placed", () => {
    const { nodes, edges } = noDb();
    expect(dataStore(nodes, edges, [{ ...feature("api-1"), placedOnNodeId: null }])).toBeUndefined();
  });
});

describe("topo-client-data", () => {
  const warnings = (extra: Node<DesignNodeData>[], extraEdges: Edge[]) => {
    const { nodes, edges } = base();
    const { result } = verify([...nodes, ...extra], [...edges, ...extraEdges]);
    return result.checks.filter((c) => c.id.startsWith("topo-client-data-"));
  };

  it("warns for a client wired to a database, naming both", () => {
    const [check] = warnings([], [edge("phone", "db")]);
    expect(check).toMatchObject({
      id: "topo-client-data-phone->db",
      status: "warn",
      detail:
        "phone talks to db directly. That puts database credentials on the client; go through compute instead.",
    });
  });

  it("warns whichever way the edge is drawn", () => {
    expect(warnings([], [edge("db", "phone")]).map((c) => c.id)).toEqual([
      "topo-client-data-db->phone",
    ]);
    expect(warnings([], [edge("phone", "db", "websocket")])).toHaveLength(1);
  });

  it("counts static hosting as client-side, and caches as data stores", () => {
    const extra = [node("site", "static_hosting"), node("cache", "cache")];
    expect(warnings(extra, [edge("site", "cache")]).map((c) => c.id)).toEqual([
      "topo-client-data-site->cache",
    ]);
  });

  it("does not warn for object storage or compute → database", () => {
    const extra = [node("files", "object_storage")];
    expect(warnings(extra, [edge("phone", "files")])).toEqual([]);
    expect(warnings([], [])).toEqual([]); // base has api → db edges only
  });
});

describe("topo-intermediate", () => {
  const hopWarnings = (extra: Node<DesignNodeData>[], extraEdges: Edge[]) => {
    const { nodes, edges } = base();
    const { result } = verify([...nodes, ...extra], [...edges, ...extraEdges]);
    return result.checks.filter((c) => c.id.startsWith("topo-intermediate-")).map((c) => c.id);
  };

  // Finding 9: these are endpoints doing their job, not hops.
  it("does not flag a client that receives push and sends requests", () => {
    const extra = [node("jobs", "message_queue"), node("worker", "task_worker")];
    const extraEdges = [edge("api-1", "jobs"), edge("jobs", "worker"), edge("worker", "phone", "web_push")];
    expect(hopWarnings(extra, extraEdges)).toEqual([]);
  });

  it("does not flag a task worker that consumes a queue and calls on", () => {
    const extra = [node("jobs", "message_queue"), node("worker", "task_worker"), node("files", "object_storage")];
    const extraEdges = [edge("api-1", "jobs"), edge("jobs", "worker"), edge("worker", "files")];
    expect(hopWarnings(extra, extraEdges)).toEqual([]);
  });

  it("still flags a data store used as a hop", () => {
    const extra = [node("files", "object_storage")];
    expect(hopWarnings(extra, [edge("db", "files")])).toEqual(["topo-intermediate-db"]);
  });

  it("still flags static hosting used as a hop", () => {
    const extra = [node("site", "static_hosting")];
    expect(hopWarnings(extra, [edge("phone", "site"), edge("site", "lb")])).toEqual([
      "topo-intermediate-site",
    ]);
  });
});

describe("task worker credit", () => {
  it("only applies the queue + worker throughput bonus for a connected worker", () => {
    const build = (connected: boolean) => {
      const { nodes, edges } = base();
      nodes.push(node("jobs", "message_queue"), node("worker", "task_worker"));
      edges.push(edge("api-1", "jobs"));
      if (connected) edges.push(edge("jobs", "worker"));
      return verify(nodes, edges).result.estimatedThroughputRpm;
    };
    expect(build(false)).toBe(460);
    // 15 % bonus; the engine's float maths lands just under 529.
    expect(build(true)).toBeCloseTo(460 * 1.15, -1);
  });
});

describe("request latency", () => {
  // Hop costs: mobile 28, load balancer 8, queue 10, replicated database 10.
  const latency = (nodes: Node<DesignNodeData>[], edges: Edge[]) =>
    verify(nodes, edges).result.estimatedLatencyMs;

  it("is unchanged for a plain request path", () => {
    const { nodes, edges } = base();
    expect(latency(nodes, edges)).toBe(28 + 8 + 10);
  });

  it("counts the enqueue but not the worker behind the queue", () => {
    const nodes = [
      node("phone", "mobile"),
      node("lb", "load_balancer"),
      node("api-1", "paas"),
      node("jobs", "message_queue"),
      node("worker", "task_worker"),
      node("db", "database", { replicas: 2 }),
    ];
    const edges = [
      edge("phone", "lb"),
      edge("lb", "api-1"),
      edge("api-1", "jobs"),
      edge("jobs", "worker"),
      edge("worker", "db", "db"),
    ];
    expect(latency(nodes, edges)).toBe(28 + 8 + 10);
  });

  it.each<EdgeProtocol>(["sse", "web_push"])(
    "adds nothing for a %s push, and the client still starts requests",
    (protocol) => {
      const { nodes, edges } = base();
      expect(latency(nodes, [...edges, edge("api-1", "phone", protocol)])).toBe(28 + 8 + 10);
    },
  );

  it("counts a WebSocket the same whichever way it was drawn", () => {
    const nodes = [node("phone", "mobile"), node("api-1", "paas"), node("db", "database", { replicas: 2 })];
    const drawnFromServer = latency(nodes, [edge("api-1", "phone", "websocket"), edge("api-1", "db", "db")]);
    const drawnFromClient = latency(nodes, [edge("phone", "api-1", "websocket"), edge("api-1", "db", "db")]);
    expect(drawnFromServer).toBe(drawnFromClient);
  });

  it("starts from nodes with no incoming edge when there are no clients", () => {
    const nodes = [node("api-1", "paas"), node("llm", "external_api")];
    expect(latency(nodes, [edge("api-1", "llm")])).toBe(45);
  });

  it("falls back to the floor when clients only receive pushes", () => {
    const nodes = [node("phone", "mobile"), node("api-1", "paas"), node("db", "database", { replicas: 2 })];
    expect(latency(nodes, [edge("api-1", "phone", "sse"), edge("api-1", "db", "db")])).toBe(20);
  });
});
