# Tasks: `confirm-replace`

Spec: [SPEC-confirm-replace.md](../../SPEC-confirm-replace.md). Plan: [plan.md](plan.md).

Standing verification for every task: `npm test`, `npx tsc --noEmit` and `npm run lint`
pass; `tests/demos.test.ts` unchanged. UI tasks also run `npm run build` and a browser
check with no console errors.

---

## Task 1: `unsaved.ts` fingerprint and `hasUnsavedWork`

**Description:** Test first in `src/lib/unsaved.test.ts`, then add `src/lib/unsaved.ts`:
`fingerprint(state) → { canvas: string; rest: string }` and
`hasUnsavedWork(state, baseline): boolean`, per the plan's first decision. Start from
the BeUWI demo state and apply one change per row.

**Acceptance criteria:**
- [x] Counts: move a node 1 px or more, rename, change purpose, change a config field
  (nested too), add or delete a node, add or delete an edge, change a protocol or edge
  label, place or unplace a feature, edit a requirement's text, a feature's numbers, or
  an NFR target
- [x] Doesn't count: select a node or edge, change the pending protocol, run
  verification, add `measured` / `width` / `height`, a 0.4 px move, a new random id on
  an otherwise identical edge, and an empty canvas (after Clear) when requirements and
  targets are untouched
- [x] Dragging a node away and back stops counting

**Verification:**
- [x] `npx vitest run src/lib/unsaved.test.ts`; standing checks

**Dependencies:** None

**Files likely touched:** `src/lib/unsaved.ts`, `src/lib/unsaved.test.ts`

**Estimated scope:** S

---

## Task 2: Store baseline and replace requests

**Description:** Test first in `store.test.ts`. Add to the store: `baseline`,
`hasUnsavedWork()`, `markSaved()`, `pendingReplace`,
`requestReplace(kind, description, run)`, `confirmReplace()`, `cancelReplace()`. Every
load action (`loadDemo`, `loadFanInDemo`, `startChallenge`, `leaveChallenge`,
`loadDesign`) and the initial state set `baseline` from what they load. `clearCanvas`
does not touch it.

**Acceptance criteria:**
- [x] After each load action, `hasUnsavedWork()` is false (one test looping over all
  five)
- [x] `requestReplace` runs at once without unsaved work, and only sets
  `pendingReplace` with it
- [x] `confirmReplace` runs the action and clears the request; `cancelReplace` leaves
  every other piece of state unchanged
- [x] After `markSaved`, no unsaved work until the next change
- [x] Clear on an untouched demo: no unsaved work; Clear after editing a sandbox
  requirement: still unsaved
- [x] In a challenge, placing a feature counts

**Verification:**
- [x] `npx vitest run src/lib/store.test.ts tests/demos.test.ts`; standing checks

**Dependencies:** Task 1

**Files likely touched:** `src/lib/store.ts`, `src/lib/store.test.ts`

**Estimated scope:** S

### Checkpoint A
- [x] Tests, types and lint green; `tests/demos.test.ts` unchanged

---

## Task 3: Confirm dialog and `beforeunload`

**Description:** New `src/components/simulator/confirm-replace-dialog.tsx`, rendered
once in `simulator-app.tsx`. Open while `pendingReplace` is set; title "Replace your
design?" or "Clear the canvas?"; the request's description plus "Export first if you
want to keep this design."; **Cancel** (initial focus) and **Replace** / **Clear**.
Closing by Escape, outside click or the close button calls `cancelReplace()`. A
`useEffect` adds a `beforeunload` listener that calls `preventDefault()` when
`hasUnsavedWork()` is true.

**Acceptance criteria:**
- [x] Dialog text and buttons as above; Cancel focused on open
- [x] Every way of closing it except Replace/Clear cancels
- [x] Reloading with unsaved work shows the browser's leave prompt; without, it doesn't (checked in Task 5)

**Verification:**
- [x] Browser: trigger a request by hand (Task 4 not needed: call it from a temporary
  button or the console), check focus and Escape; `npm run build`; standing checks

**Dependencies:** Task 2

**Files likely touched:** `src/components/simulator/confirm-replace-dialog.tsx`,
`src/components/simulator/simulator-app.tsx`

**Estimated scope:** S

---

## Task 4: Route the five controls through `requestReplace`

**Description:**
- `challenge-picker.tsx`: starting a brief →
  `requestReplace("replace", "Starting <title> replaces your design.", …)`; Sandbox →
  "Going back to the sandbox loads the BeUWI demo in place of your design."
- `design-canvas.tsx`: demos → "Loading the <name> demo replaces your design."; Clear →
  `requestReplace("clear", "Every component and connection is removed. Requirements
  and targets stay.", clearCanvas)`.
- `design-io.tsx`: Import, after a valid parse →
  "Importing <file name> replaces your design."; Export → `markSaved()` after the
  download starts.

**Acceptance criteria:**
- [x] Each of the five controls prompts after an edit and acts at once without one
- [x] Cancel from the picker leaves it showing the current mode
- [x] An invalid import shows its error and never prompts
- [x] Export then any control: no prompt

**Verification:**
- [x] Browser, by hand, for each control; `npm run build`; standing checks

**Dependencies:** Task 2

**Files likely touched:** `src/components/simulator/challenge-picker.tsx`,
`src/components/simulator/design-canvas.tsx`, `src/components/simulator/design-io.tsx`

**Estimated scope:** S

### Checkpoint B
- [x] Each control prompts after an edit and acts at once otherwise, by hand

---

## Task 5: Browser walkthrough and build

**Description:** The spec's browser checklist in the Chrome DevTools browser at 1440 and
375 wide. Notes go in [plan.md](plan.md).

**Acceptance criteria:**
- [x] Fresh app → pick a challenge: no prompt (React Flow's load-time changes don't
  count)
- [x] Add a node → pick another challenge: dialog; Cancel keeps the node and the picker
  value; again → Replace switches
- [x] Edit → Export → load a demo: no prompt
- [x] Edit → Clear: "Clear the canvas?"
- [x] Edit → Import a valid file: dialog names it; invalid file: error, no dialog
- [x] Keyboard: Cancel focused, Escape cancels, Tab reaches Replace
- [x] Reload with unsaved work: leave prompt; after Export: none
- [x] Dialog fits at 375px; no console errors

**Verification:**
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`
- [x] Notes added to [plan.md](plan.md)

**Dependencies:** Tasks 1–4

**Files likely touched:** `tasks/plan.md`

**Estimated scope:** S

### Checkpoint C
- [x] All three spec success criteria met; ready for review (nothing committed until asked)
