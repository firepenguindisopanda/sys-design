# Tasks: `ui-quick-fixes`

Spec: [SPEC-ui-quick-fixes.md](../../SPEC-ui-quick-fixes.md). Plan: [plan.md](plan.md).

Standing verification: `npm test`, `npx tsc --noEmit` and `npm run lint` pass; the engine,
store, briefs, fixtures and demos are unchanged.

---

## Task 1: Tests first

**Description:**
- **New `src/components/simulator/a11y.test.tsx`** with an `unnamedControls(html)` helper.
  Static renders, each expected to have no unnamed controls:
  - `RequirementsPanel`, sandbox demo state;
  - the same panel with a demo node selected, and again with a demo edge selected;
  - the same panel in a challenge (`startChallenge` with a loaded brief);
  - `PendingProtocolPicker`.
  - One more assertion: the helper flags a bare `<input>` and an icon-only `<button>`, so a
    helper that always returns nothing can't pass.
- **New `src/components/simulator/flow-labels.test.ts`:**
  - the demo's PaaS node → "Programme API, PaaS / App Platform";
  - the demo's API → graph DB edge → "DB from Programme API to Programme Graph DB";
  - an edge whose node is missing falls back to the node id rather than throwing;
  - the store's nodes and edges have no `ariaLabel` after the canvas would have mapped
    them (the functions don't mutate).
- **New `src/app/fonts.test.ts`:** reads `globals.css` and fails if any `--font-x` is
  defined as `var(--font-x…)`.

**Acceptance criteria:**
- [x] The panel test fails, listing the unlabelled inputs and the three icon or select
  controls.
- [x] The flow-labels test fails because the module doesn't exist.
- [x] The font guard fails on `--font-sans`.
- [x] The helper's own check passes.

**Verification:**
- [x] `npx vitest run src/components/simulator src/app`

**Dependencies:** None

**Notes (deviations):**
- Zustand's `useStore` renders on the server from `getInitialState()`, which `setState`
  never changes, so `renderToStaticMarkup` always showed the demo with nothing selected
  (the inspector tests passed without any fix). The panel tests copy the live state into
  the initial-state object before each render and restore it after each test. Test-only;
  the store is unchanged.
- The helper also requires a label on `<button role="combobox">` (select triggers): their
  text is the selected value, not the field's name, so "has text" would pass the "New
  link" select and every inspector select without a fix. One extra helper check covers it.
- Also added a database-node inspector case (Engine select, Replicas, Shards), since the
  PaaS node doesn't render the select fields.

**Files:** `src/components/simulator/a11y.test.tsx`,
`src/components/simulator/flow-labels.test.ts`, `src/app/fonts.test.ts`

**Estimated scope:** M

---

## Task 2: Font fix

**Description:**
- Read the Next.js font docs (getting started and API reference).
- `layout.tsx`: rename the IBM Plex variable to `--font-plex`; move both variable classes
  from `<body>` to `<html>`.
- `globals.css`: the theme's `--font-sans` points at `var(--font-plex)`.

**Acceptance criteria:**
- [x] The font guard passes.
- [x] In the dev server, computed `font-family` on `body` starts with "IBM Plex Sans".

**Verification:**
- [x] `npx vitest run src/app` (the DevTools check is left for review, with Task 5)

**Dependencies:** Task 1

**Files:** `src/app/layout.tsx`, `src/app/globals.css`

**Estimated scope:** XS

---

## Task 3: Accessible names

**Description:**
- **Labels linked with `htmlFor` and `id`:**
  - the requirements panel: Mem, vCPU, Disk, Target RPM, Place on compute, and the four
    NFR fields;
  - `FeatureWorkload`'s four fields;
  - the node inspector: every field;
  - the edge inspector: Protocol, Label override, From, To.
- **`aria-label`s:** the new-requirement box, Add requirement, each Remove requirement
  button, and the "New link" select.
- **`items` on the "New link" select**, so it shows "HTTP".
- **Rename** "Name / purpose" to "Name" in the node inspector.
- **New `flow-labels.ts`**, wired into `FlowCanvas` (nodes in a `useMemo`; edges in the
  existing mapping).

**Acceptance criteria:**
- [x] The panel and flow-labels tests pass; all other tests pass.

**Verification:**
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint`

**Dependencies:** Task 1

**Notes:** Base UI's `SelectTrigger` keeps a passed `id` (the label-for check passes on the
rendered triggers), so no `aria-label` fallback was needed except the "New link" select,
which has no visible `<Label>`. Node inspector ids are slugs of the label text
(`${id}-memory-gb`) or the capacity key (`${id}-memoryGb`).

**Files:** `requirements-panel.tsx`, `feature-workload.tsx`, `node-inspector.tsx`,
`edge-inspector.tsx`, `design-canvas.tsx`, new `flow-labels.ts`

**Estimated scope:** M

---

## Task 4: Delete key, contrast, focus ring

**Description:**
- `design-canvas.tsx`: `deleteKeyCode={["Backspace", "Delete"]}`.
- New `src/components/simulator/styles.ts` exports `SECTION_LABEL` with `text-slate-500`.
  Use it in `brief-panel.tsx`, `component-library.tsx`, `node-inspector.tsx`,
  `edge-inspector.tsx` and the four places in `requirements-panel.tsx`.
- `text-slate-400` → `text-slate-500` for the protocol hint, "Preparing canvas…" and the
  requirement trash icon.
- `globals.css`: in `:root`, `--ring: oklch(0.55 0.1 185)`.

**Acceptance criteria:**
- [x] `grep -rn "text-slate-400" src/components/simulator` finds nothing.
- [x] All tests pass.

**Verification:**
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint`

**Dependencies:** Task 1 (independent of 2 and 3)

**Notes:** The `--ring` change landed together with the Task 2 `globals.css` edit.

**Files:** `design-canvas.tsx`, new `styles.ts`, the five panel files, `globals.css`

**Estimated scope:** S

---

## Task 5: Docs, full checks, browser checks

**Description:**
- `docs/ui-ux-audit.md`: mark findings 3 and 4, and the contrast half of 6, as fixed.
  Leave the commit hash for when you ask me to commit.
- `HANDOVER.md`: add the step.
- `npm run build`.
- **Browser check (Chrome DevTools):**
  - at 1440×900, 1280×800 and 390×844: computed font on `body`, a library button and the
    confirm dialog; screenshots of the toolbar, feature cards and results, compared with
    the audit's screenshots;
  - Lighthouse accessibility snapshot, desktop: in the sandbox with results shown, and in
    a challenge with results shown; record the scores;
  - keyboard: Tab to a vCPU box and confirm its name in the snapshot; focus a node and
    press Delete;
  - drag a node and connect two nodes, to check that the `ariaLabel` mapping didn't break
    the canvas;
  - the teal focus ring on an input and a select;
  - the console has no new errors.

**Acceptance criteria:**
- [x] All five spec success criteria hold.

**Verification:**
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`
- [x] the browser checks above

**Notes (review, 2026-10-28):**
- **Fonts:** IBM Plex Sans on `body`, a library button and the confirm dialog's text; DM Sans
  on headings and the dialog title.
- **Lighthouse accessibility:** 100 in the sandbox with results (was 85). The first
  challenge run scored 96: the inactive tab label ("Requirements") was 4.4:1, because the
  shadcn `TabsTrigger` uses `text-foreground/60` on the muted list. That was changed to
  `/70` in `src/components/ui/tabs.tsx`, and the re-run scored 100.
- **Keyboard and canvas:** every control has a name in the accessibility snapshot. Delete
  removes a focused node and its edge. Dragging a node and connecting two nodes still work.
- **Canvas names:** a node whose label equals its catalog label was read "CDN, CDN".
  `nodeAriaLabel` now drops the repeat; there's a test for it.
- **Focus ring:** teal on an input and on a select.
- **Console:** only React Flow's existing hidden-attribution warning.
- **390 px:** the layout is unchanged from before.
- **New clipping (fixed):** the workload placeholders cut off as "req/mir" at 1280 and
  1440. Plex is wider than Times: the 81 px box minus 20 px of padding and Chrome's
  number spinner left about 46 px, and "req/min" needs 50 px. As you chose, the workload
  inputs now use `px-1.5` (6 px a side), which leaves about 54 px; "req/min" shows in
  full at 1440.
- **Found while checking:** inputs render at 14 px, not the `text-[11px]` the panels pass
  in. The shared `Input` has `md:text-sm`, and `tailwind-merge` doesn't drop a variant
  class for a base one. This is older than this change and out of scope; it's recorded in
  the audit.

**Dependencies:** Tasks 2–4

**Files:** `docs/ui-ux-audit.md`, `HANDOVER.md`

**Estimated scope:** S
