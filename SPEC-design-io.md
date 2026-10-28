# Spec: Phase 3, `design-io`

Status: **implemented** (2026-10-27); approved with all three proposals: save `at` and `purpose`, drop edge labels, importing a challenge file switches to that challenge.
Module `design-io` from the approved [capability map](CAPABILITY-MAP-phase3.md); builds on
`challenge-content` (validator and `buildDesign`) and uses the `challenge-session` store
actions, all merged to `main`. Branch: `feat/design-io`, from `main`. Plan:
[tasks/plan.md](tasks/plan.md).

## Objective

A student can save the design on the canvas to a file and open it again later, in the
sandbox or in a challenge. Today closing the tab loses everything: there's no saving
(phase 3 keeps progress out of scope), and the only way to put a design on the canvas is
to draw it or load one of the two demos.

The file is the fixture YAML format the briefs already use, so the same file can also go
the other way: you can open a fixture (`good.yaml`, a bad one) on the canvas to see what
the engine and rules say about it, and a student's exported design can become a new
fixture with a `description` and `expect` added.

Users: students saving and resuming work, or handing a design to you; you, opening
fixtures and student files on the canvas.

### User stories and acceptance

1. **Export.** The canvas toolbar has an **Export** button, in both modes. It downloads
   `<challenge id>-design.yaml` in a challenge, `sandbox-design.yaml` in the sandbox. The
   file holds the nodes (id, kind, label, config changes, position), edges and
   placements; in the sandbox it also holds the requirements and NFR targets, since those
   aren't fixed by a brief.
2. **Import.** An **Import** button opens a file picker (`.yaml`, `.yml`). A valid file
   replaces the canvas, like picking a demo or a challenge does today:
   - a file with `challenge: <id>` starts that challenge (if it isn't already the active
     one) and loads the design; requirements and targets come from the brief and stay
     locked;
   - a sandbox file (it has `functionalRequirements`) leaves any challenge and loads the
     design, requirements and targets, all editable;
   - a file with neither, which is what fixtures look like, loads into the **current**
     challenge; in the sandbox it's refused ("This design has no requirements. Pick its
     challenge first, then import it.").
3. **Clear errors.** An invalid file leaves the canvas untouched and shows one message
   under the toolbar with the problem and where it is, from the existing validator (e.g.
   `link-shortener-design.yaml: design.edges[3]: unknown node "cach"`), plus unknown
   challenge ids ("No challenge called `ride-share`.") and YAML syntax errors. The message
   has a close button and goes away on the next successful import or export.
4. **Round trip.** Exporting and importing again gives back the same design: the same
   nodes (ids, kinds, labels, purposes, configs, positions), the same edges (endpoints and
   protocols), the same placements, and in the sandbox the same requirements and targets.
   Running verification before and after gives identical results.
5. **Fixtures load.** Every fixture in `challenges/*/fixtures/` imports into its challenge
   and verifies exactly as `tests/challenges.test.ts` says it should.

## Assumptions

1. **Import replaces the canvas without asking**, the same as the demo buttons and the
   challenge picker do today. A confirm before discarding work is already on the deferred
   list (slice 1, assumption 3) and would cover all three at once.
2. **No example-design picker.** Fixtures stay on the server and are never sent to the
   browser; the capability map's "examples only in the sandbox" was about a picker. Anyone
   with a fixture file (you, from the repo) can import it into its challenge, and that's
   fine: the repo isn't handed to students.
3. **Edge labels and connection handles aren't saved.** The fixture edge form
   (`a -> b : http`) has no room for a label, and handles only change which side of the
   node a line leaves from. Imported edges use the default handles, as fixtures already
   do. (See open question 2.)
4. **One edge per pair of nodes.** The format gives each edge the id `source->target`, so
   if the canvas has two connections from A to B, Export doesn't download anything and
   says which pair to fix ("Two connections go from Link API 1 to Links DB; delete one,
   then export."). The canvas lets you draw duplicates today; this doesn't change that.
5. **Export always produces a file the validator accepts.** The exported text is parsed
   and validated in the browser before it's downloaded; if that ever fails (say, a sandbox
   requirement with empty text), Export shows the validator's message instead of saving a
   file Import would reject.
6. **The `yaml` package ships to the browser.** It's already a dependency (server-side
   today); `validate.ts` has no Node-only imports. This adds roughly 30–40 KB gzipped to
   the client bundle; I'll check the real number in the build output.
7. **No engine, rule or lock changes.** Importing into a challenge goes through the same
   locks as drawing by hand.

## Design

### File format

The fixture format, with three additions, all optional so every existing fixture stays
valid unchanged:

```yaml
challenge: link-shortener          # new; omitted in sandbox files and fixtures
design:
  nodes:
    - { id: phone, kind: mobile, label: Student phone, at: [20, 40] }
    - { id: api-1, kind: paas, label: Link API 1, purpose: Creates and resolves links, at: [460, 40] }
    - { id: db, kind: database, config: { replicas: 2 }, at: [700, 40] }
  edges:
    - phone -> api-1 : http
    - api-1 -> db : db
  placements:
    create-link: api-1
```

- **`challenge`** (new, top level): the brief id. Import only.
- **`at: [x, y]`** (new, per node): canvas position, rounded to whole pixels. Nodes
  without it get `buildDesign`'s grid, as today. (Open question 1.)
- **`purpose`** (new, per node): written only when it differs from the catalog default;
  the node inspector lets students edit it.
- **Sandbox files** add `functionalRequirements` and `nfr` in exactly the brief's format
  (`id`, `text`, `feature: { name, description, resources, targetRpm,
  computeMsPerRequest }`), read with the brief's own readers. Placements refer to those
  requirement ids.
- Import ignores `description`, `expect` and `knownGap` if present, so fixtures import
  as they are. Unknown keys still fail, as everywhere else.
- Export writes `config` with only the fields that differ from the catalog defaults
  (nested fields too), and `label` only when it differs from the catalog label, so files
  stay as short as the hand-written fixtures.

### Ids

- **Node ids** are kept when they're already lowercase kebab-case and unique (fixture
  ids, and canvas ids like `paas-16`). Canvas ids with an underscore
  (`load_balancer-3`) become `load-balancer-3`; any clash gets `-2`, `-3`. Edges and
  placements follow the renamed ids. This keeps import → export → import stable.
- **Requirement ids** in the sandbox are the feature ids (`feat-4`); on import the
  requirement row gets `freq-<id>`, as `challengeSeed` does.
- **New nodes after an import:** `addComponent` must not reuse an id already on the canvas
  (an imported `paas-3` vs the store counter reaching 3). `uid` skips ids in use.

### Code

- **`src/lib/challenges/design.ts`:** `compactDesign(nodes, edges, features)`, the
  inverse of `buildDesign`: canvas state → `CompactDesign` (with positions and purposes),
  applying the id rules above and the config diff. Returns a list of problems instead of
  a design when it finds duplicate edges. `buildDesign` uses `at` and `purpose` when
  present.
- **`src/lib/challenges/validate.ts`:** `CompactNode` gains `position` and `purpose`
  (both nullable); `readDesign` accepts `at` and `purpose`. A new
  `validateDesignFile(raw, briefs, current, file)` reads the top level (`challenge`,
  `functionalRequirements`, `nfr`, `design`, and the ignored fixture keys), works out
  which brief (or sandbox) the file is for using the rules in story 2, and returns
  `{ brief: Brief | null, requirements, nfr, design }`.
- **`src/lib/challenges/design-file.ts`** (new, browser-safe): `exportDesignFile(state)`
  → YAML text (validated before returning, see assumption 5) and
  `importDesignFile(text, fileName, briefs, current)` → the built design or an error
  message. Uses `yaml`'s `parse` and `stringify`; nodes are written as flow mappings and
  edges in the `a -> b : protocol` form, like the fixtures.
- **`src/lib/store.ts`:** one new action, `loadDesign(loaded)`, which sets `challenge`
  (or `null`), requirements, features, NFRs, nodes and edges in one `set`, and clears
  verification and selection. Starting a challenge goes through the same seed as
  `startChallenge`, so locks behave identically.
- **`src/components/simulator/design-io.tsx`** (new): the Export and Import buttons and
  the error message, placed in the canvas toolbar next to Clear. Export uses a `Blob` and
  a temporary `<a download>`; Import uses a hidden `<input type="file">` and
  `file.text()`. `design-canvas.tsx` renders it and passes `briefs`.
- **`docs/challenges/brief-format.md`:** document `at`, `purpose`, and that any canvas
  design can be exported as a starting fixture.

## Commands

```bash
npm run dev            # http://localhost:43127
npm test
npx tsc --noEmit
npm run lint
npm run build          # must pass; also shows the client bundle size
```

## Project structure

```
docs/challenges/brief-format.md                 document at, purpose, export to fixture
src/lib/challenges/types.ts                     CompactNode.position, .purpose
src/lib/challenges/validate.ts                  read at/purpose; validateDesignFile
src/lib/challenges/validate.test.ts             new cases
src/lib/challenges/design.ts                    compactDesign; buildDesign uses at/purpose
src/lib/challenges/design.test.ts               compactDesign cases
src/lib/challenges/design-file.ts               new: export/import text
src/lib/challenges/design-file.test.ts          new: round trips, every fixture, errors
src/lib/store.ts                                loadDesign; uid skips ids in use
src/lib/store.test.ts                           loadDesign; no id reuse after import
src/components/simulator/design-io.tsx          new: buttons and error message
src/components/simulator/design-canvas.tsx      render DesignIo
```

## Code style

Match the toolbar buttons next to it:

```tsx
<Button type="button" size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={onExport}>
  <Download className="h-3.5 w-3.5" />
  Export
</Button>
```

Library code follows `validate.ts`: small pure functions, errors as
`<file>: <path>: <problem>` strings.

## Testing strategy

Tests first, in this order:

- **Validator (`validate.test.ts`):** `at` must be two finite numbers; `purpose` a
  non-empty string; `challenge` must name a known brief; a sandbox file reads its
  requirements and NFRs and checks placements against them; a file with neither in the
  sandbox fails with the message from story 2; `description`/`expect`/`knownGap` are
  ignored; other unknown keys fail.
- **`compactDesign` (`design.test.ts`):** config is reduced to the changed fields
  (nested too); labels and purposes equal to the defaults are omitted; `load_balancer-3`
  becomes `load-balancer-3` and edges and placements follow; clashes get `-2`; duplicate
  edges are reported by node label.
- **Round trips (`design-file.test.ts`):**
  - **every fixture** in every brief: build → export → import gives the same nodes,
    edges and placements, and `runVerification` plus `evaluateRules` give identical
    results (this is the capability map's "round-tripping every fixture");
  - every fixture's compact design, exported, keeps its ids exactly;
  - both sandbox demos (`loadDemo`, `loadFanInDemo` state): export → import gives the
    same requirements, features, NFRs and verification result;
  - export → import → export gives identical text.
- **Errors:** YAML syntax error, unknown challenge, unknown node in an edge, placement on
  a non-compute node; each gives a message with the file name and path, and nothing is
  loaded.
- **Store (`store.test.ts`):** `loadDesign` into a challenge keeps requirements and NFRs
  locked (the existing lock tests' pattern); `addComponent` after importing a design with
  `paas-1`…`paas-5` creates a new id.
- **Regression:** all existing tests, including `tests/demos.test.ts` and the fixture
  harness, unchanged.
- **Browser (Chrome DevTools, 1440 and 375 wide):**
  - sandbox: load the BeUWI demo, export, clear, import: same picture and same
    verification result;
  - challenge: draw a small design, export, switch to the sandbox, import: back in the
    challenge with the design;
  - import `challenges/link-shortener/fixtures/good.yaml` in that challenge: passes;
    in the sandbox: refused with the story 2 message;
  - import a broken file: message shown, canvas unchanged;
  - two edges between one pair: Export refuses with the pair named;
  - both buttons reachable at 375px; no console errors.

## Boundaries

- **Always:** keep tests, types, lint and build green; existing fixtures load unchanged;
  exported files pass the validator.
- **Ask first:** changing the edge shorthand or making any existing fixture field
  required; a confirm dialog on import (it belongs with the deferred one for all three
  canvas replacements); saving to browser storage; new dependencies.
- **Never:** send fixtures to the browser; let an import unlock a challenge's requirements
  or targets; change `demoSeed` or the demo results.

## Success criteria

1. All five user stories work in the browser at 1440 and 375 wide, with no console
   errors.
2. Every fixture round-trips through export and import with identical verification
   results, in a test.
3. Both sandbox demos round-trip with identical requirements, targets and results.
4. Every existing fixture still validates unchanged; `npm run build` passes.
5. `npm test`, `npx tsc --noEmit` and `npm run lint` pass; the client bundle growth is
   reported in the PR.

## Open questions

1. **Save positions (`at`) and purposes?** Proposal: yes, both optional. Without `at`, a
   student who saves and reopens gets their design rearranged into a 4-wide grid, which
   undoes the layout work and makes the file a poor way to resume. Cost: two optional
   fields in the validator and docs; existing fixtures are unaffected, and fixtures
   written by hand can keep leaving them out.
2. **Edge labels.** Proposal: drop them (assumption 3). Keeping them would need a second
   edge form (`{ from, to, protocol, label }`) next to the shorthand, and labels are
   rarely used. If you want them, I'd add the long form as optional, with the shorthand
   still the default.
3. **Importing a challenge file from elsewhere.** Proposal: it switches to that challenge
   (story 2), since the file says what it's for and resuming work is the main use.
   Alternative: refuse unless that challenge is already picked, which is one more step for
   students but never changes mode on its own.
