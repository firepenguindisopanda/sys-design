# Spec: staged hints for brief rules

Status: **approved** (2026-10-28) as proposed:
- a count only at first;
- hints on demand;
- three steps (title, why, fix);
- forbidden rules shown in full;
- "Hints used" shown;
- one combined plan and task list.

Plan: [tasks/staged-hints/plan.md](tasks/staged-hints/plan.md). Module id `staged-hints`. Branch: `feat/staged-hints`, from
`main` (`728839e`). Covers finding 2 of [docs/ui-ux-audit.md](docs/ui-ux-audit.md).

This spec turns on teaching decisions that are yours to make. The open questions at the
end lay them out with a recommendation each.

## Objective

**One run on an empty canvas gives away every brief rule's answer.** Brief rules are kept
out of the Brief tab because "they read like hints" (`HANDOVER.md`). After the first run,
though, every failing rule is listed in full. The answer shows up in three places, not one:

| Where | Example (`campus-food-guide`) | Gives away |
|---|---|---|
| **Title** | "Site files served by a CDN", "Menus served from a cache" | the component |
| **Why** | "…host them as static files behind a CDN instead of on your API servers." | the component and the reason |
| **Fix** (built by `rules.ts`) | "Needs a cdn → static_hosting connection." | the exact connection |

So a student can build the design from the list without reasoning about it. Only the
"Needs a …" line was mentioned in the audit. Staging that line alone wouldn't help, because
the title and `why` already name the fix.

There are 74 rules across the 16 briefs:
- 19 are **forbidden** rules, such as "No client talks to the database". These point at
  something the student drew, not something missing.
- 6 are **component** rules (a minimum count of a kind).
- The rest are **required-edge** rules.

Users: students in a challenge. The sandbox has no brief rules and doesn't change.

## Change (as proposed; see the open questions)

### A. Failing required rules start hidden

- A failing **required** rule (a required edge, or a component minimum) appears first as
  part of **one summary row**: "2 scenario checks not met yet", with a **Show a hint**
  button. Its title, `why` and fix are not shown.
  - The engine's own checks stay as they are. They describe the symptom ("Throughput:
    actual 0 req/min, target ≥ 1300"), which is the clue the student should work from.
- **Passing rules** show their title as now ("Has …"). The student built it, so nothing is
  given away.
- **Forbidden rules** show in full straight away, title, `why` and "Remove …". They point
  at an edge the student drew, so the student already knows the thing being named.
- Hidden failing rules still count toward the overall result and the counts ("3 failed"),
  so a design can't look like it passes.

### B. Hints come in three steps, on demand

For each hidden rule, in the brief's rule order:

1. **Show a hint** reveals the next hidden rule's **title**, for example "Menus served from
   a cache". The rule becomes its own row, and the summary row counts one fewer.
2. On that row, **Why?** adds the `why` sentence.
3. Then **Show the fix** adds the fix line ("Needs a compute → cache connection.").

- The steps are per rule, and they last until the challenge is left, restarted or replaced
  by an import. Running again, editing or a rule passing for a while doesn't hide a
  revealed step again.
- If a revealed rule passes, it shows as a normal passing row. If it fails again later, it
  comes back at the step it had reached.

### C. The Brief tab says hints exist

One line under "Think about": "After a run, scenario checks you haven't met appear as
hints you can open one at a time."

### D. Hint use is counted, not yet stored

- The store keeps `hintSteps: Record<ruleId, 0 | 1 | 2 | 3>`.
- A small `hintsUsed` total is shown as "Hints used: 3" next to the counts, in a challenge
  only.
- Nothing is saved or sent anywhere. Recording it in exported files, or for the TA
  misconception report, is a later decision.

## Out of scope

- Writing a new "symptom" line for each rule, describing the problem rather than the fix
  (option C in open question 1). It's content work across 55 rules, so a separate step if
  you want it.
- Saving hint use in design files, or sending it anywhere.
- Changing the engine checks' wording, or any brief's rules, titles or `why` text.
- The sandbox.

## Code

- **`src/lib/challenges/types.ts`:** `RuleResult` gains structured parts. `detail` stays as
  today's full text, for the probe, tests and brief authors.
  - `kind: "required" | "forbidden"`: component rules count as required;
  - `why: string`;
  - `fix: string | null`: "Needs a … connection." or "Needs 2 × database …; found 1."
    for required rules, "Remove …" for forbidden ones, and null when the rule passes.
- **`src/lib/challenges/rules.ts`:** builds those parts. It composes `detail` from them, so
  today's text is unchanged byte for byte, and `rules.test.ts` keeps passing as it is.
- **`src/lib/hints.ts`** (new, pure):
  - `stageRules(ruleResults, hintSteps)` returns `{ shown: RuleRow[], hiddenCount: number,
    nextHiddenId: string | null }`. Each `RuleRow` carries the step-appropriate text and
    which buttons it offers.
  - `hintsUsed(hintSteps)` returns the total.
- **`src/lib/store.ts`:**
  - `hintSteps` and `advanceHint(ruleId)`;
  - `revealNextHint()`, which moves the next hidden failing rule to step 1;
  - all reset by `startChallenge`, `leaveChallenge` and `loadDesign`;
  - not part of either fingerprint, so hints never mark results stale or count as unsaved
    work.
- **`src/lib/results.ts`:** `orderResults` takes staged rule rows, and the summary row
  sorts with the failures.
- **`verification-panel.tsx`:**
  - the summary row with **Show a hint**;
  - **Why?** and **Show the fix** buttons on revealed rows;
  - "Hints used: N";
  - a polite live region announcing what a hint revealed.
- **`brief-panel.tsx`:** the one line in C.
- **Next.js:** no Next API changes.

## Tests (written first)

- **`rules.test.ts`:**
  - the existing `detail` assertions are unchanged;
  - new assertions for `kind`, `why` and `fix` on required, component and forbidden rules,
    passing and failing.
- **New `src/lib/hints.test.ts`:**
  - with every step at 0, failing required rules are hidden and counted, while forbidden
    and passing rules are shown;
  - step 1 shows the title only, step 2 adds `why`, and step 3 adds `fix`;
  - `nextHiddenId` follows the brief's rule order;
  - a revealed rule that now passes shows as passing, and comes back at its step if it
    fails again;
  - `hintsUsed` sums the steps.
- **`store.test.ts`:**
  - `revealNextHint` and `advanceHint` (which stops at 3);
  - the reset on the three replace actions;
  - hints don't make results stale or count as unsaved work.
- **`verification-panel.test.tsx`**, using `campus-food-guide` on an empty canvas after a
  run:
  - no rule title, `why` or "Needs" text in the markup;
  - "3 scenario checks not met yet" and **Show a hint**;
  - after `revealNextHint`, the first rule's title appears, and its `why` doesn't;
  - after two `advanceHint` calls, the "Needs a cdn → static_hosting" fix appears;
  - a forbidden rule's violation shows in full at once.
- **`a11y.test.tsx`:** the new buttons are named.
- **Fixture harness and probe:** unchanged; they read `status` and `detail`.

## Browser check (Chrome DevTools)

- **Food guide, 1280, empty canvas, run:**
  - the results show engine failures and "3 scenario checks not met yet", with no rule
    names;
  - Show a hint reveals "Site files served by a CDN" only;
  - Why? and then Show the fix complete it;
  - "Hints used: 3".
- **Build the CDN part and run:** that rule passes, and the other two stay hidden.
- **Draw a client → database edge and run:** the forbidden rule shows in full.
- **Leave the challenge and come back:** the hints are reset.
- **Lighthouse** in a challenge with hints open: 100.
- The console has no new errors.

## Docs

- `docs/challenges/brief-format.md`: under `rules`, say that students first see failing
  required rules as hints, so the title, `why` and fix are revealed in that order. Write
  titles that make sense on their own.
- `docs/ui-ux-audit.md`: mark finding 2 fixed.
- `HANDOVER.md` (untracked): the "Brief rules aren't listed in the Brief tab" decision now
  also covers results.

## Boundaries

- **Always:**
  - rule statuses, the overall result, `detail` text, briefs, fixtures, the engine and the
    probe unchanged;
  - tests, `tsc`, lint and build stay green;
  - Lighthouse stays at 100.
- **Ask first:**
  - writing symptom lines into briefs;
  - storing or exporting hint use;
  - unlocking hints automatically after failed runs.
- **Never:**
  - hide a failing rule's effect on the overall result;
  - hide a forbidden rule's violation.

## Success criteria

1. A first run in a challenge names no missing component or connection from a brief rule.
2. A student can reveal each rule's title, then `why`, then fix, one at a time, and the
   panel counts hints used.
3. Forbidden-rule violations and passing rules show as before.
4. Results, statuses and `detail` are unchanged for the probe, fixtures and tests.
5. All tests, `tsc`, lint and build pass; the browser checks pass; Lighthouse stays at 100.

## Open questions (teaching decisions)

1. **What does a student see first for a failing required rule?**
   - **Proposed: only a count** ("3 scenario checks not met yet"). The engine's checks
     show the symptoms. There's no content to write.
   - B: the **title** at once, with `why` and fix behind hints. It's simpler, but titles
     like "Menus served from a cache" are most of the answer.
   - C: a **new symptom line** per rule, for example "At lunch every menu read goes to the
     database", written into each brief. This is the best teaching, but it means 55 new
     sentences, reviewed per brief. It could follow later as its own step.
2. **How are hints unlocked?**
   - **Proposed: on demand** (buttons), so the student chooses to struggle or ask.
   - The alternatives are automatic unlocking after a rule fails on N runs with design
     changes between them, or both.
3. **How many steps?** **Proposed: three** (title → why → fix). The alternative is two
   (title → why and fix together).
4. **Forbidden rules shown in full at once?** **Proposed yes.** They name the student's own
   edge, not a missing idea.
5. **Show "Hints used: N" to the student?** **Proposed yes,** as gentle feedback, kept in
   memory only. The alternative is to count it silently for later analytics.
6. **Plan format.** One combined plan and task list, as before?
