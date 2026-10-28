# Tasks: `stale-results`

Spec: [SPEC-stale-results.md](../../SPEC-stale-results.md). Plan: [plan.md](plan.md).

Standing verification: `npm test`, `npx tsc --noEmit` and `npm run lint` pass. Engine
statuses, numbers, ids and titles, briefs, fixtures and demos are unchanged.

---

## Task 1: Move the store-render helper

**Description:**
- New `src/test/render-with-store.tsx`: `renderWithStore(ui)` copies the live store state
  into `useSimulatorStore.getInitialState()`, renders with `renderToStaticMarkup`, and
  restores the original state in a `finally`. The comment explaining why moves with it.
- `a11y.test.tsx` uses it in place of its inline copy, and its `afterEach` restore goes.

**Acceptance criteria:**
- [x] The a11y tests pass unchanged in what they assert.

**Verification:**
- [x] `npx vitest run src/components/simulator`

**Dependencies:** None

**Files:** new `src/test/render-with-store.tsx`, `src/components/simulator/a11y.test.tsx`

**Estimated scope:** XS

---

## Task 2: Tests first

**Description:**
- **`src/lib/unsaved.test.ts`:** a `forResults` block:
  - moving a node or changing its purpose → same fingerprint;
  - renaming a node, changing a config field, an edge protocol, a placement or an NFR →
    different.
- **`src/lib/store.test.ts`**, a "stale results" block:
  - no result → not stale; after `runVerification` → not stale;
  - each of these → stale: `addComponent`; `deleteEdge`; `updateEdge` protocol;
    `placeFeature`; `setNfr` in the sandbox; `updateNodeData` label;
    `updateNodeConfig`;
  - each of these → not stale: an `onNodesChange` position change; an `onNodesChange`
    dimensions change; `selectNode`; `selectEdge`; `updateNodeData` purpose;
  - running again → not stale;
  - `clearCanvas`, `startChallenge`, `loadDesign` and `loadDemo` leave `verification`
    and `verifiedFingerprint` both `null`.
- **New `src/lib/results.test.ts`:**
  - `orderResults` on the demo's checks: every fail before every warn before every pass,
    and the relative order within each group matches the input;
  - with brief rules: rules merged in by status, `rule: true`, keys unique;
  - `countResults` and `summarizeCounts`: "3 failed · 1 warning · 8 passed",
    "1 warning · 11 passed" (empty groups left out), "2 warnings" for plural.
- **New `src/components/simulator/verification-panel.test.tsx`** (`renderWithStore`):
  - no result: header and Run button, no rows;
  - demo after a run: summary text present, the warning row before the first passing
    row, passing rows absent, "Show N passed" present, with N counted from the result
    rather than hard-coded;
  - all passing (a fixture's good design in its challenge): passing rows present, no
    "Show … passed" button;
  - stale (run, then `addComponent`): "Design changed since this run", "(old)" on the
    badge, the rows' container carrying the dimmed class.
- **`src/lib/simulation.test.ts`:** across every fixture and both demos, no check
  `detail` contains "PDF".

**Acceptance criteria:**
- [x] The new tests fail for the expected reasons: the option isn't there,
  `resultsAreStale` isn't there, the module isn't there, the panel shows engine order with
  no summary, and seven messages contain "PDF".
- [x] Existing tests are still green.

**Verification:**
- [x] `npx vitest run src`

**Dependencies:** Task 1

**Files:** `src/lib/unsaved.test.ts`, `src/lib/store.test.ts`, new
`src/lib/results.test.ts`, new `src/components/simulator/verification-panel.test.tsx`,
`src/lib/simulation.test.ts`

**Estimated scope:** M

**Notes (deviations):**
- The store test changes a placement by unplacing a feature (`placeFeature(id, null)`),
  which is the simplest placement change on the demo.
- The no-"PDF" test lives in `simulation.test.ts` and imports the store for the two demos.

---

## Task 3: Fingerprint option and stale record in the store

**Description:**
- `unsaved.ts`: `fingerprint(s, opts?: { forResults?: boolean })`, which leaves out `at`
  and `purpose` when set.
- `store.ts`:
  - `verifiedFingerprint: Fingerprint | null` in the state type and the three seeds;
  - `runVerification` sets it to `fingerprint(state, { forResults: true })`;
  - every `verification: null` site also sets `verifiedFingerprint: null`;
  - `resultsAreStale()` returns false with no result; otherwise it compares both
    strings.

**Acceptance criteria:**
- [x] The unsaved and store tests pass.

**Verification:**
- [x] `npx vitest run src/lib`

**Dependencies:** Task 2

**Files:** `src/lib/unsaved.ts`, `src/lib/store.ts`

**Estimated scope:** S

---

## Task 4: Results module

**Description:**
- New `src/lib/results.ts`:
  - `ResultRow` = `{ key, title, detail, status, actual?, target?, rule, ruleId? }`;
  - `orderResults(checks, rules)`;
  - `countResults(rows)`;
  - `summarizeCounts(counts)`.

**Acceptance criteria:**
- [x] The results tests pass.

**Verification:**
- [x] `npx vitest run src/lib/results.test.ts`

**Dependencies:** Task 2

**Files:** new `src/lib/results.ts`

**Estimated scope:** S

**Notes (deviations):**
- `summarizeCounts(counts, separator = " · ")` takes an optional separator, so the
  live region can say "Run finished: 3 failed, 1 warning, 8 passed." from the same code.

---

## Task 5: Results panel

**Description:**
- `verification-panel.tsx`:
  - rows come from `orderResults`, and brief rules keep the teal tint and the id on hover;
  - the header shows the summary text next to the badge (hidden below `sm`, like the
    metrics), and "(old)" on the badge when stale;
  - a visible stale notice, "Design changed since this run.", in a polite live region;
  - a visually hidden polite live region for "Run finished: …";
  - the passed rows sit behind a "Show N passed" / "Hide passed" button when anything
    fails or warns;
  - a "Hide results" / "Show results" button with `aria-expanded` and `aria-controls`,
    which shows again on a new run;
  - stale rows dim (`opacity-60`).

**Acceptance criteria:**
- [x] The panel tests and the a11y tests pass; all other tests pass.

**Verification:**
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint`

**Dependencies:** Tasks 3 and 4

**Files:** `src/components/simulator/verification-panel.tsx`

**Estimated scope:** M

**Notes (deviations):**
- No `key` remount and no `useEffect`. Both toggles hold the result object they were
  set on (`hiddenFor`, `passedShownFor`) and only apply while it is still the current
  result, so a new run resets both. Same behaviour; it avoids a setState-in-effect and
  doesn't depend on `ranAt` being unique as a key.
- When hidden, the results container stays in the DOM with the `hidden` attribute, so
  the hide toggle's `aria-controls` always points at an element.
- The "Hide results" button only appears once there is a result.

---

## Task 6: Messages without "PDF"

**Description:**
- Replace the seven `detail` strings in `src/lib/simulation.ts` with the spec's table.
  Nothing else in the file changes.

**Acceptance criteria:**
- [x] The no-"PDF" test passes.
- [x] `git diff src/lib/simulation.ts` shows only those seven strings.
- [x] Demo and fixture tests are unchanged and green.

**Verification:**
- [x] `npm test`

**Dependencies:** Task 2 (independent of 3–5)

**Files:** `src/lib/simulation.ts`

**Estimated scope:** XS

---

## Task 7: Docs, full checks, browser checks

**Description:**
- `docs/ui-ux-audit.md`: mark findings 1 and 10 fixed (10's "resizable" becomes
  "collapsible").
- `HANDOVER.md`: add the step.
- `npm run build`.
- **Browser check (Chrome DevTools):**
  - Sandbox at 1440×900: run, drag a node (not stale, and no lag), add a node (stale:
    notice, "(old)", dimmed rows), run again (fresh).
  - Challenge at 1280×800: run on an empty canvas, add a VM (stale); failures first,
    passes collapsed, counts right.
  - Toggles: Hide results shrinks the panel to its header and the canvas grows; a new
    run shows it again; Show N passed works.
  - Lighthouse accessibility snapshot in both modes: 100.
  - The accessibility snapshot shows the live-region text after a run and after a
    change.
  - At 390 px the header still fits.
  - The console has no new errors.

**Acceptance criteria:**
- [x] All five spec success criteria hold.

**Verification:**
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and the browser
  checks

**Notes (review, 2026-10-28):**
- **Sandbox, 1440:**
  - after a run, 1 warning first and "Show 10 passed";
  - dragging a node doesn't mark results old;
  - adding a VM shows the notice, "Warn (old)" and the old-results styling;
  - Show passed expands to 11 rows;
  - Hide results sets `hidden` and `aria-expanded="false"`;
  - a new run shows the panel again, fresh and sorted.
- **Challenge (food guide), 1280:** a run on an empty canvas gives 8 failures first
  (engine checks and brief rules by status) and 2 passes collapsed; adding a VM marks the
  results old. This is the audit's scenario, which now reads "Fail (old)" and "Design
  changed since this run."
- **Dimming changed in review.** `opacity-60` on the results container cut the text to
  2.25–4.0:1, and Lighthouse fell to 96. Old rows now get a dashed border and grey,
  faded icons, and the text keeps full contrast. The container carries `data-stale`, which
  the panel test checks instead of `opacity-60`. Lighthouse: 100 in the sandbox and in a
  challenge, both with results marked old.
- **Added in review:** each row starts with a visually hidden "Failed:", "Warning:" or
  "Passed:". Before this, the status was only an icon, which screen readers can't read.
  The panel test checks it.
- **Drag timing:** 20-step drags took 0.5–1.5 s in the dev build, with or without a
  result. There's no consistent difference, so the stale check isn't adding measurable
  lag, and no memoising was needed.
- **390 px:** the header wraps to two rows with no sideways scroll.
- **Console:** only React Flow's existing attribution warning.

**Dependencies:** Tasks 3–6

**Files:** `docs/ui-ux-audit.md`, `HANDOVER.md`

**Estimated scope:** S
