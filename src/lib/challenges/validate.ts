import { COMPONENT_CATALOG, isComputeKind } from "@/lib/catalog";
import { PROTOCOL_META } from "@/lib/edges";
import type { ComponentKind, EdgeProtocol, NonFunctionalRequirements } from "@/lib/types";
import type {
  Brief,
  BriefRequirement,
  CompactDesign,
  CompactEdge,
  CompactNode,
  Fixture,
  FixtureExpectation,
  NodeMatcher,
  Rule,
} from "./types";

type Obj = Record<string, unknown>;

const KINDS: ReadonlySet<string> = new Set(COMPONENT_CATALOG.map((c) => c.kind));
const MATCHERS: ReadonlySet<string> = new Set([...KINDS, "client", "compute"]);
const PROTOCOLS: ReadonlySet<string> = new Set(Object.keys(PROTOCOL_META));
const SEVERITIES: ReadonlySet<string> = new Set(["fail", "warn"]);
const EDGE_MODES: ReadonlySet<string> = new Set(["required", "forbidden"]);

/** String config fields limited to a fixed set of values (mirrors types.ts). */
const CONFIG_ENUMS: Partial<Record<ComponentKind, Record<string, ReadonlySet<string>>>> = {
  database: { engine: new Set(["relational", "document", "graph", "vector"]) },
  cache: { engine: new Set(["redis", "memcached"]) },
  message_queue: { mode: new Set(["queue", "pubsub"]) },
};

/** Prefixes of the ids runVerification gives its checks. */
export const ENGINE_CHECK_PREFIXES = ["placement-", "topo-", "nfr-"];

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EDGE_SHORTHAND = /^\s*([\w-]+)\s*->\s*([\w-]+)\s*:\s*([a-z_]+)\s*$/;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function defaultConfig(kind: ComponentKind): Obj {
  return COMPONENT_CATALOG.find((c) => c.kind === kind)!.defaultConfig as Obj;
}

/** Small typed readers that throw `<file>: <path>: <problem>`. */
function reader(file: string) {
  const fail = (path: string, problem: string): never => {
    throw new Error(`${file}: ${path || "(root)"}: ${problem}`);
  };
  const at = (path: string, key: string | number) =>
    typeof key === "number" ? `${path}[${key}]` : path ? `${path}.${key}` : key;

  const obj = (v: unknown, path: string, allowedKeys: string[]): Obj => {
    if (!isObj(v)) return fail(path, "expected a mapping");
    for (const k of Object.keys(v)) {
      if (!allowedKeys.includes(k)) fail(at(path, k), "unknown field");
    }
    return v;
  };
  const str = (v: unknown, path: string): string =>
    typeof v === "string" && v.trim() ? v : fail(path, "expected a non-empty string");
  const slug = (v: unknown, path: string): string => {
    const s = str(v, path);
    return SLUG.test(s) ? s : fail(path, `"${s}" must be lowercase kebab-case`);
  };
  const num = (v: unknown, path: string, min = 0): number =>
    typeof v === "number" && Number.isFinite(v) && v >= min
      ? v
      : fail(path, `expected a number >= ${min}`);
  const list = (v: unknown, path: string): unknown[] =>
    Array.isArray(v) ? v : fail(path, "expected a list");
  const optList = (v: unknown, path: string): unknown[] => (v === undefined ? [] : list(v, path));
  const oneOf = <T extends string>(
    v: unknown,
    path: string,
    allowed: ReadonlySet<string>,
    what: string,
  ): T =>
    typeof v === "string" && allowed.has(v)
      ? (v as T)
      : fail(path, `unknown ${what} ${JSON.stringify(v)}`);
  const unique = (ids: string[], path: string, what: string) => {
    const seen = new Set<string>();
    ids.forEach((id, i) => {
      if (seen.has(id)) fail(at(path, i), `duplicate ${what} "${id}"`);
      seen.add(id);
    });
  };

  return { fail, at, obj, str, slug, num, list, optList, oneOf, unique };
}

type Reader = ReturnType<typeof reader>;

/** Config overrides may only use fields the kind's default config has, with the same types. */
function checkConfigShape(r: Reader, value: unknown, shape: Obj, path: string) {
  const overrides = r.obj(
    value,
    path,
    Object.keys(shape).filter((k) => k !== "kind"),
  );
  for (const [key, v] of Object.entries(overrides)) {
    const expected = shape[key];
    const p = r.at(path, key);
    if (isObj(expected)) {
      checkConfigShape(r, v, expected, p);
    } else if (typeof v !== typeof expected) {
      r.fail(p, `expected a ${typeof expected}`);
    }
  }
}

function readRequirement(r: Reader, raw: unknown, path: string): BriefRequirement {
  const o = r.obj(raw, path, ["id", "text", "feature"]);
  const fp = r.at(path, "feature");
  const f = r.obj(o.feature, fp, [
    "name",
    "description",
    "resources",
    "targetRpm",
    "computeMsPerRequest",
  ]);
  const rp = r.at(fp, "resources");
  const res = r.obj(f.resources, rp, ["memoryGb", "vcpus", "storageGb"]);
  return {
    id: r.slug(o.id, r.at(path, "id")),
    text: r.str(o.text, r.at(path, "text")),
    feature: {
      name: r.str(f.name, r.at(fp, "name")),
      description: f.description === undefined ? "" : r.str(f.description, r.at(fp, "description")),
      resources: {
        memoryGb: r.num(res.memoryGb, r.at(rp, "memoryGb")),
        vcpus: r.num(res.vcpus, r.at(rp, "vcpus")),
        storageGb: r.num(res.storageGb, r.at(rp, "storageGb")),
      },
      targetRpm: r.num(f.targetRpm, r.at(fp, "targetRpm")),
      computeMsPerRequest: r.num(f.computeMsPerRequest, r.at(fp, "computeMsPerRequest"), 1),
    },
  };
}

function readNfr(r: Reader, raw: unknown, path: string): NonFunctionalRequirements {
  const o = r.obj(raw, path, [
    "maxLatencyMs",
    "minThroughputRpm",
    "minAvailabilityPct",
    "maxMonthlyCostUsd",
  ]);
  const avail = r.num(o.minAvailabilityPct, r.at(path, "minAvailabilityPct"));
  if (avail > 100) r.fail(r.at(path, "minAvailabilityPct"), "must be at most 100");
  return {
    maxLatencyMs: r.num(o.maxLatencyMs, r.at(path, "maxLatencyMs"), 1),
    minThroughputRpm: r.num(o.minThroughputRpm, r.at(path, "minThroughputRpm")),
    minAvailabilityPct: avail,
    maxMonthlyCostUsd:
      o.maxMonthlyCostUsd == null
        ? null
        : r.num(o.maxMonthlyCostUsd, r.at(path, "maxMonthlyCostUsd")),
  };
}

function readRule(r: Reader, raw: unknown, path: string): Rule {
  if (!isObj(raw)) return r.fail(path, "expected a mapping");
  const id = r.slug(raw.id, r.at(path, "id"));
  if (ENGINE_CHECK_PREFIXES.some((p) => id.startsWith(p))) {
    r.fail(r.at(path, "id"), `"${id}" clashes with engine check ids (${ENGINE_CHECK_PREFIXES.join(", ")})`);
  }
  const severity = r.oneOf<Rule["severity"]>(raw.severity, r.at(path, "severity"), SEVERITIES, "severity");
  const why = r.str(raw.why, r.at(path, "why"));

  if (raw.type === "component") {
    const o = r.obj(raw, path, ["id", "type", "kind", "min", "minConfig", "severity", "why"]);
    const kind = r.oneOf<NodeMatcher>(o.kind, r.at(path, "kind"), MATCHERS, "kind");
    const minConfig: Record<string, number> = {};
    if (o.minConfig !== undefined) {
      const mp = r.at(path, "minConfig");
      const shape = KINDS.has(kind) ? defaultConfig(kind as ComponentKind) : null;
      const mc = r.obj(
        o.minConfig,
        mp,
        shape ? Object.keys(shape).filter((k) => typeof shape[k] === "number") : [],
      );
      for (const [k, v] of Object.entries(mc)) minConfig[k] = r.num(v, r.at(mp, k));
    }
    return {
      id,
      type: "component",
      kind,
      min: o.min === undefined ? 1 : r.num(o.min, r.at(path, "min"), 1),
      minConfig,
      severity,
      why,
    };
  }

  if (raw.type === "edge") {
    const o = r.obj(raw, path, ["id", "type", "mode", "from", "to", "protocols", "severity", "why"]);
    const pp = r.at(path, "protocols");
    const matchers = (v: unknown, p: string): NodeMatcher[] => {
      if (!Array.isArray(v)) return [r.oneOf<NodeMatcher>(v, p, MATCHERS, "kind")];
      if (v.length === 0) r.fail(p, "expected at least one kind");
      return v.map((m, i) => r.oneOf<NodeMatcher>(m, r.at(p, i), MATCHERS, "kind"));
    };
    return {
      id,
      type: "edge",
      mode: r.oneOf(o.mode, r.at(path, "mode"), EDGE_MODES, "mode"),
      from: matchers(o.from, r.at(path, "from")),
      to: matchers(o.to, r.at(path, "to")),
      protocols:
        o.protocols === undefined
          ? null
          : r.list(o.protocols, pp).map((p, i) =>
              r.oneOf<EdgeProtocol>(p, r.at(pp, i), PROTOCOLS, "protocol"),
            ),
      severity,
      why,
    };
  }

  return r.fail(r.at(path, "type"), `unknown rule type ${JSON.stringify(raw.type)}`);
}

export function validateBrief(raw: unknown, file: string): Brief {
  const r = reader(file);
  const o = r.obj(raw, "", [
    "id",
    "title",
    "tagline",
    "source",
    "summary",
    "outOfScope",
    "functionalRequirements",
    "nfr",
    "rules",
    "reflection",
  ]);

  const frs = r.list(o.functionalRequirements, "functionalRequirements");
  if (frs.length === 0) r.fail("functionalRequirements", "needs at least one requirement");
  const functionalRequirements = frs.map((fr, i) =>
    readRequirement(r, fr, r.at("functionalRequirements", i)),
  );
  r.unique(functionalRequirements.map((fr) => fr.id), "functionalRequirements", "requirement id");

  const rules = r.optList(o.rules, "rules").map((rule, i) => readRule(r, rule, r.at("rules", i)));
  r.unique(rules.map((rule) => rule.id), "rules", "rule id");

  return {
    id: r.slug(o.id, "id"),
    title: r.str(o.title, "title"),
    tagline: r.str(o.tagline, "tagline"),
    source: r.str(o.source, "source"),
    summary: r.str(o.summary, "summary"),
    outOfScope: r.optList(o.outOfScope, "outOfScope").map((s, i) => r.str(s, r.at("outOfScope", i))),
    functionalRequirements,
    nfr: readNfr(r, o.nfr, "nfr"),
    rules,
    reflection: r.optList(o.reflection, "reflection").map((s, i) => r.str(s, r.at("reflection", i))),
  };
}

function readDesign(r: Reader, raw: unknown, brief: Brief, path: string): CompactDesign {
  const o = r.obj(raw, path, ["nodes", "edges", "placements"]);

  const np = r.at(path, "nodes");
  const nodes: CompactNode[] = r.list(o.nodes, np).map((n, i) => {
    const p = r.at(np, i);
    const no = r.obj(n, p, ["id", "kind", "label", "config"]);
    const kind = r.oneOf<ComponentKind>(no.kind, r.at(p, "kind"), KINDS, "kind");
    if (no.config !== undefined) {
      const cp = r.at(p, "config");
      checkConfigShape(r, no.config, defaultConfig(kind), cp);
      for (const [field, allowed] of Object.entries(CONFIG_ENUMS[kind] ?? {})) {
        const v = (no.config as Obj)[field];
        if (v !== undefined) r.oneOf(v, r.at(cp, field), allowed, field);
      }
    }
    return {
      id: r.slug(no.id, r.at(p, "id")),
      kind,
      label: no.label === undefined ? null : r.str(no.label, r.at(p, "label")),
      config: (no.config as Obj | undefined) ?? {},
    };
  });
  r.unique(nodes.map((n) => n.id), np, "node id");
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const ep = r.at(path, "edges");
  const edges: CompactEdge[] = r.optList(o.edges, ep).map((e, i) => {
    const p = r.at(ep, i);
    // Unquoted `- a -> b : http` parses as the one-key mapping { "a -> b": "http" };
    // a quoted string works too.
    const text =
      isObj(e) && Object.keys(e).length === 1
        ? `${Object.keys(e)[0]} : ${String(Object.values(e)[0])}`
        : e;
    const m = typeof text === "string" ? EDGE_SHORTHAND.exec(text) : null;
    if (!m) return r.fail(p, `expected "source -> target : protocol", got ${JSON.stringify(e)}`);
    const [, source, target, protocol] = m;
    if (!byId.has(source)) r.fail(p, `unknown node "${source}"`);
    if (!byId.has(target)) r.fail(p, `unknown node "${target}"`);
    return {
      id: `${source}->${target}`,
      source,
      target,
      protocol: r.oneOf<EdgeProtocol>(protocol, p, PROTOCOLS, "protocol"),
    };
  });
  r.unique(edges.map((e) => e.id), ep, "edge");

  const pp = r.at(path, "placements");
  const frIds = brief.functionalRequirements.map((fr) => fr.id);
  const po = o.placements === undefined ? {} : r.obj(o.placements, pp, frIds);
  const placements: Record<string, string> = {};
  for (const [frId, nodeId] of Object.entries(po)) {
    const p = r.at(pp, frId);
    const node = byId.get(r.str(nodeId, p));
    if (!node) r.fail(p, `unknown node ${JSON.stringify(nodeId)}`);
    else if (!isComputeKind(node.kind)) r.fail(p, `"${node.id}" is ${node.kind}; features go on compute`);
    placements[frId] = nodeId as string;
  }

  return { nodes, edges, placements };
}

function readExpectation(r: Reader, raw: unknown, brief: Brief, path: string): FixtureExpectation {
  const o = r.obj(raw, path, ["pass", "fails", "warns"]);
  const ruleIds = new Set(brief.rules.map((rule) => rule.id));
  const ids = (key: "fails" | "warns") => {
    const p = r.at(path, key);
    return r.optList(o[key], p).map((v, i) => {
      const id = r.str(v, r.at(p, i));
      if (!ruleIds.has(id) && !ENGINE_CHECK_PREFIXES.some((pre) => id.startsWith(pre))) {
        r.fail(r.at(p, i), `"${id}" is not a rule id in this brief or an engine check id`);
      }
      return id;
    });
  };
  const fails = ids("fails");
  const warns = ids("warns");
  const pass = o.pass === true;
  if (o.pass !== undefined && typeof o.pass !== "boolean") r.fail(r.at(path, "pass"), "expected true or false");
  if (pass && fails.length > 0) r.fail(path, "pass: true cannot also list fails");
  if (!pass && fails.length === 0 && warns.length === 0) {
    r.fail(path, "needs pass: true, or at least one id under fails or warns");
  }
  return { pass, fails, warns };
}

export function validateFixture(raw: unknown, brief: Brief, file: string, name: string): Fixture {
  const r = reader(file);
  const o = r.obj(raw, "", ["description", "design", "expect", "knownGap"]);
  return {
    name,
    description: r.str(o.description, "description"),
    design: readDesign(r, o.design, brief, "design"),
    expect: readExpectation(r, o.expect, brief, "expect"),
    knownGap: o.knownGap == null ? null : r.str(o.knownGap, "knownGap"),
  };
}
