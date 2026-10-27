# Implementation Plan: Phase 3, `challenge-panels`

Spec: [SPEC-challenge-panels.md](../SPEC-challenge-panels.md) (approved). Map:
[CAPABILITY-MAP-phase3.md](../CAPABILITY-MAP-phase3.md). Task checklist: [todo.md](todo.md).
Branch: `feat/challenge-panels`, from `main`. Earlier steps: [phase1/](phase1/plan.md),
[reachability/](reachability/plan.md), [data-checks/](data-checks/plan.md),
[challenge-slice1/](challenge-slice1/plan.md).

## Overview

Give every brief rule an authored title and carry it through to the verification rows;
add a Brief tab beside Requirements in a challenge; then three small panel fixes
(placement select shows node names, the 1024–1279px gap, the BeUWI note). No engine,
rule-evaluation or lock behaviour changes.

## Dependency graph

```
T1 rule titles: types, validator, rules, 4 briefs, docs
          │
          ▼
T2 rule rows show titles ─────────────┐
                                      │
T3 brief panel + side panel (tabs) ───┼──► T6 browser walkthrough at all widths, build
          │                           │
          ▼                           │
T4 header breakpoints + sheet label ──┤
                                      │
T5 placement select + BeUWI note ─────┘   (independent of T1–T4)
```

## Architecture decisions

- **Titles are content, validated like content.** `title` is required on both rule
  types, so a brief missing one fails `npm run build` with the file and field. Titles
  for all four briefs land in the same task as the validator change, so the tree is
  never red.
- **`RuleResult` carries the title.** The verification panel stays display-only (map
  boundary: rule evaluation lives in `rules.ts`), and doesn't need the brief to look
  titles up.
- **`BriefPanel` is presentational** (takes a `Brief`, no store), so it can be tested
  with `renderToStaticMarkup` in the existing node test environment, like
  `design-node.test.tsx`. `SidePanel` owns the mode switch and the tabs.
- **Tab reset by remount.** `key={challenge.id}` on the `Tabs` root with
  `defaultValue="brief"`; no store state, no effect.
- **One header button, mode-dependent label.** The sheet renders the same `SidePanel`,
  so it opens on Brief in a challenge; the button says "Brief" there and "Reqs" in the
  sandbox.

## Task list

### Phase A: Rule titles
- [x] Task 1: Required `title` on rules, end to end through content
- [x] Task 2: Verification rows show rule titles

### Checkpoint A
- [x] Tests, types, lint and `npm run build` green; a challenge run shows titled rule rows

Notes from Phase A:
- Removing one title made `npm run build` fail with
  `challenges/chat-app/brief.yaml: rules[2].title: expected a non-empty string`.
- Browser (link shortener, empty canvas, run): rows read "Cache on the read path",
  "Replicated database", "No client talks to the database", each with its id as the
  hover `title`. No console errors. Screenshot skipped: the pane was hidden; checked
  through the DOM.

### Phase B: Brief panel and layout
- [x] Task 3: Brief panel and tabbed side panel
- [x] Task 4: Header breakpoints and sheet button label

Notes from Task 3:
- `RequirementsPanel` lost its `border-l`; `SidePanel` draws it in both modes, so the
  tabs don't get a doubled border.
- Checked in the Chrome DevTools browser at 1440px: opens on Brief; all four briefs'
  title, summary and list counts match their YAML; one panel at a time, each filling
  the column (566px); the requirements tab scrolls inside itself (489 of 905px) with
  its 12 inputs locked; picking another challenge from the Requirements tab returns to
  Brief; arrow keys move between tabs and Enter selects; sandbox has no tabs. No new
  console messages (only React Flow's existing attribution warning).
- **Hidden-pane artifact, not a bug:** in the in-app pane, while it was hidden, both
  panels stayed mounted (`data-ending-style` / `data-starting-style`). Base UI unmounts
  the old panel after its exit animation, which needs animation frames a hidden page
  doesn't get. Use the DevTools browser for UI checks when the pane is hidden.

### Checkpoint B
- [x] Brief tab works inline (≥1280px) and in the sheet (<1280px)

Notes from Task 4:
- Checked with exact emulated viewports (window resizing lands a few px off, and won't
  go below ~500px): 1023 → Library + Brief buttons; 1024 and 1279 → library inline,
  Brief button only; 1280 and 1440 → both panels inline, no buttons; 375 (mobile) →
  both buttons, both sheets open and close. No horizontal scroll at any width.
- **Found and fixed:** in the sheet, its close button covered the Requirements tab. The
  tab strip now leaves room on the right below `xl` (`pr-12 xl:pr-3`), where the panel
  only appears in the sheet.
- Sheet opens on Brief with both tabs; Requirements scrolls inside the sheet with its
  12 inputs locked. Sandbox label is "Reqs", challenge label "Brief".

### Phase C: Small fixes and verification
- [x] Task 5: Placement select shows node names; hide BeUWI note in a challenge

Notes from Task 5:
- Sandbox demo: both triggers read "Programme API (0.5 vCPU left)" instead of `paas-7`;
  BeUWI note shown. Link shortener: note hidden; "Unplaced" (was lowercase `unplaced`,
  the raw value); placing Redirect on a new PaaS shows "PaaS / App Platform (1.0 vCPU
  left)" and the Placed badge.
- **Found and fixed:** the trigger is `w-fit` and `whitespace-nowrap`, so a node name
  widened it past its card and gave the requirements panel a horizontal scrollbar.
  The trigger now fills its grid cell (`w-full min-w-0`, cell `min-w-0`) and truncates
  with an ellipsis; the full text is the trigger's `title`.
- [x] Task 6: Browser walkthrough of all five user stories at the spec's widths; build

### Checkpoint C
- [x] All four spec success criteria met; ready for review (nothing committed until asked)

Notes from Task 6 (Chrome DevTools browser, exact emulated viewports):
- **Story 1:** each of the four challenges, picked while the previous one was on the
  Requirements tab, opened on Brief with its own title and the YAML's list counts
  (4/3, 4/3, 4/3, 3/3); one panel at a time.
- **Stories 2 and 3 (real clicks):** link shortener, added a PaaS, placed Create link
  from the dropdown → trigger "PaaS / App Platform (1.5 vCPU left)"; Run simulation →
  overall Fail, rows "Cache on the read path" (fail), "Replicated database" (fail),
  "No client talks to the database" (pass), each with its id on hover.
- **Story 5:** note hidden in every challenge; back in the sandbox the note, demo
  buttons and "Programme API (0.5 vCPU left)" triggers return, with no tabs or rule rows.
- **Story 4:** at 1440 and 1280 the side panel is inline; at 1279, 1150 and 1024 it's
  behind the Brief button (library inline); at 375 (mobile) both buttons. At every
  width: opens on Brief, Requirements scrolls inside its tab with no sideways scroll,
  the sheet's close button clears the tabs, the sheet closes, no page-level horizontal
  scroll.
- Console: only React Flow's existing attribution warning.
- `npm test` (130 passed, 1 skipped as before), `tsc`, lint and `npm run build` pass;
  `tests/demos.test.ts` unchanged.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Making `title` required breaks test helpers that build rules by hand (`rules.test.ts`, `validate.test.ts`) | Low | Update them in Task 1; `tsc` finds every object literal typed as `Rule` |
| `SPEC.md` and `brief-format.md` YAML examples go stale | Low | Add `title` to both examples in Task 1 |
| Base UI `Tabs` inside the `Sheet` loses keyboard focus or scroll | Med | Tabs content gets `min-h-0 flex-1 overflow-y-auto`; check keyboard tab switching in the sheet in Task 6 |
| `RequirementsPanel` is an `<aside>` with `h-full`; nesting it inside a tab panel may break its internal scroll | Med | Give the tab panel `flex min-h-0 flex-1 flex-col`; verify the requirements list scrolls in Task 6 |
| Two inline panels plus the library at exactly 1280px squeeze the canvas | Low | Unchanged from today (same widths); confirm canvas is usable at 1280 in Task 6 |

## Parallelization

Phase A and Task 5 touch different files from Phase B and could run in parallel,
but every task is S-sized; running them in sequence in one session is cheaper than
coordinating.

## Open questions

None. The spec's three questions were answered with the proposals.
