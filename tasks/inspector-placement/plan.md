# Implementation Plan: `inspector-placement`

Spec: [SPEC-inspector-placement.md](../../SPEC-inspector-placement.md) (approved). Task
checklist: [todo.md](todo.md). Branch: `feat/inspector-placement`, from `main` (`cf2b6aa`).

## Overview

A new `InspectorCard` shows the node or edge inspector at the top right of the canvas
while something is selected. The canvas overlay becomes one row, with the toolbar on the
left and the card on the right, and the minimap hides while the card is open. The
requirements panel drops its two inspector sections. A `deleteNode` store action backs a
new Delete button in the node inspector.

## Dependency graph

```
T1 tests: deleteNode, InspectorCard states, a11y moved to the card (failing)
        │
        ├───────────────────────┐
        ▼                       ▼
T2 store deleteNode       T3 InspectorCard + inspectors lose frame/header/placeholder
        │                       │  + node Delete button
        └───────────┬───────────┘
                    ▼
T4 design-canvas overlay row, minimap toggle, focus return;
   requirements-panel drops the inspector sections
                    │
                    ▼
T5 docs, full checks, browser checks, Lighthouse
```

## Architecture decisions

- **The card owns the frame and the header; the inspectors own the fields.**
  - `InspectorCard` renders
    `<section aria-labelledby={headingId}>` with:
    - an `<h2 id={headingId}>` reading "Selected node" or "Selected connection", in the
      `SECTION_LABEL` style;
    - the name: the node's label, or "Source → Target";
    - the close button.
  - `NodeInspector` and `EdgeInspector` drop their outer frame classes, their header
    block and their "Select a …" placeholder; they return `null` when nothing matches.
    The edge inspector's direction hint stays, as the first line of its body.
  - This avoids two headers, and keeps the inspectors' fields and behaviour exactly as
    they are.
- **The card decides whether to render.** It looks up the selected node, then the
  selected edge (the store never selects both), and renders nothing when neither exists.
  That covers a node deleted with the keyboard while selected: `selectedNodeId` can point
  at a node that's gone.
- **Closing:** the close button and Escape call `selectNode(null)` and `selectEdge(null)`,
  then `onClose()`.
  - Escape is handled by `onKeyDown` on the `<section>`. Base UI renders select popups in
    a portal outside the section, so an Escape that closes a dropdown never reaches it.
  - `onClose` comes from `DesignCanvas` and focuses the canvas wrapper (`containerRef`,
    which gets `tabIndex={-1}` so it can take focus without entering the tab order).
- **Node Delete:** `NodeInspector` takes an optional `onDeleted` prop and calls
  `deleteNode(node.id)` and then `onDeleted?.()`. The card passes `onClose`, so focus goes
  back to the canvas. The button copies the edge inspector's Delete styling.
- **`deleteNode(id)`** filters the node out, filters the edges whose `source` or `target`
  is that id, runs `unplaceMissing`, and clears `selectedNodeId` and `selectedEdgeId`.
  It does nothing for an unknown id. Staleness needs nothing extra: the fingerprint
  changes.
- **Overlay layout:** in `DesignCanvas`, the absolute toolbar `div` becomes the left child
  of `absolute inset-3 z-10 flex items-start gap-2 pointer-events-none`:
  - the toolbar is `flex min-w-0 flex-1 flex-wrap gap-2` (still `pointer-events-none`,
    with its pieces `pointer-events-auto` as now);
  - the card is `pointer-events-auto w-72 max-w-full shrink-0 max-h-full overflow-y-auto`.

  The DesignIo error alert uses `order-last basis-full` and stays inside the toolbar.
- **Minimap:** `FlowCanvas` reads whether anything is selected and renders `<MiniMap>`
  only when nothing is.
- **Keys in the card:** React Flow's delete-key handler listens on the document and skips
  events from inputs, textareas and contenteditable elements. That's why Backspace in the
  Name field shouldn't delete the node. The browser check proves it; if it fails, the
  card stops propagation of key events from its inputs.

## Task list

- [x] Task 1: Tests first
- [x] Task 2: `deleteNode` in the store
- [x] Task 3: Inspector card and inspector changes
- [x] Task 4: Canvas overlay and requirements panel
- [x] Task 5: Docs, full checks, browser checks

### Checkpoint
- [x] All four spec success criteria met; ready for review (nothing committed until asked)

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Backspace in the card's Name field deletes the node | High | React Flow skips input targets; the browser check types Backspace in the field; stop propagation if needed |
| The toolbar wraps into three or four rows at 1280 px with the card open | Med | Screenshot at 1280 with the card open; if it's worse than two rows, note it for `canvas-ergonomics` (finding 17) rather than redesigning the toolbar here |
| The card covers the node being edited | Med | `fitView` already leaves 20% padding; the browser check looks at the demo at 1280. Moving the camera is out of scope |
| Focus is lost after Delete because the card unmounts | Med | `onDeleted` focuses the canvas wrapper; checked with the keyboard in the browser |
| Removing the inspector sections breaks the a11y tests that rendered them in the panel | Low | T1 moves those cases to the card first |
