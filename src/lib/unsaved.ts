import type { Edge, Node } from "@xyflow/react";
import { getEdgeData } from "./edges";
import type {
  DesignNodeData,
  FeatureBlock,
  FunctionalRequirement,
  NonFunctionalRequirements,
} from "./types";

/** The parts of the store that replacing the canvas would lose. */
export type ReplaceableState = {
  nodes: Node<DesignNodeData>[];
  edges: Edge[];
  features: FeatureBlock[];
  functionalReqs: FunctionalRequirement[];
  nfr: NonFunctionalRequirements;
};

/**
 * What the design looked like, as two strings: the canvas (nodes, edges, placements)
 * and everything else (requirements, feature numbers, targets). Selection, measured
 * sizes, edge ids and handles, and sub-pixel moves are left out.
 */
export type Fingerprint = { canvas: string; rest: string };

export function fingerprint(s: ReplaceableState): Fingerprint {
  const nodes = s.nodes
    .map((n) => ({
      id: n.id,
      kind: n.data.componentKind,
      label: n.data.label,
      purpose: n.data.purpose,
      config: n.data.config,
      at: [Math.round(n.position.x), Math.round(n.position.y)],
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const edges = s.edges
    .map((e) => {
      const { protocol, label } = getEdgeData(e);
      return `${e.source}->${e.target}:${protocol}:${label ?? ""}`;
    })
    .sort();
  const placements = s.features.map((f) => [f.id, f.placedOnNodeId]);
  // Placements are canvas; JSON drops the undefined field.
  const features = s.features.map((f) => ({ ...f, placedOnNodeId: undefined }));
  return {
    canvas: JSON.stringify({ nodes, edges, placements }),
    rest: JSON.stringify({ reqs: s.functionalReqs, features, nfr: s.nfr }),
  };
}

/** True when replacing the canvas would lose something the student did. */
export function hasUnsavedWork(s: ReplaceableState, baseline: Fingerprint): boolean {
  const now = fingerprint(s);
  // An empty canvas has nothing to lose, even if it differs from what was loaded.
  return (s.nodes.length > 0 && now.canvas !== baseline.canvas) || now.rest !== baseline.rest;
}
