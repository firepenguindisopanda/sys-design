# Spec: lay designs out in levels (`auto-layout`)

Asked for during manual testing on 2026-11-08 (`tasks/manual-testing/log.md`). Status: **draft**,
**built** (2026-11-08); see [Results](#results), which records where the build departed from
this spec. Plan: [tasks/auto-layout/plan.md](tasks/auto-layout/plan.md). Not part
of the stress-testing capability map; a feature of its own.

## Objective

A design shows its components in clear levels, left to right, so students don't have to
drag nodes into order by hand:

> clients | edge | load balancers | compute | queues | workers | data | outside services

**Who it's for:**
- **students** who import a challenge fixture or a file without positions. Today those
  land on a 4-wide grid (`src/lib/challenges/design.ts:56`), jumbled, like the chat app;
- **students** who've built up a messy canvas and want it tidied.

**Done means:**
- a **Tidy layout** button lays out the current design in role columns;
- an **Undo tidy** button puts every node back until the next edit;
- a design file with no saved positions is laid out automatically on import;
- saved positions and the built-in demos are kept as they are.

## Decisions (2026-11-08)

| Question | Decision |
|---|---|
| Style | **Columns by role.** The same columns for every design, so students learn where things go. Chosen over following the requests, which scatters loops: the chat app's second server landed behind the message bus. |
| When | **A Tidy layout button, plus automatic layout for files without positions.** Files with saved positions, and the demos, keep theirs. |
| Undo | **Undo once.** After a tidy, Undo tidy restores the previous positions until the next edit. |
| Library | **Written here, no new dependency.** The prototype is about 80 lines. |

## The layout

A pure function, `layoutByRole(nodes, edges)` in `src/lib/layout.ts`, returning a position
for every node:

1. **Columns by role,** left to right, from each kind's catalog category, with workers split
   out of messaging and placed after the queues they read:

   | Column | Kinds |
   |---|---|
   | Clients | `mobile`, `desktop`, `iot` |
   | Edge | `cdn`, `static_hosting` |
   | Network | `load_balancer` |
   | Compute | `vm`, `paas`, `functions`, `edge` |
   | Queues | `message_queue` |
   | Workers | `task_worker` |
   | Data | `database`, `cache`, `object_storage` |
   | Outside | `external_api` |

   Empty columns are skipped, so a design without queues has no gap.
2. **Order within a column:** a few sweeps of the barycentre heuristic. Each node moves
   towards the average place of the nodes it's connected to in other columns, which cuts
   crossings. Ties keep the design's own order, so the result is the same every time.
3. ~~**Long columns wrap.**~~ **Dropped while building:** wrapping more than doubled the
   crossings on app 200. See Results.
4. **Spacing:** columns 300 px apart, rows 110 px, each column centred vertically. Nodes are
   180–220 px wide, so nothing overlaps.

Self-loops, cycles, unconnected nodes and an empty design are all handled: cycles don't
matter to role columns, and unconnected nodes keep their column.

**Prototype screenshots** (`tasks/manual-testing/layout-shots/`, untracked): `role-chat-app.png`,
`role-beuwi-demo.png` and `role-app-200.png`, against the `flow-*` alternative. The
prototype has no wrapping yet; app 200 shows why it's needed.

## The pieces

| Piece | Behaviour |
|---|---|
| **Import** | `importDesignFile` lays out the design when **no** node in the file has a saved position. With some positions, today's behaviour stays: saved ones kept, the rest on the grid. Challenge fixtures imported as files get the layout this way. Corrected while planning: `buildCompactDesign` and `buildDesign` stay as they are, because the stress tests' generator and the engine's fixture runs build through them, and a layout there would reshape every generated design and its speed baselines. |
| **Tidy layout** | A button in the canvas toolbar next to **Clear**. It sets every node's position from `layoutByRole`, keeps the positions it replaced, and re-fits the view (`layoutVersion`). Disabled on an empty canvas. |
| **Undo tidy** | Shown in place of Tidy layout after a tidy. It restores the kept positions and re-fits the view. It disappears at the next change to the design: a move, an edit, a connection, a deletion, an import, a demo or Clear. |
| **Unsaved work** | A tidy changes positions, so it counts as unsaved work, as a move does today. Undo tidy puts the fingerprint back. |
| **Screen readers** | Tidy and Undo tidy are announced: "Laid out in 5 columns" and "Layout undone". |

## Not changing

- **The engine and the load model:** positions don't feed either. Both probes stay
  byte-identical.
- **The built-in demos' positions.**
- **Files with saved positions,** and the design-file format: positions are still written
  as `at: [x, y]`.
- **`/simulate`:** it shows the design as the editor had it. No layout button there.
- **Moving nodes by hand,** which works as before.

## Commands

```bash
npm test
```
```bash
npx vitest run src/lib/layout.test.ts
```
```bash
npm run test:browser
```
```bash
npx tsc --noEmit
```
```bash
npm run lint
```

## Project structure

| File | Change |
|---|---|
| `src/lib/layout.ts` (new) | `layoutByRole` and the column table |
| `src/lib/layout.test.ts` (new) | Unit tests |
| `src/lib/challenges/design-file.ts` | `importDesignFile` lays out when no node in the file has a position |
| `src/lib/store.ts` | `tidyLayout`, `undoTidy`, the kept positions, and clearing them on the next change |
| `src/components/simulator/design-canvas.tsx` | The Tidy layout / Undo tidy button and its announcement |
| `e2e/layout.spec.ts` (new) | The browser checks below |
| Tests that pin fixture positions, if any | Re-pinned, with a note |

## Code style

```ts
/** Columns left to right; a kind's column comes from its catalog role (SPEC-auto-layout.md). */
const COLUMNS: readonly (readonly ComponentKind[])[] = [
  ["mobile", "desktop", "iot"],
  ["cdn", "static_hosting"],
  // …
];

export function layoutByRole(nodes: readonly SimNode[], edges: readonly Edge[]): Map<string, XYPosition> {
```

- Pure, deterministic and testable in the node environment, like `canvas-elements.ts`.
- Comments say why, naming this spec where a rule comes from.

## Testing strategy

**Unit (`src/lib/layout.test.ts`):**
- each kind lands in its column;
- empty columns are skipped;
- the same input gives the same positions;
- no two nodes overlap;
- a column of 11 wraps into two;
- crossings are fewer than or equal to the grid's on the chat app, the BeUWI demo and app 200;
- self-loops, cycles, unconnected nodes and an empty design.

**Store tests:**
- `tidyLayout` moves nodes and bumps `layoutVersion`;
- `undoTidy` restores positions exactly;
- any other change clears the undo;
- importing a file without positions lays it out;
- a file with positions keeps them.

**Browser (`e2e/layout.spec.ts`):**
- the chat-app fixture imports in columns, not on the grid;
- Tidy layout on a scrambled design gives no overlaps, and Undo tidy restores it;
- dragging a node after a tidy removes Undo tidy;
- no page errors.

**Not regressed:**
- `npm run test:browser`, including the canvas frame-rate checks;
- both probes byte-identical.

## Boundaries

- **Always:**
  - keep saved positions;
  - keep the layout deterministic;
  - test first.
- **Ask first:**
  - any new dependency;
  - laying out designs that do have positions;
  - changing the demos' positions.
- **Never:**
  - change engine or load-model numbers;
  - commit the prototype or the screenshots.

## Success criteria

1. The chat-app fixture and other files without positions import in role columns.
2. Tidy layout lays out any design in role columns with no overlaps. Undo tidy restores it
   exactly, until the next change.
3. A file with saved positions, and the demos, look as they do today.
4. `npm test`, `npm run test:browser`, `npx tsc --noEmit` and `npm run lint` pass; both
   probes are byte-identical.

## Branch

`feat/auto-layout`, from `main`. Two fixes from manual testing are uncommitted on
`fix/manual-testing-findings`. They should be committed, or merged, first, so this branch
doesn't carry them.

## Results

Built 2026-11-08 on `feat/auto-layout`.

**Where the build departed from this spec:**
- **No wrapping.** Cutting long columns into sub-columns of 10 broke the row alignment
  between columns. On app 200 the crossings went to 8,365, against 3,694 on the import grid
  and 1,238 unwrapped. Tall columns still fit in the fitted view.
- **The best ordering is kept.** A barycentre pass can make things worse (app 30 went from
  46 crossings to 54). The layout counts crossings after each pass and keeps the best
  ordering, starting with the design's own.
- **Layout on import is in `importDesignFile`, not `buildDesign`,** so the stress tests'
  generator and fixture runs are untouched (corrected in the plan).
- **Comparing with the grid:** the chat app keeps 1 crossing, against 0 on the grid. Both its
  servers connect to both the cache and the database, which always crosses once between two
  columns. Every other design has fewer crossings than the grid:

| Design | Import grid | Layout |
|---|---|---|
| BeUWI demo | 3 | 1 (the hand-made layout also has 1) |
| app 30 | 123 | 46 (the design's own order within each column; no pass beat it) |
| app 200 | 3,694 | 1,238 |
| random 200 | 15,941 | 7,377 |

**What was built:**
- `layoutByRole` and `countCrossings` in `src/lib/layout.ts`;
- files with no saved positions laid out on import;
- `tidyLayout`, `undoTidy` and `tidyUndo` in the store. A store subscription drops the undo
  once the design's canvas fingerprint changes, so selecting a node or React Flow measuring
  one keeps it, while a move, an edit, a connection or a deletion takes it away;
- the **Tidy layout** / **Undo tidy** button beside **Clear**, announced through a polite
  live region ("Laid out in N columns." and "Layout undone.");
- the view re-fits after a tidy and after an undo.

**Checks:**
- **Unit tests:** `npm test` gives 1,892 passed, the 1,861 plus 31 new: 10 for the layout,
  4 for import (and every fixture's import now checks its layout), and 17 for the store.
- **Browser:** `e2e/layout.spec.ts`, 4 tests. A fixture imports in columns; Tidy then Undo
  tidy restores every node, re-fits and announces; moving a node removes Undo tidy; the
  button is disabled on an empty canvas.
- **The whole browser suite:** 26 passed, with the canvas and playback frame rates unchanged.
- **Mutation checks:**
  - layout switched off on import fails 87 import tests and the fixture browser test;
  - the undo never dropped fails 6 store tests and the browser move test.
- **Probes:** byte-identical. `npx tsc --noEmit`, `npm run lint` and the build pass.
- **In the browser pane:** the BeUWI demo tidies into 6 columns that fit the view, with no
  console errors.

## Open questions

None. The style, timing, undo and library are your answers of 2026-11-08.
