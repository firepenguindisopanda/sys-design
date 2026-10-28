# Tasks: Phase 3, `design-io`

Spec: [SPEC-design-io.md](../SPEC-design-io.md). Plan: [plan.md](plan.md).

Standing verification for every task: `npm test`, `npx tsc --noEmit` and `npm run lint`
pass; `tests/demos.test.ts` and `tests/challenges.test.ts` unchanged. Tasks that touch
content, the store or the UI also run `npm run build`; UI tasks add a browser check with
no console errors.

---

## Task 1: Optional `at` and `purpose` on fixture nodes

**Description:** Test first in `validate.test.ts`: `at: [20, 40]` is read as a position;
`at` that isn't a list of two finite numbers fails with the path (`design.nodes[0].at`);
`purpose` must be a non-empty string; a node without either reads as `null` for both.
Then add `position: { x: number; y: number } | null` and `purpose: string | null` to
`CompactNode`, read them in `readDesign`, and make `buildNode` use them when present
(grid position and catalog purpose otherwise). Add a `design.test.ts` case for both.
Document `at` and `purpose` in the fixtures section of `docs/challenges/brief-format.md`.

**Acceptance criteria:**
- [x] `at` and `purpose` are optional, validated, and used by `buildDesign`
- [x] Every existing fixture loads unchanged; fixture harness passing

**Verification:**
- [x] `npx vitest run src/lib/challenges`; `npm run build`; standing checks

**Dependencies:** None

**Files likely touched:** `src/lib/challenges/types.ts`, `validate.ts`,
`validate.test.ts`, `design.ts`, `design.test.ts`, `docs/challenges/brief-format.md`

**Estimated scope:** S

---

## Task 2: `compactDesign`, the inverse of `buildDesign`

**Description:** Test first in `design.test.ts`, then add
`compactDesign(nodes, edges, features)` to `design.ts`, returning
`{ design: CompactDesign } | { problems: string[] }`:
- config reduced to fields that differ from the catalog default, nested fields
  included, never `kind`; an unchanged node has `config: {}`;
- `label` and `purpose` are `null` when they equal the catalog's (or are empty);
- position rounded to whole pixels;
- ids: kept when a unique slug; otherwise `_` → `-` and `-2`, `-3` on clashes; edges and
  placements follow the new ids;
- edges as `source->target` with their protocol; two edges on one pair → a problem
  naming both nodes by label;
- placements from features with a `placedOnNodeId`.

**Acceptance criteria:**
- [x] `compactDesign(buildDesign(f))` keeps every fixture's node ids, edges and
  placements exactly, and `buildDesign` of it equals the original build
- [x] `load_balancer-3` → `load-balancer-3`, with edges and placements renamed
- [x] Duplicate edges are reported, not dropped

**Verification:**
- [x] `npx vitest run src/lib/challenges/design.test.ts`; standing checks

**Dependencies:** Task 1

**Files likely touched:** `src/lib/challenges/design.ts`, `design.test.ts`

**Estimated scope:** M

---

## Task 3: `validateDesignFile`: top level and sandbox/challenge resolution

**Description:** Test first in `validate.test.ts`, then add
`validateDesignFile(raw, briefs, currentBriefId, file)` to `validate.ts`. Allowed top-level
keys: `challenge`, `functionalRequirements`, `nfr`, `design`, and the ignored
`description`, `expect`, `knownGap`. Resolution per spec story 2:
- `challenge: <id>` → that brief (unknown id → "No challenge called `<id>`.");
  `functionalRequirements`/`nfr` alongside it fail;
- `functionalRequirements` (+ required `nfr`) → sandbox, read with the brief's
  `readRequirement` / `readNfr`, unique ids;
- neither → the current brief; in the sandbox, the spec's "no requirements" message.
The design is read with `readDesign` against the resolved requirements. Returns
`{ brief: Brief | null, functionalRequirements, nfr, design }`.

**Acceptance criteria:**
- [x] Each of the three file kinds resolves as the spec says, including the two errors
- [x] Fixture keys are ignored; other unknown keys fail with their path
- [x] Placements in a sandbox file are checked against its own requirement ids

**Verification:**
- [x] `npx vitest run src/lib/challenges/validate.test.ts`; standing checks

**Dependencies:** Task 1

**Files likely touched:** `src/lib/challenges/validate.ts`, `validate.test.ts`

**Estimated scope:** M

---

## Task 4: `design-file.ts`: export and import text, round trips

**Description:** Test first in the new `design-file.test.ts`, then add the browser-safe
`src/lib/challenges/design-file.ts`:
- `exportDesignFile({ nodes, edges, features, functionalReqs, nfr, challenge })` →
  `{ text, fileName } | { error }`. Uses `compactDesign`; writes `challenge` or the
  sandbox `functionalRequirements` + `nfr`; nodes as flow maps, edges as
  `a -> b : protocol`; validates its own text with `validateDesignFile` before
  returning.
- `importDesignFile(text, fileName, briefs, currentBriefId)` →
  `{ loaded } | { error }`, where `loaded` is the `BuiltDesign` plus the brief (or
  `null`) and the sandbox requirements. YAML syntax errors become
  `<fileName>: <message>`.

**Acceptance criteria:**
- [x] Every fixture in every brief: build → export → import gives the same built design
  and identical `runVerification` + `evaluateRules` results
- [x] Both demos (store state after `loadDemo` / `loadFanInDemo`) round-trip with the
  same requirements, features, NFRs and verification result
- [x] Export → import → export gives identical text
- [x] YAML syntax error, unknown challenge, unknown node, placement on non-compute:
  each returns a message with file name and path
- [x] Every fixture file's raw text imports into its own challenge

**Verification:**
- [x] `npx vitest run src/lib/challenges`; standing checks

**Dependencies:** Tasks 2, 3

**Files likely touched:** `src/lib/challenges/design-file.ts`, `design-file.test.ts`

**Estimated scope:** M

### Checkpoint A
- [x] All Phase A tests pass; existing tests unchanged; `npm run build` green

---

## Task 5: `loadDesign` store action; ids never reused

**Description:** Test first in `store.test.ts`. Add `loadDesign(loaded)`: with a brief,
start from `challengeSeed(brief)` and add the nodes, edges and placements; without one,
set `challenge: null` and the sandbox requirements (`freq-<id>` rows), features and NFRs.
Clears verification, rule results and selection in the same `set`. Add
`freshId(prefix, taken)` and use it in `addComponent` and `addFunctionalRequirement`;
demo seeds keep `uid`.

**Acceptance criteria:**
- [x] After `loadDesign` into a challenge, `setNfr`, `updateFeature` and
  `addFunctionalRequirement` are still no-ops
- [x] A sandbox load gives editable requirements matching the file
- [x] After loading `paas-1`…`paas-5` (and `feat-1`…), new nodes and requirements get
  unused ids
- [x] `tests/demos.test.ts` unchanged

**Verification:**
- [x] `npx vitest run src/lib/store.test.ts tests/demos.test.ts`; standing checks

**Dependencies:** Task 4

**Files likely touched:** `src/lib/store.ts`, `src/lib/store.test.ts`

**Estimated scope:** S

---

## Task 6: Export and Import buttons with the error message

**Description:** First, in the browser, load a fixture through a temporary dev call to
`loadDesign` and check imported edges draw correctly without handles (plan risk 2); fix
in `buildDesign` if not. Then add `src/components/simulator/design-io.tsx`: Export
(`Download` icon; `Blob` + temporary `<a download>`), Import (`Upload` icon; hidden
`<input type="file" accept=".yaml,.yml">`, `file.text()`, reset the input so the same
file can be picked twice), and one dismissible error line under the toolbar. Render it
in `design-canvas.tsx` next to Clear, in both modes.

**Acceptance criteria:**
- [x] Export downloads `<challenge id>-design.yaml` or `sandbox-design.yaml`
- [x] Import loads a valid file and replaces the canvas; an invalid one shows the
  message and leaves the canvas as it was
- [x] Both buttons reachable at 375px

**Verification:**
- [x] Browser: export and re-import the BeUWI demo; `npm run build`; standing checks

**Dependencies:** Task 5

**Files likely touched:** `src/components/simulator/design-io.tsx`,
`src/components/simulator/design-canvas.tsx`, maybe `src/lib/challenges/design.ts`

**Estimated scope:** S

### Checkpoint B
- [x] Export and import work by hand in the sandbox and a challenge

---

## Task 7: Browser walkthrough, build, bundle size

**Description:** Walk through the spec's browser checklist in the Chrome DevTools
browser at 1440 and 375 wide. Compare `.next/static` JS sizes against a `main` build
and record the difference. Add notes to [plan.md](plan.md).

**Acceptance criteria:**
- [x] Sandbox: BeUWI demo export → clear → import gives the same picture and result
- [x] Challenge: export, switch to sandbox, import → back in the challenge with the design
- [x] `link-shortener/fixtures/good.yaml` passes in its challenge; refused in the sandbox
- [x] Broken file: message shown, canvas unchanged
- [x] Two edges on one pair: Export refuses, naming the pair
- [x] No console errors; bundle growth recorded

**Verification:**
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`
- [x] Notes from the walkthrough added to [plan.md](plan.md)

**Dependencies:** Tasks 1–6

**Files likely touched:** `tasks/plan.md`

**Estimated scope:** S

### Checkpoint C
- [x] All five spec success criteria met; ready for review (nothing committed until asked)
