import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadChallenges } from "./challenges/load";
import type { RuleResult } from "./challenges/types";
import { countResults, orderResults, summarizeCounts } from "./results";
import { useSimulatorStore } from "./store";
import type { CheckStatus } from "./types";

const store = () => useSimulatorStore.getState();
const RANK: Record<CheckStatus, number> = { fail: 0, warn: 1, pass: 2 };

function demoChecks() {
  store().loadDemo();
  store().runVerification();
  return store().verification!.checks;
}

describe("orderResults", () => {
  it("puts the demo's failures, then warnings, then passes, keeping order within each", () => {
    const checks = demoChecks();
    const rows = orderResults(checks, null);
    expect(rows).toHaveLength(checks.length);
    const ranks = rows.map((r) => RANK[r.status]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    for (const status of ["fail", "warn", "pass"] as const) {
      expect(rows.filter((r) => r.status === status).map((r) => r.key)).toEqual(
        checks.filter((c) => c.status === status).map((c) => c.id),
      );
    }
    expect(rows.every((r) => !r.rule)).toBe(true);
  });

  it("merges brief rules in by status, after the engine checks in each group", () => {
    const checks = demoChecks();
    const rules: RuleResult[] = [
      { id: "has-cache", title: "Has a cache", status: "pass", detail: "Found one", kind: "required", why: "", fix: null },
      { id: "no-direct-db", title: "No direct DB", status: "fail", detail: "Needs an API", kind: "forbidden", why: "", fix: "Needs an API" },
      { id: "queue", title: "Uses a queue", status: "warn", detail: "Needs a queue", kind: "required", why: "", fix: "Needs a queue" },
    ];
    const rows = orderResults(checks, rules);
    expect(rows).toHaveLength(checks.length + rules.length);
    const ranks = rows.map((r) => RANK[r.status]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    for (const rule of rules) {
      const row = rows.find((r) => r.ruleId === rule.id)!;
      expect(row.rule).toBe(true);
      expect(row.title).toBe(rule.title);
      // Last in its group.
      expect(rows.filter((r) => r.status === rule.status).at(-1)).toBe(row);
    }
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it("handles a real brief's rules", () => {
    const brief = loadChallenges(path.resolve(__dirname, "../../challenges")).find(
      (c) => c.brief.id === "link-shortener",
    )!.brief;
    store().startChallenge(brief);
    store().runVerification();
    const { verification, ruleResults } = store();
    const rows = orderResults(verification!.checks, ruleResults);
    expect(rows.filter((r) => r.rule)).toHaveLength(ruleResults!.length);
  });
});

describe("countResults and summarizeCounts", () => {
  const row = (status: CheckStatus) => ({ status });

  it("counts each status", () => {
    const rows = [row("fail"), row("pass"), row("warn"), row("fail"), row("fail"), row("pass")];
    expect(countResults(rows)).toEqual({ fail: 3, warn: 1, pass: 2 });
  });

  it("writes the summary", () => {
    expect(summarizeCounts({ fail: 3, warn: 1, pass: 8 })).toBe("3 failed · 1 warning · 8 passed");
  });

  it("leaves out empty groups", () => {
    expect(summarizeCounts({ fail: 0, warn: 1, pass: 11 })).toBe("1 warning · 11 passed");
  });

  it("uses the plural for more than one warning", () => {
    expect(summarizeCounts({ fail: 0, warn: 2, pass: 0 })).toBe("2 warnings");
  });
});

describe("orderResults with staged rules", () => {
  it("adds one summary row for the hidden rules and marks revealed rows", () => {
    const rows = orderResults([], null, {
      shown: [
        { id: "a", title: "A", status: "fail", kind: "required", step: 1, text: "", canWhy: true, canFix: false },
        { id: "p", title: "P", status: "pass", kind: "required", step: 0, text: "Has p.", canWhy: false, canFix: false },
      ],
      hidden: { count: 2, status: "fail" },
    });
    expect(rows.map((r) => r.key)).toEqual(["rule-a", "hidden-rules", "rule-p"]);
    expect(rows[0].hint).toEqual({ step: 1, canWhy: true, canFix: false });
    expect(rows[1]).toMatchObject({ title: "2 scenario checks not met yet", hintSummary: true });
    expect(rows[2].hint).toBeUndefined();
  });

  it("says check, not checks, for one and leaves the row out for none", () => {
    const one = orderResults([], null, { shown: [], hidden: { count: 1, status: "warn" } });
    expect(one[0]).toMatchObject({ title: "1 scenario check not met yet", status: "warn" });
    expect(orderResults([], null, { shown: [], hidden: { count: 0, status: "pass" } })).toEqual([]);
  });
});
