# Spec: Phase 3, `challenge-panels`

Status: **implemented** (2026-10-27); approved with all three proposals: authored rule titles,
reflection questions in the Brief tab only, sheet button labelled "Brief" in a challenge.
Module `challenge-panels` from the approved [capability map](CAPABILITY-MAP-phase3.md);
builds on slice 1 ([SPEC-challenge-slice1.md](SPEC-challenge-slice1.md)), which is
merged to `main`. Branch: `feat/challenge-panels`, from `main`. Plan:
[tasks/plan.md](tasks/plan.md).

## Objective

A student can do a challenge from the app alone: read the scenario, understand every
verification row, and reach every panel on a lab-machine laptop. Today they see only the
requirement lines and targets, rule rows titled with ids (`cache-on-read-path`), node ids
in the placement select (`paas-16`), a sandbox-only note about the BeUWI defaults, and at
1024–1279px wide no way to open the requirements panel at all.

Users: students practising; you, trying a brief before giving it out.

### User stories and acceptance

1. **Read the brief.** In a challenge, the right panel has two tabs, **Brief** and
   **Requirements**, and opens on Brief when a challenge starts. Brief shows the title,
   tagline, summary, "Out of scope" as a list, and "Think about" with the reflection
   questions as a numbered list. In the sandbox there are no tabs; the panel is today's
   requirements panel.
2. **Readable rule rows.** Each brief rule row in the verification panel is titled with
   the rule's `title` (e.g. "Cache on the read path"), not its id. The detail text is
   unchanged.
3. **Node names in placement.** The "Place on compute" select shows the node's label
   (e.g. "Programme API (1.5 vCPU left)") in the closed trigger, not its id, in both
   modes.
4. **Reachable at every width.** At every viewport width from 360px up, the library and
   the requirements/brief panel can each be reached: inline at `xl` (≥1280px) as today,
   through the header sheet buttons below that. Specifically, the "Reqs" button now shows
   up to 1279px (today it hides at 1024px, while the inline panel only appears at 1280px).
5. **No sandbox note in a challenge.** The "Defaults mirror BeUWI case study…" note under
   the NFR inputs is hidden in a challenge and unchanged in the sandbox.

## Assumptions

1. **Rules are not listed in the Brief tab.** They are close to hints ("needs a cache");
   students meet them as verification rows after a run, with the `why` in the detail.
2. **`source` is not shown.** It's attribution for authors (it names a source repo path),
   not student-facing text. It stays in the YAML.
3. **Rule titles are authored in the YAML**, as a required `title` field (see open
   question 1). All four briefs are updated in the same change, so the build stays green.
4. **Tabs, not a third panel.** The right panel already scrolls; a third column would
   squeeze the canvas on laptops. The same tabbed component is used inline and in the
   sheet, so the fix in story 4 covers the brief too.
5. **The selected tab is local UI state**, not in the store; it resets to Brief whenever
   the active challenge changes. Nothing is persisted.
6. **No engine, rule-evaluation or lock changes.** Rule status and detail are exactly as
   today; only `title` is added to the result.

## Design

### Rule titles (content + rules)

- `Rule` (both `ComponentRule` and `EdgeRule`) gains `title: string`: a short phrase in
  sentence case, shown to students, at most ~40 characters.
- `validate.ts` reads it with `r.str(raw.title, …)` in both rule readers and adds it to
  the allowed keys. A missing or empty title fails the build with the file and field,
  like every other field.
- `RuleResult` gains `title: string`; `evaluateRules` copies it from the rule.
- `docs/challenges/brief-format.md`: `title` added to the rules section and both YAML
  examples.
- The four briefs get titles for their 15 rules (12 distinct ids; `no-client-to-db`
  appears in all four, with the same title, "No client talks to the database").

### Brief panel

- New `src/components/simulator/brief-panel.tsx`: `BriefPanel({ brief }: { brief: Brief })`,
  plain presentational markup, no store access. Sections in order: title + tagline,
  summary, "Out of scope" (list, omitted if empty), "Think about" (numbered list, with a
  one-line note "Not graded; use them to check your design.", omitted if empty).
- New `src/components/simulator/side-panel.tsx`: `SidePanel()` reads `challenge` from the
  store. Sandbox → `<RequirementsPanel />`. Challenge → `Tabs` (existing
  `components/ui/tabs.tsx`) with Brief and Requirements, `key={challenge.id}` so a new
  challenge remounts on the Brief tab.
- `simulator-app.tsx` renders `<SidePanel />` in both the inline column and the sheet,
  in place of `<RequirementsPanel />`.

### Small fixes

- **Placement select:** pass `items` (node id → display text, plus `unplaced` →
  "Unplaced") to `Select`, the same way `challenge-picker.tsx` does, so `SelectValue`
  shows the label. The display text is built once and used for both `items` and the
  `SelectItem` children.
- **Breakpoint gap:** split the header's `lg:hidden` wrapper: the Library sheet button
  keeps `lg:hidden` (inline library appears at `lg`), the Reqs button becomes
  `xl:hidden` (inline panel appears at `xl`). It stays one button, labelled "Reqs" in
  the sandbox and "Brief" in a challenge, since the sheet opens on the Brief tab (open
  question 3).
- **Sandbox note:** render the BeUWI note only when `!locked`.
- **Rule row title:** `verification-panel.tsx` shows `rule.title` instead of
  `Brief rule: {rule.id}`; the teal row styling already marks it as a brief rule, and the
  id goes into a `title` attribute for authors.

## Commands

```bash
npm run dev            # http://localhost:43127
npm test
npx tsc --noEmit
npm run lint
npm run build          # must pass: proves all four briefs validate with titles
```

## Project structure

```
challenges/*/brief.yaml                            title on every rule
docs/challenges/brief-format.md                    document rule title
src/lib/challenges/types.ts                        Rule.title, RuleResult.title
src/lib/challenges/validate.ts                     read and require rule title
src/lib/challenges/rules.ts                        copy title into results
src/components/simulator/brief-panel.tsx          new: brief text
src/components/simulator/brief-panel.test.tsx     new: render test
src/components/simulator/side-panel.tsx           new: tabs in a challenge
src/components/simulator/simulator-app.tsx        SidePanel; header breakpoints
src/components/simulator/requirements-panel.tsx   select items; hide note when locked
src/components/simulator/verification-panel.tsx   rule.title
```

## Code style

Match the existing panels: shadcn/ui components from `components/ui`, Tailwind classes at
the same type scale (section labels `text-[10px] font-semibold uppercase tracking-wider
text-slate-400`, body `text-xs` / `text-[11px] text-slate-600`).

```tsx
<section className="space-y-1.5">
  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
    Out of scope
  </div>
  <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-slate-600">
    {brief.outOfScope.map((item) => <li key={item}>{item}</li>)}
  </ul>
</section>
```

## Testing strategy

- **Validator (`validate.test.ts`, test first):** a rule without `title` fails with its
  path (`rules[0].title`); an empty title fails; a valid title is read.
- **Rules (`rules.test.ts`):** results carry the rule's title for pass and fail.
- **Content:** existing `load.test.ts` and the fixture harness load all four briefs, so a
  missing title in any YAML fails them.
- **Brief panel (`brief-panel.test.tsx`, `renderToStaticMarkup` like
  `design-node.test.tsx`, node environment):** with the link-shortener brief, the markup
  contains the summary, each out-of-scope item and each reflection question; with empty
  `outOfScope` and `reflection`, neither heading renders.
- **Regression:** all existing tests, including `tests/demos.test.ts`, unchanged.
- **Browser (in-app preview):**
  - start each challenge: opens on Brief, text matches the YAML; switch to Requirements
    and back; pick another challenge: back on Brief;
  - sandbox: no tabs, BeUWI note visible; challenge: note hidden;
  - place a feature: the trigger shows the node label;
  - run verification in a challenge: rule rows show titles;
  - widths 375, 1024, 1150, 1279, 1280, 1440: the library and the side panel are each
    reachable (inline or by its sheet button), no horizontal scroll;
  - no console errors.

## Boundaries

- **Always:** keep tests, types, lint and build green; check in the browser at the widths
  above; read the relevant `node_modules/next/dist/docs/` guide before touching anything
  Next-specific (not expected here).
- **Ask first:** listing rules in the Brief tab; showing `source`; new dependencies;
  changing rule status, detail text or engine behaviour; persisting the selected tab.
- **Never:** send fixtures to the browser; unlock requirements or targets in a challenge;
  change `demoSeed` or the demo results.

## Success criteria

1. All five user stories work in the browser at the listed widths, with no console errors.
2. Every rule in all four briefs has a title, and a missing title fails `npm run build`
   with the file and field.
3. New validator, rules and brief panel tests pass; existing tests are unchanged and pass.
4. `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build` pass.

## Open questions

1. **Rule titles: authored or derived?** Proposal: a required `title` in the YAML.
   Deriving from the id gives "Db replicas" and "No client to db"; deriving from the rule
   structure gives "compute → cache required", which reads like the detail line.
   Authoring costs 12 short strings now and one line per future rule.
2. **Reflection questions placement.** Proposal: only in the Brief tab. Alternative: also
   show them under the verification results after a passing run, as a "now think about"
   prompt. That's a nice touch but adds a second place to keep in sync; I'd leave it for
   later.
3. **Sheet button label.** Proposal: "Reqs" in the sandbox, "Brief" in a challenge (the
   sheet opens on Brief). Alternative: always "Reqs", which is less clear in a challenge.
