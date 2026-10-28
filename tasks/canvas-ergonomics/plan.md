# Implementation Plan: `canvas-ergonomics`

Spec: [SPEC-canvas-ergonomics.md](../../SPEC-canvas-ergonomics.md) (approved). Task
checklist: [todo.md](todo.md). Branch: `feat/canvas-ergonomics`, from `main` (`d1e016f`).

## Overview

- **Two pure helpers** in `src/lib/placement.ts`:
  - `freeSpot` finds where a new node goes;
  - `defaultProtocol` picks a new edge's protocol.
- **The store** gains:
  - a `layoutVersion` that only the replace actions raise;
  - the canvas's visible centre (`viewCentre`);
  - an optional drop position on `addComponent`.
- **The canvas** fits on `layoutVersion` only, reports its centre, accepts library drops,
  and marks itself while a connection is being drawn.
- **CSS** hides handles at rest and widens their hit area.
- **The connection inspector** gets `items` for its three selects.

## Dependency graph

```
T1 tests: placement helpers, store (layoutVersion, viewCentre, addComponent at, onConnect
   default), a11y edge names (failing)
        │
        ├──────────────────────────┬─────────────────────────┐
        ▼                          ▼                         ▼
T2 placement.ts + store      T4 edge-inspector items    T5 handle CSS + class
        │                          │                         │
        ▼                          │                         │
T3 canvas: fit on layoutVersion,   │                         │
   view centre, drop, connecting   │                         │
   class; library draggable        │                         │
        │                          │                         │
        └──────────────┬───────────┴─────────────────────────┘
                       ▼
T6 docs, full checks, browser checks, Lighthouse
```

## Architecture decisions

- **`freeSpot(centre, nodes, size = { width: 200, height: 70 })`:**
  - The candidate's top-left is `centre − size / 2`.
  - Each existing node's box is `position` plus `measured?.width/height`, or `size` if
    not yet measured.
  - "Clear" means no box intersection.
  - It steps `(+24, +24)` at most 20 times; after that it returns the last candidate
    rather than looping or throwing.
  - No React, no store, so it's tested directly.
- **`defaultProtocol(sourceKind, targetKind, picked)`:** `"db"` if either kind is
  `database` or `cache`, otherwise `picked`. One line, but named and tested, so the "never
  choose SSE/WS/Push" boundary has a test.
- **`layoutVersion`:**
  - It starts at 0 and is raised in `loadDemo`, `loadFanInDemo`, `startChallenge`,
    `leaveChallenge` and `loadDesign`. Each raises it explicitly, because the seeds are
    shared.
  - `FitViewOnReady` takes `layoutVersion` and runs `fitView` in a `requestAnimationFrame`
    when it changes. It skips the first render: the `fitView` prop already fits on mount.
  - The node-count dependency goes away.
- **`viewCentre`:**
  - `FlowCanvas` computes it with `screenToFlowPosition` at the centre of the canvas
    element's rect, and calls `setViewCentre` from `onInit`, `onMoveEnd` and the existing
    `ResizeObserver` callback.
  - It isn't in either fingerprint, and isn't in seeds (it survives loads; the next
    `onMoveEnd` after a fit updates it).
- **`addComponent(kind, at?)`:**
  - `at` is the node's top-left when given: the drop handler subtracts half the default
    size so the node centres on the pointer.
  - Without `at`, it uses `freeSpot(viewCentre, nodes)`, and the old offset if
    `viewCentre` is null.
  - It still selects the new node, so the inspector card opens.
- **Drag and drop:**
  - Library buttons get `draggable` and an `onDragStart` setting
    `application/x-sesim-kind`.
  - `ReactFlow` gets `onDragOver`, which calls `preventDefault` and sets `dropEffect =
    "move"` when that type is present, and `onDrop`, which reads the kind, checks it
    against the catalog, converts the pointer with `screenToFlowPosition` and calls
    `addComponent`.
  - A click after a drag doesn't fire, because a drag suppresses the click, so dragging
    never adds two nodes.
- **The `connecting` class:** `onConnectStart` and `onConnectEnd` set local state in
  `FlowCanvas`, which adds `connecting` to the ReactFlow `className`.
- **Handle CSS** in `globals.css`, scoped by a `sesim-handle` class on our handles so React
  Flow's own handles aren't affected:
  - `.sesim-handle { opacity: 0; transition: opacity 120ms }`;
  - shown (`opacity: 1`) on `.react-flow__node:hover`, `.react-flow__node.selected`,
    `.react-flow__node:focus-visible` and `.react-flow.connecting`;
  - `.sesim-handle::before { content: ""; position: absolute; inset: -6px;
    border-radius: 9999px }` makes the hit area 20 px around the 8 px dot;
  - `@media (prefers-reduced-motion: reduce) { .sesim-handle { transition: none } }`.

  The `design-node.test.tsx` style assertions are about the card border, not handles, so
  they're unaffected.
- **Edge inspector `items`:**
  - Protocol: `protocol → "${label} (→ or ↔)"`, matching the option text.
  - From and To: `nodeId → label`.

## Task list

- [x] Task 1: Tests first
- [x] Task 2: Placement helpers and store
- [x] Task 3: Canvas and library
- [x] Task 4: Names in the connection inspector
- [x] Task 5: Handle visibility and hit area
- [x] Task 6: Docs, full checks, browser checks

### Checkpoint
- [x] All six spec success criteria met; ready for review (nothing committed until asked)

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Hidden handles make connecting harder to discover for new students | Med | Shown on hover and selection; the library text and the existing "New link" picker stay; browser check from a fresh load |
| `::before` hit rings overlap the node card and steal clicks meant for the node | Med | The rings are 6 px outside the dot, on the node's border; browser check: clicking the node body selects it, and dragging from the body moves it |
| The fit no longer runs after `clearCanvas` + adding nodes, so the first nodes after a clear land at an old zoom | Low | B places them at the visible centre at the current zoom; acceptable |
| `viewCentre` is stale right after a load, until `onMoveEnd` fires | Low | `fitView` with a duration fires `onMoveEnd` at the end; browser check: load a demo, then add a node at once |
| HTML5 drag doesn't work on touch | Low | Clicking stays the path for touch; in the spec |
| A demo or fixture result changes | Low | Only interactive actions change; demo, fixture and design-file tests run unchanged |
