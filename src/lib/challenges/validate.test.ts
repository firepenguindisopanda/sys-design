/* eslint-disable @typescript-eslint/no-explicit-any -- these tests mutate raw, untyped parsed YAML */
import { describe, expect, it } from "vitest";
import { validateBrief, validateDesignFile, validateFixture } from "./validate";

const FILE = "challenges/test/brief.yaml";
const FIXTURE_FILE = "challenges/test/fixtures/good.yaml";

// Same shape as the example brief in SPEC.md, as parsed from YAML.
function rawBrief(): Record<string, any> {
  return {
    id: "link-shortener",
    title: "Campus link shortener",
    tagline: "Short links for course pages",
    source: "Adapted from architect-it starter bitly",
    summary: "Staff create short links; students click them.",
    outOfScope: ["analytics"],
    functionalRequirements: [
      {
        id: "create-link",
        text: "Create a short link.",
        feature: {
          name: "Create link",
          resources: { memoryGb: 0.5, vcpus: 0.5, storageGb: 1 },
          targetRpm: 60,
          computeMsPerRequest: 30,
        },
      },
      {
        id: "redirect",
        text: "Redirect to the long URL.",
        feature: {
          name: "Redirect",
          resources: { memoryGb: 1, vcpus: 1, storageGb: 1 },
          targetRpm: 1200,
          computeMsPerRequest: 10,
        },
      },
    ],
    nfr: {
      maxLatencyMs: 120,
      minThroughputRpm: 1300,
      minAvailabilityPct: 99.9,
      maxMonthlyCostUsd: 250,
    },
    rules: [
      {
        id: "cache-on-read-path",
        title: "Cache on the read path",
        type: "edge",
        mode: "required",
        from: "compute",
        to: "cache",
        severity: "fail",
        why: "Hot links should be served from a cache.",
      },
      {
        id: "db-replicas",
        title: "Replicated database",
        type: "component",
        kind: "database",
        minConfig: { replicas: 2 },
        severity: "fail",
        why: "One copy is a single point of failure.",
      },
    ],
    reflection: ["How are short codes generated?"],
  };
}

function rawFixture(): Record<string, any> {
  return {
    description: "Reference design.",
    design: {
      nodes: [
        { id: "phone", kind: "mobile" },
        { id: "api", kind: "paas", config: { capacity: { vcpus: 4 } } },
        { id: "cache", kind: "cache" },
        { id: "db", kind: "database", config: { replicas: 2 } },
      ],
      // Mapping form is what unquoted YAML `- phone -> api : http` produces.
      edges: [{ "phone -> api": "http" }, "api->cache:db", "api -> db : db"],
      placements: { "create-link": "api", redirect: "api" },
    },
    expect: { pass: true },
  };
}

function briefError(mutate: (b: Record<string, any>) => void): string {
  const b = rawBrief();
  mutate(b);
  try {
    validateBrief(b, FILE);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("expected validateBrief to throw");
}

function fixtureError(mutate: (f: Record<string, any>) => void): string {
  const brief = validateBrief(rawBrief(), FILE);
  const f = rawFixture();
  mutate(f);
  try {
    validateFixture(f, brief, FIXTURE_FILE, "good");
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("expected validateFixture to throw");
}

describe("validateBrief", () => {
  it("accepts the spec example and fills defaults", () => {
    const b = rawBrief();
    delete b.functionalRequirements[0].feature.description;
    const brief = validateBrief(b, FILE);
    expect(brief.functionalRequirements[0].feature.description).toBe("");
    const dbRule = brief.rules[1];
    expect(dbRule).toMatchObject({ type: "component", min: 1, minConfig: { replicas: 2 } });
    expect(brief.rules[0]).toMatchObject({
      type: "edge",
      from: ["compute"],
      to: ["cache"],
      protocols: null,
    });
  });

  it("reads rule titles and requires them", () => {
    const brief = validateBrief(rawBrief(), FILE);
    expect(brief.rules.map((rule) => rule.title)).toEqual([
      "Cache on the read path",
      "Replicated database",
    ]);
    expect(briefError((b) => delete b.rules[0].title)).toBe(
      `${FILE}: rules[0].title: expected a non-empty string`,
    );
    expect(briefError((b) => (b.rules[1].title = ""))).toBe(
      `${FILE}: rules[1].title: expected a non-empty string`,
    );
  });

  it("accepts a list of kinds as an edge rule endpoint", () => {
    const b = rawBrief();
    b.rules[0].to = ["cache", "load_balancer"];
    expect(validateBrief(b, FILE).rules[0]).toMatchObject({ to: ["cache", "load_balancer"] });
  });

  it("treats a missing cost budget as null", () => {
    const brief = validateBrief(
      { ...rawBrief(), nfr: { maxLatencyMs: 100, minThroughputRpm: 0, minAvailabilityPct: 99 } },
      FILE,
    );
    expect(brief.nfr.maxMonthlyCostUsd).toBeNull();
  });

  it("names the file and field path in errors", () => {
    expect(briefError((b) => (b.rules[0].to = "databse"))).toBe(
      `${FILE}: rules[0].to: unknown kind "databse"`,
    );
  });

  it("rejects unknown protocols, groups and fields", () => {
    expect(briefError((b) => (b.rules[0].protocols = ["grpc"]))).toContain(
      "rules[0].protocols[0]: unknown protocol",
    );
    expect(briefError((b) => (b.rules[0].from = "server"))).toContain("rules[0].from: unknown kind");
    expect(briefError((b) => (b.rulez = []))).toContain("rulez: unknown field");
    expect(briefError((b) => (b.rules[0].to = ["cache", "redis"]))).toContain(
      'rules[0].to[1]: unknown kind "redis"',
    );
    expect(briefError((b) => (b.rules[0].to = []))).toContain("rules[0].to: expected at least one kind");
    expect(briefError((b) => (b.rules[1].minConfig = { replica: 2 }))).toContain(
      "rules[1].minConfig.replica: unknown field",
    );
  });

  it("rejects duplicate ids", () => {
    expect(
      briefError((b) => (b.functionalRequirements[1].id = "create-link")),
    ).toContain('functionalRequirements[1]: duplicate requirement id "create-link"');
    expect(briefError((b) => (b.rules[1].id = "cache-on-read-path"))).toContain(
      "rules[1]: duplicate rule id",
    );
  });

  it("rejects rule ids that clash with engine check ids", () => {
    expect(briefError((b) => (b.rules[0].id = "topo-cache"))).toContain("clashes with engine check ids");
  });

  it("rejects missing or invalid required fields", () => {
    expect(briefError((b) => delete b.source)).toBe(`${FILE}: source: expected a non-empty string`);
    expect(briefError((b) => (b.functionalRequirements = []))).toContain("needs at least one requirement");
    expect(briefError((b) => (b.nfr.minAvailabilityPct = 101))).toContain("must be at most 100");
    expect(briefError((b) => (b.id = "Link Shortener"))).toContain("kebab-case");
    expect(briefError((b) => (b.rules[0].type = "path"))).toContain('unknown rule type "path"');
  });
});

describe("validateFixture", () => {
  const brief = validateBrief(rawBrief(), FILE);

  it("parses nodes, edge shorthand and placements", () => {
    const fx = validateFixture(rawFixture(), brief, FIXTURE_FILE, "good");
    expect(fx.design.edges).toEqual([
      { id: "phone->api", source: "phone", target: "api", protocol: "http" },
      { id: "api->cache", source: "api", target: "cache", protocol: "db" },
      { id: "api->db", source: "api", target: "db", protocol: "db" },
    ]);
    expect(fx.design.nodes[0]).toEqual({
      id: "phone",
      kind: "mobile",
      label: null,
      purpose: null,
      position: null,
      config: {},
    });
    expect(fx.design.placements).toEqual({ "create-link": "api", redirect: "api" });
    expect(fx.expect).toEqual({ pass: true, fails: [], warns: [] });
    expect(fx.knownGap).toBeNull();
  });

  it("reads optional node positions and purposes", () => {
    const f = rawFixture();
    f.design.nodes[1].at = [460, 40.4];
    f.design.nodes[1].purpose = "Creates and resolves links";
    const node = validateFixture(f, brief, FIXTURE_FILE, "good").design.nodes[1];
    expect(node.position).toEqual({ x: 460, y: 40.4 });
    expect(node.purpose).toBe("Creates and resolves links");
  });

  it("rejects malformed positions and purposes", () => {
    const atError = "design.nodes[0].at: expected [x, y] with two numbers";
    expect(fixtureError((f) => (f.design.nodes[0].at = [1]))).toContain(atError);
    expect(fixtureError((f) => (f.design.nodes[0].at = [1, 2, 3]))).toContain(atError);
    expect(fixtureError((f) => (f.design.nodes[0].at = [1, "2"]))).toContain(atError);
    expect(fixtureError((f) => (f.design.nodes[0].at = { x: 1, y: 2 }))).toContain(atError);
    expect(fixtureError((f) => (f.design.nodes[0].at = [1, Infinity]))).toContain(atError);
    expect(fixtureError((f) => (f.design.nodes[0].purpose = ""))).toContain(
      "design.nodes[0].purpose: expected a non-empty string",
    );
  });

  it("rejects malformed edges and unknown nodes", () => {
    expect(fixtureError((f) => (f.design.edges[0] = "phone => api"))).toContain(
      'design.edges[0]: expected "source -> target : protocol"',
    );
    expect(fixtureError((f) => (f.design.edges[0] = "phone -> apii : http"))).toContain(
      'design.edges[0]: unknown node "apii"',
    );
    expect(fixtureError((f) => (f.design.edges[0] = "phone -> api : grpc"))).toContain(
      "unknown protocol",
    );
    expect(fixtureError((f) => f.design.edges.push("phone -> api : websocket"))).toContain(
      'duplicate edge "phone->api"',
    );
  });

  it("rejects bad node kinds, ids and config overrides", () => {
    expect(fixtureError((f) => (f.design.nodes[0].kind = "phone"))).toContain(
      'design.nodes[0].kind: unknown kind "phone"',
    );
    expect(fixtureError((f) => (f.design.nodes[3].id = "api"))).toContain('duplicate node id "api"');
    expect(fixtureError((f) => (f.design.nodes[3].config = { replica: 2 }))).toContain(
      "design.nodes[3].config.replica: unknown field",
    );
    expect(fixtureError((f) => (f.design.nodes[3].config = { replicas: "2" }))).toContain(
      "design.nodes[3].config.replicas: expected a number",
    );
    expect(fixtureError((f) => (f.design.nodes[1].config = { capacity: { cpus: 2 } }))).toContain(
      "design.nodes[1].config.capacity.cpus: unknown field",
    );
    expect(fixtureError((f) => (f.design.nodes[3].config = { engine: "postgres" }))).toContain(
      'design.nodes[3].config.engine: unknown engine "postgres"',
    );
  });

  it("rejects placements naming an unknown requirement or node, or non-compute", () => {
    expect(fixtureError((f) => (f.design.placements.search = "api"))).toContain(
      "design.placements.search: unknown field",
    );
    expect(fixtureError((f) => (f.design.placements.redirect = "nope"))).toContain(
      'design.placements.redirect: unknown node "nope"',
    );
    expect(fixtureError((f) => (f.design.placements.redirect = "db"))).toContain(
      "features go on compute",
    );
  });

  it("checks expectations", () => {
    expect(fixtureError((f) => (f.expect = {}))).toContain("needs pass: true, or at least one id");
    expect(fixtureError((f) => (f.expect = { pass: true, fails: ["nfr-latency"] }))).toContain(
      "pass: true cannot also list fails",
    );
    expect(fixtureError((f) => (f.expect = { fails: ["no-such-rule"] }))).toContain(
      '"no-such-rule" is not a rule id in this brief or an engine check id',
    );
    const fx = validateFixture(
      { ...rawFixture(), expect: { fails: ["cache-on-read-path", "topo-cache"] }, knownGap: "Reason." },
      brief,
      FIXTURE_FILE,
      "bad-no-cache",
    );
    expect(fx.expect).toEqual({ pass: false, fails: ["cache-on-read-path", "topo-cache"], warns: [] });
    expect(fx.knownGap).toBe("Reason.");
    expect(fixtureError((f) => (f.knownGap = ""))).toContain("knownGap: expected a non-empty string");
  });
});

describe("validateDesignFile", () => {
  const brief = validateBrief(rawBrief(), FILE);
  const briefs = [brief];
  const DESIGN_FILE = "my-design.yaml";

  function sandboxFile(): Record<string, any> {
    const b = rawBrief();
    return {
      functionalRequirements: [{ ...b.functionalRequirements[0], id: "feat-4" }],
      nfr: b.nfr,
      design: { ...rawFixture().design, placements: { "feat-4": "api" } },
    };
  }

  function fileError(raw: Record<string, any>, current: string | null = null): string {
    try {
      validateDesignFile(raw, briefs, current, DESIGN_FILE);
    } catch (e) {
      return (e as Error).message;
    }
    throw new Error("expected validateDesignFile to throw");
  }

  it("reads a challenge file against that brief, whatever is current", () => {
    const file = validateDesignFile(
      { challenge: "link-shortener", design: rawFixture().design },
      briefs,
      null,
      DESIGN_FILE,
    );
    expect(file.brief).toBe(brief);
    expect(file.functionalRequirements).toBe(brief.functionalRequirements);
    expect(file.nfr).toEqual(brief.nfr);
    expect(file.design.placements).toEqual({ "create-link": "api", redirect: "api" });
  });

  it("reads a sandbox file's own requirements and targets", () => {
    const file = validateDesignFile(sandboxFile(), briefs, "link-shortener", DESIGN_FILE);
    expect(file.brief).toBeNull();
    expect(file.functionalRequirements.map((fr) => fr.id)).toEqual(["feat-4"]);
    expect(file.functionalRequirements[0].feature.description).toBe("");
    expect(file.nfr.maxLatencyMs).toBe(120);
    expect(file.design.placements).toEqual({ "feat-4": "api" });
  });

  it("allows a sandbox file with no requirements", () => {
    const raw: Record<string, any> = { ...sandboxFile(), functionalRequirements: [] };
    raw.design.placements = {};
    expect(validateDesignFile(raw, briefs, null, DESIGN_FILE).functionalRequirements).toEqual([]);
  });

  it("reads a fixture into the current challenge, ignoring its expectations", () => {
    const file = validateDesignFile(
      { ...rawFixture(), knownGap: "Reason." },
      briefs,
      "link-shortener",
      DESIGN_FILE,
    );
    expect(file.brief).toBe(brief);
    expect(file.design.nodes).toHaveLength(4);
  });

  it("refuses a file with no requirements in the sandbox", () => {
    expect(fileError({ design: rawFixture().design })).toBe(
      `${DESIGN_FILE}: This design has no requirements. Pick its challenge first, then import it.`,
    );
  });

  it("names the file and path in errors", () => {
    expect(fileError({ challenge: "ride-share", design: rawFixture().design })).toBe(
      `${DESIGN_FILE}: challenge: no challenge called "ride-share"`,
    );
    expect(fileError({ ...sandboxFile(), challenge: "link-shortener" })).toContain(
      "functionalRequirements: not allowed with challenge",
    );
    expect(fileError({ ...sandboxFile(), nfr: undefined })).toBe(`${DESIGN_FILE}: nfr: expected a mapping`);
    expect(fileError({ nfr: rawBrief().nfr, design: rawFixture().design })).toContain(
      "nfr: only allowed with functionalRequirements",
    );
    expect(fileError({ challenge: "link-shortener" })).toBe(`${DESIGN_FILE}: design: expected a mapping`);
    expect(fileError({ ...sandboxFile(), extra: 1 })).toBe(`${DESIGN_FILE}: extra: unknown field`);
  });

  it("checks placements against the file's own requirement ids", () => {
    const raw = sandboxFile();
    raw.design.placements = { redirect: "api" };
    expect(fileError(raw)).toBe(`${DESIGN_FILE}: design.placements.redirect: unknown field`);
    const dup = sandboxFile();
    dup.functionalRequirements.push(dup.functionalRequirements[0]);
    expect(fileError(dup)).toContain('duplicate requirement id "feat-4"');
  });
});
