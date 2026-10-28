# Implementation Plan: `ui-quick-fixes`

Spec: [SPEC-ui-quick-fixes.md](../../SPEC-ui-quick-fixes.md) (approved). Task checklist:
[todo.md](todo.md). Branch: `fix/ui-quick-fixes`, from `main` (`1948cb1`).

## Overview

Three fixes from the UI/UX audit, none of which touch the engine or the store:
- the body font: one variable rename in `layout.tsx` and `globals.css`;
- accessible names for every form control, icon button, canvas node and edge, plus the
  Delete key;
- contrast for faint text, and a teal focus ring.

## Dependency graph

```
T1 tests: unnamed-control check, canvas names, font guard (failing)
        │
        ├──────────────┬────────────────────┐
        ▼              ▼                    ▼
T2 font fix      T3 accessible names   T4 Delete key, contrast, ring
        │              │                    │
        └──────────────┴────────────────────┘
                       ▼
T5 docs, full checks, browser checks, Lighthouse
```

T2, T3 and T4 touch different lines and can go in any order. I'll do them in the order
listed, so the browser check in T5 sees the final font when it checks wrapping.

## Architecture decisions

- **Read the Next.js font docs first** (`AGENTS.md`): `01-app/01-getting-started/13-fonts.md`
  and the `font.md` API reference in `node_modules/next/dist/docs/`. The `variable` option
  only names the CSS variable, so renaming it to `--font-plex` is safe. The class goes on
  `<html>` so `html { font-family }` can resolve it.
- **Canvas names live in a small pure module**, `src/components/simulator/flow-labels.ts`,
  with `nodeAriaLabel(node)` and `edgeAriaLabel(edge, nodes)`.
  - `FlowCanvas` maps nodes in a `useMemo` on `nodes` to add `ariaLabel`, and adds
    `ariaLabel` in the edge mapping it already does for styling.
  - Nothing is written back to the store, so Export, the unsaved-changes fingerprint and
    the engine never see it.
  - A separate module can be tested without importing `design-canvas.tsx` and React Flow's
    CSS.
  - Node names use the catalog `label` ("PaaS / App Platform"). Edge names use the
    protocol's `shortLabel`, not the edge's label override, so they match the protocol
    chosen in the inspector.
- **Label ids:** `useId()` once per component. In the feature list, ids add the feature id
  and field key: `${base}-${feature.id}-vcpus`. `FeatureWorkload` gets its own `useId()`.
  - Base UI's `Input` keeps a passed `id`.
  - For selects, the `<Label htmlFor>` points at the `SelectTrigger`'s `id`. If the trigger
    doesn't keep it (checked in T3 by rendering), use `aria-label` with the label text.
- **The unnamed-control check** is a regex helper in the test file, not a DOM environment
  (that would be "ask first"). It looks for:
  - `<input>`: an `aria-label`, or an `id` matched by some `for="…"`;
  - `<button>`: an `aria-label`, or some text after its tags are stripped.

  Select triggers render as `<button role="combobox">`, so they're covered.
- **`SECTION_LABEL`** moves from `brief-panel.tsx` to a new
  `src/components/simulator/styles.ts` and is used in all eight places. The colour changes
  to `text-slate-500` in that one place.
- **Test state:** the panel tests set the Zustand store directly
  (`useSimulatorStore.setState`) for the selected node or edge, and use `startChallenge`
  with a brief from `loadChallenges` for the challenge case, as `store.test.ts` already
  does. Each test resets to the demo state afterwards.

## Task list

- [x] Task 1: Tests first
- [x] Task 2: Font fix
- [x] Task 3: Accessible names
- [x] Task 4: Delete key, contrast, focus ring
- [x] Task 5: Docs, full checks, browser checks

### Checkpoint
- [x] All five spec success criteria met; ready for review (nothing committed until
  asked)

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The new font changes widths, so toolbar buttons wrap or labels truncate differently | Med | Screenshots at 1440, 1280 and 390 px before and after; compare the toolbar, feature cards and results |
| Mapping nodes for `ariaLabel` gives React Flow new objects each render and breaks dragging or measuring | Med | `useMemo` on `nodes`; React Flow applies changes by id, which the store already relies on. Browser check: drag a node, connect two nodes, delete one |
| Base UI's `SelectTrigger` ignores a passed `id` | Low | Checked by rendering in T3; fall back to `aria-label` |
| Regex helper misses a case, such as a nested label or a self-closing tag | Low | It only needs to catch what this codebase renders; Lighthouse in T5 is the second check |
| `slate-500` still fails on a tinted background (the teal rule rows) | Low | Lighthouse runs in a challenge with results shown |
| The ring colour clashes with the destructive (red) focus style | Low | Destructive buttons use their own ring tokens; checked in the confirm dialog |
