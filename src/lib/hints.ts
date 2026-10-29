import type { RuleResult } from "./challenges/types";
import type { CheckStatus } from "./types";

/** How far a rule's hint is open: 1 title, 2 adds why, 3 adds the fix. Absent means 0. */
export type HintStep = 1 | 2 | 3;
export type HintSteps = Record<string, HintStep>;

/** A brief rule as the results panel shows it, given the hints opened so far. */
export type StagedRule = {
  id: string;
  title: string;
  status: CheckStatus;
  kind: RuleResult["kind"];
  step: 0 | HintStep;
  /** The row's detail line: "" when only the title is open */
  text: string;
  /** The row offers "Why?" */
  canWhy: boolean;
  /** The row offers "Show the fix" */
  canFix: boolean;
};

export type StagedRules = {
  shown: StagedRule[];
  /** Failing required rules with no hint open; status is the worst among them */
  hidden: { count: number; status: CheckStatus };
  /** The first hidden rule in brief order, or null */
  nextHiddenId: string | null;
};

const SEVERITY: Record<CheckStatus, number> = { pass: 0, warn: 1, fail: 2 };

/**
 * Split rule results into what a student sees. Passes and forbidden-rule violations show
 * in full; a failing required rule stays hidden until its hint is opened, then shows its
 * title, why and fix one step at a time. Statuses are untouched.
 */
export function stageRules(results: RuleResult[], steps: HintSteps): StagedRules {
  const shown: StagedRule[] = [];
  let count = 0;
  let status: CheckStatus = "pass";
  let nextHiddenId: string | null = null;

  for (const r of results) {
    const step: StagedRule["step"] = (steps[r.id] as HintStep | undefined) ?? 0;
    const base = { id: r.id, title: r.title, status: r.status, kind: r.kind, step };
    if (r.status === "pass" || r.kind === "forbidden") {
      shown.push({ ...base, text: r.detail, canWhy: false, canFix: false });
    } else if (step === 0) {
      count++;
      if (SEVERITY[r.status] > SEVERITY[status]) status = r.status;
      nextHiddenId ??= r.id;
    } else {
      const text = step === 1 ? "" : step === 2 ? r.why : `${r.why} ${r.fix}`;
      shown.push({ ...base, text, canWhy: step === 1, canFix: step === 2 });
    }
  }
  return { shown, hidden: { count, status }, nextHiddenId };
}

/** Hint steps opened in total. */
export function hintsUsed(steps: HintSteps): number {
  return Object.values(steps).reduce<number>((sum, s) => sum + s, 0);
}
