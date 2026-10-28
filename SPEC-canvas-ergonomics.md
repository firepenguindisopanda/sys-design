# Spec: a calmer canvas — placing, connecting and naming

Status: **approved** (2026-10-28) as proposed:
- only DB is a default protocol;
- dragging from the library, alongside clicking;
- a 20 px handle hit area, keeping all handles and their ids;
- one combined plan and task list.

Plan: [tasks/canvas-ergonomics/plan.md](tasks/canvas-ergonomics/plan.md). Module id
`canvas-ergonomics`. Branch:
`feat/canvas-ergonomics`, from `main` (`d1e016f`). Covers findings 7, 9 and 20 of
[docs/ui-ux-audit.md](docs/ui-ux-audit.md).

## Objective

Building a design on the canvas fights the student in three ways.

- **The camera jumps (finding 7).**
  - `FitViewOnReady` re-fits the view whenever the node count changes, so every add or
    delete re-frames the whole canvas.
  - Adding a VM to an empty canvas zoomed to 150%.
  - Since `inspector-placement`, nodes the re-fit pushes to the right can end up under the
    inspector card.
  - New nodes go to `120 + 24·n` in flow space, which can be off-screen once you've panned,
    and they stack on top of each other. In the browser check, a click on "Desktop Client"
    landed on the Load Balancer stacked over it.
  - The reverse also happens: importing a design with the same number of nodes doesn't
    re-fit at all (deferred polish in `HANDOVER.md`).
- **Connecting is hard to discover and to hit (finding 9).**
  - Each node shows 18 always-visible 8 px handles (198 on the demo), which is visual noise
    and below the 24 px target-size guidance.
  - Every new edge takes the toolbar's "New link" protocol, HTTP by default, even into a
    database, where it's never right.
  - The engine treats them differently: a DB hop costs 12 ms and an HTTP hop 20 ms, so a
    student who forgets to switch gets a slower, wrong result.
- **The connection inspector shows internal ids (finding 20).** Protocol, From and To show
  `db`, `desktop-2` and `message_queue-11` instead of "Database protocol", "Desktop web"
  and "Upload events". Since `inspector-placement` this sits in the middle of the screen.

Users: every student, from the first node they place.

## Change

### A. The camera moves only when the design is replaced (finding 7)

- The view fits the design on first load and whenever the whole design is replaced:
  - a demo loads;
  - a challenge starts or is left;
  - a design file is imported.

  Adding, deleting, moving or connecting nodes never moves the camera.
- This also fixes the import case: an import fits even when the node count is unchanged.
- **How:** a store counter, `layoutVersion`, goes up in those actions, and
  `FitViewOnReady` watches that instead of `nodes.length`.

### B. New nodes appear where the student is looking (finding 7)

- **Clicking a library item** places the node at the centre of the visible canvas.
  - If another node already covers that spot, it steps down and to the right (24 px at a
    time, up to 20 steps) until it's clear.
  - The canvas reports its visible centre, in flow coordinates, to the store whenever the
    view moves or resizes. With no canvas yet, as in tests, the old offset rule still
    applies.
- **Dragging a library item onto the canvas** drops the node where it's released, centred
  on the pointer.
  - Clicking still works. The library help text becomes "Click or drag onto the canvas."
  - Inside the library sheet below 1024 px, dragging can't reach the canvas (the sheet is
    modal), so only clicking applies there.

### C. Handles that appear when needed, and are easier to hit (finding 9)

- **Visibility:** handles are hidden until the node is hovered, selected or focused, or
  while a connection is being drawn. During a drag they show on every node, so targets are
  visible.
  - They fade in over 120 ms, or instantly with `prefers-reduced-motion`.
- **Hit area:** each handle's dot stays 8 px, but an invisible ring around it makes the
  clickable area 20 px.
  - All 18 handles per node stay. Demos and saved edges refer to their ids, and fan-in
    designs use them.
  - Neighbouring hit areas may overlap; that's harmless.
  - 20 px is under the 24 px guidance. Going bigger would need fewer handles, which would
    break the existing ids.

### D. Sensible default protocol (finding 9)

- A new edge to or from a **database or cache** gets the **DB** protocol.
- Every other new edge still uses the toolbar's "New link" choice. That includes the push
  and real-time protocols (SSE, WebSocket, Web Push), which are what several briefs teach,
  so the student still chooses those.
- The inspector card already opens on a new edge (`inspector-placement`), so the student
  sees the protocol straight away and can change it.
- Only edges drawn by hand are affected. Demos, fixtures and imported files keep their
  protocols.

### E. Names, not ids, in the connection inspector (finding 20)

- The Protocol, From and To selects pass `items`, as the placement and "New link" selects
  already do. They show "Database protocol (→)", "Desktop web" and "Upload events".

## Out of scope

- Fewer handles, or connecting from anywhere on a node.
- Connecting nodes with the keyboard.
- Undo (`undo`).
- Toolbar grouping (finding 17).
- Moving the camera to keep the selected node clear of the inspector card. With A and B,
  new nodes appear in the middle of the view; if overlap is still a problem, it's a later
  step.

## Code

- **New `src/lib/placement.ts`** (pure):
  - `freeSpot(centre, nodes, size?)`: the first spot, starting at `centre` and stepping
    `(+24, +24)` up to 20 times, whose box doesn't overlap any node's box. Boxes use each
    node's measured size if known, otherwise 200 × 70.
  - `defaultProtocol(sourceKind, targetKind, picked)` returns `"db"` when either kind is
    `database` or `cache`; otherwise `picked`.
- **`src/lib/store.ts`:**
  - `layoutVersion: number`, raised in `loadDemo`, `loadFanInDemo`, `startChallenge`,
    `leaveChallenge` and `loadDesign`;
  - `viewCentre: { x: number; y: number } | null` and `setViewCentre`;
  - `addComponent(kind, at?)`: `at` is used as given (a drop); otherwise
    `freeSpot(viewCentre, nodes)`; otherwise the old offset;
  - `onConnect` uses `defaultProtocol`.

  Neither new field is part of the fingerprints, so neither affects unsaved work or stale
  results.
- **`design-canvas.tsx`:**
  - `FitViewOnReady` keys on `layoutVersion`;
  - `onMoveEnd`, `onInit` and the existing `ResizeObserver` report the view centre (using
    `screenToFlowPosition`);
  - `onDragOver` and `onDrop` for library drops;
  - `onConnectStart` and `onConnectEnd` toggle a `connecting` class on the canvas wrapper.
- **`component-library.tsx`:** buttons are `draggable`, setting
  `application/x-sesim-kind`. The help text changes as in B.
- **`design-node.tsx`:** a `sesim-handle` class on every handle (the inline 8 px style
  stays).
- **`globals.css`:** the handle rules: hidden by default, shown on hover, `.selected`,
  `:focus-within` and `.connecting`; a `::before` ring for the hit area; a reduced-motion
  variant.
- **`edge-inspector.tsx`:** `items` for the Protocol, From and To selects.
- **Next.js:** no Next API changes.

## Tests (written first)

- **New `src/lib/placement.test.ts`:**
  - `freeSpot` on an empty canvas returns the centre (offset by half the box);
  - with a node over the centre it steps until clear;
  - it gives up after 20 steps and returns the last spot;
  - it uses measured sizes when present;
  - `defaultProtocol`:
    - `paas → database` gives `db`, and so does `cache → paas`;
    - `mobile → paas` keeps the pick;
    - `paas → mobile` with `sse` picked keeps `sse`;
    - `object_storage` keeps the pick.
- **`src/lib/store.test.ts`:**
  - `layoutVersion` rises on each of the five replace actions and not on `addComponent`,
    `deleteNode`, `onConnect` or `updateNodeData`;
  - `addComponent` with a view centre places the node at `freeSpot`, and adding twice
    gives two non-overlapping boxes;
  - `addComponent(kind, at)` uses `at`;
  - with no view centre, the old rule still applies;
  - `onConnect` to the demo's database gives `db` with the picker on `http`, and between
    two compute nodes gives the picker's protocol.
- **`a11y.test.tsx`** (edge case): the card shows the node names in the From/To triggers,
  not ids. Every control is still named.
- **Existing tests:** demos, fixtures, design-file round trips and the engine are
  unchanged.

## Browser check (Chrome DevTools)

- **1440, sandbox:**
  - pan the canvas, then click "Virtual Machine": the node appears in the middle of the
    view and the camera doesn't move;
  - click it four more times: five nodes, none stacked exactly;
  - delete one: no camera move;
  - drag "Database" onto the canvas: it lands under the pointer.
- **Handles:**
  - no handles show at rest;
  - hovering a node shows its handles;
  - starting a connection shows handles on every node;
  - the hit area is 20 px: `document.elementFromPoint` 9 px from a handle's centre still
    returns the handle, and 11 px away doesn't;
  - on touch, where there's no hover, tapping a node selects it and shows its handles.
- **Connecting:** Programme API → a new Database gives "DB"; Mobile app → Programme API
  with the picker on HTTP gives "HTTP".
- **Inspector:** From/To show node names, and Protocol shows "Database protocol (→)".
- **Import:** export the demo, move nothing, then import it: the view fits.
- **Lighthouse** in both modes: 100.
- The console has no new errors.

## Docs

- `docs/ui-ux-audit.md`: mark findings 7, 9 (except the keyboard and handle-count parts)
  and 20 fixed.
- `HANDOVER.md`: remove the "after an import with the same number of nodes, the canvas
  doesn't re-fit" deferred item.

## Boundaries

- **Always:**
  - the engine, briefs, fixtures and demos unchanged;
  - handle ids unchanged;
  - tests, `tsc`, lint and build stay green;
  - Lighthouse stays at 100.
- **Ask first:**
  - removing handles or changing their ids;
  - defaulting any protocol other than DB;
  - moving the camera to make room for the card.
- **Never:** choose SSE, WebSocket, Web Push or WebRTC for the student.

## Success criteria

1. The camera moves only when a whole design is loaded; adds, deletes and connects leave
   it alone.
2. New nodes appear in the visible area without landing exactly on another node, and can
   be dragged in from the library.
3. Handles are hidden at rest, visible when needed, and easier to hit.
4. Edges into a database or cache default to DB; everything else follows the picker.
5. The connection inspector shows names, not ids.
6. All tests, `tsc`, lint and build pass; the browser checks pass; Lighthouse stays at
   100.

## Open questions

1. **Default only DB?** Proposed yes: it's never wrong for a database or cache, and the
   protocols the briefs teach stay the student's choice. The alternative is no defaults,
   with only the inspector opening.
2. **Drag from the library?** Proposed yes, alongside clicking. It's the convention in
   diagram tools, and the click path stays for touch and keyboard. The alternative leaves
   drag out to keep the change smaller.
3. **Handle hit area 20 px rather than 24 px**, keeping all 18 handles and their ids?
   Proposed yes. 24 px would need fewer handles, which breaks the demos' edges unless
   they're remapped.
4. **Plan format.** One combined plan and task list, as before?
