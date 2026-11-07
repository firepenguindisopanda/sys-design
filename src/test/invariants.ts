import type { Edge } from "@xyflow/react";
import { exportDesignFile, importDesignFile } from "@/lib/challenges/design-file";
import type { Brief } from "@/lib/challenges/types";
import { simulateLoad } from "@/lib/loadsim/model";
import { canSwitchOff } from "@/lib/loadsim/outages";
import { defaultScenario, featureLoads } from "@/lib/loadsim/scenario";
import type { LoadRun, Scenario, SimNode } from "@/lib/loadsim/types";
import { runVerification } from "@/lib/simulation";
import type {
  FeatureBlock,
  FunctionalRequirement,
  NonFunctionalRequirements,
  VerificationResult,
} from "@/lib/types";

// The invariants every design must keep (SPEC-stress-harness.md). Checks return what's
// broken instead of asserting, so one run can report several problems, and the same checks
// serve the default suite, larger seed runs and replays.

/** A broken invariant: its id from the spec (E1–E4, L1–L9, R1–R2) and what was wrong. */
export type Broken = { id: string; text: string };

/** Counts can be fractional (e.g. 100,000.0000000067 served); "equal" means within this share of requests. */
export const COUNT_TOLERANCE = 1e-6;
/** Utilisation is a ratio; below zero by more than this is broken, not rounding. */
const RATIO_TOLERANCE = 1e-9;

const countTolerance = (requests: number) => COUNT_TOLERANCE * Math.abs(requests) + 1e-6;
const show = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(4));

export type Subject = {
  nodes: SimNode[];
  edges: Edge[];
  features: FeatureBlock[];
  nfr: NonFunctionalRequirements;
  /** Needed to export a sandbox design; derived from the features when left out */
  functionalReqs?: FunctionalRequirement[];
};

export type InvariantOptions = {
  /** E4 and L8: run twice and compare */
  determinism?: boolean;
  /** L9: run again with a component switched off */
  outage?: boolean;
  /** R1 and R2: export, import, and run again */
  roundTrip?: boolean;
};

const RANK = { pass: 0, warn: 1, fail: 2 } as const;

/** E2 and E3, on one engine result. */
export function checkEngine(result: VerificationResult): Broken[] {
  const broken: Broken[] = [];
  const estimates = {
    latency: result.estimatedLatencyMs,
    throughput: result.estimatedThroughputRpm,
    availability: result.estimatedAvailabilityPct,
    cost: result.estimatedMonthlyCostUsd,
  };
  const bad = Object.entries(estimates).filter(([, v]) => !Number.isFinite(v) || v < 0);
  if (bad.length > 0) {
    broken.push({ id: "E2", text: `estimates must be finite and ≥ 0: ${bad.map(([k, v]) => `${k} ${v}`).join(", ")}` });
  } else if (estimates.availability > 100) {
    broken.push({ id: "E2", text: `availability must be ≤ 100: ${estimates.availability}` });
  }
  const worst = result.checks.reduce<keyof typeof RANK>(
    (w, c) => (RANK[c.status] > RANK[w] ? c.status : w),
    "pass",
  );
  if (result.overall !== worst) {
    broken.push({ id: "E3", text: `overall is "${result.overall}" but the worst check is "${worst}"` });
  }
  return broken;
}

/** The path of the first number that isn't finite, or null. */
function firstNonFinite(value: unknown, path: string): string | null {
  if (typeof value === "number") return Number.isFinite(value) ? null : `${path} = ${value}`;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = firstNonFinite(value[i], `${path}[${i}]`);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, v] of Object.entries(value)) {
      const found = firstNonFinite(v, `${path}.${key}`);
      if (found) return found;
    }
  }
  return null;
}

/** L2–L7, on one load-model run. */
export function checkLoadRun(run: LoadRun): Broken[] {
  const broken: Broken[] = [];
  const s = run.summary;
  const tol = countTolerance(s.requests);

  const nonFinite =
    firstNonFinite(s, "summary") ??
    run.frames.reduce<string | null>((found, f, i) => found ?? firstNonFinite(f, `frames[${i}]`), null);
  if (nonFinite) broken.push({ id: "L2", text: `every number must be finite: ${nonFinite}` });

  if (Math.abs(s.served + s.failed - s.requests) > tol) {
    broken.push({ id: "L3", text: `served + failed = requests: ${show(s.served)} + ${show(s.failed)} ≠ ${show(s.requests)}` });
  }

  const grouped = s.failures.reduce((sum, f) => sum + f.count, 0);
  if (Math.abs(grouped - s.failed) > tol) {
    broken.push({ id: "L4", text: `failure groups add up to failed: ${show(grouped)} ≠ ${show(s.failed)}` });
  }

  const negative = (() => {
    for (const [id, n] of Object.entries(s.perNode)) {
      for (const key of ["served", "failed", "peakBacklog", "failedWhileOff"] as const) {
        if (n[key] < -tol) return `summary.perNode.${id}.${key} = ${n[key]}`;
      }
      if (n.peakUtilisation < -RATIO_TOLERANCE) return `summary.perNode.${id}.peakUtilisation = ${n.peakUtilisation}`;
    }
    for (let i = 0; i < run.frames.length; i++) {
      for (const [id, n] of Object.entries(run.frames[i].nodes)) {
        for (const key of ["arrivals", "served", "failed", "backlog"] as const) {
          if (n[key] < -tol) return `frames[${i}].nodes.${id}.${key} = ${n[key]}`;
        }
        if (n.utilisation < -RATIO_TOLERANCE) return `frames[${i}].nodes.${id}.utilisation = ${n.utilisation}`;
      }
    }
    return null;
  })();
  if (negative) broken.push({ id: "L5", text: `no count is negative and utilisation is ≥ 0: ${negative}` });

  if (s.p50Ms > s.p95Ms + RATIO_TOLERANCE) {
    broken.push({ id: "L6", text: `p50 ≤ p95: ${show(s.p50Ms)} > ${show(s.p95Ms)}` });
  }

  const j = s.jobs;
  if (j && Math.abs(j.done + j.stillWaiting + j.neverDone - j.queued) > countTolerance(j.queued)) {
    broken.push({
      id: "L7",
      text: `done + still waiting + never done = queued: ${show(j.done)} + ${show(j.stillWaiting)} + ${show(j.neverDone)} ≠ ${show(j.queued)}`,
    });
  }
  return broken;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * JSON with each node and edge id replaced by its position (`#n3`, `#e7`). Import renames
 * ids that aren't kebab-case (the demos' `static_hosting-5` becomes `static-hosting-5`) but
 * keeps their order, so results before and after a round trip compare equal this way.
 * An id inside a longer one (`api-1` in `api-10`) is left alone.
 */
export function canonical(value: unknown, nodeIds: string[], edgeIds: string[]): string {
  const tokens = [
    ...edgeIds.map((id, i) => [id, `#e${i}`] as const),
    ...nodeIds.map((id, i) => [id, `#n${i}`] as const),
  ].sort((a, b) => b[0].length - a[0].length);
  let text = JSON.stringify(value);
  for (const [id, token] of tokens) {
    const pattern = new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(id)}(?![A-Za-z0-9_]|-[A-Za-z0-9_])`, "g");
    text = text.replace(pattern, token);
  }
  return text;
}

type Attempt<T> = { ok: T } | { threw: string };

function attempt<T>(f: () => T): Attempt<T> {
  try {
    return { ok: f() };
  } catch (e) {
    return { threw: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * One load-model run. With `outage`, the node is switched off a third of the way in, and
 * `baseline` (the same run without it) saves the model running the design twice to tell
 * what the outage cost elsewhere, as the page does.
 */
function runModel(
  subject: Subject,
  brief: Brief | null,
  scenario: Scenario,
  outage?: { nodeId: string; baseline: LoadRun },
): LoadRun {
  return simulateLoad({
    nodes: subject.nodes,
    edges: subject.edges,
    features: subject.features,
    scenario,
    loads: featureLoads(subject.features, brief),
    ...(outage
      ? {
          outages: [{ nodeId: outage.nodeId, offAt: scenario.windowSeconds / 3, onAt: null }],
          baseline: outage.baseline,
        }
      : {}),
  });
}

const withoutRanAt = (v: VerificationResult) => ({ ...v, ranAt: 0 });

/**
 * Every invariant that doesn't hold for this design, empty when all do. Never throws: a
 * throw becomes E1 (engine) or L1 (load model), so one bad design doesn't hide the others.
 */
export function brokenInvariants(subject: Subject, brief: Brief | null, options: InvariantOptions = {}): Broken[] {
  const { determinism = true, outage = true, roundTrip = true } = options;
  const broken: Broken[] = [];
  const scenario = defaultScenario(brief);
  const verify = () => runVerification(subject.nodes, subject.edges, subject.features, subject.nfr);

  const engine = attempt(verify);
  if ("threw" in engine) {
    broken.push({ id: "E1", text: `the engine threw: ${engine.threw}` });
  } else {
    broken.push(...checkEngine(engine.ok));
    if (determinism) {
      const again = attempt(verify);
      if ("ok" in again && JSON.stringify(withoutRanAt(again.ok)) !== JSON.stringify(withoutRanAt(engine.ok))) {
        broken.push({ id: "E4", text: "two engine runs gave different results" });
      }
    }
  }

  const load = attempt(() => runModel(subject, brief, scenario));
  if ("threw" in load) {
    broken.push({ id: "L1", text: `the load model threw: ${load.threw}` });
  } else {
    broken.push(...checkLoadRun(load.ok));
    if (determinism) {
      const again = attempt(() => runModel(subject, brief, scenario));
      if ("ok" in again && JSON.stringify(again.ok) !== JSON.stringify(load.ok)) {
        broken.push({ id: "L8", text: "two load-model runs gave different results" });
      }
    }
  }

  if (outage && "ok" in load) {
    const off = subject.nodes.find((n) => n.data && canSwitchOff(n.data.componentKind));
    if (off) {
      const run = attempt(() => runModel(subject, brief, scenario, { nodeId: off.id, baseline: load.ok }));
      const prefix = `with ${off.id} switched off at ${show(scenario.windowSeconds / 3)} s`;
      if ("threw" in run) {
        broken.push({ id: "L9", text: `${prefix}, the load model threw: ${run.threw}` });
      } else {
        for (const b of checkLoadRun(run.ok).filter((x) => x.id === "L2" || x.id === "L3")) {
          broken.push({ id: "L9", text: `${prefix}, ${b.id} broke: ${b.text}` });
        }
      }
    }
  }

  if (roundTrip && "ok" in engine && "ok" in load) {
    broken.push(...checkRoundTrip(subject, brief, scenario, engine.ok, load.ok));
  }
  return broken;
}

/** R1 and R2: the design exports, and importing the export gives the same results. */
function checkRoundTrip(
  subject: Subject,
  brief: Brief | null,
  scenario: Scenario,
  engine: VerificationResult,
  load: LoadRun,
): Broken[] {
  const functionalReqs =
    subject.functionalReqs ??
    subject.features.map((f) => ({ id: `freq-${f.id}`, text: f.name, featureId: f.id }));
  const file = attempt(() =>
    exportDesignFile({ ...subject, functionalReqs, challenge: brief }),
  );
  if ("threw" in file) return [{ id: "R1", text: `export threw: ${file.threw}` }];
  if ("error" in file.ok) return [{ id: "R1", text: `export refused: ${file.ok.error}` }];

  const back = importDesignFile(file.ok.text, file.ok.fileName, brief ? [brief] : [], brief?.id ?? null);
  if ("error" in back) return [{ id: "R1", text: `re-import refused: ${back.error}` }];
  const loaded = back.loaded;

  const before = { nodes: subject.nodes.map((n) => n.id), edges: subject.edges.map((e) => e.id) };
  const after = { nodes: loaded.nodes.map((n) => n.id), edges: loaded.edges.map((e) => e.id) };
  const broken: Broken[] = [];

  const engineAfter = attempt(() => runVerification(loaded.nodes, loaded.edges, loaded.features, loaded.nfr));
  if ("threw" in engineAfter) {
    broken.push({ id: "R2", text: `after export and import, the engine threw: ${engineAfter.threw}` });
  } else if (
    canonical(withoutRanAt(engine), before.nodes, before.edges) !==
    canonical(withoutRanAt(engineAfter.ok), after.nodes, after.edges)
  ) {
    broken.push({ id: "R2", text: "after export and import, the engine gives a different result" });
  }

  const loadAfter = attempt(() => runModel(loaded, brief, scenario));
  if ("threw" in loadAfter) {
    broken.push({ id: "R2", text: `after export and import, the load model threw: ${loadAfter.threw}` });
  } else if (
    canonical(load.summary, before.nodes, before.edges) !== canonical(loadAfter.ok.summary, after.nodes, after.edges)
  ) {
    broken.push({ id: "R2", text: "after export and import, the load model gives a different summary" });
  }
  return broken;
}
