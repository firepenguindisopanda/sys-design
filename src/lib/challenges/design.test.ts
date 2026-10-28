import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CAPACITIES } from "@/lib/catalog";
import { createStyledEdge, getEdgeData } from "@/lib/edges";
import { buildDesign, compactDesign } from "./design";
import { loadChallenges } from "./load";
import type { Brief, CompactDesign, Fixture } from "./types";

const brief: Brief = {
  id: "demo",
  title: "Demo",
  tagline: "Demo",
  source: "Test",
  summary: "Demo",
  outOfScope: [],
  functionalRequirements: [
    {
      id: "read",
      text: "Read things.",
      feature: {
        name: "Read",
        description: "",
        resources: { memoryGb: 1, vcpus: 1, storageGb: 1 },
        targetRpm: 500,
        computeMsPerRequest: 20,
      },
    },
    {
      id: "write",
      text: "Write things.",
      feature: {
        name: "Write",
        description: "Writes",
        resources: { memoryGb: 0.5, vcpus: 0.5, storageGb: 2 },
        targetRpm: 50,
        computeMsPerRequest: 40,
      },
    },
  ],
  nfr: { maxLatencyMs: 200, minThroughputRpm: 500, minAvailabilityPct: 99.9, maxMonthlyCostUsd: null },
  rules: [],
  reflection: [],
};

const fixture: Fixture = {
  name: "good",
  description: "Test",
  design: {
    nodes: [
      { id: "phone", kind: "mobile", label: "Student phone", purpose: null, position: null, config: {} },
      {
        id: "api",
        kind: "vm",
        label: null,
        purpose: "Serves reads and writes",
        position: { x: 300, y: 80 },
        config: { capacity: { vcpus: 8 } },
      },
      { id: "db", kind: "database", label: null, purpose: null, position: null, config: { replicas: 2 } },
    ],
    edges: [
      { id: "phone->api", source: "phone", target: "api", protocol: "websocket" },
      { id: "api->db", source: "api", target: "db", protocol: "db" },
    ],
    placements: { read: "api" },
  },
  expect: { pass: true, fails: [], warns: [] },
  knownGap: null,
};

describe("buildDesign", () => {
  const built = buildDesign(brief, fixture);

  it("applies catalog defaults and merges overrides", () => {
    const db = built.nodes.find((n) => n.id === "db")!;
    expect(db.data.config).toMatchObject({ kind: "database", replicas: 2, shards: 1, storageGb: 50 });
    const api = built.nodes.find((n) => n.id === "api")!;
    expect(api.data.config).toMatchObject({
      kind: "vm",
      capacity: { ...DEFAULT_CAPACITIES.vm, vcpus: 8 },
    });
  });

  it("does not mutate the catalog defaults", () => {
    buildDesign(brief, fixture);
    expect(DEFAULT_CAPACITIES.vm.vcpus).toBe(4);
    const again = buildDesign(brief, { ...fixture, design: { ...fixture.design, nodes: [
      { id: "api", kind: "vm", label: null, purpose: null, position: null, config: {} },
    ] } });
    expect(again.nodes[0].data.config).toMatchObject({ capacity: DEFAULT_CAPACITIES.vm });
  });

  it("uses the fixture label, or the catalog label", () => {
    expect(built.nodes[0].data.label).toBe("Student phone");
    expect(built.nodes[2].data.label).toBe("Database");
    expect(built.nodes[0].data.componentKind).toBe("mobile");
  });

  it("uses the fixture position and purpose, or the grid and the catalog purpose", () => {
    const [phone, api, db] = built.nodes;
    expect(api.position).toEqual({ x: 300, y: 80 });
    expect(api.data.purpose).toBe("Serves reads and writes");
    // Grid slot is the node's index: phone 0, db 2.
    expect(phone.position).toEqual({ x: 0, y: 0 });
    expect(db.position).toEqual({ x: 440, y: 0 });
    expect(db.data.purpose).toBe("Persistent data store");
  });

  it("builds edges with stable ids and the given protocol", () => {
    expect(built.edges.map((e) => e.id)).toEqual(["phone->api", "api->db"]);
    expect(built.edges.map((e) => getEdgeData(e).protocol)).toEqual(["websocket", "db"]);
  });

  it("creates one feature per requirement with its placement", () => {
    expect(built.features).toEqual([
      expect.objectContaining({ id: "read", targetRpm: 500, computeMsPerRequest: 20, placedOnNodeId: "api" }),
      expect.objectContaining({ id: "write", description: "Writes", placedOnNodeId: null }),
    ]);
    expect(built.nfr).toEqual(brief.nfr);
  });

  it("copies background work and polling only when the brief sets them", () => {
    const marked: Brief = {
      ...brief,
      functionalRequirements: [
        {
          ...brief.functionalRequirements[0],
          feature: { ...brief.functionalRequirements[0].feature, backgroundWorkMs: 3000, pollingRpm: 2400 },
        },
        brief.functionalRequirements[1],
      ],
    };
    const [read, write] = buildDesign(marked, fixture).features;
    expect(read).toMatchObject({ backgroundWorkMs: 3000, pollingRpm: 2400 });
    expect(write).not.toHaveProperty("backgroundWorkMs");
    expect(write).not.toHaveProperty("pollingRpm");
  });
});

function compactOrThrow(...args: Parameters<typeof compactDesign>): CompactDesign {
  const result = compactDesign(...args);
  if ("problems" in result) throw new Error(result.problems.join("; "));
  return result.design;
}

describe("compactDesign", () => {
  const built = buildDesign(brief, fixture);
  const challenges = loadChallenges(path.resolve(__dirname, "../../../challenges"));
  const all = challenges.flatMap((c) => c.fixtures.map((f) => ({ brief: c.brief, fixture: f })));

  it.each(all.map((x) => [`${x.brief.id}/${x.fixture.name}`, x] as const))(
    "undoes buildDesign for %s",
    (_, { brief: b, fixture: f }) => {
      const built = buildDesign(b, f);
      const compact = compactOrThrow(built.nodes, built.edges, built.features);
      expect(compact.nodes.map((n) => n.id)).toEqual(f.design.nodes.map((n) => n.id));
      expect(compact.edges).toEqual(f.design.edges);
      expect(compact.placements).toEqual(f.design.placements);
      expect(buildDesign(b, { ...f, design: compact })).toEqual(built);
    },
  );

  it("keeps only config fields that differ from the defaults, nested too", () => {
    const compact = compactOrThrow(built.nodes, built.edges, built.features);
    expect(compact.nodes.map((n) => n.config)).toEqual([
      {},
      { capacity: { vcpus: 8 } },
      { replicas: 2 },
    ]);
  });

  it("omits labels and purposes equal to the catalog's or empty", () => {
    const nodes = built.nodes.map((n) => ({ ...n, data: { ...n.data } }));
    nodes[1].data.label = "";
    nodes[2].data.purpose = "";
    const compact = compactOrThrow(nodes, built.edges, built.features);
    expect(compact.nodes.map((n) => [n.label, n.purpose])).toEqual([
      ["Student phone", null],
      [null, "Serves reads and writes"],
      [null, null],
    ]);
  });

  it("rounds positions to whole pixels", () => {
    const nodes = built.nodes.map((n) => ({ ...n, position: { x: n.position.x + 0.6, y: -12.4 } }));
    expect(compactOrThrow(nodes, built.edges, built.features).nodes[0].position).toEqual({ x: 1, y: -12 });
  });

  it("turns canvas ids into kebab-case and renames edges and placements to match", () => {
    const rename = (id: string) => (id === "api" ? "load_balancer-3" : id === "db" ? "load-balancer-3" : id);
    const nodes = built.nodes.map((n) => ({ ...n, id: rename(n.id) }));
    const edges = built.edges.map((e) =>
      createStyledEdge({ id: `e-${e.id}`, source: rename(e.source), target: rename(e.target) }, getEdgeData(e).protocol),
    );
    const features = built.features.map((f) => ({
      ...f,
      placedOnNodeId: f.placedOnNodeId && rename(f.placedOnNodeId),
    }));
    const compact = compactOrThrow(nodes, edges, features);
    // load-balancer-3 is already valid and keeps its id; the other one has to move.
    expect(compact.nodes.map((n) => n.id)).toEqual(["phone", "load-balancer-3-2", "load-balancer-3"]);
    expect(compact.edges.map((e) => e.id)).toEqual(["phone->load-balancer-3-2", "load-balancer-3-2->load-balancer-3"]);
    expect(compact.placements).toEqual({ read: "load-balancer-3-2" });
  });

  it("reports two connections between the same nodes by label", () => {
    const edges = [...built.edges, createStyledEdge({ id: "dup", source: "api", target: "db" }, "http")];
    expect(compactDesign(built.nodes, edges, built.features)).toEqual({
      problems: ["Two connections go from Virtual Machine to Database; delete one, then export."],
    });
  });
});
