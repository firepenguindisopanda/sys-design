import type { Edge, Node } from "@xyflow/react";
import { isClientKind } from "./catalog";
import { PROTOCOL_META, getEdgeData } from "./edges";
import type { DesignNodeData } from "./types";

type SimNode = Node<DesignNodeData>;

/**
 * Where requests start: the client nodes, or, for a design without clients,
 * the nodes with no incoming edges (the same roots path latency uses).
 */
export function requestRoots(nodes: SimNode[], edges: Edge[]): string[] {
  const clients = nodes.filter((n) => isClientKind(n.data.componentKind));
  if (clients.length > 0) return clients.map((n) => n.id);
  const targets = new Set(edges.map((e) => e.target));
  return nodes.filter((n) => !targets.has(n.id)).map((n) => n.id);
}

/**
 * Neighbours a request can move to from each node: edges as drawn, plus the
 * reverse of bidirectional ones (WebSocket, WebRTC).
 */
export function outgoingNeighbours(edges: Edge[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (from: string, to: string) => {
    const list = out.get(from) ?? [];
    list.push(to);
    out.set(from, list);
  };
  for (const e of edges) {
    add(e.source, e.target);
    if (PROTOCOL_META[getEdgeData(e).protocol].direction === "bidirectional") {
      add(e.target, e.source);
    }
  }
  return out;
}

/** Ids of every node on a request path from a root, roots included. */
export function reachableNodeIds(nodes: SimNode[], edges: Edge[]): Set<string> {
  const known = new Set(nodes.map((n) => n.id));
  const out = outgoingNeighbours(edges);
  const seen = new Set<string>();
  const queue = requestRoots(nodes, edges);
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id) || !known.has(id)) continue;
    seen.add(id);
    for (const next of out.get(id) ?? []) queue.push(next);
  }
  return seen;
}
