# Tasks: Phase 5, more briefs

Spec: [SPEC-phase5-briefs.md](../SPEC-phase5-briefs.md). Plan: [plan.md](plan.md).

Standing verification for every task: `npx vitest run -t <id>` passes; `npm test`,
`npx tsc --noEmit`, `npm run lint` and `npm run build` pass; existing fixtures,
`tests/demos.test.ts` and `tests/calibration.test.ts` unchanged and passing.

Every brief task follows the same steps (from `docs/challenges/brief-format.md`):

1. `brief.yaml`: summary, out of scope, requirements with feature numbers, NFRs
   (provisional), rules with titles, 3 reflection questions on what the checks can't see,
   and `source` naming the starter. Text rewritten in my own words.
2. `fixtures/good.yaml`; run the probe; set the NFRs from its estimates (15–30 % headroom on
   throughput and cost; latency 2× rounded up to 10 ms).
3. The four bad fixtures, each a copy of `good.yaml` with one change.
4. Run the brief's tests; record the probe output for the findings (Task 6).
5. Commit the brief, once you approve it (one commit per brief).

---

## Task 1: `campus-food-guide` (from `yelp`)

**Rules:** `pages-on-cdn` (CDN → static hosting), `clients-use-cdn` (client → CDN),
`menu-cache` (compute → cache), `no-client-to-db`.

**Acceptance criteria:**
- [x] Brief validates; requirements `browse-vendors`, `view-vendor`, `post-review`
- [x] `good` passes the engine and every rule, with no warnings, calibrated as above
- [x] `bad-no-cdn`, `bad-pages-from-api`, `bad-no-cache`, `bad-client-to-db` each fail
  their intended ids (or carry a `knownGap`); whether the engine catches `bad-no-cdn` on
  latency is recorded
- [x] Probe output saved for the findings (in `plan.md`)

**Dependencies:** None

**Files:** `challenges/campus-food-guide/**`

**Estimated scope:** M

### Checkpoint A (review stop)
- [x] You've reviewed the food guide before Tasks 2–5 start

---

## Task 2: External API hop fix (test first)

**Description:** In `src/lib/simulation.test.ts`, a case where compute calls an external API
and the API calls compute back (a webhook): no `topo-intermediate-<api>` warning. It fails
first. Then add `external_api` to the `hopOk` set in `simulation.ts`, with a one-line comment.

**Acceptance criteria:**
- [ ] The new test fails before the change and passes after
- [ ] Every existing test passes unchanged (no existing design has an external API with
  edges both ways)

**Dependencies:** Checkpoint A

**Files:** `src/lib/simulation.ts`, `src/lib/simulation.test.ts`

**Estimated scope:** XS

---

## Task 3: `printing-credits` (from `payment-system`)

**Rules:** `provider-from-server` (compute → external API), `no-client-to-provider` (client ↛
external API), `webhook-to-server` (external API → compute or load balancer),
`ledger-replicas` (database `replicas ≥ 2`), `no-client-to-db`.

**Acceptance criteria:**
- [ ] Brief validates; requirements `start-payment`, `payment-confirmed`, `view-balance`
- [ ] Reflection covers what the checks can't: the hosted payment page, crediting exactly
  once when the webhook is retried, checking the webhook really came from the provider
- [ ] `good` passes with no warnings (needs Task 2)
- [ ] `bad-client-calls-provider`, `bad-no-webhook`, `bad-single-db-replica`,
  `bad-client-to-db` fail their intended ids (or carry a `knownGap`)
- [ ] How the webhook edge affects latency is recorded

**Dependencies:** Task 2

**Files:** `challenges/printing-credits/**`

**Estimated scope:** M

---

## Task 4: `lecture-video-library` (from `youtube`)

**Rules:** `recordings-in-object-storage` (compute → object storage), `transcode-queued`
(compute → queue), `workers-transcode` (queue → task worker), `renditions-stored` (task
worker → object storage), `playback-via-cdn` (CDN → object storage).

**Acceptance criteria:**
- [ ] Brief validates; requirements `upload-recording`, `browse-lectures`, `watch-lecture`
- [ ] `good` passes with headroom
- [ ] `bad-sync-transcode`, `bad-video-in-db`, `bad-no-cdn`, `bad-client-to-db` fail their
  intended ids (or carry a `knownGap`)

**Dependencies:** Checkpoint A

**Files:** `challenges/lecture-video-library/**`

**Estimated scope:** M

---

## Task 5: `course-link-checker` (from `web-crawler`)

**Rules:** `crawl-queued` (compute → queue), `stage-handoff` (task worker → queue),
`workers-fetch` (task worker → external API), `report-stored` (task worker → database),
`no-client-to-db`.

**Acceptance criteria:**
- [ ] Brief validates; requirements `start-check`, `view-report`; the summary says the
  nightly run is drawn as a request from the lecturer's machine
- [ ] `good` passes with headroom
- [ ] `bad-single-stage`, `bad-sync-crawl`, `bad-results-not-stored`, `bad-client-to-db`
  fail their intended ids (or carry a `knownGap`)

**Dependencies:** Checkpoint A

**Files:** `challenges/course-link-checker/**`

**Estimated scope:** M

### Checkpoint B
- [ ] All twelve briefs' tests pass; existing fixtures, demos and calibration unchanged

---

## Task 6: Findings, HANDOVER, browser check, build

**Description:** "Update: phase 5" in `docs/challenges/phase1-findings.md`: per brief, what
the engine catches alone and what only rules catch; finding 13 (the hop warning, fixed); new
findings from calibration; the twelve-brief total. `HANDOVER.md`: built items, engine
tally, starters left (19). In the browser, each new brief opens from the picker; its
`good.yaml` passes and one bad fixture fails its rule.

**Acceptance criteria:**
- [ ] Findings and HANDOVER updated
- [ ] Browser checks done; no console errors
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` pass

**Dependencies:** Checkpoint B

**Files:** `docs/challenges/phase1-findings.md`, `HANDOVER.md`, `tasks/plan.md`,
`tasks/todo.md`

**Estimated scope:** S

### Checkpoint C
- [ ] All four spec success criteria met; ready for review
