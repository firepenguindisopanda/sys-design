# Tasks: Phase 4, new briefs

Spec: [SPEC-phase4-briefs.md](../SPEC-phase4-briefs.md). Plan: [plan.md](plan.md).

Standing verification for every brief task: `npx vitest run -t <id>` passes; `npm test`,
`npx tsc --noEmit`, `npm run lint` and `npm run build` pass; existing fixtures and
`tests/demos.test.ts` unchanged.

Every brief task follows the same steps (from `docs/challenges/brief-format.md`):

1. `brief.yaml`: summary, out of scope, requirements with feature numbers, NFRs
   (provisional), rules with titles, 3 reflection questions on what the checks can't
   see, and `source` naming the starter. Text rewritten in my own words.
2. `fixtures/good.yaml`; run the probe; set the NFRs from its estimates with 15–30 %
   headroom on throughput and cost.
3. The bad fixtures, each a copy of `good.yaml` with one change.
4. Run the brief's tests; record the probe output for the findings (Task 5).
5. Commit the brief (one commit per brief).

---

## Task 1: `lab-autograder` (from `leetcode`)

**Rules:** `grading-queued` (compute → queue), `workers-run-tests` (queue → task
worker), `results-stored` (task worker → database), `no-client-to-db`.

**Acceptance criteria:**
- [x] Brief validates; requirements `browse-exercises`, `submit-solution`, `view-result`
- [x] `good` passes the engine and every rule, with the NFR headroom above
- [x] `bad-sync-grading`, `bad-no-worker`, `bad-results-not-stored`, `bad-client-to-db`
  each fail their intended ids (or carry a `knownGap`)
- [x] Probe output saved for the findings

**Dependencies:** None

**Files:** `challenges/lab-autograder/brief.yaml`, `challenges/lab-autograder/fixtures/*.yaml`

**Estimated scope:** M

### Checkpoint A (review stop)
- [ ] You've reviewed the autograder before Tasks 2–4 start

---

## Task 2: `course-registration` (from `ticketmaster`, `flash-sale`)

**Rules:** `catalog-cache` (compute → cache), `enrol-queued` (compute → queue),
`seat-worker` (queue → task worker), `db-replicas` (database `replicas ≥ 2`),
`no-client-to-db`.

**Acceptance criteria:**
- [ ] Brief validates; requirements `browse-sections`, `enrol`, `view-timetable`
- [ ] Reflection covers what the checks can't: an atomic seat check, holds,
  overselling
- [ ] `good` passes with headroom
- [ ] `bad-no-cache`, `bad-direct-enrol`, `bad-single-db-replica`, `bad-client-to-db`
  fail their intended ids (or carry a `knownGap`)

**Dependencies:** Checkpoint A

**Files:** `challenges/course-registration/**`

**Estimated scope:** M

---

## Task 3: `shuttle-tracker` (from `uber`)

**Rules:** `shuttles-report` (IoT → compute), `live-positions` (compute →
mobile/desktop over SSE or WebSocket), `latest-in-cache` (compute → cache),
`no-client-to-db`.

**Acceptance criteria:**
- [ ] Brief validates; requirements `report-location`, `live-map`, `stop-eta`
- [ ] `good` passes with headroom
- [ ] `bad-polling`, `bad-sse-wrong-direction` (also trips `topo-sse-dir-<edge>`),
  `bad-no-cache`, `bad-client-to-db` fail their intended ids (or carry a `knownGap`)

**Dependencies:** Checkpoint A

**Files:** `challenges/shuttle-tracker/**`

**Estimated scope:** M

---

## Task 4: `course-assistant` (from `chatgpt`)

**Rules:** `llm-from-server` (compute → external API), `no-client-to-llm` (client ↛
external API), `stream-answers` (compute → mobile/desktop over SSE), `history-db`
(compute → database).

**Acceptance criteria:**
- [ ] Brief validates; requirements `ask-question`, `history`
- [ ] `good` passes with headroom
- [ ] `bad-client-calls-llm` (also trips `topo-api-keys-<edge>`), `bad-no-streaming`,
  `bad-no-history`, `bad-client-to-db` fail their intended ids (or carry a `knownGap`)

**Dependencies:** Checkpoint A

**Files:** `challenges/course-assistant/**`

**Estimated scope:** M

### Checkpoint B
- [ ] All eight briefs' tests pass; existing fixtures unchanged

---

## Task 5: Findings, HANDOVER, browser check, build

**Description:** Add a "Phase 4" section to `docs/challenges/phase1-findings.md`: per new
brief, which bad designs the engine catches alone and which only rules catch, plus any
new findings (numbered from 12). Update `HANDOVER.md`. In the browser, open each new
brief from the picker, import its `good.yaml` (passes) and one bad fixture (fails the
named rule).

**Acceptance criteria:**
- [ ] Findings section written from the probe output
- [ ] Each new brief opens on its Brief tab; good passes and one bad fails in the
  browser; no console errors
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` pass

**Dependencies:** Tasks 1–4

**Files:** `docs/challenges/phase1-findings.md`, `HANDOVER.md`, `tasks/plan.md`

**Estimated scope:** S

### Checkpoint C
- [ ] All four spec success criteria met; ready for review
