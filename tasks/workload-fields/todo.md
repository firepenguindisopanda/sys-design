# Tasks: `workload-fields`

Spec: [SPEC-workload-fields.md](../../SPEC-workload-fields.md). Plan: [plan.md](plan.md).

Standing verification: `npm test`, `npx tsc --noEmit` and `npm run lint` pass; engine,
briefs, fixtures and demos unchanged.

---

## Task 1: Tests first

**Description:**
- **New `src/components/simulator/feature-workload.test.tsx`** (static render):
  - sandbox: the labels "Slow work", "If polled" and "Files" appear; a set field shows
    its value, and unset ones show empty boxes; nothing is disabled;
  - challenge: only the set fields appear, disabled, each with its `title` tooltip;
  - challenge with none of the fields: an empty render.
- **`parseWorkloadInput`:**
  - `"2400"` → 2400, `"1"` → 1;
  - `"0.5"`, `""`, `"0"`, `"-3"` and `"abc"` → `undefined`.
- **`src/lib/store.test.ts`:** in the sandbox, set a feature's `fileRpm` with
  `updateFeature`, then set it to `undefined`. Export then has no `fileRpm` line, and
  `runVerification` gives the same result as before the edit.

**Acceptance criteria:**
- [x] The component and parser tests fail because the file doesn't exist yet. The store
  test passes already, which confirms that no store change is needed.

**Verification:**
- [x] `npx vitest run src/components/simulator src/lib/store.test.ts`

**Dependencies:** None

**Files:** `src/components/simulator/feature-workload.test.tsx`, `src/lib/store.test.ts`

**Estimated scope:** S

---

## Task 2: Component and panel wiring

**Description:**
- Read the client components guide in `node_modules/next/dist/docs/`.
- Write `feature-workload.tsx`:
  - `FeatureWorkload({ feature, locked, onChange })` renders the row, with local text per
    box;
  - export `parseWorkloadInput`.
- In `requirements-panel.tsx`:
  - render it under the Target RPM row, passing
    `(patch) => updateFeature(feature.id, patch)`;
  - add the sandbox-only help line under the section heading.

**Acceptance criteria:**
- [x] Task 1's tests pass; all other tests pass

**Verification:**
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint`

**Dependencies:** Task 1

**Files:** `src/components/simulator/feature-workload.tsx`,
`src/components/simulator/requirements-panel.tsx`

**Estimated scope:** S

---

## Task 3: Docs, full checks, browser checks

**Description:**
- **`brief-format.md`:** one sentence saying students see these fields read-only on the
  feature card.
- **`HANDOVER.md`:** update it.
- **`npm run build`.**
- **Browser** (DevTools, 1440 wide):
  - **Sandbox:**
    - load the BeUWI demo and type 3000 into the first feature's Slow work;
    - run: latency rises by 3000 ms, and the detail names the feature;
    - type "0.5" and then "05": the box keeps the text;
    - clear the box and run: latency is back to before.
  - **Challenge:** in the shuttle tracker, "Live map" shows If polled 3600, disabled, and
    the other cards have no row.
  - **Narrow view:** check the card at 390 px wide.
  - **Console:** check for errors.

**Acceptance criteria:**
- [x] All three spec success criteria met

**Verification:**
- [x] Results recorded in the notes below and in `plan.md`

**Dependencies:** Task 2

**Files:** `docs/challenges/brief-format.md`, `HANDOVER.md`, `tasks/workload-fields/*`

**Estimated scope:** S

---

## Notes

- **Task 1:**
  - `feature-workload.test.tsx`: 4 render cases and 7 parser cases. The file failed to
    load at first because the component didn't exist yet.
  - The store round-trip test passed straight away, which confirms no store change was
    needed.
- **Task 2:**
  - I read `05-server-and-client-components.md`. The new file declares `"use client"`
    itself, because it uses `useState`. That's a small deviation from the spec, which said
    it needed no directive; it matches the other stateful components in the folder and the
    guide's advice for interactive files.
  - The panel renders `FeatureWorkload` under the Target RPM row, with the sandbox help
    line under the heading.
  - Two fixes along the way:
    - The test's "not disabled" check matched Tailwind's `disabled:` classes, so it now
      looks for the `disabled=""` attribute.
    - A lint error from an unused destructured key; the code now deletes the key from a
      copy instead.
  - 531 passed; `tsc` and lint clean.
- **Task 3:** one sentence in `brief-format.md`; `HANDOVER.md`; `npm run build` passes.
  Browser checks (DevTools):
  - **Sandbox, 1440 wide:** the help line and three empty boxes on both demo features.
    - Baseline run: 96 ms.
    - Slow work 3000 → 3096 ms, and the detail says "Browse / search programmes waits for
      3000 ms of slow work…".
    - Typed "0.5": the box kept "0.5" while focused; on blur it emptied, and the run was
      back to 96 ms.
    - The first click on Run simulation after the page loaded didn't register; a second
      run worked. I didn't investigate further.
  - **Challenge, shuttle tracker, Requirements tab:**
    - only "Live map" has a Workload row: If polled 3600, disabled, with its tooltip;
    - the other two cards have none, and there's no help line.
    - Switching to the challenge showed the app's "Replace your design?" dialog, because
      the sandbox had been edited; I chose Replace.
  - **390 px, side sheet:** the row sits inside the card's three-column grid with no
    overflow.
  - **Console:** only React Flow's attribution warning.
- `npm test` 531 passed, 1 skipped; `tsc`, lint and `npm run build` pass.
