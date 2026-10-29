# Implementation Plan: `staged-hints`

Spec: [SPEC-staged-hints.md](../../SPEC-staged-hints.md) (approved). Task checklist:
[todo.md](todo.md). Branch: `feat/staged-hints`, from `main` (`728839e`).

## Overview

- **Rule results** carry their parts (`kind`, `why`, `fix`) alongside today's `detail`.
- **`src/lib/hints.ts`** (pure) stages them:
  - failing required rules are hidden until hinted;
  - forbidden and passing rules are shown;
  - each hinted rule shows title, then `why`, then `fix`.
- **The store** keeps `hintSteps` per rule, reset whenever the design is replaced.
- **The results panel** shows a summary row for the hidden rules, the hint buttons and
  "Hints used: N". Counts and the overall result still include the hidden rules.

## Dependency graph

```
T1 tests: rule parts, staging, store hints, panel, a11y (failing)
        │
        ├────────────────────────┐
        ▼                        ▼
T2 RuleResult parts        T3 hints.ts + store hintSteps
   (rules.ts, types.ts)          │
        │                        │
        └───────────┬────────────┘
                    ▼
T4 results.ts + verification-panel.tsx (summary row, buttons, Hints used, live region)
   + brief-panel line
                    │
                    ▼
T5 docs, full checks, browser checks, Lighthouse
```

## Architecture decisions

- **`RuleResult` keeps `detail` as the full text.**
  - The probe, the fixture harness, `rules.test.ts` and brief authors keep reading it.
  - New fields:
    - `kind: "required" | "forbidden"` (component rules are "required");
    - `why: string`;
    - `fix: string | null`.
  - `rules.ts` builds `why` and `fix` first, then
    `detail = ok ? <current pass text> : \`${why} ${fix}\``. The current `rules.test.ts`
    `detail` assertions then prove the text is byte-identical.
- **`stageRules(results, steps)`** in `src/lib/hints.ts` returns:
  - `shown: StagedRule[]`: each one `{ id, title, status, kind, step, text, canWhy,
    canFix }`, where `text` depends on the step:
    - a pass shows `detail` ("Has …");
    - a forbidden failure shows `detail`;
    - step 1 shows "" (title only);
    - step 2 shows `why`;
    - step 3 shows `why fix`.
  - `hidden: { count, status }`: failing required rules at step 0, with the worst status
    among them.
  - `nextHiddenId`: the first hidden rule in brief order, or null.

  `hintsUsed(steps)` sums the step values. No React, no store.
- **Store:**
  - `hintSteps: Record<string, 1 | 2 | 3>` (absent means 0);
  - `revealNextHint()` puts the current `nextHiddenId` at 1. It reads `ruleResults` and
    does nothing without a hidden rule;
  - `advanceHint(id)` adds one, up to 3;
  - all three replace actions (`startChallenge`, `leaveChallenge`, `loadDesign`) reset to
    `{}`, and the sandbox seeds include `{}`;
  - hint state isn't in either fingerprint.
- **The results module stays generic.**
  - `orderResults(checks, rules)` gets an optional third argument, `staged?: { shown,
    hidden }`.
  - When it's given, rule rows come from `shown`, and one summary row is added when
    `hidden.count > 0`:
    - key `hidden-rules`, `status: hidden.status`;
    - title "N scenario checks not met yet", or "1 scenario check not met yet";
    - `detail` "Open a hint to see what's missing, one at a time.";
    - a `hintSummary: true` marker.
  - `ResultRow` gains optional `hint?: { step, canWhy, canFix }` for revealed rule rows.
  - Counts are still computed from the **unstaged** rows
    (`countResults(orderResults(checks, rules))`), so "3 failed" includes the hidden rules.
- **Panel:**
  - the summary row has a **Show a hint** button, which calls `revealNextHint`;
  - revealed rows have **Why?** (step 1) or **Show the fix** (step 2), which call
    `advanceHint(id)`;
  - "Hints used: N" sits next to the counts in a challenge (hidden below `sm`, like the
    counts);
  - a polite `sr-only` live region says what the last hint showed, for example "Hint:
    Site files served by a CDN";
  - the passed-rows collapse and the stale styling apply to hint rows as to any other.
- **Brief tab:** one muted line under "Think about".
- **Which rule is "next" is fixed by brief order,** not by sort order, so the hints follow
  the brief author's sequence.

## Task list

- [x] Task 1: Tests first
- [x] Task 2: Rule result parts
- [x] Task 3: Staging helper and store
- [x] Task 4: Panel and brief line
- [x] Task 5: Docs, full checks, browser checks

### Checkpoint
- [x] All five spec success criteria met; ready for review (nothing committed until asked)

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `detail` text drifts while splitting it into parts | High | Existing `rules.test.ts` assertions unchanged; the probe output diffed before and after on all briefs |
| Hidden rules make a failing design look better | High | Counts and overall result computed from unstaged results; panel test checks "N failed" includes hidden rules |
| Students miss that hints exist | Med | The summary row is a failing row sorted first, with a visible button; the Brief tab line |
| A revealed rule's button lingers after it passes | Low | Passing rows have no hint buttons; tested |
| Rule ids collide across briefs in `hintSteps` | Low | Reset on every challenge change; ids are unique within a brief (validator) |
