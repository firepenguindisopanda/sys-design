import { describe, expect, it } from "vitest";
import type { DesignState } from "@/lib/challenges/design-file";
import type { Brief } from "@/lib/challenges/types";
import { getEdgeData } from "@/lib/edges";
import { useSimulatorStore, type SimNode } from "@/lib/store";
import { briefById, briefs, challenges, fixtureDesign } from "@/test/loadsim-designs";
import type { Edge } from "@xyflow/react";
import { HANDOFF_KEY, loadHandoff, saveHandoff, type HandoffStorage } from "./handoff";

function memoryStorage(): HandoffStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
}

function challengeState(brief: Brief, built: ReturnType<typeof fixtureDesign>): DesignState {
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

function loadOrThrow(storage: HandoffStorage) {
  const result = loadHandoff(storage, briefs);
  if (!("loaded" in result)) throw new Error(`expected a design, got ${JSON.stringify(result)}`);
  return result.loaded;
}

/** What the page draws and simulates, by node label so renamed ids don't matter. */
function view(d: { nodes: SimNode[]; edges: Edge[]; features: DesignState["features"] }) {
  const label = (id: string | null) => d.nodes.find((n) => n.id === id)?.data.label ?? null;
  return {
    nodes: d.nodes.map((n) => [n.data.label, n.data.componentKind, n.data.config, n.position]),
    edges: d.edges.map((e) => [label(e.source), label(e.target), getEdgeData(e).protocol]),
    placements: d.features.map((f) => [f.id, label(f.placedOnNodeId)]),
  };
}

const pilots = challenges
  .filter((c) => c.brief.id === "link-shortener" || c.brief.id === "course-registration")
  .flatMap((c) => c.fixtures.map((f) => [c.brief.id, f.name] as const));

describe("hand-off round trip", () => {
  it.each(pilots)("%s/%s comes back in its challenge with the same design", (briefId, name) => {
    const brief = briefById(briefId);
    const built = fixtureDesign(briefId, name);
    const storage = memoryStorage();
    expect(saveHandoff(challengeState(brief, built), storage)).toEqual({ ok: true });
    expect(storage.map.has(HANDOFF_KEY)).toBe(true);
    const loaded = loadOrThrow(storage);
    expect(loaded.brief?.id).toBe(briefId);
    expect(loaded.nodes.map((n) => n.id)).toEqual(built.nodes.map((n) => n.id));
    expect(view(loaded)).toEqual(view(built));
  });

  it.each(["loadDemo", "loadFanInDemo"] as const)("the %s sandbox design comes back in the sandbox", (load) => {
    useSimulatorStore.getState()[load]();
    const s = useSimulatorStore.getState();
    const storage = memoryStorage();
    expect(saveHandoff({ ...s, challenge: null }, storage)).toEqual({ ok: true });
    const loaded = loadOrThrow(storage);
    expect(loaded.brief).toBeNull();
    expect(view(loaded)).toEqual(view(s));
  });
});

describe("hand-off problems", () => {
  it("says there's nothing to load when storage is empty", () => {
    expect(loadHandoff(memoryStorage(), briefs)).toEqual({ empty: true });
  });

  it("returns a message, not an exception, for corrupt storage", () => {
    const storage = memoryStorage();
    storage.setItem(HANDOFF_KEY, "{not json");
    expect(loadHandoff(storage, briefs)).toEqual({ error: expect.any(String) });
    storage.setItem(HANDOFF_KEY, JSON.stringify({ text: "design: [", fileName: "x.yaml", briefId: null }));
    expect(loadHandoff(storage, briefs)).toEqual({ error: expect.any(String) });
    storage.setItem(HANDOFF_KEY, JSON.stringify({ unexpected: true }));
    expect(loadHandoff(storage, briefs)).toEqual({ error: expect.any(String) });
  });

  it("refuses a design Export would refuse, with Export's message, and stores nothing", () => {
    const brief = briefById("link-shortener");
    const state = challengeState(brief, fixtureDesign("link-shortener", "good"));
    const storage = memoryStorage();
    const result = saveHandoff({ ...state, edges: [...state.edges, { ...state.edges[0], id: "dup" }] }, storage);
    expect(result).toEqual({
      error: "Two connections go from Student phone to Load Balancer; delete one, then export.",
    });
    expect(storage.map.has(HANDOFF_KEY)).toBe(false);
  });
});
