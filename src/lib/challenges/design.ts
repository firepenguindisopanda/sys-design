import type { Edge, Node } from "@xyflow/react";
import { COMPONENT_CATALOG } from "@/lib/catalog";
import { createStyledEdge, getEdgeData } from "@/lib/edges";
import type {
  ComponentKind,
  DesignNodeData,
  FeatureBlock,
  NodeConfig,
  NonFunctionalRequirements,
} from "@/lib/types";
import type {
  Brief,
  BriefRequirement,
  CompactDesign,
  CompactEdge,
  CompactNode,
  Fixture,
} from "./types";

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

/** The purpose a new node of this kind starts with (same as the store's createNode). */
function catalogPurpose(kind: ComponentKind): string {
  const item = COMPONENT_CATALOG.find((c) => c.kind === kind)!;
  return item.description.split(".")[0] ?? item.label;
}

function buildNode(node: CompactNode, index: number): SimNode {
  const item = COMPONENT_CATALOG.find((c) => c.kind === node.kind)!;
  return {
    id: node.id,
    type: "designNode",
    // Nodes without a saved position go on a simple grid.
    position: node.position ?? { x: (index % 4) * 220, y: Math.floor(index / 4) * 140 },
    data: {
      label: node.label ?? item.label,
      componentKind: node.kind,
      purpose: node.purpose ?? catalogPurpose(node.kind),
      config: mergeConfig(structuredClone(item.defaultConfig) as Obj, node.config) as NodeConfig,
    },
  };
}

/** Turn a validated fixture into the inputs runVerification takes. */
export function buildDesign(brief: Brief, fixture: Fixture): BuiltDesign {
  return buildCompactDesign(brief.functionalRequirements, brief.nfr, fixture.design);
}

/** Same as buildDesign, for requirements and targets that may not come from a brief. */
export function buildCompactDesign(
  functionalRequirements: BriefRequirement[],
  nfr: NonFunctionalRequirements,
  design: CompactDesign,
): BuiltDesign {
  return {
    nodes: design.nodes.map(buildNode),
    edges: design.edges.map((e) =>
      createStyledEdge({ id: e.id, source: e.source, target: e.target }, e.protocol),
    ),
    features: functionalRequirements.map((fr) => ({
      id: fr.id,
      name: fr.feature.name,
      description: fr.feature.description,
      resources: { ...fr.feature.resources },
      targetRpm: fr.feature.targetRpm,
      computeMsPerRequest: fr.feature.computeMsPerRequest,
      placedOnNodeId: design.placements[fr.id] ?? null,
    })),
    nfr: { ...nfr },
  };
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Fields of `config` that differ from `base`, recursing into nested mappings; never `kind`. */
function configDiff(config: Obj, base: Obj): Obj {
  const out: Obj = {};
  for (const [key, value] of Object.entries(config)) {
    if (key === "kind") continue;
    if (isObj(value) && isObj(base[key])) {
      const nested = configDiff(value, base[key]);
      if (Object.keys(nested).length > 0) out[key] = nested;
    } else if (value !== base[key]) {
      out[key] = value;
    }
  }
  return out;
}

/** Valid, unique ids stay; others become kebab-case, with -2, -3… on clashes. */
function compactIds(ids: string[]): Map<string, string> {
  const taken = new Set(ids.filter((id, i) => SLUG.test(id) && ids.indexOf(id) === i));
  const out = new Map<string, string>();
  ids.forEach((id, i) => {
    if (taken.has(id) && ids.indexOf(id) === i) {
      out.set(id, id);
      return;
    }
    const base =
      id
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "node";
    let next = base;
    for (let n = 2; taken.has(next) || !SLUG.test(next); n++) next = `${base}-${n}`;
    taken.add(next);
    out.set(id, next);
  });
  return out;
}

/**
 * The inverse of buildDesign: canvas state → compact design, as written in fixtures.
 * Returns problems instead when the canvas can't be written in that format.
 */
export function compactDesign(
  nodes: SimNode[],
  edges: Edge[],
  features: FeatureBlock[],
): { design: CompactDesign } | { problems: string[] } {
  const ids = compactIds(nodes.map((n) => n.id));
  const labelOf = new Map(nodes.map((n) => [n.id, n.data.label || n.id]));

  const problems: string[] = [];
  const seen = new Set<string>();
  const compactEdges: CompactEdge[] = [];
  for (const e of edges) {
    const source = ids.get(e.source)!;
    const target = ids.get(e.target)!;
    const id = `${source}->${target}`;
    if (seen.has(id)) {
      problems.push(
        `Two connections go from ${labelOf.get(e.source)} to ${labelOf.get(e.target)}; delete one, then export.`,
      );
      continue;
    }
    seen.add(id);
    compactEdges.push({ id, source, target, protocol: getEdgeData(e).protocol });
  }
  if (problems.length > 0) return { problems };

  const placements: Record<string, string> = {};
  for (const f of features) {
    if (f.placedOnNodeId && ids.has(f.placedOnNodeId)) placements[f.id] = ids.get(f.placedOnNodeId)!;
  }

  return {
    design: {
      nodes: nodes.map((n) => {
        const item = COMPONENT_CATALOG.find((c) => c.kind === n.data.componentKind)!;
        const { label, purpose } = n.data;
        return {
          id: ids.get(n.id)!,
          kind: n.data.componentKind,
          label: label && label !== item.label ? label : null,
          purpose: purpose && purpose !== catalogPurpose(n.data.componentKind) ? purpose : null,
          position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
          config: configDiff(n.data.config as Obj, item.defaultConfig as Obj),
        };
      }),
      edges: compactEdges,
      placements,
    },
  };
}
