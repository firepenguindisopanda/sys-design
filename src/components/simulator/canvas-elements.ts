import type { Edge } from "@xyflow/react";
import { edgeAriaLabelFrom, nodeAriaLabel } from "./flow-labels";
import type { SimNode } from "@/lib/store";

// What FlowCanvas hands to React Flow: store nodes and edges plus screen-reader names,
// selection and the `still` class. Outputs are cached so an element whose inputs didn't
// change stays the same object and React Flow's per-element memo skips it
// (SPEC-canvas-render-scale.md, fix 3: a drag changed one node but re-rendered all 395
// edges). Nothing here reaches the store.

type NodeEntry = { source: SimNode; selected: boolean; out: SimNode };
type EdgeEntry = {
  source: Edge;
  from: string;
  to: string;
  selected: boolean;
  still: boolean;
  out: Edge;
};

export type ElementCache = {
  nodes: Map<string, NodeEntry>;
  edges: Map<string, EdgeEntry>;
  /** The last edge list handed out, kept while every edge in it is unchanged. */
  edgeList: Edge[];
};

export const createElementCache = (): ElementCache => ({ nodes: new Map(), edges: new Map(), edgeList: [] });

/** `next` if anything differs from `previous`, else `previous`, so the list keeps its identity. */
function sameList<T>(previous: T[], next: T[]): T[] {
  return previous.length === next.length && next.every((item, i) => item === previous[i]) ? previous : next;
}

/**
 * `still` adds the `still` class to animated edges (globals.css stops their motion and
 * keeps the dashes). The cache is replaced by this call's entries, so deleted elements
 * don't linger.
 */
export function canvasElements(
  cache: ElementCache,
  nodes: SimNode[],
  edges: Edge[],
  selectedNodeId: string | null,
  selectedEdgeId: string | null,
  still: boolean,
): { nodes: SimNode[]; edges: Edge[] } {
  const labels = new Map<string, string>();
  for (const n of nodes) labels.set(n.id, n.data.label);

  const nextNodes = new Map<string, NodeEntry>();
  const outNodes = nodes.map((n) => {
    const selected = n.id === selectedNodeId;
    const prev = cache.nodes.get(n.id);
    const entry: NodeEntry =
      prev && prev.source === n && prev.selected === selected
        ? prev
        : { source: n, selected, out: { ...n, ariaLabel: nodeAriaLabel(n), selected } as SimNode };
    nextNodes.set(n.id, entry);
    return entry.out;
  });

  const nextEdges = new Map<string, EdgeEntry>();
  const outEdges = edges.map((e) => {
    const selected = e.id === selectedEdgeId;
    const from = labels.get(e.source) ?? e.source;
    const to = labels.get(e.target) ?? e.target;
    const prev = cache.edges.get(e.id);
    const entry: EdgeEntry =
      prev &&
      prev.source === e &&
      prev.from === from &&
      prev.to === to &&
      prev.selected === selected &&
      prev.still === still
        ? prev
        : {
            source: e,
            from,
            to,
            selected,
            still,
            out: {
              ...e,
              ...(still && e.animated ? { className: e.className ? `${e.className} still` : "still" } : {}),
              ariaLabel: edgeAriaLabelFrom(e, labels),
              selected,
              style: {
                stroke: selected ? "#0f766e" : "#64748b",
                strokeWidth: selected ? 2.5 : 1.5,
              },
            } as Edge,
          };
    nextEdges.set(e.id, entry);
    return entry.out;
  });

  cache.nodes = nextNodes;
  cache.edges = nextEdges;
  // A drag changes nodes only. Handing React Flow the same edge list then spares it
  // re-processing every edge on each move; a new list, even of the same edges, doesn't.
  cache.edgeList = sameList(cache.edgeList, outEdges);
  return { nodes: outNodes, edges: cache.edgeList };
}
