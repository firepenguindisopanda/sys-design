# Tasks: `auto-layout`

Spec: [SPEC-auto-layout.md](../../SPEC-auto-layout.md). Plan: [plan.md](plan.md).

**Standing verification:**
- `npm test`, `npx tsc --noEmit` and `npm run lint` pass.
- No change to `src/lib/loadsim/`, `src/lib/simulation.ts`, `src/lib/challenges/design.ts`,
  `src/test/gen-designs.ts` or `challenges/`.
- Nothing temporary is committed: no prototype, no screenshots.

---

## Task 0: Baseline

**Description:** with the manual-testing fixes committed or merged (you choose), create
`feat/auto-layout` from `main`. Save both probe outputs and the `npm test` count.

**Acceptance criteria:**
- [x] The branch exists, from `main`, without uncommitted fixes in it.
- [x] Both probe outputs are saved, and the count is recorded.

**Scope:** XS

## Task 1: `layoutByRole`

**Description:** `src/lib/layout.ts` with the column table, barycentre ordering, wrapping and
coordinates, plus `countCrossings`. Tests first.

**Acceptance criteria:**
- [x] Every catalog kind is in the column table (a test lists the catalog).
- [x] Each kind lands in its column; empty columns are skipped.
- [x] The same input gives the same positions.
- [x] No two nodes overlap (the boxes, at 220 × 60, don't intersect).
- [x] ~~A column of 11 wraps into 10 and 1~~ Dropped: wrapping doubled crossings (see the spec's Results); a long column stays one column.
- [x] Ordering never adds crossings; fewer than the grid on the demo, app 30, app 200 and random 200. The chat app keeps 1 against the grid's 0 (two servers to two stores always cross once).
- [x] Self-loops, cycles, unconnected nodes and an empty design are handled.

**Verification:** `npx vitest run src/lib/layout.test.ts`
**Dependencies:** Task 0
**Files:** `src/lib/layout.ts`, `src/lib/layout.test.ts`
**Scope:** S

## Task 2: Import lays out files without positions

**Description:** `importDesignFile` applies `layoutByRole` when no node in the file has a
position.

**Acceptance criteria:**
- [x] A test: the chat-app fixture text imports with role-column positions, not the grid.
- [x] A test: a file with positions keeps them exactly.
- [x] A file with some positions behaves as today.
- [x] `generateDesign` output is unchanged, checked by a test comparing positions with
      `main`'s grid.
- [x] The full `npm test` passes; any test that pinned imported positions is re-pinned with
      a note.

**Verification:** `npx vitest run src/lib/challenges`, `npm test`
**Dependencies:** Task 1
**Files:** `src/lib/challenges/design-file.ts`, `design-file.test.ts`
**Scope:** S

## Task 3: Tidy and undo in the store

**Description:** `tidyUndo`, `tidyLayout`, `undoTidy`, the subscription that clears it, and
loads and Clear resetting it.

**Acceptance criteria:**
- [x] `tidyLayout` moves every node to its `layoutByRole` position and bumps `layoutVersion`.
- [x] `undoTidy` restores every position exactly and bumps `layoutVersion`.
- [x] Selecting a node keeps the undo; a move, a config edit, a connection or a deletion
      clears it.
- [x] Import, both demos, a challenge and Clear clear it.
- [x] A tidy counts as unsaved work; undo puts the fingerprint back.

**Verification:** `npx vitest run src/lib/store.test.ts`
**Dependencies:** Task 1
**Files:** `src/lib/store.ts`, `src/lib/store.test.ts`
**Scope:** S

## Task 4: The button and the browser checks

**Description:** Tidy layout / Undo tidy in the canvas toolbar with its announcement, and
`e2e/layout.spec.ts`.

**Acceptance criteria:**
- [x] The chat-app fixture imports in columns: the clients' x is smallest, the database's
      largest.
- [x] On the BeUWI demo, Tidy layout gives no overlapping nodes; Undo tidy restores every
      node's position.
- [x] Undo tidy is still offered a second after the tidy (no dimension change clears it);
      dragging a node removes it.
- [x] The button is disabled on an empty canvas.
- [x] The announcement is heard: the live region's text.
- [x] No page errors.
- [x] Checked by eye in the browser pane.

**Verification:** `npx playwright test e2e/layout.spec.ts`
**Dependencies:** Task 3
**Files:** `src/components/simulator/design-canvas.tsx`, `e2e/layout.spec.ts`
**Scope:** M

## Task 5: Finish

**Acceptance criteria:**
- [x] `npm run test:browser` passes, with the canvas frame-rate checks unchanged.
- [x] Mutation checks:
  - layout off in import fails the import tests;
  - undo not cleared on a move fails the store and browser checks.
- [x] Both probes are byte-identical to Task 0's.
- [x] `npx tsc --noEmit`, `npm run lint` and `npm run build` pass.
- [x] The spec gets a Results section.
- [x] Committed on `feat/auto-layout` without a Co-Authored-By line.
- [ ] Review with you before merging into `main`.

**Dependencies:** Tasks 2 and 4
**Scope:** S
