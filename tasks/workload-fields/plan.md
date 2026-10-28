# Implementation Plan: `workload-fields`

Spec: [SPEC-workload-fields.md](../../SPEC-workload-fields.md) (approved). Task checklist:
[todo.md](todo.md). Branch: `feat/workload-fields`, from `main` (`e3186ae`).

## Overview

A small `FeatureWorkload` component renders a "Workload" row on each feature card:
- editable number boxes in the sandbox;
- read-only boxes in a challenge, only for the fields the brief sets.

A `parseWorkloadInput` helper turns typed text into a value or `undefined`. The panel
renders the component and passes `updateFeature`. The engine, store and briefs don't
change.

## Dependency graph

```
T1 tests: component render + parser + store round trip, failing
        │
        ▼
T2 feature-workload.tsx + wire into requirements-panel.tsx + help line
        │
        ▼
T3 docs, full checks, browser checks
```

## Architecture decisions

- **A separate component, not inline JSX.** It keeps `requirements-panel.tsx` from
  growing, and it can be tested with `renderToStaticMarkup`, as `brief-panel.test.tsx` is.
  The project has no DOM test environment, and adding one is out of scope.
- **Read the Next.js docs first** (`AGENTS.md`): the client components guide in
  `node_modules/next/dist/docs/`. The panel is already `"use client"`, and the new file is
  only imported there.
- **Match the existing inputs:**
  - `Label` at `text-[10px] text-slate-500`, `Input` at `h-7 text-[11px]`, and the
    `grid grid-cols-3 gap-1.5` row of Mem, vCPU and Disk;
  - in a challenge, `disabled`, as the other locked numbers are.
- **The panel keeps each box's typed text locally.**
  - `parseWorkloadInput` maps anything below 1 to `undefined`, so in the middle of typing
    "0.5" the store holds `undefined`. If the box showed the store's value, it would empty
    itself.
  - So each box keeps its own text, and only the parsed result goes to the store.
- **No store change.** `updateFeature(id, { fileRpm: undefined })` already behaves like an
  absent field everywhere; the store test pins that.

## Task list

- [x] Task 1: Tests first
- [x] Task 2: Component and panel wiring
- [x] Task 3: Docs, full checks, browser checks

### Checkpoint
- [x] All three spec success criteria met; ready for review (nothing committed until
  asked)

Notes: see [todo.md](todo.md). One deviation: the new file declares `"use client"` itself,
as the folder's other stateful components do. 531 tests pass; `tsc`, lint, build and the
browser checks pass.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A box empties itself while typing a value below 1 | Med | Local text per box (see decisions); checked in the browser by typing "0.5" then "05" |
| The extra row crowds the card on narrow screens | Low | Same three-column grid as Mem/vCPU/Disk; checked at 390 px |
| Students read "Slow work" as their own latency budget | Low | The tooltip says the request waits only if no worker takes it |
| A demo or saved design changes | Low | Nothing writes the fields unless a user types; the demo and design-file tests run unchanged |
