import { describe, expect, it } from "vitest";
import { isClientKind, isComputeKind } from "@/lib/catalog";
import { exportDesignFile } from "@/lib/challenges/design-file";
import { CONFIG_ENUMS, CONFIG_RANGES, generateDesign, type GeneratedDesign } from "./gen-designs";

// SPEC-stress-harness.md, Task 1: the generator itself. Every stress test trusts these
// properties, so they're checked over many seeds, not one.

const SEEDS = Array.from({ length: 500 }, (_, i) => i + 1);
/** The loops over every seed take several seconds while the rest of the suite runs alongside. */
const SLOW = 30_000;

const designs = {
  random: SEEDS.map((seed) => generateDesign({ seed, shape: "random" })),
  app: SEEDS.map((seed) => generateDesign({ seed, shape: "app" })),
};
const all: GeneratedDesign[] = [...designs.random, ...designs.app];

/** A node's config as flat `field` / `nested.field` keys. */
function flatConfig(config: Record<string, unknown>, prefix = ""): [string, unknown][] {
  return Object.entries(config).flatMap(([key, value]) =>
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? flatConfig(value as Record<string, unknown>, `${prefix}${key}.`)
      : [[`${prefix}${key}`, value] as [string, unknown]],
  );
}

describe("the same seed gives the same design", () => {
  it.each(["random", "app"] as const)("%s", (shape) => {
    expect(generateDesign({ seed: 42, shape })).toEqual(generateDesign({ seed: 42, shape }));
    expect(generateDesign({ seed: 42, shape, nodes: 60 })).toEqual(generateDesign({ seed: 42, shape, nodes: 60 }));
  });

  it.each(["random", "app"] as const)("%s: different seeds give different designs", (shape) => {
    expect(generateDesign({ seed: 1, shape }).compact).not.toEqual(generateDesign({ seed: 2, shape }).compact);
  });
});

describe("every config value is in range", () => {
  it("over 500 seeds of each shape", () => {
    for (const d of all) {
      for (const node of d.compact.nodes) {
        const ranges = CONFIG_RANGES[node.kind] ?? {};
        const enums = CONFIG_ENUMS[node.kind] ?? {};
        for (const [field, value] of flatConfig(node.config)) {
          const where = `${d.description}: ${node.id}.${field} = ${String(value)}`;
          if (field in enums) {
            expect(enums[field], where).toContain(value);
            continue;
          }
          const range = ranges[field];
          expect(range, `${where} has no range`).toBeDefined();
          expect(typeof value, where).toBe("number");
          const n = value as number;
          expect(n, where).toBeGreaterThanOrEqual(range.min);
          expect(n, where).toBeLessThanOrEqual(range.max);
          const steps = (n - range.min) / range.step;
          expect(Math.abs(steps - Math.round(steps)), where).toBeLessThan(1e-9);
        }
      }
    }
  }, SLOW);
});

describe("edges and placements", () => {
  it("has no self-loops and at most one edge per pair of nodes", () => {
    for (const d of all) {
      const pairs = new Set<string>();
      for (const e of d.compact.edges) {
        expect(e.source, d.description).not.toBe(e.target);
        const pair = [e.source, e.target].sort().join("|");
        expect(pairs.has(pair), `${d.description}: two edges between ${pair}`).toBe(false);
        pairs.add(pair);
      }
    }
  });

  it("places features only on compute nodes", () => {
    for (const d of all) {
      const kindOf = new Map(d.compact.nodes.map((n) => [n.id, n.kind]));
      for (const nodeId of Object.values(d.compact.placements)) {
        expect(isComputeKind(kindOf.get(nodeId) ?? ""), `${d.description}: placed on ${nodeId}`).toBe(true);
      }
    }
  });

  it("keeps the built design and the compact one in step", () => {
    for (const d of all) {
      expect(d.nodes.map((n) => n.id)).toEqual(d.compact.nodes.map((n) => n.id));
      expect(d.edges).toHaveLength(d.compact.edges.length);
      expect(d.functionalReqs.map((r) => r.featureId)).toEqual(d.features.map((f) => f.id));
    }
  });
});

describe("every generated design exports", () => {
  it("over 500 seeds of each shape", () => {
    for (const d of all) {
      const file = exportDesignFile({ ...d, challenge: null });
      expect("error" in file ? file.error : "", d.description).toBe("");
    }
  }, SLOW);

  it("at ladder sizes", () => {
    for (const shape of ["random", "app"] as const) {
      for (const nodes of [25, 50, 100, 200]) {
        const d = generateDesign({ seed: 1, shape, nodes });
        const file = exportDesignFile({ ...d, challenge: null });
        expect("error" in file ? file.error : "", d.description).toBe("");
      }
    }
  }, SLOW);
});

describe("shapes", () => {
  it("random: 2–14 nodes, at least one client and one compute", () => {
    for (const d of designs.random) {
      const kinds = d.compact.nodes.map((n) => n.kind);
      expect(kinds.length).toBeGreaterThanOrEqual(2);
      expect(kinds.length).toBeLessThanOrEqual(14);
      expect(kinds.some(isClientKind), d.description).toBe(true);
      expect(kinds.some(isComputeKind), d.description).toBe(true);
    }
  });

  it("random: covers every kind and both ends of the size range across seeds", () => {
    const kinds = new Set(designs.random.flatMap((d) => d.compact.nodes.map((n) => n.kind)));
    expect(kinds.size).toBe(16);
    const sizes = designs.random.map((d) => d.compact.nodes.length);
    expect(Math.min(...sizes)).toBe(2);
    expect(Math.max(...sizes)).toBe(14);
  });

  it("app: 5–30 nodes by default, with clients, a load balancer, compute and a database", () => {
    for (const d of designs.app) {
      const kinds = d.compact.nodes.map((n) => n.kind);
      expect(kinds.length, d.description).toBeGreaterThanOrEqual(5);
      expect(kinds.length, d.description).toBeLessThanOrEqual(30);
      expect(kinds.some(isClientKind)).toBe(true);
      expect(kinds).toContain("load_balancer");
      expect(kinds.some(isComputeKind)).toBe(true);
      expect(kinds).toContain("database");
      expect(Object.keys(d.compact.placements)).toHaveLength(d.features.length);
    }
  });

  it("app: reaches the asked size within 3 nodes", () => {
    for (const nodes of [5, 25, 50, 100, 200]) {
      for (const seed of [1, 2, 3]) {
        const size = generateDesign({ seed, shape: "app", nodes }).compact.nodes.length;
        expect(Math.abs(size - nodes), `app seed ${seed}, asked ${nodes}, got ${size}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it("random: has exactly the asked size", () => {
    expect(generateDesign({ seed: 1, shape: "random", nodes: 200 }).compact.nodes).toHaveLength(200);
  });

  it("stacked 3 × 4: a client, three fully connected layers of load balancers, a VM and a database", () => {
    const d = generateDesign({ shape: "stacked", layers: 3, width: 4 });
    expect(d.compact.nodes).toHaveLength(1 + 12 + 2);
    // client → layer 1, layer 1 → 2, layer 2 → 3, layer 3 → VM, VM → database
    expect(d.compact.edges).toHaveLength(4 + 16 + 16 + 4 + 1);
    expect(d.compact.nodes.filter((n) => n.kind === "load_balancer")).toHaveLength(12);
    expect(d.description).toBe("stacked 3 × 4, 15 nodes");
  });

  it("describes each design so a failure can name it", () => {
    expect(generateDesign({ seed: 7, shape: "random" }).description).toMatch(/^random seed 7, \d+ nodes$/);
    expect(generateDesign({ seed: 7, shape: "app", nodes: 50 }).description).toMatch(/^app seed 7, \d+ nodes$/);
  });
});
