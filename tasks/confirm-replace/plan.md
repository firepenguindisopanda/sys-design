# Implementation Plan: `confirm-replace`

Spec: [SPEC-confirm-replace.md](../../SPEC-confirm-replace.md) (approved). Task checklist:
[todo.md](todo.md). Branch: `feat/confirm-replace`, from `main` (`6430f71`). Earlier
steps: [phase1/](../phase1/plan.md), [reachability/](../reachability/plan.md),
[data-checks/](../data-checks/plan.md), [challenge-slice1/](../challenge-slice1/plan.md),
[challenge-panels/](../challenge-panels/plan.md), [design-io/](../design-io/plan.md).

## Overview

Ask before any of five controls replaces a design that has unsaved changes, and warn
when closing the tab. "Unsaved" is decided by comparing a fingerprint of the current
state with one taken at the last load or export. The store gains the baseline and a
replace request; one dialog renders the request; the five controls go through it. The
load actions themselves don't change.

## Dependency graph

```
T1 unsaved.ts: fingerprint + hasUnsavedWork (pure)
        │
        ▼
T2 store: baseline, markSaved, requestReplace / confirm / cancel
        │
        ├────────────────────────────┐
        ▼                            ▼
T3 dialog + beforeunload        T4 wire the five controls
        │                            │
        └────────────┬───────────────┘
                     ▼
T5 browser walkthrough at 1440 and 375, build
```

## Architecture decisions

- **Two fingerprints, not one.** `unsaved.ts` returns `{ canvas, rest }` as strings.
  `canvas` covers nodes (id, kind, label, purpose, config, position rounded), edges
  (source, target, protocol, label; not the edge id, which is random for drawn edges)
  and placements. `rest` covers requirements, feature numbers and NFRs. Unsaved work =
  `(nodes.length > 0 && canvas ≠ baseline.canvas) || rest ≠ baseline.rest`. This is the
  spec's "only while it has a node" rule in one line.
- **Baseline taken inside each load action's `set`**, from the same object it sets, so it
  can never drift from what was loaded. The initial store state computes it from
  `demoSeed()` the same way.
- **The request holds a closure.** `pendingReplace.run` is the action to perform (e.g.
  `() => startChallenge(brief)`); Zustand state can hold functions, and it keeps the
  dialog generic: it only shows `kind` and `description` and calls `confirmReplace()`.
- **Import validates before asking.** `design-io.tsx` parses the file, and only a valid
  result reaches `requestReplace`. Export calls `markSaved()` after it starts the
  download, not before, so a refused export (duplicate edges) doesn't mark anything
  saved.
- **`beforeunload` lives with the dialog** in `confirm-replace-dialog.tsx` (one
  `useEffect`), reading `hasUnsavedWork()` from `getState()` at the time of the event.
- **Focus:** `DialogContent` passes `initialFocus` (a ref to Cancel) through to Base
  UI's popup.

## Task list

### Phase A: Logic
- [x] Task 1: `unsaved.ts` fingerprint and `hasUnsavedWork`
- [x] Task 2: Store baseline and replace requests

### Checkpoint A
- [x] Tests, types and lint green; `tests/demos.test.ts` unchanged

Notes from Phase A:
- `npm test`: 276 passed, 1 skipped (was 239 + 1): 25 in `unsaved.test.ts` (15 changes
  that count, 7 that don't, 3 edge cases), 12 in `store.test.ts`.
- Edges are fingerprinted as sorted `source->target:protocol:label` strings, so a redrawn
  connection (new random id, other handles) or a reordered list isn't a change.
- Feature numbers go in `rest` with `placedOnNodeId` blanked; placements go in `canvas`.
- `withBaseline(seed)` wraps every load action's state, including the initial store
  state, so the baseline is always computed from exactly what was set.
- `confirmReplace` clears the request before running it, so a load that itself checks
  `pendingReplace` would see it cleared.

### Phase B: UI
- [x] Task 3: Confirm dialog and `beforeunload`
- [x] Task 4: Route the five controls through `requestReplace`

### Checkpoint B
- [x] Each control prompts after an edit and acts at once otherwise, by hand

Notes from Phase B (Chrome DevTools, 1440 wide; the dev server, so React Flow's
measuring and fit-view ran as normal):
- **Plan risk 1 cleared:** fresh app, wait 1.5 s, pick Campus link shortener: switched
  with no prompt.
- **Picker:** add a PaaS, pick Course group chat: "Replace your design? Starting “Course
  group chat” replaces your design. Export first if you want to keep this design.",
  Cancel focused, picker still on Campus link shortener. Escape: dialog closed, node
  kept, picker unchanged. Again and Replace: Course group chat, empty canvas. Back to
  Sandbox from that untouched challenge: no prompt.
- **Export counts as saving:** add a VM, Export (`sandbox-design.yaml` captured), Fan-in
  DB demo: no prompt.
- **Clear:** add a cache, Clear: "Clear the canvas? Every component and connection is
  removed. Requirements and targets stay. …" with a Clear button; confirmed, canvas
  empty. Then BeUWI demo onto the cleared canvas: no prompt; Clear on the untouched demo:
  no prompt.
- **Import:** BeUWI demo plus a database, then `broken-design.yaml`: error under the
  toolbar, no dialog, canvas unchanged. `link-shortener-design.yaml`: "Importing
  link-shortener-design.yaml replaces your design."; Replace opened Campus link
  shortener with its 7 nodes.
- Console: only React Flow's attribution warning.
- **Seen, not changed:** after the dialog closes, focus goes to `<body>` when the
  request came from the picker (its popup is gone by then); from a button, Base UI
  returns it to that button. Left as is: Escape and Tab still work from there.
- `npm test` 276 passed, 1 skipped; `tsc`, lint and `npm run build` pass.
- Still for Task 5: the `beforeunload` prompt, 375 wide, and keyboard Tab order.

### Phase C: Verification
- [x] Task 5: Browser walkthrough of the spec's checklist; build

### Checkpoint C
- [x] All three spec success criteria met; ready for review (nothing committed until asked)

Notes from Task 5 (Chrome DevTools; real clicks through the protocol, so the page has
the user activation Chrome requires before it shows a leave prompt):
- **Leave warning:** after a click that changed nothing (BeUWI demo on the untouched
  demo), reload with the prompt set to be dismissed: the page reloaded, no prompt.
  Add a VM, reload: Chrome showed its leave prompt ("Dismissed a beforeunload dialog"),
  and the page stayed with 12 nodes. Export, reload: no prompt, page reloaded. It also
  fired, correctly, when switching device emulation reloaded a page with an unsaved VM.
- **Keyboard:** add a VM, Clear: Cancel focused; Tab → Clear; Tab → back to Cancel
  (focus stays in the dialog); Enter on Cancel closes it, the VM stays, and focus returns
  to the Clear button. Escape was checked in Phase B.
- **375 wide (mobile):** VM added from the Library sheet, Clear: the dialog spans
  16–359 px, no sideways scroll, buttons stacked with Clear above Cancel (the shared
  `DialogFooter` layout), Cancel focused; Cancel kept the VM.
- The rest of the checklist (fresh app, picker cancel/replace, Export then demo, Clear,
  Import valid and invalid) was done in Phase B.
- Console throughout: only React Flow's attribution warning.
- No code changed after Checkpoint B, whose run stands: `npm test` 276 passed,
  1 skipped; `tsc`, lint and `npm run build` pass.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| React Flow fires `dimensions` and `position` changes on load (measuring, fit view), which would count as edits | High | Fingerprint ignores `measured`, `width`/`height`, `selected`, `dragging`; positions are rounded. Browser check: fresh app, then pick a challenge, must not prompt |
| A sub-pixel drift in positions after load | Med | Rounding to whole pixels; a test with a 0.4 px move |
| Base UI `Select` in the picker shows the new value before the store changes | Med | The picker is controlled by `challenge`; checked in T4 that Cancel leaves it on the old value |
| Dialog opened from inside the Select's popup fights over focus | Med | The request is stored and the dialog renders at app level after the Select closes; checked with the keyboard in T5 |
| The baseline goes stale if a new load action is added later | Low | Each load action sets it in its own `set`; a store test loops over all load actions |
| Words in the spec's Markdown add Tailwind classes to the build | Low | Found in the audit step; harmless, and the CSS isn't compared here since this change adds styles anyway |

## Parallelization

T3 and T4 both depend on T2 and touch different files, but each is S-sized. Sequential
in this session.

## Open questions

None. The spec's three questions were answered with the proposals.
