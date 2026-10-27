import { runVerification } from "@/lib/simulation";
import type { CheckStatus, VerificationResult } from "@/lib/types";
import { buildDesign } from "./design";
import { evaluateRules } from "./rules";
import type { Brief, Fixture, RuleResult } from "./types";

export type FixtureRun = {
  verification: VerificationResult;
  rules: RuleResult[];
  /** Every engine check and rule, by id */
  statuses: Map<string, { status: CheckStatus; detail: string }>;
  /** Ways the outcome differs from fixture.expect; empty when it matches */
  mismatches: string[];
};

/** Run a fixture through the engine and the brief's rules, and compare with its expectation. */
export function runFixture(brief: Brief, fixture: Fixture): FixtureRun {
  const { nodes, edges, features, nfr } = buildDesign(brief, fixture);
  const verification = runVerification(nodes, edges, features, nfr);
  const rules = evaluateRules(brief, nodes, edges);

  const statuses = new Map<string, { status: CheckStatus; detail: string }>();
  for (const c of verification.checks) {
    const extra = c.actual ? ` [${c.actual} vs ${c.target}]` : "";
    statuses.set(c.id, { status: c.status, detail: `${c.detail}${extra}` });
  }
  for (const r of rules) statuses.set(r.id, { status: r.status, detail: r.detail });

  const mismatches: string[] = [];
  const { expect } = fixture;
  if (expect.pass) {
    for (const [id, s] of statuses) {
      if (s.status === "fail") mismatches.push(`${id} failed: ${s.detail}`);
    }
  }
  const wanted: [string, CheckStatus][] = [
    ...expect.fails.map((id): [string, CheckStatus] => [id, "fail"]),
    ...expect.warns.map((id): [string, CheckStatus] => [id, "warn"]),
  ];
  for (const [id, status] of wanted) {
    const s = statuses.get(id);
    if (!s) mismatches.push(`${id} should be ${status} but was not reported`);
    else if (s.status !== status) mismatches.push(`${id} should be ${status} but is ${s.status}: ${s.detail}`);
  }

  return { verification, rules, statuses, mismatches };
}
