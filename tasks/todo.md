# Tasks: Phase 3, `challenge-panels`

Spec: [SPEC-challenge-panels.md](../SPEC-challenge-panels.md). Plan: [plan.md](plan.md).

Standing verification for every task: `npm test`, `npx tsc --noEmit` and `npm run lint`
pass; `tests/demos.test.ts` unchanged. Tasks that touch content or the UI also run
`npm run build` and a browser check with no console errors.

---

## Task 1: Required `title` on rules, end to end through content

**Description:** Test first in `validate.test.ts`: a rule without `title` fails with the
path `rules[0].title`; an empty title fails; a valid title is read onto the rule. Then
add `title: string` to `ComponentRule` and `EdgeRule`, read it with `r.str` in both rule
readers in `validate.ts` and add it to their allowed keys. Write titles for all 15 rules
in the four briefs (sentence case, ≤ ~40 chars; `no-client-to-db` is "No client talks to
the database" everywhere). Add `title` to the rules section and both YAML examples in
`docs/challenges/brief-format.md` and to the example brief in `SPEC.md`. Update the
hand-built rules in `rules.test.ts` and `rawBrief()` in `validate.test.ts`.

**Acceptance criteria:**
- [x] Missing or empty `title` is a validation error naming the file and field
- [x] All four briefs load with titles; fixture harness unchanged and passing
- [x] Docs and `SPEC.md` examples show `title`

**Verification:**
- [x] `npx vitest run src/lib/challenges`; `npm run build`; standing checks
- [x] Remove one title temporarily: `npm run build` fails with that file and field; restore

**Dependencies:** None

**Files likely touched:** `src/lib/challenges/types.ts`, `src/lib/challenges/validate.ts`,
`src/lib/challenges/validate.test.ts`, `src/lib/challenges/rules.test.ts`,
`challenges/*/brief.yaml`, `docs/challenges/brief-format.md`, `SPEC.md`

**Estimated scope:** M (many files, each a few lines)

---

## Task 2: Verification rows show rule titles

**Description:** Test first in `rules.test.ts`: results carry the rule's `title` for a
passing and a failing rule of each type. Add `title` to `RuleResult` and copy it in
`checkComponentRule` and `checkEdgeRule`. In `verification-panel.tsx`, the row title
becomes `rule.title` (replacing `Brief rule: {rule.id}`), with `title={rule.id}` on the
element for authors.

**Acceptance criteria:**
- [x] Rule results include the title; status and detail unchanged
- [x] Rule rows show the title; the id is available on hover

**Verification:**
- [x] `npx vitest run src/lib/challenges/rules.test.ts`; standing checks
- [x] Browser: start link shortener, run verification, rows read "Cache on the read path"
  (or the chosen titles), not ids

**Dependencies:** Task 1

**Files likely touched:** `src/lib/challenges/types.ts`, `src/lib/challenges/rules.ts`,
`src/lib/challenges/rules.test.ts`, `src/components/simulator/verification-panel.tsx`

**Estimated scope:** S

### Checkpoint A
- [x] Tests, types, lint and `npm run build` green; titled rule rows in the browser

---

## Task 3: Brief panel and tabbed side panel

**Description:** Test first in a new `brief-panel.test.tsx` (`renderToStaticMarkup`,
node environment, link-shortener brief via `loadChallenges`): markup contains the
summary, each out-of-scope item and each reflection question; with empty `outOfScope`
and `reflection`, neither heading renders. Then build `BriefPanel({ brief })`: title and
tagline, summary, "Out of scope" list, "Think about" numbered list with "Not graded; use
them to check your design." Build `SidePanel()`: sandbox → `<RequirementsPanel />`;
challenge → `Tabs` (`defaultValue="brief"`, `key={challenge.id}`) with Brief and
Requirements. Use it in both places in `simulator-app.tsx`.

**Acceptance criteria:**
- [x] Sandbox: no tabs, panel identical to today
- [x] Challenge: opens on Brief; switching challenge returns to Brief
- [x] Brief content scrolls; the requirements tab keeps its internal scroll

**Verification:**
- [x] `npx vitest run src/components/simulator/brief-panel.test.tsx`; standing checks
- [x] Browser at 1440px: all four briefs' text matches their YAML

**Dependencies:** None (uses existing `Brief` fields)

**Files likely touched:** `src/components/simulator/brief-panel.tsx` (new),
`src/components/simulator/brief-panel.test.tsx` (new),
`src/components/simulator/side-panel.tsx` (new),
`src/components/simulator/simulator-app.tsx`

**Estimated scope:** M

---

## Task 4: Header breakpoints and sheet button label

**Description:** Split the header's `lg:hidden` wrapper: the Library sheet button keeps
`lg:hidden`; the side-panel sheet button becomes `xl:hidden`. Its label reads "Brief" in
a challenge and "Reqs" in the sandbox (icon unchanged or `FileText` for Brief).

**Acceptance criteria:**
- [x] 1024–1279px: the side-panel button shows and opens the sheet; Library button
  hidden (library is inline)
- [x] <1024px: both buttons show; ≥1280px: neither shows
- [x] Label follows the mode

**Verification:**
- [x] Browser at 1024, 1150, 1279, 1280: as above; standing checks

**Dependencies:** Task 3

**Files likely touched:** `src/components/simulator/simulator-app.tsx`

**Estimated scope:** XS

### Checkpoint B
- [x] Brief tab works inline (≥1280px) and in the sheet (<1280px)

---

## Task 5: Placement select shows node names; hide BeUWI note in a challenge

**Description:** In `requirements-panel.tsx`, build one map of compute node id → display
text (`label` plus the vCPU-left suffix) and `unplaced` → "Unplaced"; pass it as `items`
to the placement `Select` and use the same text in the `SelectItem`s, as
`challenge-picker.tsx` does. Render the "Defaults mirror BeUWI…" note only when not
locked.

**Acceptance criteria:**
- [x] The closed trigger shows the node's label, in both modes
- [x] The note shows in the sandbox and not in a challenge

**Verification:**
- [x] Browser: place a feature in the sandbox demo and in a challenge, trigger shows the
  label; standing checks

**Dependencies:** None

**Files likely touched:** `src/components/simulator/requirements-panel.tsx`

**Estimated scope:** XS

---

## Task 6: Browser walkthrough and build

**Description:** Walk through the spec's browser checklist in the in-app preview.

**Acceptance criteria:**
- [x] Each challenge opens on Brief with text matching the YAML; tab switching works by
  mouse and keyboard; picking another challenge returns to Brief
- [x] Sandbox: no tabs, BeUWI note visible; challenge: note hidden
- [x] Placement trigger shows the node label
- [x] Rule rows show titles after a run
- [x] At 375, 1024, 1150, 1279, 1280 and 1440px the library and the side panel are each
  reachable, with no horizontal scroll; the requirements list scrolls inside its tab
- [x] No console errors

**Verification:**
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`
- [x] Notes from the walkthrough added to [plan.md](plan.md)

**Dependencies:** Tasks 1–5

**Files likely touched:** `tasks/plan.md`

**Estimated scope:** S

### Checkpoint C
- [x] All four spec success criteria met; ready for review (nothing committed until asked)
