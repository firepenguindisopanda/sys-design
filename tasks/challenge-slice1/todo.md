# Tasks: Phase 3, slice 1: start and verify a challenge

Spec: [SPEC-challenge-slice1.md](../../SPEC-challenge-slice1.md). Plan: [plan.md](plan.md).

Standing verification for every task: `npm test`, `npx tsc --noEmit` and `npm run lint`
pass; `tests/demos.test.ts` unchanged. Tasks that touch `page.tsx` or the UI also run
`npm run build` and a browser check with no console errors.

---

## Task 1: Load briefs on the server and pass them to the client

**Description:** Read `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
(passing data, environment poisoning) first. Add the `server-only` package and
`import "server-only"` in `src/lib/challenges/load.ts`; alias it to an empty module in
`vitest.config.mts`. `page.tsx` calls `loadChallenges` and passes `briefs` (briefs only)
to `SimulatorApp`, which passes them to `DesignCanvas`. Nothing uses them yet.

**Acceptance criteria:**
- [x] `npm run build` passes and prerenders the page
- [x] Importing `load.ts` from a client file fails the build (checked once, then reverted)
- [x] The app looks and behaves exactly as before

**Verification:**
- [x] `npm run build`; standing checks; browser: app loads, no console errors

**Dependencies:** None

**Files likely touched:** `package.json`, `package-lock.json`, `vitest.config.mts`,
`src/lib/challenges/load.ts`, `src/app/page.tsx`,
`src/components/simulator/simulator-app.tsx`, `src/components/simulator/design-canvas.tsx`

**Estimated scope:** S

---

## Task 2: Unplace features when their node is removed

**Description:** Test first in a new `src/lib/store.test.ts`: place a feature, then
(a) `clearCanvas`, (b) remove its node through `onNodesChange` with a `remove` change;
the feature's `placedOnNodeId` must become `null`. Then fix both actions.

**Acceptance criteria:**
- [x] Both cases unplace the feature; features on other nodes stay placed
- [x] Demos test unchanged

**Verification:**
- [x] `npx vitest run src/lib/store.test.ts`; standing checks

**Dependencies:** None

**Files likely touched:** `src/lib/store.ts`, `src/lib/store.test.ts`

**Estimated scope:** S

---

## Checkpoint A
- [x] Standing checks and `npm run build` green; app unchanged in the browser

---

## Task 3: Challenge session in the store

**Description:** Test first. Add `challenge`, `ruleResults`, `startChallenge(brief)` and
`leaveChallenge()` to the store as specified. Lock `addFunctionalRequirement`,
`removeFunctionalRequirement`, `updateFeature` and `setNfr` while a challenge is active.
In a challenge, `runVerification` also evaluates the brief's rules and sets
`verification.overall` to the worst of engine and rules. Add an end-to-end test that
starts `link-shortener`, recreates the `good` and `bad-no-cache` fixture canvases through
the store, and verifies.

**Acceptance criteria:**
- [x] Start: canvas empty; requirements, features (unplaced) and NFRs match the brief
- [x] Each lock is a no-op in a challenge and works in the sandbox; `placeFeature` works in both
- [x] Verification in a challenge returns rule results; a failing rule fails `overall`
- [x] Leave: state equals a fresh `demoSeed()`; sandbox verification has no rule results
- [x] End-to-end: `good` → overall not fail; `bad-no-cache` → `cache-on-read-path` fails

**Verification:**
- [x] `npx vitest run src/lib/store.test.ts`; standing checks

**Dependencies:** Tasks 1 and 2

**Files likely touched:** `src/lib/store.ts`, `src/lib/store.test.ts`

**Estimated scope:** M

---

## Checkpoint B
- [x] Store and end-to-end tests pass; demos test unchanged; standing checks green

---

## Task 4: Challenge picker in the toolbar

**Description:** In `design-canvas.tsx`, add a select listing "Sandbox" and each brief's
title, wired to `startChallenge` / `leaveChallenge`. In a challenge show the brief's
`tagline` and Clear, and hide the demo buttons. Follow the existing toolbar and select
patterns.

**Acceptance criteria:**
- [x] Choosing a brief starts it; choosing "Sandbox" leaves it
- [x] Demo buttons only in the sandbox; tagline only in a challenge

**Verification:**
- [x] Browser: switch between all four briefs and the sandbox; no console errors; standing checks

**Dependencies:** Task 3

**Files likely touched:** `src/components/simulator/design-canvas.tsx`

**Estimated scope:** S

---

## Task 5: Locked requirements panel and rule rows

**Description:** In `requirements-panel.tsx`, while a challenge is active hide the
add-requirement form and remove buttons, and disable feature-number and NFR inputs;
leave placement enabled. In `verification-panel.tsx`, after the engine checks, render one
row per rule result using the existing row and status icon.

**Acceptance criteria:**
- [x] In a challenge, locked controls are hidden or disabled; placement works
- [x] Rule rows appear only in a challenge, after the engine checks

**Verification:**
- [x] Browser: start a challenge, try to edit (can't), place features, run verification
      and see rule rows; standing checks

**Dependencies:** Task 3

**Files likely touched:** `src/components/simulator/requirements-panel.tsx`,
`src/components/simulator/verification-panel.tsx`

**Estimated scope:** S

---

## Task 6: Walkthrough, build and README

**Description:** Walk through the five user stories in the browser and fix anything
found. Run `npm run build`. Add a short "Challenges" section to `README.md` (where briefs
live, how to pick one, link to `docs/challenges/brief-format.md`). Mark the spec
implemented.

**Acceptance criteria:**
- [x] All five user stories pass in the browser with no console errors
- [x] `npm run build` passes; README section added

**Verification:**
- [x] Screenshots of a challenge before and after verification

**Dependencies:** Tasks 4 and 5

**Files likely touched:** `README.md`, `SPEC-challenge-slice1.md`

**Estimated scope:** XS

---

## Checkpoint C (complete)
- [x] All five success criteria in SPEC-challenge-slice1.md met
- [x] Ready for review; nothing committed until asked
