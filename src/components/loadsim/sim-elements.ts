import type { Edge, Node } from "@xyflow/react";
import { edgeAriaLabel } from "@/components/simulator/flow-labels";
import type { SimNode } from "@/lib/loadsim/types";

/**
 * The design's nodes for the simulation canvas. Students can drag them to tidy the
 * layout; positions are copied, so moving one stays on this page and never changes the
 * design handed over from the editor.
 */
export function simNodes(nodes: SimNode[]): Node[] {
  return nodes.map((n) => ({
    id: n.id,
    type: "load",
    position: { ...n.position },
    data: { label: n.data.label, kind: n.data.componentKind },
    draggable: true,
    connectable: false,
    selectable: false,
  }));
}

/** The design's connections as flow edges, named by their nodes for screen readers. */
export function simEdges(edges: Edge[], nodes: SimNode[]): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: "flow",
    markerEnd: e.markerEnd,
    markerStart: e.markerStart,
    selectable: false,
    focusable: false,
    ariaLabel: edgeAriaLabel(e, nodes),
  }));
}
