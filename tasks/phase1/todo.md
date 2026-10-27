# Tasks: Design challenge briefs, phase 1

Spec: [SPEC.md](../../SPEC.md). Plan: [plan.md](plan.md).

Standing verification for every task: `npm test` and `npx tsc --noEmit` pass, and
`git diff --stat -- src` shows no changes to existing files (new files only).

---

## Task 1: Set up vitest and prove the engine runs under it

**Description:** Install dependencies, add vitest and yaml as dev dependencies, add the
`test` and `test:watch` scripts and a `vitest.config.ts` (node environment, `@/` alias).
Add a smoke test that builds a tiny design by hand and calls `runVerification`, which
proves `@xyflow/react` loads under vitest. This is the riskiest step, so it goes first.

**Acceptance criteria:**
- [x] `npm test` runs and the smoke test passes
- [x] If the node environment can't load `@xyflow/react`, jsdom is added and noted in plan.md

**Verification:**
- [x] `npm test`
- [x] `npx tsc --noEmit`

**Dependencies:** None

**Files likely touched:** `package.json`, `package-lock.json`, `vitest.config.ts`,
`src/lib/challenges/engine.test.ts`

**Estimated scope:** S

---

## Task 2: Challenge types and brief/fixture validation

**Description:** Define `Brief`, `Rule` (component and edge), `Fixture`, `CompactDesign`
and `RuleResult` in `types.ts`. Write `validateBrief(raw, file)` and
`validateFixture(raw, brief, file)`, which return typed objects or throw errors shaped
`<file>: <field path>: <problem>`.

**Acceptance criteria:**
- [x] The example brief from the spec validates
- [x] Unknown kind, protocol or group; duplicate FR or rule id; a placement naming an
      unknown FR or node; and a missing required field each throw with the field path
- [x] Fixture `expect` must be `pass: true` or have `fails` / `warns`; `knownGap` is
      `null` or a non-empty string

**Verification:**
- [x] `npm test -- validate`

**Dependencies:** Task 1

**Files likely touched:** `src/lib/challenges/types.ts`, `src/lib/challenges/validate.ts`,
`src/lib/challenges/validate.test.ts`

**Estimated scope:** M

---

## Task 3: Compact design builder

**Description:** `buildDesign(brief, fixture)` turns a compact design into
`{ nodes, edges, features, nfr }` ready for `runVerification`. It merges node `config`
over the catalog `defaultConfig`, parses `a -> b : protocol` edges (id `a->b`), styles
edges with `createStyledEdge` from `edges.ts` where possible, and creates one feature per
FR with `placedOnNodeId` from `placements` (null if unplaced).

**Acceptance criteria:**
- [x] Defaults apply and overrides merge (e.g. `database` with `replicas: 2` keeps default `shards`)
- [x] Edge shorthand parses, including whitespace variants; bad shorthand throws
- [x] Features carry the brief's resources, RPM and ms per request, and the placement

**Verification:**
- [x] `npm test -- design`

**Dependencies:** Task 2

**Files likely touched:** `src/lib/challenges/design.ts`, `src/lib/challenges/design.test.ts`

**Estimated scope:** S

---

## Task 4: Rule evaluator

**Description:** `evaluateRules(brief, nodes, edges)` returns one `RuleResult` per rule
(`id`, `status`, `detail`), following the rule semantics in the spec.

**Acceptance criteria:**
- [x] `component` rules: `min` count and `minConfig` (`>=`)
- [x] `edge` rules: required and forbidden; `client` and `compute` groups; `protocols`
      filter; `websocket` / `webrtc` match in either direction
- [x] A failed rule reports its `severity`; a passed rule reports `pass`

**Verification:**
- [x] `npm test -- rules`

**Dependencies:** Task 2 (types only)

**Files likely touched:** `src/lib/challenges/rules.ts`, `src/lib/challenges/rules.test.ts`

**Estimated scope:** S

---

## Checkpoint A
- [x] `npm test` and `npx tsc --noEmit` green
- [x] No existing `src/` file modified

---

## Task 5: Loader, fixture suite, link-shortener brief and good fixture

**Description:** `loadChallenges(root)` reads every `challenges/*/brief.yaml` and its
`fixtures/*.yaml`, validating each. `tests/challenges.test.ts` generates one test per
fixture (plain `it`, or `it.fails` with the reason when `knownGap` is set) and one
structure test per brief (exactly one `good.yaml`, at least three `bad-*.yaml`; the
structure test is skipped until Task 6 adds the bad fixtures, then enabled). Write the
link-shortener brief and its good fixture, calibrating NFRs so the good design passes
with headroom.

**Acceptance criteria:**
- [x] `link-shortener/good` passes: no engine check or rule has status `fail`
- [x] A deliberately broken brief file in a temp dir makes `loadChallenges` throw with the file path
- [x] Test names read `<brief>/<fixture>`

**Verification:**
- [x] `npm test`
- [x] Manual: read the vitest output and confirm the test names and gap labels are clear

**Dependencies:** Tasks 2, 3, 4

**Files likely touched:** `src/lib/challenges/load.ts`, `tests/challenges.test.ts`,
`challenges/link-shortener/brief.yaml`, `challenges/link-shortener/fixtures/good.yaml`

**Estimated scope:** M

---

## Task 6: Link-shortener bad fixtures and gap probes

**Description:** Add at least three bad fixtures, each a copy of `good.yaml` with one
flaw: no cache, single DB replica, client wired to the database. Add gap probes: cache
present but unconnected, load balancer present but unconnected, no edges at all. Mark
any the engine misses with `knownGap` and a reason. Enable the structure test.

**Acceptance criteria:**
- [x] Each bad fixture differs from `good.yaml` by one flaw (stated in `description`)
- [x] Each either fails its listed ids or carries a `knownGap` sentence
- [x] The structure test is enabled and passes

**Verification:**
- [x] `npm test`

**Dependencies:** Task 5

**Files likely touched:** `challenges/link-shortener/fixtures/bad-*.yaml`, `tests/challenges.test.ts`

**Estimated scope:** S

---

## Checkpoint B (human review)
- [x] `npm test` green; findings so far noted in plan.md
- [x] User reviews the link-shortener brief, fixtures and test output before Tasks 7 to 9

---

## Task 7: Chat app brief and fixtures

**Description:** Brief for a course group chat (send 900 rpm, load history 300 rpm;
≤150 ms, ≥1200 rpm, 99.9%, ≤$300). Rules: WebSocket between client and compute,
pub/sub queue reached from compute, no client → database. Bad fixtures: HTTP instead of
WebSocket, no queue, client → database, plus at least one gap probe.

**Acceptance criteria:**
- [x] Brief validates; good fixture passes
- [x] At least three bad fixtures, each failing its listed ids or marked `knownGap`

**Verification:**
- [x] `npx vitest run -t chat-app`

**Dependencies:** Checkpoint B

**Files likely touched:** `challenges/chat-app/brief.yaml`, `challenges/chat-app/fixtures/*.yaml`

**Estimated scope:** S

---

## Task 8: File storage brief and fixtures

**Description:** Brief for an assignment submission store (upload 120, download 600,
list 300 rpm; ≤250 ms, ≥1000 rpm, 99.9%, ≤$300). Rules: object storage reached from
compute, metadata database, CDN for downloads (warn). Bad fixtures: no object storage,
no metadata DB, multiple compute nodes without a load balancer, capacity overflow.

**Acceptance criteria:**
- [x] Brief validates; good fixture passes
- [x] At least three bad fixtures, each failing its listed ids or marked `knownGap`

**Verification:**
- [x] `npx vitest run -t file-storage`

**Dependencies:** Checkpoint B

**Files likely touched:** `challenges/file-storage/brief.yaml`, `challenges/file-storage/fixtures/*.yaml`

**Estimated scope:** S

---

## Task 9: Notification system brief and fixtures

**Description:** Brief for campus alerts (publish 30, deliver 1500, preferences 120 rpm;
≤200 ms, ≥1650 rpm, 99.9%, ≤$250). Rules: queue and task worker present, compute →
queue → worker, Web Push from server side to clients. Bad fixtures: no task worker, Web
Push drawn client → server, delivery done synchronously in compute with no queue.

**Acceptance criteria:**
- [x] Brief validates; good fixture passes
- [x] At least three bad fixtures, each failing its listed ids or marked `knownGap`

**Verification:**
- [x] `npx vitest run -t notification-system`

**Dependencies:** Checkpoint B

**Files likely touched:** `challenges/notification-system/brief.yaml`,
`challenges/notification-system/fixtures/*.yaml`

**Estimated scope:** S

---

## Checkpoint C
- [x] `npm test` and `npx tsc --noEmit` green
- [x] Four briefs, each with one good and at least three bad fixtures

---

## Task 10: Brief authoring guide

**Description:** `docs/challenges/brief-format.md`: every brief and fixture field, rule
semantics, the list of engine check ids, how to mark a known gap, and a walkthrough of
adding a new brief.

**Acceptance criteria:**
- [x] Every field in `types.ts` is documented
- [x] Engine check ids listed match `simulation.ts`

**Verification:**
- [x] Manual: someone could write a fifth brief from the guide alone

**Dependencies:** Checkpoint C

**Files likely touched:** `docs/challenges/brief-format.md`

**Estimated scope:** XS

---

## Task 11: Phase 1 findings note

**Description:** `docs/challenges/phase1-findings.md`: a table of every known gap (brief,
fixture, what the engine misses, which function causes it, suggested phase 2 fix), plus
any NFR calibration that was needed to make the good designs pass.

**Acceptance criteria:**
- [x] Every `knownGap` fixture appears in the table
- [x] Each row names the responsible function in `simulation.ts`

**Verification:**
- [x] Cross-check against `npm test` output (count of `it.fails` tests matches table rows)

**Dependencies:** Checkpoint C

**Files likely touched:** `docs/challenges/phase1-findings.md`

**Estimated scope:** XS

---

## Checkpoint: Complete
- [x] All eight success criteria in SPEC.md met
- [x] Ready for review; nothing committed until asked
