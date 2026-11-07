import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFlowGraph, TooManyRoutesError } from "@/lib/loadsim/graph";
import { simulateLoad } from "@/lib/loadsim/model";
import { defaultScenario, featureLoads } from "@/lib/loadsim/scenario";
import type { FlowGraph, PathStep } from "@/lib/loadsim/types";
import { runVerification } from "@/lib/simulation";
import { generateDesign, type GenerateOptions } from "@/test/gen-designs";

// SPEC-stress-harness.md: the opt-in size ladder. Times depend on the machine, so it never
// runs in the default suite; with no environment variables this file only skips.
//
//   STRESS=1 npx vitest run tests/stress-scale.test.ts --reporter=verbose
//
// A blow-up is synchronous, and vitest can't stop a synchronous test, so each case runs in
// its own child vitest (STRESS_CASE set) with a hard time limit. The child writes each
// part's time to a file as soon as it has it, so a hang in the load model still reports
// the engine's time. `--pool=threads` keeps the child's work in a thread of the child
// process, so killing the child stops it rather than leaving a fork spinning.

type Case = { name: string; design: GenerateOptions; engineMs: number; loadMs: number };
/** `refused`: the load model refused the design as having too many routes (SPEC-loadsim-route-scale.md). */
type Result = { engineMs?: number; loadMs?: number; routeSteps?: number; refused?: boolean };

/**
 * Cases over budget for a known reason, by name, with the module that fixes them; empty
 * since the stress map's last module (2026-11-06). Earlier pins, for the record:
 * - stacked 5–7 × 4 (loadsim-route-scale): the load model took 3.3 s, 24.4 s and over the
 *   limit; it now refuses them in milliseconds, which counts as within budget.
 * - random 200 nodes, seeds 1–3 (engine-path-scale): the engine's latency walk never
 *   returned or took 1.5 s; past 100,000 steps it now uses a linear estimate.
 */
const PINNED: Record<string, string> = {};

const FILE = "tests/stress-scale.test.ts";
const VITEST = path.resolve("node_modules/vitest/vitest.mjs");
/** Starting a child vitest takes a few seconds on top of the case itself. */
const STARTUP_MS = 15_000;

function cases(): Case[] {
  const out: Case[] = [];
  for (const shape of ["random", "app"] as const) {
    for (const nodes of [25, 50, 100, 200]) {
      for (const seed of [1, 2, 3]) {
        const small = nodes <= 50;
        out.push({
          name: `${shape} ${nodes} nodes, seed ${seed}`,
          design: { seed, shape, nodes },
          engineMs: small ? 200 : 500,
          loadMs: small ? 2_000 : 5_000,
        });
      }
    }
  }
  for (let layers = 3; layers <= 7; layers++) {
    out.push({ name: `stacked ${layers} × 4`, design: { shape: "stacked", layers, width: 4 }, engineMs: 200, loadMs: 2_000 });
  }
  return out;
}

function routeSteps(graph: FlowGraph): number {
  const count = (step: PathStep): number => 1 + step.next.reduce((n, next) => n + count(next.step), 0);
  return graph.classes.reduce((n, c) => n + (c.root ? count(c.root) : 0), 0);
}

const childCase = process.env.STRESS_CASE;
const parent = process.env.STRESS === "1" && !childCase;

describe.runIf(childCase)("one ladder case (child)", () => {
  it("times the engine, then the load model", () => {
    const out = process.env.STRESS_OUT!;
    const write = (result: Result) => appendFileSync(out, JSON.stringify(result) + "\n");
    const d = generateDesign(JSON.parse(childCase!) as GenerateOptions);
    let start = performance.now();
    runVerification(d.nodes, d.edges, d.features, d.nfr);
    const engineMs = performance.now() - start;
    write({ engineMs });
    const loads = featureLoads(d.features, null);
    // Counted with a budget far above every ladder design (7 × 4 is 109,226), for the table.
    const steps = routeSteps(buildFlowGraph(d.nodes, d.edges, d.features, loads, 1_000_000));
    write({ engineMs, routeSteps: steps });
    start = performance.now();
    try {
      simulateLoad({ nodes: d.nodes, edges: d.edges, features: d.features, scenario: defaultScenario(null), loads });
      write({ engineMs, routeSteps: steps, loadMs: performance.now() - start });
    } catch (e) {
      if (!(e instanceof TooManyRoutesError)) throw e;
      write({ engineMs, routeSteps: steps, loadMs: performance.now() - start, refused: true });
    }
  }, 0);
});

/** Run one case in a child vitest; the last result it wrote, and whether it was killed. */
function runChild(c: Case): Result & { killed: boolean } {
  const out = path.join(tmpdir(), `sesim-stress-${process.pid}-${Date.now()}.jsonl`);
  const hardMs = 10 * (c.engineMs + c.loadMs) + STARTUP_MS;
  try {
    const child = spawnSync(process.execPath, [VITEST, "run", FILE, "--pool=threads"], {
      env: { ...process.env, STRESS: "", STRESS_CASE: JSON.stringify(c.design), STRESS_OUT: out },
      timeout: hardMs,
      killSignal: "SIGKILL",
      encoding: "utf8",
    });
    const lines = existsSync(out) ? readFileSync(out, "utf8").trim().split("\n").filter(Boolean) : [];
    const last = lines.length > 0 ? (JSON.parse(lines[lines.length - 1]) as Result) : {};
    const killed = child.signal !== null || (child.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT";
    return { ...last, killed };
  } finally {
    rmSync(out, { force: true });
  }
}

const show = (ms: number | undefined) => (ms === undefined ? "—" : `${Math.round(ms)} ms`);

describe.runIf(parent)("size ladder", () => {
  for (const c of cases()) {
    const owner = PINNED[c.name];
    const test = owner ? it.fails : it;
    const title = owner ? `[${owner}] ${c.name} within budget` : `${c.name} within budget`;
    test(title, () => {
      const r = runChild(c);
      const line =
        `${c.name}: engine ${show(r.engineMs)} (budget ${c.engineMs}), ` +
        `load model ${show(r.loadMs)}${r.refused ? " (refused: too many routes)" : ""} (budget ${c.loadMs}), ` +
        `route steps ${r.routeSteps ?? "—"}` +
        (r.killed ? ", killed at the time limit" : "");
      console.log(line);
      expect(r.engineMs, line).toBeDefined();
      expect(r.engineMs!, line).toBeLessThanOrEqual(c.engineMs);
      expect(r.loadMs, line).toBeDefined();
      expect(r.loadMs!, line).toBeLessThanOrEqual(c.loadMs);
    }, 10 * (c.engineMs + c.loadMs) + 2 * STARTUP_MS);
  }
});
