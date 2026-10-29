import type { RuleResult } from "./challenges/types";
import type { StagedRules } from "./hints";
import type { CheckStatus, VerificationCheck } from "./types";

/** One row of the results panel: an engine check or a brief rule. */
export type ResultRow = {
  key: string;
  title: string;
  detail: string;
  status: CheckStatus;
  actual?: string;
  target?: string;
  /** True for a brief rule */
  rule: boolean;
  /** The brief rule's id, shown on hover for brief authors */
  ruleId?: string;
  /** A revealed hint's step and the button it offers next */
  hint?: { step: number; canWhy: boolean; canFix: boolean };
  /** The row standing in for the rules still hidden behind hints */
  hintSummary?: boolean;
};

export type ResultCounts = Record<CheckStatus, number>;

const RANK: Record<CheckStatus, number> = { fail: 0, warn: 1, pass: 2 };

/**
 * Engine checks and brief rules as one list, failures first, then warnings, then passes.
 * Within each group the order is kept: engine checks, then brief rules.
 *
 * With `staged`, rule rows show only what the hints have opened, and the hidden rules
 * become one summary row. Count from the unstaged rows, so hidden rules still count.
 */
export function orderResults(
  checks: VerificationCheck[],
  rules: RuleResult[] | null,
  staged?: Pick<StagedRules, "shown" | "hidden">,
): ResultRow[] {
  const ruleRows: ResultRow[] = staged
    ? [
        ...staged.shown.map((r) => ({
          key: `rule-${r.id}`,
          title: r.title,
          detail: r.text,
          status: r.status,
          rule: true,
          ruleId: r.id,
          hint:
            r.step > 0 && r.status !== "pass"
              ? { step: r.step, canWhy: r.canWhy, canFix: r.canFix }
              : undefined,
        })),
        ...(staged.hidden.count > 0
          ? [
              {
                key: "hidden-rules",
                title: `${staged.hidden.count} scenario ${staged.hidden.count === 1 ? "check" : "checks"} not met yet`,
                detail: "Open a hint to see what's missing, one at a time.",
                status: staged.hidden.status,
                rule: true,
                hintSummary: true,
              },
            ]
          : []),
      ]
    : (rules ?? []).map((r) => ({
        key: `rule-${r.id}`,
        title: r.title,
        detail: r.detail,
        status: r.status,
        rule: true,
        ruleId: r.id,
      }));
  const rows: ResultRow[] = [
    ...checks.map((c) => ({
      key: c.id,
      title: c.title,
      detail: c.detail,
      status: c.status,
      actual: c.actual,
      target: c.target,
      rule: false,
    })),
    ...ruleRows,
  ];
  // Array.prototype.sort is stable, so each group keeps its order.
  return rows.sort((a, b) => RANK[a.status] - RANK[b.status]);
}

export function countResults(rows: { status: CheckStatus }[]): ResultCounts {
  const counts: ResultCounts = { fail: 0, warn: 0, pass: 0 };
  for (const r of rows) counts[r.status]++;
  return counts;
}

/** For example "3 failed · 1 warning · 8 passed"; empty groups are left out. */
export function summarizeCounts(counts: ResultCounts, separator = " · "): string {
  return [
    counts.fail > 0 && `${counts.fail} failed`,
    counts.warn > 0 && `${counts.warn} ${counts.warn === 1 ? "warning" : "warnings"}`,
    counts.pass > 0 && `${counts.pass} passed`,
  ]
    .filter(Boolean)
    .join(separator);
}
