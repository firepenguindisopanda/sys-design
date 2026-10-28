import { describe, expect, it } from "vitest";
import { buildDesign } from "./design";
import { evaluateRules } from "./rules";
import type { Brief, CompactDesign, ComponentRule, EdgeRule, NodeMatcher, Rule } from "./types";

function briefWith(rules: Rule[]): Brief {
  return {
    id: "demo",
    title: "Demo",
    tagline: "Demo",
    source: "Test",
    summary: "Demo",
    outOfScope: [],
    functionalRequirements: [
      {
        id: "read",
        text: "Read.",
        feature: {
          name: "Read",
          description: "",
          resources: { memoryGb: 1, vcpus: 1, storageGb: 1 },
          targetRpm: 100,
          computeMsPerRequest: 20,
        },
      },
    ],
    nfr: { maxLatencyMs: 200, minThroughputRpm: 100, minAvailabilityPct: 99, maxMonthlyCostUsd: null },
    rules,
    reflection: [],
  };
}

type EdgePatch = Omit<Partial<EdgeRule>, "from" | "to"> & {
  from?: NodeMatcher | NodeMatcher[];
  to?: NodeMatcher | NodeMatcher[];
};

function edgeRule({ from = "client", to = "compute", ...patch }: EdgePatch): EdgeRule {
  return {
    id: "r",
    title: "Rule",
    type: "edge",
    mode: "required",
    protocols: null,
    severity: "fail",
    why: "Because.",
    ...patch,
    from: Array.isArray(from) ? from : [from],
    to: Array.isArray(to) ? to : [to],
  };
}

function componentRule(patch: Partial<ComponentRule>): ComponentRule {
  return {
    id: "r",
    title: "Rule",
    type: "component",
    kind: "database",
    min: 1,
    minConfig: {},
    severity: "fail",
    why: "Because.",
    ...patch,
  };
}

// phone ↔ api over WebSocket (drawn api → phone), api → db, laptop → db (bad).
const design: CompactDesign = {
  nodes: [
    { id: "phone", kind: "mobile", label: null, purpose: null, position: null, config: {} },
    { id: "laptop", kind: "desktop", label: null, purpose: null, position: null, config: {} },
    { id: "api", kind: "functions", label: null, purpose: null, position: null, config: {} },
    { id: "db", kind: "database", label: null, purpose: null, position: null, config: { replicas: 2 } },
    { id: "db2", kind: "database", label: null, purpose: null, position: null, config: {} },
  ],
  edges: [
    { id: "api->phone", source: "api", target: "phone", protocol: "websocket" },
    { id: "api->db", source: "api", target: "db", protocol: "db" },
    { id: "laptop->db", source: "laptop", target: "db", protocol: "http" },
  ],
  placements: { read: "api" },
};

function run(rule: Rule) {
  const brief = briefWith([rule]);
  const { nodes, edges } = buildDesign(brief, {
    name: "t",
    description: "t",
    design,
    expect: { pass: true, fails: [], warns: [] },
    knownGap: null,
  });
  return evaluateRules(brief, nodes, edges)[0];
}

describe("evaluateRules: edge rules", () => {
  it("required edge passes when a matching edge exists", () => {
    expect(run(edgeRule({ from: "compute", to: "database" }))).toMatchObject({
      id: "r",
      status: "pass",
      detail: "Has compute → database (api->db).",
    });
  });

  it("required edge fails with the rule's severity", () => {
    expect(run(edgeRule({ from: "compute", to: "cache" })).status).toBe("fail");
    const warned = run(edgeRule({ from: "compute", to: "cache", severity: "warn" }));
    expect(warned.status).toBe("warn");
    expect(warned.detail).toBe("Because. Needs a compute → cache connection.");
  });

  it("matches bidirectional protocols in either direction", () => {
    expect(run(edgeRule({ from: "client", to: "compute", protocols: ["websocket"] })).status).toBe("pass");
  });

  it("does not reverse directed protocols", () => {
    expect(run(edgeRule({ from: "database", to: "compute" })).status).toBe("fail");
  });

  it("filters by protocol", () => {
    expect(run(edgeRule({ from: "client", to: "compute", protocols: ["http"] })).status).toBe("fail");
    expect(run(edgeRule({ from: "client", to: "database", protocols: ["http", "db"] })).status).toBe("pass");
  });

  it("uses groups and concrete kinds", () => {
    expect(run(edgeRule({ from: "desktop", to: "database" })).status).toBe("pass");
    expect(run(edgeRule({ from: "mobile", to: "database" })).status).toBe("fail");
    expect(run(edgeRule({ from: "functions", to: "client" })).status).toBe("pass");
  });

  it("matches any of several kinds on either end", () => {
    expect(run(edgeRule({ from: "client", to: ["cache", "database"] })).status).toBe("pass");
    expect(run(edgeRule({ from: ["iot", "desktop"], to: "database" }))).toMatchObject({
      status: "pass",
      detail: "Has iot or desktop → database (laptop->db).",
    });
    expect(run(edgeRule({ from: ["iot", "mobile"], to: "database" })).status).toBe("fail");
  });

  it("forbidden edge fails and names the offending edges", () => {
    const result = run(edgeRule({ mode: "forbidden", from: "client", to: "database" }));
    expect(result).toMatchObject({ status: "fail", detail: "Because. Remove laptop->db." });
    expect(run(edgeRule({ mode: "forbidden", from: "client", to: "cache" })).status).toBe("pass");
  });
});

describe("evaluateRules: component rules", () => {
  it("counts matching nodes against min", () => {
    expect(run(componentRule({ min: 2 })).status).toBe("pass");
    expect(run(componentRule({ min: 3 }))).toMatchObject({
      status: "fail",
      detail: "Because. Needs 3 × database; found 2.",
    });
    expect(run(componentRule({ kind: "client", min: 2 })).status).toBe("pass");
    expect(run(componentRule({ kind: "cache" })).status).toBe("fail");
  });

  it("only counts nodes meeting minConfig", () => {
    expect(run(componentRule({ minConfig: { replicas: 2 } })).status).toBe("pass");
    expect(run(componentRule({ min: 2, minConfig: { replicas: 2 } }))).toMatchObject({
      status: "fail",
      detail: "Because. Needs 2 × database with replicas ≥ 2; found 1.",
    });
  });

  it("returns one result per rule, in order", () => {
    const brief = briefWith([componentRule({ id: "a" }), edgeRule({ id: "b" })]);
    const { nodes, edges } = buildDesign(brief, {
      name: "t",
      description: "t",
      design,
      expect: { pass: true, fails: [], warns: [] },
      knownGap: null,
    });
    expect(evaluateRules(brief, nodes, edges).map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("evaluateRules: titles", () => {
  it("carries the rule's title on passing and failing results of both types", () => {
    const title = "Readable name";
    expect(run(edgeRule({ title, from: "compute", to: "database" }))).toMatchObject({ title, status: "pass" });
    expect(run(edgeRule({ title, from: "compute", to: "cache" }))).toMatchObject({ title, status: "fail" });
    expect(run(componentRule({ title, minConfig: { replicas: 2 } }))).toMatchObject({ title, status: "pass" });
    expect(run(componentRule({ title, min: 3 }))).toMatchObject({ title, status: "fail" });
  });
});
