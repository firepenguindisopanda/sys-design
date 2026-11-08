# Implementation Plan: `auto-layout`

Spec: [SPEC-auto-layout.md](../../SPEC-auto-layout.md) (approved 2026-11-08). Task checklist:
[todo.md](todo.md). Branch: `feat/auto-layout`, from `main` once the two manual-testing
fixes on `fix/manual-testing-findings` are committed or merged.

## Overview

- **The layout function first:** pure and unit-tested, with the chat app, the BeUWI demo and
  app 200 as its real-world checks.
- **Then the two ways it's used:**
  - import, automatically, for files without positions;
  - the store's tidy and undo.
- **The button and the browser checks last,** then the finish.

## Dependency graph

```
T0 baseline: branch, probes, npm test count
        │
        ▼
T1 layoutByRole (pure)
        │
        ├─────────────────────┐
        ▼                     ▼
T2 import lays out      T3 store: tidyLayout, undoTidy
        │                     │
        │                     ▼
        │               T4 button, announcement, e2e/layout.spec.ts
        │                     │
        └──────────┬──────────┘
                   ▼
T5 suite, mutation checks, probes, docs, commit
```

T2 and T3 touch different files and could run in parallel. Both are small, so they run in
order.

## Architecture decisions

### `layoutByRole(nodes, edges): Map<id, XYPosition>` (`src/lib/layout.ts`)

- **Columns:** a table of kinds, in the spec's order. A kind missing from the table (one
  added to the catalog later) falls back to the compute column, and a unit test fails so the
  table gets updated.
- **Order:** start from the design's own node order. Then 8 barycentre sweeps, alternating
  left-to-right and right-to-left. Each sweep sorts a column by the mean place of each node's
  neighbours in other columns; ties keep the current order (a stable sort). Neighbours in the
  same column are ignored.
- **Wrapping:** after ordering, a column of more than 10 nodes is cut into sub-columns of up
  to 10, in order, placed 260 px apart. Columns after it shift right.
- **Coordinates:** each column, or sub-column, is centred on y = 0, with rows 110 px apart.
  Positions are whole numbers.
- **Measuring crossings for the tests:** a small `countCrossings(positions, edges)` helper
  that counts pairs of straight segments that cross. It's an approximation of the drawn
  smoothstep paths, but good enough to compare layouts.

### Import (`src/lib/challenges/design-file.ts`)

- In `importDesignFile`, after building: if `file.design.nodes.every((n) => n.position === null)`,
  replace every node's position from `layoutByRole`.
- `buildCompactDesign` is unchanged, so the generator and the engine's fixture runs are too.
- Export of a laid-out design writes the new positions, as for any design.

### Tidy and undo (`src/lib/store.ts`)

- **State:** `tidyUndo: { before: Record<string, XYPosition>; after: string } | null`, where
  `after` is `fingerprint(state).canvas` straight after the tidy.
- **`tidyLayout()`:**
  - sets every node's position from `layoutByRole`;
  - records `before` and `after`;
  - bumps `layoutVersion` so the view re-fits.
- **`undoTidy()`:** while the design still matches `after`, restores `before`, clears
  `tidyUndo` and bumps `layoutVersion`.
- **Clearing at the next change, without touching every action:** a store subscription.
  While `tidyUndo` is set, each store change compares `fingerprint(state).canvas` with
  `after` and clears `tidyUndo` on a mismatch.
  - The fingerprint leaves out selection, measured sizes and sub-pixel moves, so clicking a
    node doesn't count as a change, but a move, an edit, a connection or a deletion does.
  - It runs only while an undo is possible, and stops at the first mismatch, so a drag pays
    it once.
- **Loads and Clear** (import, demos, challenges, Clear) set `tidyUndo: null` directly, since
  they replace the design.

### The button (`src/components/simulator/design-canvas.tsx`)

- **Place:** in the toolbar group with Load demo and Clear. It shows **Tidy layout**
  (lucide `Network` icon) or, while `tidyUndo` is set, **Undo tidy** (lucide `Undo2` icon).
- **Disabled** on an empty canvas.
- **Announcement:** a polite live region, "Laid out in N columns" or "Layout undone".
- **In a challenge too:** layout doesn't change a design's meaning.

### Tests

- **Unit:** `src/lib/layout.test.ts`; store tests in `src/lib/store.test.ts`; import tests in
  `src/lib/challenges/design-file.test.ts`.
- **Browser:** `e2e/layout.spec.ts`, using the existing helpers (`openEditor`,
  `importDesign`, `designFile`).

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Tests pin a fixture's imported positions | Low | T2 runs `npm test` first; any such test is re-pinned with a note. |
| The fingerprint check costs time on every store change | Low | It runs only while an undo is possible, and stops at the first change. |
| React Flow sends a dimension change after a tidy, clearing the undo at once | Medium | The fingerprint leaves out measured sizes; a browser test checks Undo tidy is still offered after the tidy settles. |
| Barycentre ordering makes more crossings than the grid on some design | Low | A unit test compares crossings with the grid on the chat app, the demo and app 200. |
| Wrapping long columns puts a node's neighbours far apart | Low | Wrapping keeps the barycentre order, so neighbours stay in nearby rows. |

## Open questions

None.
