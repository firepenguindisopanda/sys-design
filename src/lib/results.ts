import type { RuleResult } from "./challenges/types";
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
};

export type ResultCounts = Record<CheckStatus, number>;

const RANK: Record<CheckStatus, number> = { fail: 0, warn: 1, pass: 2 };

/**
 * Engine checks and brief rules as one list, failures first, then warnings, then passes.
 * Within each group the order is kept: engine checks, then brief rules.
 */
export function orderResults(
  checks: VerificationCheck[],
  rules: RuleResult[] | null,
): ResultRow[] {
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
    ...(rules ?? []).map((r) => ({
      key: `rule-${r.id}`,
      title: r.title,
      detail: r.detail,
      status: r.status,
      rule: true,
      ruleId: r.id,
    })),
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
