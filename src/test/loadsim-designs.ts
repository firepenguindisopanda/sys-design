import path from "node:path";
import { buildCompactDesign, buildDesign, type BuiltDesign } from "@/lib/challenges/design";
import { loadChallenges } from "@/lib/challenges/load";
import type { Brief, BriefFeature, BriefRequirement, CompactDesign } from "@/lib/challenges/types";
import { featureLoads } from "@/lib/loadsim/scenario";
import { simulateLoad } from "@/lib/loadsim/model";
import type { FeatureLoads, LoadRun, Scenario } from "@/lib/loadsim/types";
import type { ComponentKind, EdgeProtocol } from "@/lib/types";

// Designs for the load simulation tests: the real briefs and fixtures, plus a small
// builder for hand-made designs written the way fixtures are.

export const challenges = loadChallenges(path.resolve(__dirname, "../../challenges"));
export const briefs = challenges.map((c) => c.brief);

export function briefById(id: string): Brief {
  const brief = briefs.find((b) => b.id === id);
  if (!brief) throw new Error(`no brief ${id}`);
  return brief;
}

/** A brief's fixture, built as the store would hold it. */
export function fixtureDesign(briefId: string, fixtureName: string): BuiltDesign & { brief: Brief } {
  const challenge = challenges.find((c) => c.brief.id === briefId);
  const fixture = challenge?.fixtures.find((f) => f.name === fixtureName);
  if (!challenge || !fixture) throw new Error(`no fixture ${briefId}/${fixtureName}`);
  return { brief: challenge.brief, ...buildDesign(challenge.brief, fixture) };
}

export function requirement(
  id: string,
  feature: Partial<BriefFeature> & Pick<BriefFeature, "targetRpm" | "computeMsPerRequest">,
): BriefRequirement {
  return {
    id,
    text: id,
    feature: {
      name: id,
      description: "",
      resources: { memoryGb: 0.5, vcpus: 0.5, storageGb: 1 },
      ...feature,
    },
  };
}

type NodeSpec = [id: string, kind: ComponentKind, config?: Record<string, unknown>, label?: string];

/** A hand-made design. Edges are written as in fixtures: "a -> b : http". */
export function design(
  reqs: BriefRequirement[],
  nodes: NodeSpec[],
  edges: string[],
  placements: Record<string, string>,
): BuiltDesign {
  const compact: CompactDesign = {
    nodes: nodes.map(([id, kind, config, label]) => ({
      id,
      kind,
      label: label ?? null,
      purpose: null,
      position: null,
      config: config ?? {},
    })),
    edges: edges.map((text) => {
      const m = /^(\S+)\s*->\s*(\S+)\s*:\s*(\w+)$/.exec(text);
      if (!m) throw new Error(`bad edge ${text}`);
      return { id: `${m[1]}->${m[2]}`, source: m[1], target: m[2], protocol: m[3] as EdgeProtocol };
    }),
    placements,
  };
  const nfr = { maxLatencyMs: 100, minThroughputRpm: 0, minAvailabilityPct: 99, maxMonthlyCostUsd: null };
  return buildCompactDesign(reqs, nfr, compact);
}

/** Run a built design; loads default to the brief's (or the sandbox defaults). */
export function runDesign(
  built: Pick<BuiltDesign, "nodes" | "edges" | "features">,
  scenario: Scenario,
  opts: { brief?: Brief | null; loads?: FeatureLoads } = {},
): LoadRun {
  return simulateLoad({
    nodes: built.nodes,
    edges: built.edges,
    features: built.features,
    scenario,
    loads: opts.loads ?? featureLoads(built.features, opts.brief ?? null),
  });
}
