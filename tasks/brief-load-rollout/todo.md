# Tasks: `brief-load-rollout`

Spec: [SPEC-brief-load-rollout.md](../../SPEC-brief-load-rollout.md). Plan:
[plan.md](plan.md). Each task stops for your review. Each brief is committed on its own
once its task is approved.

Standing checks for every task: `npm test`, `npx tsc --noEmit`, `npm run lint`, and the
load-probe diff (only the briefs the task names may move).

---

## Task 1: Failing tests and baselines

**Description:**
- Save the load probe and the engine probe at `c7f8aca`, in the session scratchpad, before
  any change.
- New `tests/loadsim-briefs.test.ts`: the pilot expectations for all twelve briefs (plan,
  Tests).
- `slowMs` tests:
  - **validator:** accepted from 1 to 600,000 ms; refused out of range, and on a feature
    without `backgroundWorkMs`;
  - **scenario:** `featureLoads` gives `slowMs`, or null when unset;
  - **graph:** a job's slow work, and inline slow work, use `slowMs` when it's set and
    `backgroundWorkMs` when it isn't;
  - **model:** a worker's throughput follows `slowMs`.

**Acceptance criteria:**
- [x] The new tests fail for the reasons expected: no `load` block, the reference design
  failing under the generic default, or no `slowMs` field.
- [x] Every existing test still passes.

**Verification:**
- [x] Full suite: 1,414 passed, 57 failed, all of them expected. `tsc` fails only on the
  missing `slowMs` type, and lint is clean.

**Notes (2026-11-06):**
- **Baselines** at `c7f8aca`, in the session scratchpad: `rollout-loadprobe-c7f8aca.txt`
  and `rollout-engineprobe-c7f8aca.txt`.
- **`tests/loadsim-briefs.test.ts`** (80 tests, 50 failing):
  - **per brief:** it has a `load` block, and its average is the sum of its features'
    `targetRpm` (open question 1). Both fail for all twelve;
  - **the reference design:** at least 99.9% served, p95 under 1,000 ms, no compute
    instance or database saturated, and no jobs waiting or never done. These fail for
    the six broken today: food guide, chat, course assistant, file storage, video
    library and price watch. The queue check also fails for the photo wall, link
    checker and notifications;
  - **flaws, by direction:** three fail for now: the photo wall's thumbnails (not marked
    `cpu` yet), price watch's inline check (its reference design is too broken under the
    generic load to compare against) and the course assistant's `apiMs` (not set). Five
    already pass: the link checker's crawl, file storage's overflow, the video library's
    transcoding, and notifications' sync delivery and missing worker.
- **`slowMs` tests (7, failing):**
  - **validator:** accepted from 1 to 600,000; refused at 0, over 600,000, as a string
    (these three pass already, since an unknown field is refused at the same path), and
    on a feature without `backgroundWorkMs`;
  - **`featureLoads`:** null by default, or the brief's value;
  - **graph:** a job's worker, inline slow work, and a two-stage job's split all follow
    `slowMs`;
  - **model:** one worker slot at 5 + 45 ms does 18 jobs a second with no backlog, and
    with 95 ms falls behind.
- **Existing tests re-pinned, expectations unchanged.** Three tests used these briefs'
  default load, which their blocks will change:
  - the notifications slot demo (with its two headline tests);
  - the video library's "too slow under the default load";
  - the `defaultScenario` test, which used chat as its brief with no block.

  A new `runGeneric` helper in `loadsim-pilots.test.ts` runs a design under the generic
  default with default figures, as if its brief had no block. The demos still test the
  same mechanics. The `defaultScenario` test now takes chat's block away.
- **For Task 6, a consequence to decide on then:** `slowMs` applies to inline slow work
  too (the plan reads it in both places). If notifications' `slowMs` is about 200 ms per
  push, `bad-sync-delivery` under its own load is about 200 ms slower, not 2 s, and runs
  out of slots only at a much bigger rush. The slot cascade would then show on the page
  only if a student raises the requests. The re-pinned tests keep the mechanics
  covered either way.

**Dependencies:** none

**Files:** `tests/loadsim-briefs.test.ts` (new), `src/lib/challenges/validate.test.ts`,
`src/lib/loadsim/scenario.test.ts`, `src/lib/loadsim/graph.test.ts`,
`src/lib/loadsim/model.test.ts`

**Estimated scope:** M

---

## Task 2: The `slowMs` field

**Description:** `slowMs` in the brief types, the validator, `featureLoads` and the two
reads in `graph.ts` (plan, `slowMs`). Document it in `brief-format.md`.

**Acceptance criteria:**
- [x] Task 1's `slowMs` tests pass.
- [x] The load probe is identical to the baseline (no brief sets `slowMs` yet).
- [x] The engine probe is unchanged.

**Verification:**
- [x] Standing checks, and `npm run build`: 1,421 passed, and the only failures are
  `tests/loadsim-briefs.test.ts`'s 50. `tsc`, lint and the build are clean.

**Notes (2026-11-06):**
- **Validator:** `readLoad` gets the ids of features with `backgroundWorkMs`. `slowMs` on
  any other feature fails with "only for a feature with backgroundWorkMs". Out of range
  fails with "expected a number of ms from 1 to 600,000".
- **`graph.ts`:** a `slowTimeOf(feature)` helper gives `slowMs` where the loads set it, and
  `backgroundWorkMs` otherwise. The queue path's split between stages and the inline
  path's `inlineSlowMs` both use it. Whether a feature has slow work at all (and so goes
  on a queue) still comes from `backgroundWorkMs`.
- **`FeatureLoad.slowMs: number | null`**, from `featureLoads`. Eleven hand-built loads in
  seven older test files gained `slowMs: null`, as `apiMs` did in `loadsim-cascades`.
- **Probes:** both identical to the `c7f8aca` baselines. The load probe's only difference
  is the baseline run's own timeout message after the last line.
- **`brief-format.md`:** a `slowMs` bullet after `apiMs`, with a push as its example.

**Dependencies:** Task 1

**Files:** `src/lib/challenges/types.ts`, `src/lib/challenges/validate.ts`,
`src/lib/loadsim/types.ts`, `src/lib/loadsim/scenario.ts`, `src/lib/loadsim/graph.ts`,
`docs/challenges/brief-format.md`

**Estimated scope:** S

---

## Task 3: Request-only briefs

**Description:** blocks for `campus-food-guide`, `chat-app`, `shuttle-tracker` and
`club-auction`, one commit each. These have no external calls or long jobs, so they
settle the scenario rule first.

**Acceptance criteria:**
- [x] Each brief's pilot expectations pass.
- [x] Each flaw the page can show (for example the food guide's and the shuttle's missing
  caches, if their realistic `dbMs` makes them visible) has its number pinned, or a note
  saying why it doesn't show.
- [x] Each commit's load-probe diff moves only that brief. (The four briefs are still
  uncommitted; together, only they moved.)

**Verification:**
- [x] Standing checks: 1,437 passed. The only failures are the 36 brief tests for the
  eight briefs still to come. `tsc` and lint are clean, and the engine probe is
  unchanged.

**Notes (2026-11-06):**

| Brief | Scenario | Reference design | What the flawed designs show |
|---|---|---|---|
| `campus-food-guide` | Lunch rush: 25,800 over 20 min, spike | 100%, p95 66 ms, APIs 26%, database 2% | `bad-no-cache`: the database is 9% busy instead of 2%, with "A cache in front would bring it to about 2%." The other three look the same as the good design: files (`bad-no-cdn`, `bad-pages-from-api`) or a stray client edge |
| `chat-app` | An evening before a deadline: 24,000 over 20 min, steady | 100%, p95 85 ms, chat servers 18%, database 6% | All six look the same: polling and pub/sub wait for `loadsim-delivery` |
| `shuttle-tracker` | Between classes: 26,400 over 20 min, steady | 100%, p95 74 ms, APIs 7%, database 0.6% | `bad-no-cache`: the database is 2.4% busy instead of 0.6%, with the cache note. One-row reads, so it stays small. Polling and SSE wait for `loadsim-delivery` |
| `club-auction` | Closing evening: 24,000 over 20 min, spike | 100%, p95 66 ms, APIs 16%, every bid judged (6,000) | All look the same without an outage. With the database off 2:00–3:00, `bad-single-db-replica` fails 180 requests ("It had no replica"), and the good design none, since bids wait on the queue |

- **The figures:**
  - every read-only feature has `writeShare: 0`;
  - `dbMs` runs from 2 ms (one row by key) to 10 ms (a review insert plus an average update);
  - nothing is batched. Bids are decided one at a time.
- **Pinned in tests:** the food guide's and the shuttle's missing caches: a database more
  than 4× (and 3×) busier, and each note's exact text.
- **The auction's outage** isn't a test: the spec's table puts it under "with an outage",
  which the pilot expectations don't cover. It was checked by hand (above).
- **Probe check:** a first comparison reported `textbook-price-watch` as moved too. It
  hadn't: its output is identical in every run. It's the last brief in the probe, and the
  comparison script had taken the baseline run's own timeout message as part of it.

**Dependencies:** Task 1

**Files:** four `challenges/<id>/brief.yaml`, `tests/loadsim-briefs.test.ts`, this file

**Estimated scope:** M

---

## Task 4: Briefs with external calls

**Description:** blocks for `printing-credits`, `course-assistant` and
`textbook-price-watch`, one commit each, with `apiMs` set to the provider's realistic
time. The course assistant uses the time to the first streamed words, about 1,000 ms.

**Acceptance criteria:**
- [x] Each brief's pilot expectations pass. The course assistant's slowest 5% may take
  1,000 ms plus its model call (decided below).
- [x] `textbook-price-watch/bad-inline-check` shows its slower answers.
- [x] Each commit's load-probe diff moves only that brief. (Still uncommitted. Together,
  only the seven briefs with blocks moved.)

**Verification:**
- [x] Standing checks: 1,452 passed. The 21 failures are the tests for the Tasks 5–6
  briefs. `tsc` and lint are clean, and the engine probe is unchanged.

**Notes (2026-11-06):**

| Brief | Scenario | Reference design | What the flawed designs show |
|---|---|---|---|
| `printing-credits` | Coursework due: 10,400 over 20 min, spike | 100%, p50 54 ms, p95 473 ms (top-ups wait for the provider), APIs 8%, database 2% | All look the same without an outage, except `bad-client-calls-provider`: p95 73 ms. Its API never calls the provider, so it looks faster. With the database off 2:00–3:00, `bad-single-db-replica` fails 320 requests ("It had no replica"), and the good design 120 writes, in the 30 s before its replica takes over |
| `course-assistant` | Evening before an exam: 14,000 over 20 min, steady | 100%, p50 39 ms, **p95 1,061 ms**, APIs 9%, database 3% | All look the same. `bad-no-streaming` does, as open question 3 expected |
| `textbook-price-watch` | First morning of semester: 7,200 over 20 min, spike | 100%, p95 75 ms, functions 30%. Checkers 100% busy in the rush: the queue peaks at 1 job and is empty by 5:00, with job p95 11 s | `bad-inline-check`: p95 2,078 ms. Its functions don't run out of slots (about 4 held), so the flaw shows as slower answers only |

- **The figures:**
  - `apiMs` 400 ms for creating a payment page, and 1,000 ms for the model's first words;
  - the price watch has no `apiMs`: its `backgroundWorkMs` (2,000 ms) is the bookstore call;
  - `dbMs` runs from 4 ms (a balance by key) to 8 ms (a payment and its credits in one
    transaction, or a question and its answer stored).
- **The course assistant's conflict:** 43% of its requests ask a question, so the slowest
  5% all wait for the model's first words. With `apiMs: 1000` (open question 3), p95 is
  1,061 ms, over the pilot expectation of 1,000 ms. The two approved points couldn't both
  hold.
  - **Decided:** the figure stays at 1,000 ms. The course assistant's slowest 5% must stay
    under 1,000 ms plus its model call, so 2,000 ms. The other eleven keep 1,000 ms. The
    spec's pilot expectations say so, and the test reads the allowance from the brief's
    `apiMs`.
  - **Rejected:** 800 ms would have passed (about 860 ms), but only because it was picked
    to.
- **The price watch's checkers:** four of them, at 2 s a check, take exactly the 2 checks
  a second the rush brings. The queue absorbs the rest, as the brief describes. The
  11 s job time is the queueing formula at its 95% cap (about 4.5 × 2,000 ms of
  waiting), not a backlog. The page notes "Price checkers fell behind at 0:00", and the
  queue is empty again by 5:00.
- **Pinned in tests:** `bad-inline-check`'s p95 is over 2,000 ms, against under 100 ms
  for the good design.
- **The printing-credits outage** isn't a test, for the auction's reason. It was checked
  by hand (above).
- **A stale comment:** `scenario.test.ts` says "No brief sets apiMs in this module". Its
  check, on the autograder only, still holds. The comment is left for Task 7's docs pass.

**Dependencies:** Task 1

**Files:** three `challenges/<id>/brief.yaml`, `tests/loadsim-briefs.test.ts`, this file

**Estimated scope:** M

---

## Task 5: Files and photos

**Description:** blocks for `file-storage` and `club-photo-wall`, one commit each. The
photo wall's thumbnails are marked `slowWork: cpu`.

**Acceptance criteria:**
- [x] Each brief's pilot expectations pass.
- [x] `file-storage/bad-capacity-overflow` saturates, and
  `club-photo-wall/bad-sync-thumbnails` fills the API's CPU, with numbers pinned.
- [x] Each commit's load-probe diff moves only that brief. (Still uncommitted. Against
  the Task 4 probe, only these two moved.)

**Verification:**
- [x] Standing checks: 1,461 passed. The 12 failures are the tests for the Task 6 briefs.
  `tsc` and lint are clean, and the engine probe is unchanged.

**Notes (2026-11-06):**

| Brief | Scenario | Reference design | What the flawed designs show |
|---|---|---|---|
| `file-storage` | The last 20 min before a deadline: 20,400, ramp | 100%, p50 108 ms, p95 211 ms, APIs 75% at the deadline, database 2.5% | `bad-capacity-overflow`: API 1 saturates at 13:20, and 1,092 requests (5.4%) time out there. The other three look like the good design: files in the database wait for `loadsim-delivery`, and `bad-no-metadata-db` only ends its requests at the API |
| `club-photo-wall` | The evening after the societies' ball: 22,800, spike | 100%, p95 70 ms, APIs 19%. Thumbnail workers 100% busy in the rush: the queue peaks at 1 job and is empty by 5:00, with job p95 16 s | `bad-sync-thumbnails`: both APIs 162% busy from 0:00 and 4,350 requests (19%) time out. The others look the same: files and uploads wait for `loadsim-delivery` |

- **The figures:**
  - `dbMs` runs from 3 ms (a file's access check, a photo by key) to 15 ms (an
    assignment's few hundred submissions, sorted);
  - files and photos go to object storage, so no figure counts them;
  - the thumbnails keep their `backgroundWorkMs` (3,000 ms). The plan gives `slowMs` only
    to Task 6.
- **The photo wall's flaw spreads:** both APIs sit behind the load balancer as one pool,
  so the thumbnails fill both. Wall browsing times out too, not only posting.
- **The thumbnail workers** fill exactly as the price watch's checkers do: four workers,
  3 s a photo, and 1.33 photos a second in the rush. The page notes they fell behind at
  0:00. The 16 s job time is the queueing formula at its 95% cap, not a backlog.
- **Pinned in tests:**
  - file storage: API 1 saturates after 10:00, API 2 never, and over 4% of requests
    time out at API 1;
  - photo wall: the APIs over 150% busy against under 25%, and over 15% of requests
    time out at them.

**Dependencies:** Task 1

**Files:** two `challenges/<id>/brief.yaml`, `tests/loadsim-briefs.test.ts`, this file

**Estimated scope:** S

---

## Task 6: Slow jobs

**Description:** blocks for `course-link-checker`, `lecture-video-library` and
`notification-system`, one commit each. `slowMs` is set where the job's realistic time
differs from `backgroundWorkMs`, for example about 200 ms for a push.

**Acceptance criteria:**
- [ ] Each reference design's queue is empty before the end.
- [ ] `bad-sync-crawl`, `bad-sync-transcode`, `bad-sync-delivery` and `bad-no-worker` show
  their flaws, with numbers pinned.
- [ ] Each commit's load-probe diff moves only that brief.
- [ ] Stop and report if no realistic `slowMs` lets a reference design drain.

**Verification:**
- [ ] Standing checks for each brief.

**Dependencies:** Task 2

**Files:** three `challenges/<id>/brief.yaml`, `tests/loadsim-briefs.test.ts`, this file

**Estimated scope:** M

---

## Task 7: Docs, full checks, browser checks

**Description:**
- **Docs:**
  - `brief-format.md`: the scenario rule, and an `apiMs` example;
  - the capability map: this module's status, and a note for `loadsim-delivery` listing
    the flaws it should make visible;
  - the spec's section C table brought up to date, and its Results section.
- **Full checks**, including `npm run build`.
- **Browser** (production build, 1440×900, Chrome DevTools with the tab in front):
  `textbook-price-watch/good`, `file-storage/good` and `notification-system/good` look
  healthy.
- **Timing:** a switch-off re-run for two of the twelve briefs.

**Acceptance criteria:**
- [ ] The spec's success criteria all hold.

**Verification:**
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build`.
- [ ] Browser notes and timings recorded here.

**Dependencies:** Tasks 2–6

**Files:** `docs/challenges/brief-format.md`, `CAPABILITY-MAP-dataflow-sim.md`,
`SPEC-brief-load-rollout.md`, this file

**Estimated scope:** S
