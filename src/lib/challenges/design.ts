import type { Edge, Node } from "@xyflow/react";
import { COMPONENT_CATALOG } from "@/lib/catalog";
import { createStyledEdge } from "@/lib/edges";
import type {
  DesignNodeData,
  FeatureBlock,
  NodeConfig,
  NonFunctionalRequirements,
} from "@/lib/types";
import type { Brief, CompactNode, Fixture } from "./types";

type SimNode = Node<DesignNodeData>;

export type BuiltDesign = {
  nodes: SimNode[];
  edges: Edge[];
  features: FeatureBlock[];
  nfr: NonFunctionalRequirements;
};

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Overrides win; nested mappings (e.g. compute capacity) merge field by field. */
function mergeConfig(base: Obj, overrides: Obj): Obj {
  const out: Obj = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    out[key] = isObj(value) && isObj(base[key]) ? mergeConfig(base[key], value) : value;
  }
  return out;
}

function buildNode(node: CompactNode, index: number): SimNode {
  const item = COMPONENT_CATALOG.find((c) => c.kind === node.kind)!;
  return {
    id: node.id,
    type: "designNode",
    // Simple grid so a fixture could be loaded onto the canvas later.
    position: { x: (index % 4) * 220, y: Math.floor(index / 4) * 140 },
    data: {
      label: node.label ?? item.label,
      componentKind: node.kind,
      purpose: item.description.split(".")[0] ?? item.label,
      config: mergeConfig(structuredClone(item.defaultConfig) as Obj, node.config) as NodeConfig,
    },
  };
}

/** Turn a validated fixture into the inputs runVerification takes. */
export function buildDesign(brief: Brief, fixture: Fixture): BuiltDesign {
  const { design } = fixture;
  return {
    nodes: design.nodes.map(buildNode),
    edges: design.edges.map((e) =>
      createStyledEdge({ id: e.id, source: e.source, target: e.target }, e.protocol),
    ),
    features: brief.functionalRequirements.map((fr) => ({
      id: fr.id,
      name: fr.feature.name,
      description: fr.feature.description,
      resources: { ...fr.feature.resources },
      targetRpm: fr.feature.targetRpm,
      computeMsPerRequest: fr.feature.computeMsPerRequest,
      placedOnNodeId: design.placements[fr.id] ?? null,
    })),
    nfr: { ...brief.nfr },
  };
}
