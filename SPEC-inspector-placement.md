# Spec: show the inspector where the selection is

Status: **approved** (2026-10-28) as proposed:
- an inspector card on the canvas;
- the minimap hidden while the card is open;
- delete without asking;
- one combined plan and task list.

Plan: [tasks/inspector-placement/plan.md](tasks/inspector-placement/plan.md). Module id
`inspector-placement`. Branch:
`feat/inspector-placement`, from `main` (`cf2b6aa`). Covers finding 5 of
[docs/ui-ux-audit.md](docs/ui-ux-audit.md), and the node Delete button from finding 8.

## Objective

Selecting a node or connection is how students edit a design, but what they select ends
up somewhere they can't see:

- **In a challenge**, the node and connection inspectors sit at the bottom of the
  **Requirements** tab. The panel opens on **Brief**, so clicking a node or adding one
  from the library changes nothing on screen.
- **In the sandbox**, the inspectors sit below every feature card and the targets. With
  the demo's two features you have to scroll the panel to reach them.
- **Below 1280 px**, the whole side panel is a sheet that's closed until you open it, so
  selecting something never shows its settings. That's the common laptop range,
  1024–1279 px.
- **A node can only be deleted with the keyboard.** The connection inspector has a Delete
  button, but the node inspector doesn't (finding 8).

Users: every student, every time they add or click something.

## Change

### A. An inspector card on the canvas

When a node or connection is selected, its inspector appears as a card docked to the
**top-right of the canvas**. When nothing is selected, the card is gone.

- **What's in it:** the existing `NodeInspector` or `EdgeInspector` content, unchanged.
  - The header shows the kind ("Selected node" or "Selected connection") and the name,
    and has a close button (`aria-label="Close inspector"`) that clears the selection.
  - Pressing **Escape** while focus is inside the card does the same.
- **Where it sits:** the canvas overlay becomes one row across the top of the canvas,
  with the toolbar on the left, taking the remaining width and wrapping, and the card on
  the right.
  - The card is 18 rem (288 px) wide. At most it's as tall as the canvas minus its
    margins, and it scrolls inside if needed.
  - While the card is open, the toolbar wraps earlier instead of running underneath it.
  - The minimap is hidden while the card is open, so a tall card doesn't cover it.
- **When it opens:** on every selection, the same way selection already works:
  - clicking a node or edge;
  - adding a component from the library (the store already selects the new node);
  - drawing a connection (the store already selects the new edge). The student lands on
    the protocol picker straight after connecting, which also helps with finding 9.
- **Focus:** opening the card doesn't move focus, so clicking and dragging nodes isn't
  interrupted. Closing it with the button or Escape returns focus to the canvas.
- **Accessibility:** the card is a `<section>` labelled by its heading. It's in the tab
  order after the toolbar, and every control in it keeps the accessible name added in
  `ui-quick-fixes`.
- **Every width:** the card belongs to the canvas, not the side panel, so it works at
  1024–1279 px, where the side panel is a closed sheet. Below 640 px it can take the
  full canvas width; phones stay out of scope (finding 13).

### B. The side panel loses the inspectors

- The "Node inspector" and "Connection inspector" sections and their separators leave
  `RequirementsPanel`.
- In the sandbox the panel is then requirements and targets only. In a challenge the
  Requirements tab is the feature cards and the locked targets.

### C. Delete a node from its inspector

- **A Delete button** in the node inspector, styled like the connection inspector's.
- It calls a new store action, `deleteNode(id)`, which:
  - removes the node and every edge to or from it;
  - unplaces features that were on it;
  - clears the selection.

  This is what Backspace or Delete on the canvas already does through React Flow's
  changes; the action does it directly.
- **No confirmation**, matching the keyboard. Undo comes later (finding 8).
- **Focus** moves to the canvas, so it isn't lost when the card disappears.

## Out of scope

- Undo and redo (finding 8, `undo`).
- Changing what the inspectors contain. Their raw-value selects are finding 20.
- Choosing the protocol after connecting by default, and hover-only handles (finding 9,
  `canvas-ergonomics`).
- Phone layouts (finding 13).

## Code

- **New `src/components/simulator/inspector-card.tsx`:** `InspectorCard` reads
  `selectedNodeId` and `selectedEdgeId`, renders nothing when neither matches an
  existing node or edge, and otherwise renders the card with `NodeInspector` or
  `EdgeInspector`.
  - Their outer border and placeholder ("Select a canvas node…") are no longer needed in
    the card. Each gets a small change so the card owns the frame and the title.
- **`design-canvas.tsx`:** the overlay becomes
  `absolute inset-3 flex items-start gap-2 pointer-events-none`, holding the toolbar
  (`flex-1 flex-wrap`) and `InspectorCard` (`w-72 max-h-full overflow-y-auto
  pointer-events-auto`).
  - `MiniMap` renders only when nothing is selected.
  - The close and delete handlers return focus to the canvas wrapper (`containerRef`,
    with `tabIndex={-1}`).
- **`requirements-panel.tsx`:** the two inspector sections are removed.
- **`store.ts`:** `deleteNode(id)`, built on the existing `unplaceMissing`.
- **`node-inspector.tsx`:** the Delete button.
- **Next.js:** no Next API changes.

## Tests (written first)

- **`src/lib/store.test.ts`, `deleteNode`:**
  - it removes the node and only its edges;
  - it unplaces only the features that were on it;
  - it clears the selection;
  - it marks results as stale (`resultsAreStale()`);
  - a missing id changes nothing.
- **New `src/components/simulator/inspector-card.test.tsx`** (`renderWithStore`):
  - nothing selected: renders nothing;
  - a node selected: "Selected node", its name, the node fields, a "Close inspector"
    button and a "Delete" button;
  - an edge selected: "Selected connection" and the protocol field;
  - a selected id that no longer exists: renders nothing.
- **`a11y.test.tsx`:** the node, database-node and edge cases render `InspectorCard`
  instead of `RequirementsPanel`. Every control is still named, including the close and
  delete buttons.
- **`requirements-panel` (in `a11y.test.tsx`):** with a node selected, the panel no longer
  contains "Selected node".

## Browser check (Chrome DevTools)

- **1440×900, sandbox:**
  - click a node: the card opens at the top right with its fields, and the minimap
    hides;
  - edit the name: the node on the canvas updates;
  - click the canvas background: the card closes and the minimap returns;
  - add a component: the card opens on it;
  - draw a connection: the card opens on the edge;
  - Delete in the card: the node and its edges go, and focus is on the canvas.
- **1280×800, challenge:** with the Brief tab open, clicking a node shows the card. The
  toolbar wraps to the card's left and nothing overlaps.
- **1100×800 (side panel in a sheet):** clicking a node shows the card.
- **Keyboard:**
  - Tab into the card, press Escape: the card closes and focus returns to the canvas.
  - With a dropdown open inside the card, Escape closes only the dropdown.
  - Backspace and Delete typed in the card's Name field edit the text and don't delete
    the node. React Flow ignores key presses in inputs, but the card now sits next to the
    canvas, so this has to be proven.
- **Dragging** a node while the card is open still works.
- **Lighthouse** accessibility snapshot with the card open, in both modes: 100.
- The console has no new errors.

## Docs

- `docs/ui-ux-audit.md`: mark finding 5 fixed, and note the node Delete button under
  finding 8.
- `HANDOVER.md` (untracked).

## Boundaries

- **Always:**
  - the engine, briefs, fixtures and demos unchanged;
  - the inspectors' fields and behaviour unchanged;
  - tests, `tsc`, lint and build stay green;
  - Lighthouse stays at 100.
- **Ask first:**
  - a confirmation before deleting a node;
  - moving the card to another corner, or making it draggable;
  - changing the toolbar's contents or grouping (finding 17).
- **Never:** move focus into the card when a node is clicked; that would break dragging
  and keyboard movement on the canvas.

## Success criteria

1. Selecting a node or connection shows its settings at once, in the sandbox and in a
   challenge, at every width from 1024 px up.
2. Nodes can be deleted from their inspector, and that removes their edges and unplaces
   their features.
3. The requirements panel no longer holds the inspectors.
4. All tests, `tsc`, lint and build pass; the browser checks pass; Lighthouse stays 100.

## Open questions

1. **Where should the inspector go?**
   - **Proposed: a card docked on the canvas.** It shows wherever the student is working,
     and it works at 1024–1279 px, where the side panel is a closed sheet.
     - Cost: while it's open, the canvas loses 288 px on the right, and the toolbar wraps
       sooner.
   - **Alternative: a third side-panel tab** ("Selected") that opens on selection and
     goes back to the previous tab when you deselect.
     - It's simpler and keeps the canvas clear.
     - But below 1280 px it's inside the closed sheet, so selecting would still show
       nothing there.
2. **Hide the minimap while the card is open?** Proposed yes. The alternative is to cap
   the card's height above the minimap, which makes the card short on 800 px screens.
3. **Delete without asking?** Proposed yes, matching the keyboard, until undo exists.
4. **Plan format.** One combined plan and task list, as before?
