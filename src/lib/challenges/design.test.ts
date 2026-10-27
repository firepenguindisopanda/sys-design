import { describe, expect, it } from "vitest";
import { DEFAULT_CAPACITIES } from "@/lib/catalog";
import { getEdgeData } from "@/lib/edges";
import { buildDesign } from "./design";
import type { Brief, Fixture } from "./types";

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
      { id: "phone", kind: "mobile", label: "Student phone", config: {} },
      { id: "api", kind: "vm", label: null, config: { capacity: { vcpus: 8 } } },
      { id: "db", kind: "database", label: null, config: { replicas: 2 } },
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
      { id: "api", kind: "vm", label: null, config: {} },
    ] } });
    expect(again.nodes[0].data.config).toMatchObject({ capacity: DEFAULT_CAPACITIES.vm });
  });

  it("uses the fixture label, or the catalog label", () => {
    expect(built.nodes[0].data.label).toBe("Student phone");
    expect(built.nodes[2].data.label).toBe("Database");
    expect(built.nodes[0].data.componentKind).toBe("mobile");
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
});
