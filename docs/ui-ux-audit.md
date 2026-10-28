# UI/UX audit: Sesim simulator

Oct 28, 2026, against `main` at `1948cb1`.

## How this was done

- Read every file in `src/components/simulator/`, the app shell, `globals.css` and the store actions the UI calls.
- Ran the dev server and used the app in Chrome at 1440×900, 1280×800 and 390×844, in the sandbox and in the `campus-food-guide` challenge.
- Ran a Lighthouse accessibility snapshot (score **85**; four failed audits).
- Judged against Nielsen's ten heuristics, Norman's principles (visibility, feedback, mapping, constraints), WCAG 2.2 AA, Fitts's law and Gestalt grouping. For a teaching tool, I also asked whether the feedback helps a student learn.

Each finding says whether it was **seen** in the browser or comes from **code** only.

## Summary

The core loop works: pick a brief, place components, connect them, run, read results. The layout follows a familiar editor pattern (library, canvas, inspector, results), and the confirm-before-replace work is solid.

The main problems:

1. **Results go stale without saying so** (feedback and system status).
2. **One empty run reveals every brief rule's answer** (a learning-design problem more than a UI one).
3. **The body font is broken**: most text renders in Times New Roman.
4. **Most form fields have no accessible name**, and some icon buttons have none.
5. **The inspector is out of sight**: in a challenge, selecting a node changes nothing you can see.
6. **Text is small and low-contrast throughout** (62 uses of 10–11 px text; section labels at 2.5:1).

## Findings

Priority: **P0** is broken or misleading; **P1** costs students time or excludes some users; **P2** is polish.

### P0: broken or misleading

**1. Verification results go stale silently** (seen)
- *What happens:* In the food-guide brief I ran the check on an empty canvas, then added a VM. The panel still said "Topology: Canvas is empty" and "Fail", next to a canvas with a node on it.
- *Why it matters:* Visibility of system status, Nielsen #1. Students will read old numbers as the result of their latest change.
- *Where:* `runVerification` sets `verification` once (`src/lib/store.ts:587`). No edit action clears it or marks it out of date; only Clear, loading a design and starting a challenge reset it.
- *Fix:* Keep a fingerprint of the design at run time (`src/lib/unsaved.ts` already computes one). When it changes, dim the results and show "Design changed since this run. Run again." Don't clear them: comparing before and after is useful.

**2. One empty run gives away every brief rule's answer** (seen)
- *What happens:* Running the food-guide brief on an empty canvas listed every rule with its fix: "Needs a cdn → static_hosting connection", "Needs a client → cdn connection", "Needs a compute → cache connection".
- *Why it matters:* `HANDOVER.md` says rules stay out of the Brief tab "because they read like hints". One click on Run shows them all anyway, so a student can build the design from the list without reasoning about it.
- *Where:* `src/lib/challenges/rules.ts:66` appends `Needs a <link> connection` to every failing rule.
- *Fix (a teaching decision, so yours):* Show hints in stages. On the first failing run, show the rule title and the `why` text only. Show the "Needs a …" line after another failed run, or behind a "Show hint" button. A hint counter could later feed the TA misconception report.

**3. The body font falls back to Times New Roman** (seen) — **fixed** in `ui-quick-fixes`
- *What happens:* Computed `font-family` is `"Times New Roman"` on `html`, `body`, the library buttons and the panels. Only headings that use `--font-display` get DM Sans. It's visible in every screenshot: the panel text is serif.
- *Why:* `next/font` puts `--font-sans` on `<body>` (`src/app/layout.tsx:30`). `html { @apply font-sans }` (`src/app/globals.css:130`) resolves `var(--font-sans)` on `<html>`, where it isn't defined. The theme token also refers to itself (`--font-sans: var(--font-sans), …`, `globals.css:10`), so the declaration is invalid at computed-value time and the browser falls back to its default serif.
- *Fix:* Rename the `next/font` variable (for example `--font-plex`), point the theme's `--font-sans` at it, and put both font variable classes on `<html>`. About three lines; check with one `getComputedStyle` call.

### P1: costs time or excludes users

**4. Form fields and icon buttons have no accessible name** (seen, Lighthouse) — **fixed** in `ui-quick-fixes`; Lighthouse accessibility is now 100 in both modes
- Every `<Label>` in the requirements panel, node inspector and NFR section is a sibling of its input with no `htmlFor`. Screen readers announce the fields as "spin button 1.5", with no name. That covers Mem, vCPU, Disk, Target RPM, every NFR field and every inspector field. The workload fields are named only by their placeholder ("ms", "req/min").
- Unnamed buttons: Add requirement (`+`, `requirements-panel.tsx:92`), Delete requirement (trash icon, `:116`) and the "New link" protocol select (`edge-inspector.tsx:174`).
- Canvas nodes are announced as an unnamed "group". Edges are announced with internal ids ("Edge from paas-7 to database-9") instead of node names.
- *Fix:* Use `useId()` with `htmlFor`/`id`, or wrap each input in its `<Label>`. Add `aria-label` to the three controls. Set React Flow's `ariaLabel` on nodes and edges from `data.label`.

**5. In a challenge, the inspector is hidden behind a tab** (seen)
- Adding or clicking a node selects it. The node and edge inspectors are at the bottom of the **Requirements** tab, which is closed while the **Brief** tab is open. Nothing visible changes in the side panel. In the sandbox the inspector is below two feature cards and the NFR block, so you have to scroll to find it.
- *Why it matters:* Visibility and mapping (Norman). The inspector should appear where the user's attention already is.
- *Fix:* Make the inspector its own context-driven area. When something is selected, show a third "Selected" tab and switch to it, or show the inspector as a panel docked to the canvas. Return to the previous tab when nothing is selected.

**6. Small, low-contrast text everywhere** (seen, Lighthouse) — **contrast fixed** in `ui-quick-fixes` (labels, the inactive tab and a teal `--ring`); the size floor is still open
- 62 uses of `text-[10px]` or `text-[11px]` in the simulator components. 84 visible text elements are under 12 px.
- Section labels (`text-slate-400` on `#f8fafc`) measure **2.51:1**. WCAG AA needs 4.5:1. `text-slate-500` at 10 px is borderline.
- *Fix:* Set a floor of 12 px for body text and 11 px for uppercase labels, and move labels to `slate-500` or darker. Do it through tokens (see finding 14), not one class at a time.

**7. The camera re-fits on every add or delete** (seen, code)
- `FitViewOnReady` (`design-canvas.tsx:31`) calls `fitView` whenever the node count changes. Adding one VM to an empty canvas zoomed it to 150%. On a busy canvas, every add re-frames the whole view, so the user loses their place.
- New nodes appear at `120 + 24·n` (`store.ts:440`), which drifts off-screen once you've panned.
- *Fix:* Fit only on load, import, challenge start and demo load. Place new nodes at the centre of the current viewport (`screenToFlowPosition`) and nudge them so they don't overlap. Allow drag-and-drop from the library; the instruction says "Click to place", but dragging is the convention users expect in diagram tools.

**8. No undo, and deleting nodes is hidden** (code)
- Nodes can only be deleted with Backspace (React Flow's default). The canvas's own screen-reader text says "Press delete", which is the wrong key. The node inspector has no Delete button, while the edge inspector has one, so the two are inconsistent.
- There is no undo or redo anywhere. Accidentally deleting a node also unplaces its features, which silently undoes work in the requirements panel.
- *Why it matters:* User control and freedom, and error recovery (Nielsen #3 and #9).
- *Fix:* Add a Delete button to the node inspector and set `deleteKeyCode={["Backspace", "Delete"]}`. Add a small undo stack (zundo or a hand-rolled snapshot list of `{nodes, edges, features}`) with Ctrl+Z and Ctrl+Shift+Z.

**9. The connection workflow is hard to discover** (seen)
- To connect two nodes you first choose a protocol in a "New link" dropdown at the top, then drag between one of 18 small handles per node (198 handles across 11 nodes in the demo). The dropdown shows the raw value `http` instead of its label, because `SelectValue` gets no `items` (`edge-inspector.tsx:175`). Its hint is cut off at `max-w-[10rem]`.
- The 8 px handles are below the 24 px minimum target size (WCAG 2.5.8 and Fitts's law), and they're always visible, which adds visual noise.
- *Fix:* Show handles only on hover or selection, and make the hit area 24 px even if the dot stays small. Let the student pick the protocol after connecting: create the edge with a sensible default based on source and target kinds (client → compute is HTTP, compute → database is DB), then open the edge inspector. Keep the toolbar picker as an override.

**10. Results panel: no order, no summary, and it pushes the canvas** (seen)
- Checks appear in engine order, so passes, warnings and failures are mixed. A student has to scan all of them to find what failed.
- No count is shown (for example "3 failed · 1 warning · 8 passed").
- The panel takes up to `max-h-44` plus its header, and the canvas shrinks with it. At 1280×800 the canvas lost about 30% of its height.
- Several engine messages cite "PDF" ("PDF: mainly only compute components…", `src/lib/simulation.ts:573–852`). Students in a challenge don't have that PDF.
- *Fix:* Sort failures first, then warnings, then passes, and collapse the passes. Add the count summary to the badge. Make the panel resizable or collapsible. Rewrite the "PDF" lines in plain words, or name the source.

**11. The placement error is shared and never clears** (code)
- `placeError` (`requirements-panel.tsx:26`) is one message for the whole list, shown below all the cards. The card it belongs to isn't marked, and the message stays until another placement succeeds.
- *Fix:* Keep the error per feature, show it on that card with `aria-live="polite"`, and clear it when the card changes.

**12. Number inputs accept anything** (code)
- Node and feature inputs write `Number(e.target.value)` straight into the store. Clearing a box stores `0`, and typing `-3` vCPU is accepted. Only the workload fields parse input (`feature-workload.tsx`). The `min` and `max` attributes are hints the store never enforces.
- *Fix:* Reuse the draft-and-parse pattern from `FeatureWorkload` in one shared `NumberField`. Clamp values in the store, and mark invalid fields with `aria-invalid`.

### P2: polish and consistency

**13. Mobile and tablet** (seen at 390 px)
- The toolbar wraps to four rows and covers about 30% of the canvas. The minimap covers another 20%. Nodes render at about 6 px text.
- Editing diagrams on a phone isn't a realistic goal. But students will open shared links on phones, so give them something useful:
  - below `md`, show a read-only notice ("Best on a laptop") with the brief;
  - hide the minimap below `lg`;
  - fold the toolbar into a single overflow menu.

**14. The design system is bypassed** (code)
- 46 hard-coded hex colours in the simulator components, mostly in `design-node.tsx` and the edge styles. Raw `slate-*`/`teal-*` utilities are used instead of the shadcn tokens (`--primary`, `--muted-foreground`, `--border`).
- The tokens themselves are unfinished. `--ring` is neutral grey, so the focus ring doesn't match the teal brand. The `.dark` palette exists, but nothing uses it, and the components wouldn't follow it anyway.
- Unused primitives ship in the bundle: Card, Alert, Progress, Slider and ScrollArea are imported nowhere. `TooltipProvider` wraps the app, but no `Tooltip` is used; help text uses `title=` instead, which keyboard and touch users can't reach (`feature-workload.tsx:68`, `verification-panel.tsx`).
- *Fix:*
  - Define semantic tokens (`--status-pass/warn/fail`, `--kind-compute`, `--kind-data`, …) and map Tailwind to them.
  - Move the `KIND_STYLES` colours into CSS variables.
  - Make `--ring` teal.
  - Replace `title=` help with `Tooltip` or an info button.
  - Delete the unused primitives, or keep them deliberately.

**15. Duplicated maps, and icons that collide** (code)
- `component-library.tsx:24` (`ICONS`) and `design-node.tsx:23` (`KIND_STYLES`) each map component kinds to icons. A new kind needs both edited, and they can drift apart.
- Two pairs of different kinds share an icon: Message Queue and Task Worker both use `ListTodo`, and Static Hosting and CDN both use `Globe`. This weakens recognition (Nielsen #6). It matters most for the pairs students are learning to tell apart.
- *Fix:* One `KIND_VISUALS` record in `src/lib/catalog.ts` (icon, accent and chip colours), used by both components. Give each kind its own icon, for example `Workflow` for the worker and `Satellite` or `Radio` for the CDN.

**16. Empty states and orientation** (seen)
- Starting a challenge shows an empty canvas and an empty minimap, with no prompt about what to do first.
- The header has a lot of chrome and a long tagline, but nothing shows progress through the brief (for example "3 features to place · not yet run").
- *Fix:* Show an empty-canvas card ("Start by adding the clients from the brief → Library") that disappears after the first node. Hide the minimap when there are fewer than about 6 nodes. Add a small status strip in challenge mode: features placed (2/3), last run result, and changed-since-run.

**17. Toolbar grouping** (seen)
- The toolbar mixes four kinds of control: mode (Challenge), file (Export and Import), destructive (Clear) and drawing (New link). They wrap unpredictably as the width changes. In challenge mode the tagline takes toolbar space and duplicates the Brief header.
- *Fix:* Group them following Gestalt proximity:
  - mode and file actions in the app header;
  - drawing tools on the canvas;
  - Clear behind an overflow menu, away from frequently used buttons.

**19. Inputs ignore the size the panels ask for** (seen, found during `ui-quick-fixes`)
- The panels pass `text-[11px]` to `Input`, but the shared primitive also has `md:text-sm`. `tailwind-merge` doesn't drop a breakpoint class in favour of a base one, so from 768 px up every such input renders at 14 px.
- This is part of why the workload placeholders ("req/min") now clip in IBM Plex Sans.
- *Fix:* decide whether those inputs should be 11 px (as written) or 14 px (as rendered), then pass the matching `md:` class or change the primitive. Best done with the text-size floor in finding 6.

**20. Edge inspector selects show raw values** (seen, found during `ui-quick-fixes`)
- The Protocol, From and To selects have no `items`, so selecting the API → graph DB edge shows `db`, `paas-7` and `database-9`, not "DB", "Programme API" and "Programme Graph DB". The "New link" select was fixed the same way in `ui-quick-fixes`.

**18. Small items** (seen and code)
- Dark-mode tokens exist, but the app is hard-coded light. Either finish dark mode or delete `.dark` to avoid confusion.
- The Brief tab gives no reading aid for long scenarios (the course-assistant and photo-wall summaries run long). Bold the key numbers, or show them as a "Targets" list (latency, throughput, budget) next to the scenario. The targets are already in the brief data.
- The "Defaults mirror BeUWI case study from the PDF" note is sandbox-only, but it shows on first load, so it's the first thing a new student reads.
- The "Toggle Interactivity" lock button in the canvas controls has no clear purpose for students. Consider `showInteractive={false}`.

## Engineering patterns

- **Store vs. view state.** Selection, the pending protocol and pending replace live in the global Zustand store alongside domain data; placement error and drafts live in components. This is mostly fine. The one change to make is to store `verifiedFingerprint` with each result, which fixes finding 1 without adding a new subsystem.
- **One place per concept.** Kind visuals (finding 15) and number parsing (finding 12) are each implemented more than once. Moving them into `catalog.ts` and a shared `NumberField` is the same pattern the code already uses for `PROTOCOL_META`.
- **The inspector is a component, not a section.** `NodeInspector` and `EdgeInspector` are already self-contained. Only their placement inside `RequirementsPanel` couples them to it, so finding 5 is mostly moving JSX.
- **Accessibility tests.** The repo has vitest with component tests (`brief-panel.test.tsx`, `design-node.test.tsx`). Add `vitest-axe` or a `getByLabelText` assertion per panel so finding 4 can't come back.

## Suggested order

Each item fits the existing spec → plan → branch flow:

1. **Quick fixes in one branch:** font (3), accessible names (4), contrast floor and `--ring` (6), protocol select label (part of 9). Small and low risk. They clear three of the four failed Lighthouse audits, which should lift accessibility from 85 to about 95.
2. **`stale-results`:** findings 1 and 10. This changes how every run is read, so it's high value.
3. **`inspector-placement`:** finding 5, plus the node delete button from 8.
4. **`canvas-ergonomics`:** findings 7 and 9 (fit only on load, place in the viewport, hover handles, protocol after connecting).
5. **`staged-hints`:** finding 2. This needs your teaching decision first.
6. **`undo`:** the rest of finding 8.
7. **Design tokens and kind visuals:** findings 14 and 15, then 16–18 as polish.
