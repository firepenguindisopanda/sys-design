import { describe, expect, it } from "vitest";
import type { RuleResult } from "./challenges/types";
import { hintsUsed, stageRules } from "./hints";

function rule(patch: Partial<RuleResult> & { id: string }): RuleResult {
  const status = patch.status ?? "fail";
  const kind = patch.kind ?? "required";
  const fix = status === "pass" ? null : (patch.fix ?? `Needs ${patch.id}.`);
  return {
    title: `Title ${patch.id}`,
    status,
    kind,
    why: `Why ${patch.id}.`,
    fix,
    detail: status === "pass" ? `Has ${patch.id}.` : `Why ${patch.id}. ${fix}`,
    ...patch,
  };
}

const a = rule({ id: "a" });
const b = rule({ id: "b", status: "warn" });
const c = rule({ id: "c" });
const passed = rule({ id: "p", status: "pass" });
const forbidden = rule({ id: "f", kind: "forbidden", fix: "Remove x->y." });

describe("stageRules", () => {
  it("hides failing required rules and shows forbidden failures and passes in full", () => {
    const staged = stageRules([a, passed, b, forbidden], {});
    expect(staged.hidden).toEqual({ count: 2, status: "fail" });
    expect(staged.shown.map((r) => r.id)).toEqual(["p", "f"]);
    expect(staged.shown[0]).toMatchObject({ text: "Has p.", canWhy: false, canFix: false });
    expect(staged.shown[1]).toMatchObject({
      status: "fail",
      text: "Why f. Remove x->y.",
      canWhy: false,
      canFix: false,
    });
  });

  it("takes the worst status among the hidden rules", () => {
    expect(stageRules([b], {}).hidden).toEqual({ count: 1, status: "warn" });
    expect(stageRules([passed], {}).hidden.count).toBe(0);
  });

  it("shows the title, then why, then the fix", () => {
    const one = stageRules([a], { a: 1 }).shown[0];
    expect(one).toMatchObject({ id: "a", title: "Title a", step: 1, text: "", canWhy: true, canFix: false });
    const two = stageRules([a], { a: 2 }).shown[0];
    expect(two).toMatchObject({ step: 2, text: "Why a.", canWhy: false, canFix: true });
    const three = stageRules([a], { a: 3 }).shown[0];
    expect(three).toMatchObject({ step: 3, text: "Why a. Needs a.", canWhy: false, canFix: false });
    expect(stageRules([a], { a: 1 }).hidden.count).toBe(0);
  });

  it("picks the next hidden rule in brief order, skipping revealed ones", () => {
    expect(stageRules([a, b, c], {}).nextHiddenId).toBe("a");
    expect(stageRules([a, b, c], { a: 1 }).nextHiddenId).toBe("b");
    expect(stageRules([a, b, c], { a: 3, b: 1 }).nextHiddenId).toBe("c");
    expect(stageRules([a, b, c], { a: 1, b: 1, c: 1 }).nextHiddenId).toBeNull();
    expect(stageRules([passed, forbidden], {}).nextHiddenId).toBeNull();
  });

  it("shows a revealed rule that now passes as a pass, and restores its step when it fails again", () => {
    const nowPasses = stageRules([rule({ id: "a", status: "pass" })], { a: 2 }).shown[0];
    expect(nowPasses).toMatchObject({ status: "pass", text: "Has a.", canWhy: false, canFix: false });
    const failsAgain = stageRules([a], { a: 2 }).shown[0];
    expect(failsAgain).toMatchObject({ step: 2, text: "Why a.", canFix: true });
  });
});

describe("hintsUsed", () => {
  it("sums the steps", () => {
    expect(hintsUsed({})).toBe(0);
    expect(hintsUsed({ a: 3, b: 1 })).toBe(4);
  });
});
