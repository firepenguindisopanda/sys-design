# Tasks: `staged-hints`

Spec: [SPEC-staged-hints.md](../../SPEC-staged-hints.md). Plan: [plan.md](plan.md).

Standing verification: `npm test`, `npx tsc --noEmit` and `npm run lint` pass. Rule
statuses, overall results, `detail` text, briefs, fixtures, the engine and the probe output
are unchanged.

---

## Task 1: Tests first

**Description:**
- **Before any change**, save the probe output:
  `PROBE=1 npx vitest run tests/probe.test.ts --reporter=verbose > <scratch>/probe-before.txt`.
- **`src/lib/challenges/rules.test.ts`:**
  - the existing assertions are untouched;
  - new cases for `kind`, `why` and `fix`:
    - a required edge rule, failing and passing (`fix` "Needs a … connection." / null);
    - a component rule, failing ("Needs 2 × database …; found 1.") and passing;
    - a forbidden rule, violated ("Remove …") and clean (null).
- **New `src/lib/hints.test.ts`**, with hand-built `RuleResult`s:
  - all steps 0: failing required rules hidden (`hidden.count`, worst `hidden.status`);
    forbidden failures and passes shown with `detail`;
  - steps 1, 2 and 3 give `text` "", `why`, and `why fix`; `canWhy` and `canFix` are set
    to match;
  - `nextHiddenId` follows input (brief) order and skips revealed rules;
  - a step-2 rule that now passes is shown as a pass with no buttons, and comes back at
    step 2 when it fails again;
  - `hintsUsed`.
- **`src/lib/store.test.ts`:**
  - in `campus-food-guide` on an empty canvas after a run, `revealNextHint` sets the first
    failing required rule to 1, and a second call sets the next one;
  - `advanceHint` stops at 3;
  - `revealNextHint` with nothing hidden changes nothing;
  - `startChallenge`, `leaveChallenge` and `loadDesign` reset `hintSteps`;
  - hint actions leave `resultsAreStale()` and `hasUnsavedWork()` false.
- **`verification-panel.test.tsx`**, food guide, empty canvas, run:
  - none of the three required rules' titles, their `why` text or "Needs a" appears;
  - "3 scenario checks not met yet" and a "Show a hint" button appear;
  - the failed count includes the hidden rules;
  - after `revealNextHint`, "Site files served by a CDN" appears and its `why` doesn't,
    with a "Why?" button;
  - after two `advanceHint` calls, the "Needs a cdn → static_hosting" fix appears;
  - "Hints used: 3".
- **Same file**, with a client → database edge: the forbidden rule's full text appears at
  once.
- **`a11y.test.tsx`:** the panel with the summary row and a revealed rule has no unnamed
  controls.
- **`brief-panel.test.tsx`:** the hint line appears.

**Acceptance criteria:**
- [x] The new tests fail for the expected reasons: no `kind`/`why`/`fix`, no `./hints`, no
  `hintSteps`, and the panel shows rule titles at once.
- [x] Existing tests are still green.

**Verification:**
- [x] `npx vitest run src`

**Notes (deviations):**
- The panel test can't assert the live region's text ("Hint: …"): it is set by the
  buttons' click handlers, which static markup can't run. The test checks the polite
  region exists instead; the announcement needs the browser check.
- The a11y test for the hint buttons is a new `describe` in `a11y.test.tsx` that renders
  `VerificationPanel`.

**Dependencies:** None

**Files:** `rules.test.ts`, new `hints.test.ts`, `store.test.ts`,
`verification-panel.test.tsx`, `a11y.test.tsx`, `brief-panel.test.tsx`

**Estimated scope:** M

---

## Task 2: Rule result parts

**Description:**
- `types.ts`: `RuleResult` gains `kind`, `why` and `fix`.
- `rules.ts`: build them and compose `detail` from them, with the text unchanged.

**Acceptance criteria:**
- [x] The `rules.test.ts` cases pass.
- [x] The probe output is identical to `probe-before.txt`.

**Verification:**
- [x] `npx vitest run src/lib/challenges`, then the probe again and a `diff`

**Dependencies:** Task 1

**Files:** `src/lib/challenges/types.ts`, `src/lib/challenges/rules.ts`

**Estimated scope:** S

---

## Task 3: Staging helper and store

**Description:**
- New `src/lib/hints.ts` with `stageRules` and `hintsUsed`.
- `store.ts`:
  - `hintSteps`, `revealNextHint` and `advanceHint`;
  - the resets in the three replace actions and the seeds.

**Acceptance criteria:**
- [x] The hints and store tests pass.

**Verification:**
- [x] `npx vitest run src/lib`

**Notes (deviations):**
- `loadDemo` and `loadFanInDemo` also reset `hintSteps` (they share the sandbox seed
  shape); `clearCanvas` does not, since it doesn't leave the challenge.

**Dependencies:** Tasks 1 and 2

**Files:** new `src/lib/hints.ts`, `src/lib/store.ts`

**Estimated scope:** S

---

## Task 4: Panel and brief line

**Description:**
- `results.ts`: `orderResults` accepts the optional `staged` argument, adds the summary
  row, and puts `hint` on revealed rows.
- `verification-panel.tsx`:
  - counts from the unstaged rows, and rows from the staged ones;
  - the summary row with Show a hint;
  - Why? and Show the fix on revealed rows;
  - "Hints used: N" in a challenge;
  - the hint live region.
- `brief-panel.tsx`: "After a run, scenario checks you haven't met appear as hints you can
  open one at a time."

**Acceptance criteria:**
- [x] The panel, a11y and brief-panel tests pass; all other tests pass.

**Verification:**
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint`

**Notes (deviations):**
- Added two `orderResults` cases to `results.test.ts` for the summary row (not in Task 1's
  list), and gave its hand-built `RuleResult`s the new fields so `tsc` passes.
- The live region text comes from local panel state set on click ("Hint: <title>",
  "Why: <why>", "Fix: <fix>"), cleared by a new run, rather than from the store.
- "Why?" and "Show the fix" carry an `aria-label` that adds the rule title, since every
  revealed row has the same button text.
- "Hints used: N" shows in a challenge whenever there is a result, including 0.

**Dependencies:** Task 3

**Files:** `src/lib/results.ts`, `verification-panel.tsx`, `brief-panel.tsx`

**Estimated scope:** M

---

## Task 5: Docs, full checks, browser checks

**Description:**
- `docs/challenges/brief-format.md`: the note under `rules` from the spec.
- `docs/ui-ux-audit.md`: mark finding 2 fixed.
- `HANDOVER.md`: add the step, and widen the "rules aren't listed in the Brief tab"
  decision.
- `npm run build`.
- **Browser check (Chrome DevTools):** every item in the spec's "Browser check", plus
  Lighthouse with hints open, and the console.

**Acceptance criteria:**
- [x] All five spec success criteria hold.

**Verification:**
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` (all pass), and the browser
  checks (left for review)

**Notes (review, 2026-10-28):**
- **Probe:** a rerun matches `probe-before.txt` line for line apart from timing (361
  lines).
- **Food guide, 1280, empty canvas, run:** no rule title, `why` or "Needs a" in the
  results, only "3 scenario checks not met yet". The header reads "8 failed · 2 passed",
  so the hidden rules count. The engine's own latency advice ("Add CDN/cache…") is
  generic across briefs, not a rule spoiler.
- **Keyboard:**
  - Show a hint opens "Site files served by a CDN" only; focus moves to that row; the live
    region says "Hint: Site files served by a CDN"; "Hints used: 1".
  - Tab, then Why? adds the `why`, and focus stays on the same button, now "Show the fix".
  - Enter adds "Needs a cdn → static_hosting connection.", and focus moves to the row.
  - "Hints used: 3".
- **Building the CDN part:** that rule passes and moves to the passes; the other two stay
  hidden.
- **A client → database edge:** the forbidden rule shows in full at once.
- **Leaving the challenge and coming back:** hints reset ("Hints used" gone, the summary row
  back).
- **Lighthouse with hints open:** 100. **Console:** only React Flow's attribution warning.
- **Fixed in review:**
  - **Focus.** "Why?" and "Show the fix" were separate elements, and the summary row or the
    pressed button could disappear, dropping focus to `body`. Now:
    - one button changes its text from Why? to Show the fix;
    - rule rows are focusable (`tabIndex=-1`), and focus moves to the rule's row after Show
      a hint and after Show the fix.
  - **"Hints used"** only shows once a hint has been opened, not as "Hints used: 0".
  - **Camera on an empty challenge (from `canvas-ergonomics`, already on `main`).** Starting
    a challenge called `fitView` on an empty canvas. React Flow queues that fit until nodes
    appear, so the first node added zoomed the view to 1.5. On an empty design
    `FitViewOnReady` now resets to 100% instead. Checked: the zoom stays at 1 after
    starting the food guide and adding two nodes, both in view.
- **Noted, not changed (`detail` text is out of scope):** a forbidden rule's fix names
  internal edge ids ("Remove e-desktop-18-database-19-db-z28ai."). Naming the two nodes
  instead would be a small follow-up in `rules.ts`.

**Dependencies:** Tasks 2–4

**Files:** `docs/challenges/brief-format.md`, `docs/ui-ux-audit.md`, `HANDOVER.md`

**Estimated scope:** S
