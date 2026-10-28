import type { Edge } from "@xyflow/react";
import { Document, isMap, isSeq, parse } from "yaml";
import type { SimNode } from "@/lib/store";
import type { FeatureBlock, FunctionalRequirement, NonFunctionalRequirements } from "@/lib/types";
import { buildCompactDesign, compactDesign, optionalWorkload, type BuiltDesign } from "./design";
import type { Brief, BriefRequirement, CompactDesign } from "./types";
import { validateDesignFile } from "./validate";

/** The parts of the store a design file is made from. */
export type DesignState = {
  nodes: SimNode[];
  edges: Edge[];
  features: FeatureBlock[];
  functionalReqs: FunctionalRequirement[];
  nfr: NonFunctionalRequirements;
  challenge: Brief | null;
};

/** A validated, built design file, ready for the store. */
export type LoadedDesign = BuiltDesign & {
  /** The challenge to be in; null for the sandbox */
  brief: Brief | null;
  functionalReqs: FunctionalRequirement[];
};

/** Sandbox requirements in the brief's format; feature ids become requirement ids. */
function sandboxRequirements(state: DesignState): BriefRequirement[] {
  return state.functionalReqs.flatMap((req) => {
    const f = state.features.find((x) => x.id === req.featureId);
    if (!f) return [];
    return [
      {
        id: f.id,
        text: req.text,
        feature: {
          name: f.name,
          description: f.description,
          resources: { ...f.resources },
          targetRpm: f.targetRpm,
          computeMsPerRequest: f.computeMsPerRequest,
          ...optionalWorkload(f),
        },
      },
    ];
  });
}

/** Plain objects in the order and shape fixtures are written in. */
function toYamlObject(state: DesignState, design: CompactDesign) {
  const nodes = design.nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    ...(n.label ? { label: n.label } : {}),
    ...(n.purpose ? { purpose: n.purpose } : {}),
    ...(n.position ? { at: [n.position.x, n.position.y] } : {}),
    ...(Object.keys(n.config).length > 0 ? { config: n.config } : {}),
  }));
  // A one-key mapping writes as `- a -> b: http`, which the validator reads like the
  // unquoted fixture shorthand.
  const edges = design.edges.map((e) => ({ [`${e.source} -> ${e.target}`]: e.protocol }));
  const body = { design: { nodes, edges, placements: design.placements } };
  if (state.challenge) return { challenge: state.challenge.id, ...body };
  return {
    functionalRequirements: sandboxRequirements(state).map((fr) => ({
      ...fr,
      feature: {
        name: fr.feature.name,
        // The validator reads a missing description as "", but not an empty one.
        ...(fr.feature.description ? { description: fr.feature.description } : {}),
        resources: fr.feature.resources,
        targetRpm: fr.feature.targetRpm,
        computeMsPerRequest: fr.feature.computeMsPerRequest,
        ...optionalWorkload(fr.feature),
      },
    })),
    nfr: state.nfr,
    ...body,
  };
}

function stringify(value: object): string {
  const doc = new Document(value);
  doc.commentBefore = " Sesim design. Open it with Import on the canvas toolbar.";
  const design = doc.get("design");
  // Nodes and resources on one line each, like the hand-written fixtures.
  if (isMap(design)) {
    const nodes = design.get("nodes");
    if (isSeq(nodes)) for (const n of nodes.items) if (isMap(n)) n.flow = true;
  }
  const frs = doc.get("functionalRequirements");
  if (isSeq(frs)) {
    for (const fr of frs.items) {
      const resources = isMap(fr) ? fr.getIn(["feature", "resources"], true) : null;
      if (isMap(resources)) resources.flow = true;
    }
  }
  return doc.toString({ lineWidth: 0 });
}

/**
 * Write the canvas as a design file. The text is validated before it's returned, so
 * Export never produces a file Import would reject.
 */
export function exportDesignFile(state: DesignState): { text: string; fileName: string } | { error: string } {
  const fileName = `${state.challenge?.id ?? "sandbox"}-design.yaml`;
  const compact = compactDesign(state.nodes, state.edges, state.features);
  if ("problems" in compact) return { error: compact.problems.join(" ") };
  const text = stringify(toYamlObject(state, compact.design));
  const check = importDesignFile(
    text,
    fileName,
    state.challenge ? [state.challenge] : [],
    state.challenge?.id ?? null,
  );
  return "error" in check ? check : { text, fileName };
}

/** Read a design file (or a fixture) and build it, or say what's wrong with it. */
export function importDesignFile(
  text: string,
  fileName: string,
  briefs: Brief[],
  currentBriefId: string | null,
): { loaded: LoadedDesign } | { error: string } {
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (e) {
    return { error: `${fileName}: ${(e as Error).message}` };
  }
  try {
    const file = validateDesignFile(raw, briefs, currentBriefId, fileName);
    return {
      loaded: {
        ...buildCompactDesign(file.functionalRequirements, file.nfr, file.design),
        brief: file.brief,
        functionalReqs: file.functionalRequirements.map((fr) => ({
          id: `freq-${fr.id}`,
          text: fr.text,
          featureId: fr.id,
        })),
      },
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
