import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { COMPONENT_CATALOG } from "./catalog";
import { createStyledEdge } from "./edges";
import { reachableNodeIds, requestRoots } from "./reachability";
import type { ComponentKind, DesignNodeData, EdgeProtocol } from "./types";

function node(id: string, kind: ComponentKind): Node<DesignNodeData> {
  const item = COMPONENT_CATALOG.find((c) => c.kind === kind)!;
  return {
    id,
    position: { x: 0, y: 0 },
    data: { label: id, componentKind: kind, purpose: "", config: structuredClone(item.defaultConfig) },
  };
}

function edge(source: string, target: string, protocol: EdgeProtocol = "http"): Edge {
  return createStyledEdge({ id: `${source}->${target}`, source, target }, protocol);
}

const sorted = (s: Iterable<string>) => [...s].sort();

describe("requestRoots", () => {
  it("uses client nodes when there are any", () => {
    const nodes = [node("phone", "mobile"), node("pc", "desktop"), node("api", "paas")];
    expect(requestRoots(nodes, [edge("phone", "api")])).toEqual(["phone", "pc"]);
  });

  it("falls back to nodes with no incoming edges", () => {
    const nodes = [node("vm-1", "vm"), node("vm-2", "vm"), node("db", "database")];
    const edges = [edge("vm-1", "db", "db"), edge("vm-2", "db", "db")];
    expect(requestRoots(nodes, edges)).toEqual(["vm-1", "vm-2"]);
  });
});

describe("reachableNodeIds", () => {
  it("follows edges from clients, including through load balancers", () => {
    const nodes = [
      node("phone", "mobile"),
      node("lb", "load_balancer"),
      node("api", "paas"),
      node("db", "database"),
      node("cache", "cache"),
    ];
    const edges = [edge("phone", "lb"), edge("lb", "api"), edge("api", "db", "db")];
    expect(sorted(reachableNodeIds(nodes, edges))).toEqual(["api", "db", "lb", "phone"]);
  });

  it("does not follow directed edges backwards", () => {
    const nodes = [node("phone", "mobile"), node("api", "paas"), node("worker", "task_worker")];
    // worker -> api is drawn into api, so worker isn't reachable from the phone.
    const edges = [edge("phone", "api"), edge("worker", "api")];
    expect(sorted(reachableNodeIds(nodes, edges))).toEqual(["api", "phone"]);
  });

  it("follows bidirectional protocols both ways", () => {
    const nodes = [node("iot", "iot"), node("api", "paas"), node("queue", "message_queue")];
    // Drawn queue -> iot over WebSocket, and api -> queue over HTTP.
    const edges = [edge("queue", "iot", "websocket"), edge("api", "queue")];
    expect(sorted(reachableNodeIds(nodes, edges))).toEqual(["iot", "queue"]);
  });

  it("terminates on cycles", () => {
    const nodes = [node("phone", "mobile"), node("a", "paas"), node("q", "message_queue")];
    const edges = [edge("phone", "a"), edge("a", "q"), edge("q", "a")];
    expect(sorted(reachableNodeIds(nodes, edges))).toEqual(["a", "phone", "q"]);
  });

  it("returns only the clients when nothing is connected", () => {
    const nodes = [node("phone", "mobile"), node("api", "paas")];
    expect(sorted(reachableNodeIds(nodes, []))).toEqual(["phone"]);
  });

  it("returns an empty set for an empty design", () => {
    expect(reachableNodeIds([], []).size).toBe(0);
  });
});
