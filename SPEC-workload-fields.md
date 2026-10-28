# Spec: show the workload fields in the requirements panel

Status: **implemented** (2026-10-28); approved as proposed: read-only in a challenge, labels Slow work / If
polled / Files, one combined plan and task list. Plan:
[tasks/workload-fields/plan.md](tasks/workload-fields/plan.md).
Follows `sync-and-polling` and `file-serving`, which left the panel alone. Module id
`workload-fields`. Branch: `feat/workload-fields`, from `main` (`e3186ae`).

## Objective

Three optional feature fields now drive the engine:
- `backgroundWorkMs`: slow work the request waits for unless a worker takes it;
- `pollingRpm`: requests per minute if clients poll instead of being pushed to;
- `fileRpm`: file requests per minute unless the files come from a store.

The requirements panel shows none of them. This causes two problems:

- **In a challenge**, a student can't see why the shuttle tracker's throughput target
  jumped to 4020, or where 3000 ms of latency came from, until the result message
  explains it.
- **In the sandbox**, the only way to set the fields is to edit an exported file and
  import it again.

Users: students in a challenge (reading), and anyone in the sandbox (editing).

## Change

**A "Workload" row on each feature card**, under Target RPM and placement:

| Field | Label | Unit hint (placeholder) |
|---|---|---|
| `backgroundWorkMs` | Slow work | ms |
| `pollingRpm` | If polled | req/min |
| `fileRpm` | Files | req/min |

- **Sandbox:** three number inputs in a row, like Mem, vCPU and Disk.
  - Empty means "not set". Typing a number ≥ 1 sets the field; clearing the box, or a
    value below 1, removes it.
  - Values below 1 are treated as unset rather than stored, because the validator
    rejects them and Export would then refuse the design.
- **Challenge:** read-only, and only the fields the brief sets, as disabled inputs like the
  other locked numbers. A feature with none of them shows no Workload row, so most cards
  look exactly as they do today.
- **One line of help** under the "Functional → features" heading, in the sandbox only:
  "Optional workload: slow work waits unless a worker takes it; if polled counts when
  nothing pushes; files count unless they come from a store."
  - In a challenge, each read-only input gets the same explanation as a `title` tooltip,
    so the card stays compact.

**Code:**

- **New `src/components/simulator/feature-workload.tsx`:**
  - `FeatureWorkload({ feature, locked, onChange })` renders the row. The panel passes
    `updateFeature`.
  - It also exports `parseWorkloadInput(text): number | undefined`: a whole or decimal
    number ≥ 1, otherwise `undefined`.
  - A separate component keeps the panel file from growing, and it can be tested with
    `renderToStaticMarkup` like `brief-panel.test.tsx`. The project has no DOM test
    environment.
- **Store:** no change.
  - `updateFeature` already merges a patch, and already ignores edits in a challenge.
  - Setting a field to `undefined` behaves like an absent field for:
    - the engine (it checks for a truthy value);
    - Export (`optionalWorkload` skips `undefined`);
    - the unsaved-changes fingerprint (`JSON.stringify` drops `undefined`).
- **Next.js:** the panel is already a client component (`"use client"`). The new file is
  imported only from it, so it needs no directive of its own. Per `AGENTS.md`, I'll check
  `node_modules/next/dist/docs/` on client components before writing it.

## Tests (written first)

- **`feature-workload.test.tsx`** (static render):
  - sandbox: three inputs with their labels, showing set values and empty boxes for unset
    ones;
  - challenge: only the set fields, disabled, each with its tooltip;
  - challenge with no fields: renders nothing.
- **`parseWorkloadInput`:**
  - `"2400"` → 2400, `"0.5"` → undefined, `"1"` → 1;
  - `""`, `"0"`, `"-3"` and `"abc"` → undefined.
- **`store.test.ts`:** setting `fileRpm` through `updateFeature` and then clearing it to
  `undefined` leaves an Export with no `fileRpm` line, and the verification result returns
  to what it was.
- **Browser check** (DevTools, 1440 wide):
  - **Sandbox:** load the BeUWI demo and type 3000 into the first feature's Slow work. Run:
    latency rises by 3000 ms and the detail names the feature. Clear it and run again:
    back to the old number.
  - **Challenge:** in the shuttle tracker, "Live map" shows If polled 3600, read-only; other
    cards have no Workload row.
  - Check the console, and a 390 px wide view for wrapping.

## Docs

- **`docs/challenges/brief-format.md`:** one sentence saying students see these fields
  read-only on the feature card.
- **`HANDOVER.md`** (untracked).

## Boundaries

- **Always:**
  - engine, briefs, fixtures and demos unchanged;
  - tests, types, lint and build stay green.
- **Ask first:**
  - showing `computeMsPerRequest` (also hidden today);
  - changing how locked fields look in general;
  - adding a DOM test environment.
- **Never:** let a challenge's fields be edited.

## Success criteria

1. A sandbox user can set and clear all three fields from the panel, and the run results
   and Export follow.
2. A student sees the brief's fields read-only, only where they're set.
3. All tests, `tsc`, lint and build pass, and the browser checks pass.

## Open questions

1. **Show them in a challenge?** Proposed yes. "Slow work 3000 ms" hints that a queue is
   needed, but the brief's summary already says the work is slow, and the targets are
   already visible. The alternative is to hide them in a challenge and show them only in
   the sandbox.
2. **Labels.** "Slow work", "If polled" and "Files", as proposed?
3. **Plan format.** One combined plan and task list, as before?
