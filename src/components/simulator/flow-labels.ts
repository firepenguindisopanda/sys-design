import type { Edge } from "@xyflow/react";
import { COMPONENT_CATALOG } from "@/lib/catalog";
import { PROTOCOL_META, getEdgeData } from "@/lib/edges";
import type { SimNode } from "@/lib/store";

// Screen-reader names for canvas nodes and edges, built from what the student sees
// rather than ids. FlowCanvas adds them when it maps for React Flow; they never reach
// the store, so Export, the unsaved-changes fingerprint and the engine don't see them.

/**
 * "<label>, <catalog label>", e.g. "Programme API, PaaS / App Platform"; just the label
 * when it already is the catalog label (a "CDN" node isn't read as "CDN, CDN").
 */
export function nodeAriaLabel(node: SimNode): string {
  const item = COMPONENT_CATALOG.find((c) => c.kind === node.data.componentKind);
  return item && item.label !== node.data.label
    ? `${node.data.label}, ${item.label}`
    : node.data.label;
}

/** "<protocol> from <source> to <target>", falling back to ids for missing nodes. */
export function edgeAriaLabel(edge: Edge, nodes: SimNode[]): string {
  const name = (id: string) => nodes.find((n) => n.id === id)?.data.label ?? id;
  const protocol = PROTOCOL_META[getEdgeData(edge).protocol].shortLabel;
  return `${protocol} from ${name(edge.source)} to ${name(edge.target)}`;
}
