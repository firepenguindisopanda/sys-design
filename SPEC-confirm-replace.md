# Spec: ask before replacing the canvas

Status: **implemented** (2026-10-28); approved with all three proposals: Clear asks too, a `beforeunload`
warning, and a combined plan and task list. Plan: [tasks/confirm-replace/plan.md](tasks/confirm-replace/plan.md).
From HANDOVER's deferred polish (slice 1 assumption 3, design-io assumption 1). Module id
`confirm-replace`. Branch: `feat/confirm-replace`, from `main` (`6430f71`).

## Objective

A student who has drawn a design shouldn't lose it to one misclick. Today five controls
replace the canvas immediately, with no way back:

| Control | Store action | What's lost |
|---|---|---|
| Challenge picker → a brief | `startChallenge` | canvas, and in the sandbox the requirements and targets |
| Challenge picker → Sandbox | `leaveChallenge` (loads the BeUWI demo) | canvas and placements |
| Load BeUWI demo / Fan-in DB demo | `loadDemo` / `loadFanInDemo` | canvas, requirements, targets |
| Clear | `clearCanvas` | nodes, edges, placements (requirements stay) |
| Import (valid file) | `loadDesign` | canvas, requirements, targets |

Design-io made this more likely: Import sits next to Export, and students now have a
reason to load files.

Users: students working on a design.

### User stories and acceptance

1. **Asked only when there's something to lose.** If the student has changed anything
   since the canvas was last loaded or exported, each control above opens a dialog
   instead of acting:
   - title: "Replace your design?" (for Clear: "Clear the canvas?");
   - body: what will happen, e.g. "Starting *Campus link shortener* replaces the canvas
     and your requirements. Export first if you want to keep this design.";
   - buttons: **Cancel** (default focus) and **Replace** (or **Clear**).
   Cancel, Escape or clicking outside leaves everything as it was, including the picker
   showing the current mode.
2. **No prompt for untouched work.** Straight after opening the app, picking a
   challenge, loading a demo, importing a file or exporting, the controls act at once,
   as today. Clearing an untouched canvas doesn't count as work either.
3. **Export counts as saving.** After Export, the design counts as saved until the next
   change, so the student isn't warned about work they've just saved.
4. **Import asks after reading the file.** The file is read and validated first: an
   invalid file shows its error and never prompts; the dialog names the file ("Importing
   *sandbox-design.yaml* replaces …"). Cancelling the browser's file chooser does
   nothing.
5. **Same in both modes**, at every width (the dialog fits at 375px).

## What counts as a change

The store keeps a **baseline**, a fingerprint of the replaceable state taken whenever
the canvas is loaded (app start, `startChallenge`, `leaveChallenge`, either demo,
`loadDesign`) or exported. "Unsaved work" means the current state differs from the
baseline in:

- **the canvas**, but only while it has at least one node: node ids, kinds, labels,
  purposes, configs and positions (rounded to whole pixels); edge endpoints, protocols
  and labels; and which node each feature is placed on; or
- **requirements**, **feature numbers** or **NFR targets**.

Placements belong to the canvas group because Clear unplaces every feature: counted
separately, clearing an untouched demo would itself look like work.

Not counted: selection, the pending protocol, verification results, viewport
(pan/zoom), and React Flow's measured sizes. Moving a node does count, since layout is
work.

Why a fingerprint rather than a "dirty" flag set by every action: there are 15 store
actions that edit, plus React Flow's own change events (select, dimensions, position),
and a flag would have to get each one right. Comparing to a baseline is one function
with one test table, and undoing a change (dragging a node back) correctly stops
counting as work.

The rule "only while it has a node" is what makes Clear on an untouched demo, then
loading a demo, not prompt. Clear on an edited sandbox still prompts on the next load
if the requirements were edited, because those survive Clear.

## Design

### Store (`src/lib/store.ts`)

- `baseline: string`: the fingerprint, set by every load action and by a new
  `markSaved()` (called after a successful Export).
- `hasUnsavedWork(): boolean`: compares the current fingerprint with `baseline`.
- `pendingReplace: { kind: "replace" | "clear"; description: string; run: () => void } | null`.
- `requestReplace(kind, description, run)`: runs `run` at once when there's no unsaved
  work; otherwise sets `pendingReplace`.
- `confirmReplace()` runs and clears it; `cancelReplace()` clears it.
- The fingerprint function lives in a small pure module,
  `src/lib/unsaved.ts`, so it can be tested without the store.

The load actions themselves don't change: they still replace immediately. The guard
sits in front of them, so tests and demos that call them directly behave as today.

### UI

- New `src/components/simulator/confirm-replace-dialog.tsx`: one `Dialog` (the
  existing `components/ui/dialog.tsx`, unused until now) driven by `pendingReplace`,
  rendered once in `simulator-app.tsx`.
- Callers go through `requestReplace`:
  - `challenge-picker.tsx`: start a brief, or go back to the sandbox;
  - `design-canvas.tsx`: both demo buttons and Clear;
  - `design-io.tsx`: Import after validation; Export calls `markSaved()` after the
    download starts.
- The picker is already controlled by the store's `challenge`, so while the dialog is
  open, and after Cancel, it keeps showing the current mode.

## Commands

```bash
npm run dev            # http://localhost:43127
npm test
npx tsc --noEmit
npm run lint
npm run build
```

## Testing strategy

Tests first.

- **`unsaved.test.ts`:** a table of changes that count (move a node, rename, change a
  config field, add or delete an edge, change a protocol, place a feature, edit a
  requirement or a target) and ones that don't (select, pending protocol, run
  verification, React Flow's `measured` sizes, a sub-pixel move, an empty canvas after
  Clear with untouched requirements).
- **`store.test.ts`:** `requestReplace` runs at once on a fresh demo, after each load
  action and after `markSaved`; it waits for confirmation after an edit; `confirmReplace`
  runs the action and clears the request; `cancelReplace` changes nothing. In a
  challenge, placing a feature counts as work.
- **Regression:** all existing tests unchanged, including `tests/demos.test.ts`.
- **Browser (Chrome DevTools, 1440 and 375):**
  - fresh app: picking a challenge doesn't prompt;
  - add a node, pick another challenge: dialog; Cancel keeps the node and the picker
    value; again, Replace switches;
  - edit, Export, then load a demo: no prompt;
  - edit, Clear: "Clear the canvas?" dialog;
  - edit, Import a valid file: dialog names the file; Import an invalid file: error, no
    dialog;
  - keyboard: Escape cancels, Cancel has focus when the dialog opens, Tab reaches
    Replace;
  - no console errors.

## Boundaries

- **Always:** keep the load actions' behaviour when called directly; tests, types,
  lint and build green.
- **Ask first:** undo/restore of a replaced design; saving to browser storage; a
  `beforeunload` warning (open question 2); new dependencies.
- **Never:** prompt when nothing would be lost; let Cancel change any state.

## Success criteria

1. All five stories work in the browser at 1440 and 375, with no console errors.
2. The fingerprint tests cover every row of the "counts / doesn't count" table above.
3. Existing tests unchanged and passing; `npm test`, `tsc`, lint and build pass.

## Open questions

1. **Should Clear ask too?** Proposal: yes, when there's unsaved work. Its name says
   what it does, but it sits right next to the demo buttons and loses the same work.
   Alternative: leave Clear alone, since its name says what it does.
2. **Warn when closing or reloading the tab?** Closing the tab is the easiest way to
   lose everything, and the same `hasUnsavedWork()` check could drive the browser's
   standard "Leave site?" prompt (a `beforeunload` listener, about 10 lines). Proposal:
   include it. The browser's own wording can't be changed, and it only shows if the
   student has interacted with the page, which is fine here.
3. **Paperwork.** This touches the store, four components and adds a dialog, so it's
   bigger than the audit step. Proposal: this spec plus a combined plan and task list in
   `tasks/plan.md` / `tasks/todo.md` (design-io's move to `tasks/design-io/`), approved
   together before any code.
