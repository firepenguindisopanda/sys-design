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
