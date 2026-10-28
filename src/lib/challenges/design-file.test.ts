import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runVerification } from "@/lib/simulation";
import { useSimulatorStore } from "@/lib/store";
import { buildDesign } from "./design";
import { exportDesignFile, importDesignFile, type DesignState, type LoadedDesign } from "./design-file";
import { loadChallenges } from "./load";
import { evaluateRules } from "./rules";
import type { Brief } from "./types";

const ROOT = path.resolve(__dirname, "../../../challenges");
const challenges = loadChallenges(ROOT);
const briefs = challenges.map((c) => c.brief);
const all = challenges.flatMap((c) => c.fixtures.map((f) => ({ brief: c.brief, fixture: f })));
const linkShortener = briefs.find((b) => b.id === "link-shortener")!;

function exportOrThrow(state: DesignState) {
  const result = exportDesignFile(state);
  if ("error" in result) throw new Error(result.error);
  return result;
}

function importOrThrow(text: string, current: string | null = null): LoadedDesign {
  const result = importDesignFile(text, "test.yaml", briefs, current);
  if ("error" in result) throw new Error(result.error);
  return result.loaded;
}

function importError(text: string, current: string | null = null): string {
  const result = importDesignFile(text, "test.yaml", briefs, current);
  if ("loaded" in result) throw new Error("expected importDesignFile to fail");
  return result.error;
}

/** Canvas state for a challenge, as the store would hold it after drawing a fixture. */
function challengeState(brief: Brief, built: ReturnType<typeof buildDesign>): DesignState {
  return {
    nodes: built.nodes,
    edges: built.edges,
    features: built.features,
    functionalReqs: brief.functionalRequirements.map((fr) => ({
      id: `freq-${fr.id}`,
      text: fr.text,
      featureId: fr.id,
    })),
    nfr: built.nfr,
    challenge: brief,
  };
}

function results(brief: Brief | null, d: Pick<LoadedDesign, "nodes" | "edges" | "features" | "nfr">) {
  const verification = { ...runVerification(d.nodes, d.edges, d.features, d.nfr), ranAt: 0 };
  return { verification, rules: brief ? evaluateRules(brief, d.nodes, d.edges) : null };
}

describe("export then import", () => {
  it.each(all.map((x) => [`${x.brief.id}/${x.fixture.name}`, x] as const))(
    "gives back %s with identical results",
    (_, { brief, fixture }) => {
      const built = buildDesign(brief, fixture);
      const { text, fileName } = exportOrThrow(challengeState(brief, built));
      expect(fileName).toBe(`${brief.id}-design.yaml`);

      // Imported from the sandbox: the file's `challenge` picks the brief.
      const loaded = importOrThrow(text, null);
      expect(loaded.brief).toBe(brief);
      expect(loaded.nodes).toEqual(built.nodes);
      expect(loaded.edges).toEqual(built.edges);
      expect(loaded.features).toEqual(built.features);
      expect(loaded.nfr).toEqual(brief.nfr);
      expect(results(brief, loaded)).toEqual(results(brief, built));
    },
  );

  it("is stable: export, import, export gives the same text", () => {
    const { brief, fixture } = all[0];
    const first = exportOrThrow(challengeState(brief, buildDesign(brief, fixture))).text;
    const loaded = importOrThrow(first);
    const second = exportOrThrow({ ...loaded, challenge: loaded.brief }).text;
    expect(second).toBe(first);
  });

  it("writes the fixture style: one-line nodes, arrow edges", () => {
    const good = all.find((x) => x.brief.id === "link-shortener" && x.fixture.name === "good")!;
    const { text } = exportOrThrow(challengeState(good.brief, buildDesign(good.brief, good.fixture)));
    expect(text).toContain("challenge: link-shortener\n");
    expect(text).toContain("- { id: phone, kind: mobile, label: Student phone, at: [ 0, 0 ] }");
    expect(text).toContain("- { id: db, kind: database, label: Links DB, at: [ 440, 140 ], config: { replicas: 2 } }");
    expect(text).toContain("- phone -> lb: http");
    expect(text).toContain("placements:\n    create-link: api-1\n");
  });
});

describe.each([
  ["BeUWI demo", "loadDemo"],
  ["fan-in demo", "loadFanInDemo"],
] as const)("sandbox round trip: %s", (_, load) => {
  useSimulatorStore.getState()[load]();
  const s = useSimulatorStore.getState();
  const state: DesignState = { ...s, challenge: null };
  const { text, fileName } = exportOrThrow(state);
  const loaded = importOrThrow(text, "link-shortener");

  it("loads into the sandbox with the same requirements and targets", () => {
    expect(fileName).toBe("sandbox-design.yaml");
    expect(loaded.brief).toBeNull();
    expect(loaded.functionalReqs.map((r) => [r.text, r.featureId])).toEqual(
      s.functionalReqs.map((r) => [r.text, r.featureId]),
    );
    expect(loaded.nfr).toEqual(s.nfr);
    // Placements point at renamed node ids (load_balancer-6 → load-balancer-6).
    expect(loaded.features.map((f) => ({ ...f, placedOnNodeId: null }))).toEqual(
      s.features.map((f) => ({ ...f, placedOnNodeId: null })),
    );
    const labelOf = (nodes: typeof s.nodes, id: string | null) => nodes.find((n) => n.id === id)?.data.label;
    expect(loaded.features.map((f) => labelOf(loaded.nodes, f.placedOnNodeId))).toEqual(
      s.features.map((f) => labelOf(s.nodes, f.placedOnNodeId)),
    );
  });

  it("keeps every node's kind, label, purpose, config and position", () => {
    const view = (nodes: typeof s.nodes) => nodes.map((n) => [n.data, n.position]);
    expect(view(loaded.nodes)).toEqual(view(s.nodes));
  });

  it("verifies the same; check ids differ only by the renamed node and edge ids", () => {
    const before = results(null, s).verification;
    const after = results(null, loaded).verification;
    const shape = (v: typeof before) => ({
      ...v,
      checks: v.checks.map((c) => ({ ...c, id: "" })),
    });
    expect(shape(after)).toEqual(shape(before));
  });

  it("is stable on a second round trip", () => {
    expect(exportOrThrow({ ...loaded, challenge: null }).text).toBe(text);
  });
});

describe("sandbox round trip: background work, polling and files", () => {
  useSimulatorStore.getState().loadDemo();
  const s = useSimulatorStore.getState();
  const [first, ...rest] = s.features;
  const marked: DesignState = {
    ...s,
    challenge: null,
    features: [{ ...first, backgroundWorkMs: 3000, pollingRpm: 2400, fileRpm: 1200 }, ...rest],
  };

  it("keeps all three fields through export and import", () => {
    const { text } = exportOrThrow(marked);
    expect(text).toContain("backgroundWorkMs: 3000");
    expect(text).toContain("pollingRpm: 2400");
    expect(text).toContain("fileRpm: 1200");
    const loaded = importOrThrow(text);
    expect(loaded.features[0]).toMatchObject({ backgroundWorkMs: 3000, pollingRpm: 2400, fileRpm: 1200 });
    expect(loaded.features.slice(1).some((f) => "backgroundWorkMs" in f || "pollingRpm" in f || "fileRpm" in f)).toBe(false);
  });

  it("writes none of the fields when no feature has them", () => {
    const { text } = exportOrThrow({ ...s, challenge: null });
    expect(text).not.toContain("backgroundWorkMs");
    expect(text).not.toContain("pollingRpm");
    expect(text).not.toContain("fileRpm");
  });
});

describe("importing fixture files", () => {
  it.each(all.map((x) => [`${x.brief.id}/${x.fixture.name}`, x] as const))(
    "%s imports into its own challenge as buildDesign builds it",
    (_, { brief, fixture }) => {
      const text = readFileSync(path.join(ROOT, brief.id, "fixtures", `${fixture.name}.yaml`), "utf8");
      const loaded = importOrThrow(text, brief.id);
      expect(loaded.brief).toBe(brief);
      const built = buildDesign(brief, fixture);
      expect(loaded.nodes).toEqual(built.nodes);
      expect(loaded.edges).toEqual(built.edges);
      expect(loaded.features).toEqual(built.features);
    },
  );
});

describe("import errors", () => {
  it("names the file for YAML syntax errors", () => {
    expect(importError("design: [unclosed")).toMatch(/^test\.yaml: /);
  });

  it("passes validator messages through", () => {
    expect(importError("challenge: ride-share\ndesign: { nodes: [] }")).toBe(
      'test.yaml: challenge: no challenge called "ride-share"',
    );
    const unknownNode = [
      "challenge: link-shortener",
      "design:",
      "  nodes: [{ id: api, kind: paas }]",
      "  edges: [api -> cach : db]",
    ].join("\n");
    expect(importError(unknownNode)).toBe('test.yaml: design.edges[0]: unknown node "cach"');
    const onCache = [
      "challenge: link-shortener",
      "design:",
      "  nodes: [{ id: cache, kind: cache }]",
      "  placements: { redirect: cache }",
    ].join("\n");
    expect(importError(onCache)).toContain("design.placements.redirect: \"cache\" is cache; features go on compute");
  });

  it("rejects an empty file", () => {
    expect(importError("")).toBe("test.yaml: (root): expected a mapping");
  });
});

describe("export problems", () => {
  it("refuses two connections between the same pair of nodes", () => {
    const good = all.find((x) => x.brief.id === "link-shortener" && x.fixture.name === "good")!;
    const built = buildDesign(good.brief, good.fixture);
    const state = challengeState(linkShortener, built);
    const result = exportDesignFile({ ...state, edges: [...state.edges, { ...state.edges[0], id: "dup" }] });
    expect(result).toEqual({
      error: "Two connections go from Student phone to Load Balancer; delete one, then export.",
    });
  });

  it("reports a state the format can't hold instead of writing a bad file", () => {
    useSimulatorStore.getState().loadDemo();
    const s = useSimulatorStore.getState();
    const state: DesignState = {
      ...s,
      challenge: null,
      functionalReqs: s.functionalReqs.map((r, i) => (i === 0 ? { ...r, text: "" } : r)),
    };
    expect(exportDesignFile(state)).toEqual({
      error: "sandbox-design.yaml: functionalRequirements[0].text: expected a non-empty string",
    });
  });
});
