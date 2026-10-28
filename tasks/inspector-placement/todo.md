# Tasks: `inspector-placement`

Spec: [SPEC-inspector-placement.md](../../SPEC-inspector-placement.md). Plan:
[plan.md](plan.md).

Standing verification: `npm test`, `npx tsc --noEmit` and `npm run lint` pass. The
engine, briefs, fixtures and demos are unchanged, and the inspectors' fields behave as
before.

---

## Task 1: Tests first

**Description:**
- **`src/lib/store.test.ts`, a `deleteNode` block** (on the demo):
  - deleting the PaaS node removes it and exactly the edges with it as source or target;
    other edges stay;
  - features placed on it become unplaced, and others keep their placement;
  - `selectedNodeId` and `selectedEdgeId` are `null` afterwards;
  - after a run, `deleteNode` makes `resultsAreStale()` true;
  - an unknown id leaves nodes, edges and features unchanged.
- **New `src/components/simulator/inspector-card.test.tsx`** (`renderWithStore`):
  - nothing selected: empty markup;
  - the PaaS node selected:
    - an `<h2>` "Selected node" that the `<section>` points at with `aria-labelledby`;
    - the node's name, the "Name" field;
    - a button named "Close inspector" and a "Delete" button;
  - an edge selected: "Selected connection", "Programme API → Programme Graph DB" for
    the API → graph DB edge, and the "Protocol" field;
  - `selectedNodeId` set to an id that doesn't exist: empty markup.
- **`a11y.test.tsx`:**
  - the node, database-node and edge cases render `InspectorCard` instead of
    `RequirementsPanel`, and still have no unnamed controls;
  - a new case renders `RequirementsPanel` with a node selected and expects no
    "Selected node".

**Acceptance criteria:**
- [x] The new tests fail for the expected reasons: `deleteNode` isn't a function, the
  module `./inspector-card` doesn't exist, and the panel still contains the inspector.
- [x] Existing tests are still green.

**Verification:**
- [x] `npx vitest run src`

**Dependencies:** None

**Files:** `src/lib/store.test.ts`, new
`src/components/simulator/inspector-card.test.tsx`,
`src/components/simulator/a11y.test.tsx`

**Estimated scope:** S

**Note:** the `a11y.test.tsx` node case also checks for the `Close inspector` button. Before the change the full run had 778 passing tests; Task 1 added 10.

---

## Task 2: `deleteNode` in the store

**Description:**
- `deleteNode: (id: string) => void` in the state type, with a doc comment.
- Implementation as in the plan, using `unplaceMissing`.

**Acceptance criteria:**
- [x] The `deleteNode` tests pass.

**Verification:**
- [x] `npx vitest run src/lib/store.test.ts`

**Dependencies:** Task 1

**Files:** `src/lib/store.ts`

**Estimated scope:** XS

---

## Task 3: Inspector card and inspector changes

**Description:**
- New `src/components/simulator/inspector-card.tsx`: `InspectorCard({ onClose })`, as in
  the plan, with the header, close button and Escape handling. Its body is
  `<NodeInspector onDeleted={onClose} />` or `<EdgeInspector />`.
- `node-inspector.tsx`:
  - drop the outer frame, the header and the placeholder; return `null` with no node;
  - add the Delete button (`Trash2` icon, outline, red text, like the edge inspector's)
    calling `deleteNode` and then `onDeleted`.
- `edge-inspector.tsx`: drop the outer frame, the header and the placeholder, and keep
  the direction hint.

**Acceptance criteria:**
- [x] The card tests and the a11y card cases pass.

**Verification:**
- [x] `npx vitest run src/components/simulator`

**Dependencies:** Tasks 1 and 2

**Files:** new `inspector-card.tsx`, `node-inspector.tsx`, `edge-inspector.tsx`

**Estimated scope:** S

**Note:** the requirements-panel inspector sections came out in this task, not Task 4, because the inspectors no longer had a placeholder to render there.

---

## Task 4: Canvas overlay and requirements panel

**Description:**
- `design-canvas.tsx`:
  - the overlay row (`absolute inset-3 z-10 flex items-start gap-2 pointer-events-none`),
    with the toolbar `flex min-w-0 flex-1 flex-wrap gap-2` and `InspectorCard` on the
    right;
  - `containerRef` gets `tabIndex={-1}` and `outline-none`;
  - `onClose` focuses it;
  - `<MiniMap>` only renders when nothing is selected.
- `requirements-panel.tsx`: remove the two inspector sections, their separators and the
  now-unused imports.

**Acceptance criteria:**
- [x] The requirements panel no longer contains "Selected node".
- [x] All tests pass.

**Verification:**
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint`

**Dependencies:** Task 3

**Files:** `design-canvas.tsx`, `requirements-panel.tsx`

**Estimated scope:** S

**Note:** the minimap hides when the selection matches an existing node or edge (the same test `InspectorCard` uses), not when an id is merely set, so a keyboard-deleted node that leaves a stale `selectedNodeId` doesn't hide it with no card showing.

---

## Task 5: Docs, full checks, browser checks

**Description:**
- `docs/ui-ux-audit.md`: mark finding 5 fixed; note the node Delete button under
  finding 8.
- `HANDOVER.md`: add the step.
- `npm run build`.
- **Browser check (Chrome DevTools):** every item in the spec's "Browser check":
  - 1440 sandbox: click, edit, deselect, add, connect and delete;
  - 1280 challenge with the Brief tab open;
  - 1100 with the side panel in a sheet;
  - keyboard: Escape, Escape inside an open dropdown, and Backspace/Delete in the Name
    field;
  - dragging with the card open;
  - Lighthouse with the card open in both modes;
  - the console.

**Acceptance criteria:**
- [x] All four spec success criteria hold.

**Verification:**
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and the browser
  checks

**Notes (review, 2026-10-28):**
- **Delete key (fixed in review).**
  - React Flow listens for Delete and Backspace on the whole document and only ignores
    inputs, selects, textareas and `.nokey`. With a node selected, Backspace on any button
    deleted it: the card's close button, and also "Run simulation". The second case was
    there before this change.
  - `FlowCanvas` now passes `onBeforeDelete`, which only allows a deletion while focus is
    inside the React Flow element. Clicking a node focuses it, so keyboard deletion on the
    canvas still works.
  - Checked: Backspace on Run simulation and on Close inspector leaves the node; Delete on
    a clicked node removes it; Backspace and Delete in the Name field edit the text.
- **Connection Delete focus (fixed in review):** `EdgeInspector` takes `onDeleted` too, so
  deleting a connection from the card returns focus to the canvas, as for nodes.
- **From/To overflow (fixed in review):** in the 288 px card, the From/To selects pushed
  the card into a sideways scroll. They're now `w-full min-w-0` with a truncating value,
  like the placement select.
- **Challenge picker overlap (fixed in review):** at 1280 the picker's box, with the
  tagline, ran over the card's header. The box is now `min-w-0 max-w-full` and the tagline
  `min-w-0`, so the tagline truncates; the toolbar ends at 652 px and the card starts at
  660 px.
- **Checked:**
  - 1440 sandbox: click, Escape and the close button; the minimap hides and returns;
    focus goes to the canvas wrapper. Card Delete removes the load balancer and its 2
    edges, and focus goes to the canvas. Adding a Database opens the card on it. Drawing a
    connection opens "Selected connection" with the protocol field.
  - Escape with a dropdown open closes only the dropdown (`aria-expanded="false"`, card
    still open).
  - Dragging with the card open works.
  - 1280 challenge with the Brief tab open: the card shows.
  - 1100 (side panel in a sheet): the card shows.
- **Lighthouse with the card open:** 100 in the sandbox (1440) and in a challenge (1100).
- **Console:** only React Flow's attribution warning. One "reading 'document'" error came
  from the DevTools tool's injected script (`pptr:evaluateHandle`), not the app.
- **Seen, not fixed (finding 7):** at 1280 the card covers nodes on the right of the
  canvas. Adding nodes re-zooms and stacks them, so they end up under the card. That's
  for `canvas-ergonomics`.

**Dependencies:** Tasks 2–4

**Files:** `docs/ui-ux-audit.md`, `HANDOVER.md`

**Estimated scope:** S
