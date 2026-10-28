# Tasks: `canvas-ergonomics`

Spec: [SPEC-canvas-ergonomics.md](../../SPEC-canvas-ergonomics.md). Plan:
[plan.md](plan.md).

Standing verification: `npm test`, `npx tsc --noEmit` and `npm run lint` pass. The engine,
briefs, fixtures, demos and handle ids are unchanged.

---

## Task 1: Tests first

**Description:**
- **New `src/lib/placement.test.ts`:**
  - `freeSpot`:
    - an empty canvas gives `centre − (100, 35)`;
    - a node exactly there makes it step to `+24, +24`;
    - a column of nodes along the diagonal makes it step past all of them;
    - 21 blocking nodes on the diagonal make it return the 20th step;
    - a node with `measured: { width: 400, height: 200 }` blocks a wider area than the
      default size.
  - `defaultProtocol`:
    - `paas → database` gives `db`, and so does `database → paas`;
    - `vm → cache` gives `db`;
    - `mobile → paas` with `http` gives `http`;
    - `paas → mobile` with `sse` gives `sse`, and with `web_push` gives `web_push`;
    - `paas → object_storage` with `http` gives `http`.
- **`src/lib/store.test.ts`:**
  - `layoutVersion` rises by one on each of `loadDemo`, `loadFanInDemo`, `startChallenge`,
    `leaveChallenge` and `loadDesign`;
  - it doesn't change on `addComponent`, `deleteNode`, `onConnect`, `onNodesChange`
    (position) or `updateNodeData`;
  - with `setViewCentre({ x: 500, y: 300 })` on an empty canvas, `addComponent("vm")`
    places the node at `(400, 265)`, and a second `addComponent` places a node whose box
    doesn't overlap the first;
  - `addComponent("vm", { x: 10, y: 20 })` places it at `(10, 20)`;
  - with `viewCentre` null, the old offset rule applies;
  - `onConnect` from the demo's PaaS node to its database, with the picker on `http`,
    gives `db`; from the load balancer to the PaaS node gives `http`.
- **`a11y.test.tsx`**, edge case: `InspectorCard` for the API → graph DB edge shows
  "Programme API" and "Programme Graph DB" inside the From/To triggers and "Database
  protocol" inside the Protocol trigger, and no `paas-` or `database-` ids appear in
  them.

**Acceptance criteria:**
- [x] The new tests fail for the expected reasons: the module is missing, `layoutVersion`
  and `setViewCentre` aren't there, `addComponent` ignores the position, `onConnect` gives
  `http`, and the triggers show ids.
- [x] Existing tests are still green.

**Verification:**
- [x] `npx vitest run src`

**Dependencies:** None

**Deviation:** the todo's second `freeSpot` case expected a node at the centre to push the
new node one step, to `+24, +24`. A 70 px tall box still overlaps a box 24 or 48 px lower,
so the first clear spot is the third step, `+72, +72`; the test expects that. The helper is
as the plan describes.

**Files:** new `src/lib/placement.test.ts`, `src/lib/store.test.ts`,
`src/components/simulator/a11y.test.tsx`

**Estimated scope:** M

---

## Task 2: Placement helpers and store

**Description:**
- New `src/lib/placement.ts` with `freeSpot` and `defaultProtocol`, as in the plan.
- `store.ts`:
  - `layoutVersion` (raised in the five replace actions);
  - `viewCentre` and `setViewCentre`;
  - `addComponent(kind, at?)`;
  - `onConnect` using `defaultProtocol` with the two nodes' kinds.

**Acceptance criteria:**
- [x] The placement and store tests pass.

**Verification:**
- [x] `npx vitest run src/lib`

**Dependencies:** Task 1

**Files:** new `src/lib/placement.ts`, `src/lib/store.ts`

**Estimated scope:** S

---

## Task 3: Canvas and library

**Description:**
- `design-canvas.tsx`:
  - `FitViewOnReady` keyed on `layoutVersion`, skipping the first render;
  - `setViewCentre` from `onInit`, `onMoveEnd` and the `ResizeObserver`;
  - `onDragOver` and `onDrop` for `application/x-sesim-kind`, checked against the
    catalog;
  - `onConnectStart` and `onConnectEnd` toggling the `connecting` class.
- `component-library.tsx`:
  - buttons are `draggable` with `onDragStart`;
  - the help text reads "Click or drag onto the canvas. Connect with the protocol picker
    on the canvas."

**Acceptance criteria:**
- [x] All tests pass.
- [x] tsc and lint are clean.

**Verification:**
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint`

**Dependencies:** Task 2

**Files:** `design-canvas.tsx`, `component-library.tsx`

**Deviations:**
- The view centre is reported from a new `ResizeObserver` on the ReactFlow element inside
  `FlowCanvas`, not the existing one in `DesignCanvas`: that one sits outside
  `ReactFlowProvider`, so it can't call `screenToFlowPosition`. The existing observer is
  unchanged.
- `LIBRARY_DRAG_TYPE` and `DEFAULT_NODE_SIZE` live in `src/lib/placement.ts`, so the
  library doesn't import the canvas module.

**Estimated scope:** M

---

## Task 4: Names in the connection inspector

**Description:**
- `edge-inspector.tsx`: `items` on the Protocol, From and To selects, as in the plan.

**Acceptance criteria:**
- [x] The a11y edge-names case passes.

**Verification:**
- [x] `npx vitest run src/components/simulator`

**Dependencies:** Task 1

**Files:** `edge-inspector.tsx`

**Estimated scope:** XS

---

## Task 5: Handle visibility and hit area

**Description:**
- `design-node.tsx`: `className="sesim-handle"` on every `Handle` (the inline styles stay).
- `globals.css`: the handle rules from the plan.

**Acceptance criteria:**
- [x] `design-node.test.tsx` and all other tests pass.

**Verification:**
- [x] `npm test`

**Dependencies:** Task 1 (independent of 2–4)

**Files:** `design-node.tsx`, `src/app/globals.css`

**Deviation:** the hit ring uses `inset: -7px`, not `-6px`. With border-box sizing the 8 px
handle's padding box is 6 px (1 px border), and `::before` is positioned from the padding
box, so -6 px would give 18 px. Handles also show on `:focus-within` as well as
`:focus-visible`, as the spec lists.

**Estimated scope:** XS

---

## Task 6: Docs, full checks, browser checks

**Description:**
- `docs/ui-ux-audit.md`: mark findings 7, 9 (apart from handle count and keyboard
  connecting) and 20 fixed.
- `HANDOVER.md`: drop the deferred import re-fit item; add the step.
- `npm run build`.
- **Browser check (Chrome DevTools)**, every item in the spec's "Browser check":
  - placing after a pan, five clicks, delete with no camera move, drag-drop;
  - handles at rest, on hover, while connecting, the 20 px hit test, touch-tap;
  - clicking and dragging a node's body still selects and moves it;
  - the default protocols;
  - names in the inspector;
  - import re-fit;
  - adding a node right after a demo loads;
  - Lighthouse in both modes;
  - the console.

**Acceptance criteria:**
- [x] All six spec success criteria hold.

**Verification:**
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and the browser
  checks

**Notes (review, 2026-10-28):**
- **Placing (1440, sandbox):** after a pan, five clicks on Virtual Machine gave five nodes
  in view, none stacked exactly, with the first within 7 px of the canvas centre and no
  camera move. Adding Edge Compute right after leaving a challenge for the demo placed it
  in view (13 px from centre).
- **Selected nodes now marked (fixed in review).** A node added from the library was
  selected in the store (the card opened) but React Flow didn't mark it: no teal border, no
  handles. `FlowCanvas` now sets `selected` from `selectedNodeId` when it maps nodes, as it
  already did for edges. Checked: added node selected with handles; a background click
  clears it; dragging an unselected node by its body still moves it.
- **Handles:** opacity 0 at rest, 1 on hover (other nodes stay 0), and 1 on every node
  while connecting (the `connecting` class clears afterwards).
  - The `::before` ring measures 20.4 px in flow units. On screen it scales with zoom
    (about 8 px radius at 0.67), like everything on the canvas.
  - The spec's 9 px / 11 px `elementFromPoint` test was too fine at that zoom and
    with 0.8 px borders, so the ring's computed size was used instead. The left-side
    handles sit about 10 px apart, so their rings overlap, as the spec expected.
- **Connecting:** Programme API → a new Database gave "Database protocol (→)"; Desktop web →
  Load Balancer with the picker on HTTP gave "HTTP request (→)". From/To show node names.
- **Library drop:** the cache landed within 6 px of the pointer, the drop was handled
  (`defaultPrevented`), the camera didn't move, and the card opened on it.
- **Import:** importing the link-shortener good design fitted all 7 nodes. Panning away
  and importing the same file again (same node count) fitted again; this was the old
  deferred bug.
- **Lighthouse:** 100 in the sandbox (card open) and in a challenge (card open, results
  shown).
- **Found and fixed (from `stale-results`, already on `main`).** With a long all-passing
  result list, the page grew to 959 px and showed a scrollbar. The rows' `sr-only`
  "Passed:" text is absolutely positioned, and the results box wasn't positioned, so it
  escaped. The results box is now `relative`, and the panel test checks for it.
- **Console:** only React Flow's attribution warning. The "reading 'document'" error and
  the Next badge's "1 Issue" came from the DevTools tool's injected script
  (`pptr:evaluateHandle`).

**Dependencies:** Tasks 2–5

**Files:** `docs/ui-ux-audit.md`, `HANDOVER.md`

**Estimated scope:** S
