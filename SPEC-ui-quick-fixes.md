# Spec: UI quick fixes (font, accessible names, contrast)

Status: **approved** (2026-10-28) as proposed: a shared `SECTION_LABEL` constant, "Name / purpose"
renamed to "Name", Delete added alongside Backspace, one combined plan and task list. Plan:
[tasks/ui-quick-fixes/plan.md](tasks/ui-quick-fixes/plan.md). Module id `ui-quick-fixes`. Branch: `fix/ui-quick-fixes`,
from `main` (`1948cb1`). This is the first batch from [docs/ui-ux-audit.md](docs/ui-ux-audit.md):
findings 3, 4 and 6 (contrast only), and the protocol select label from 9.

## Objective

Three problems found in the audit are cheap to fix and affect every student:

- **The body font is broken.** Everything except a few headings renders in Times New Roman,
  including dialogs. Computed `font-family` on `html`, `body` and the panels is
  `"Times New Roman"`.
- **Screen readers can't name most controls.** Lighthouse (snapshot, desktop) fails
  `label` (11+ inputs) and `button-name` (4 buttons). Canvas nodes are unnamed groups, and
  edges are named with internal ids ("Edge from paas-7 to database-9").
- **Section labels are too faint.** `text-slate-400` on the panel background measures
  2.51:1; WCAG AA needs 4.5:1. The focus ring is neutral grey.

Users: every student. Screen-reader and keyboard users are blocked today, and everyone
reads the wrong font.

## Change

### A. Font

**Cause:**
- `next/font` declares `--font-sans` on `<body>` (`src/app/layout.tsx:30`).
- `html { @apply font-sans }` (`src/app/globals.css:130`) reads that variable on `<html>`,
  where it isn't defined.
- The theme token also refers to itself (`--font-sans: var(--font-sans), …`,
  `globals.css:10`).

The declaration is invalid at computed-value time, so the browser uses its default serif.

**Fix:**
- In `layout.tsx`, rename the IBM Plex variable to `--font-plex`, and put both font
  variable classes on `<html>` instead of `<body>`.
- In `globals.css`, set the theme's `--font-sans: var(--font-plex), "IBM Plex Sans",
  ui-sans-serif, system-ui, sans-serif`.
- `--font-display` keeps its name, so the six `font-[family-name:var(--font-display)]`
  headings are unchanged. `--font-heading` (used by the dialog and sheet titles) already
  points at it.

Per the Next.js font docs (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md`),
`variable` only names the CSS variable, so the rename is safe.

**Expected side effect:** every label gets slightly wider or narrower, so truncation and
toolbar wrapping move a little. The browser check covers this.

### B. Accessible names

1. **Link every visible label to its control** with `htmlFor` and `id`:
   - Requirements panel feature cards: Mem, vCPU, Disk, Target RPM, Place on compute, and
     the four workload fields (Slow work, If polled, Files, Writes).
   - Non-functional section: the four targets.
   - Node inspector: every field.
   - Edge inspector: Protocol, Label override, From, To.

   Ids come from `useId()`; inside the feature list they add the feature id and field key
   (for example `${base}-${feature.id}-vcpus`). Base UI's `Input` keeps a passed `id`
   (checked: `useBaseUiId(idProp)`). For selects, the label points at the `SelectTrigger`,
   which is a `<button>` and so can take a label. If Base UI's trigger doesn't take the
   id, fall back to `aria-label` with the same text.
2. **Name the unlabelled controls:**
   - the new-requirement text box: `aria-label="New functional requirement"`;
   - its `+` button: `aria-label="Add requirement"`;
   - each requirement's trash button: `aria-label={`Remove requirement: ${req.text}`}`;
   - the "New link" select: `aria-label="Protocol for new connections"`.
3. **Make the "New link" select show its label.** Pass `items` (protocol → short label),
   as the challenge picker and placement select already do. It then shows "HTTP" instead
   of the raw value `http`.
4. **Name canvas nodes and edges** from what the student sees, not ids:
   - nodes: `"<label>, <catalog label>"`, for example "Programme API, PaaS / App Platform";
   - edges: `"<protocol short label> from <source label> to <target label>"`, for example
     "DB from Programme API to Programme Graph DB".

   These are computed in `FlowCanvas` when it maps nodes and edges for React Flow (edges
   are already mapped there for styling). They are never written to the store, so Export,
   the unsaved-changes fingerprint and the engine are unaffected.
5. **Make the Delete key do what the canvas says.** React Flow's built-in screen-reader text
   says "Press delete to remove it", but the default delete key is Backspace only. Set
   `deleteKeyCode={["Backspace", "Delete"]}`.

### C. Contrast and focus

- **Section labels:** the uppercase section labels appear in eight places with the same
  class string. Replace them with one shared constant `SECTION_LABEL` (moved out of
  `brief-panel.tsx`, where it already exists) and change `text-slate-400` to
  `text-slate-500` (4.56:1 on `#f8fafc`, 4.76:1 on white).
- **Other `text-slate-400` text** goes to `text-slate-500`: the protocol hint
  (`edge-inspector.tsx:185`) and "Preparing canvas…" (`design-canvas.tsx:209`).
- **The requirement trash icon** (`requirements-panel.tsx:113`) goes to `text-slate-500`,
  so it meets 3:1 for non-text contrast.
- **Focus ring:** `--ring` changes from neutral grey `oklch(0.708 0 0)` to a brand teal,
  `oklch(0.55 0.1 185)`, which is about 4.8:1 on white. Inputs use it at full opacity for
  the focused border (`focus-visible:border-ring`), so the indicator passes 3:1. The 50%
  halo is extra.

## Out of scope

- **The text-size floor** (finding 6, second half). It changes the layout of every panel
  and is better reviewed on its own.
- Hard-coded hex colours, design tokens and dark mode (finding 14).
- Any layout, copy or behaviour change not listed above.

## Tests (written first)

- **New `src/components/simulator/a11y.test.tsx`** (static render, like
  `brief-panel.test.tsx`). A small helper, `unnamedControls(html)`, returns each `<input>`
  that has neither an `aria-label` nor an `id` matched by some `<label for>`, and each
  `<button>` that has no text and no `aria-label`. The test renders, from the store's
  default demo state:
  - the requirements panel (sandbox);
  - the same panel with a node selected, then with an edge selected (both inspectors);
  - the requirements panel in a challenge (locked fields);
  - the canvas toolbar's protocol picker.

  Each must return no unnamed controls. The project runs vitest in `node` without a DOM,
  so the helper reads markup with regular expressions instead of adding a DOM
  environment (adding one was "ask first" in earlier specs).
- **Canvas names:** the function that builds React Flow's nodes and edges is exported and
  tested directly. A demo node gets "Programme API, PaaS / App Platform"; a demo edge gets
  "DB from Programme API to Programme Graph DB"; the store's nodes have no `ariaLabel`.
- **Font guard:** a test reads `globals.css` and fails if any `--font-x` token is defined as
  `var(--font-x…)` (self-reference).
- **Existing tests** stay green unchanged, including the `design-node.test.tsx` border
  colours.

## Browser check (Chrome DevTools, as before)

- At 1440×900, 1280×800 and 390×844:
  - computed `font-family` on `body`, a library button and the confirm dialog starts with
    "IBM Plex Sans";
  - screenshots show no new clipping or overflow in the toolbar, feature cards or results.
- **Lighthouse** accessibility snapshot, desktop, in the sandbox with a run shown and in a
  challenge: no failed accessibility audits. Record the score; it was 85.
- **Keyboard:** Tab to a feature's vCPU box; the accessibility snapshot names it "vCPU".
  Focus a canvas node and press Delete; the node is removed.
- **Focus ring:** visibly teal on an input and a select.
- No new console errors.

## Docs

- `docs/ui-ux-audit.md`: mark findings 3 and 4, and the contrast half of 6, as fixed with
  the commit.
- `HANDOVER.md` (untracked).

## Boundaries

- **Always:**
  - the engine, store, briefs, fixtures and demos stay unchanged;
  - tests, `tsc`, lint and build stay green;
  - visible copy is unchanged, except the protocol select showing "HTTP" instead of `http`
    and, if approved, open question 2.
- **Ask first:**
  - changing text sizes;
  - adding a DOM test environment or an axe dependency;
  - restyling beyond the colour changes listed.
- **Never:** store accessibility-only fields in the design or in exported files.

## Success criteria

1. The app renders in IBM Plex Sans (body) and DM Sans (headings) everywhere, dialogs
   included.
2. Lighthouse reports no failed accessibility audits in either mode.
3. Every form control and icon button has an accessible name, and the new test keeps it
   that way.
4. Canvas nodes and edges are announced by their visible names, and Delete removes a
   focused node.
5. All tests, `tsc`, lint and build pass, and the browser check passes.

## Open questions

1. **Shared section-label constant.** Proposed: one exported `SECTION_LABEL` class string,
   since `brief-panel.tsx` already uses that pattern. The alternative is a small
   `<SectionLabel>` component, which is tidier but changes eight call sites' markup.
2. **Rename "Name / purpose" to "Name"** in the node inspector? It becomes the field's
   spoken name, and the next field is "Purpose note". Proposed yes; it's the only copy
   change beyond the protocol select.
3. **Delete key.** Add Delete alongside Backspace, as proposed, or change React Flow's text
   to say Backspace instead?
4. **Plan format.** One combined plan and task list, as before?
