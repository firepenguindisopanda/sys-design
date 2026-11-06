# Tasks: `loadsim-cascades`

Spec: [SPEC-loadsim-cascades.md](../../SPEC-loadsim-cascades.md). Plan: [plan.md](plan.md).

Standing verification: `npm test`, `npx tsc --noEmit` and `npm run lint` pass. The engine,
its numbers, the fixtures, the demos, `rules.ts`, the verification panel and the editor are
unchanged. Before Task 1, save the full probe output to the scratchpad as the baseline.

---

## Task 1: Tests first

**Description:**
- **`validate.test.ts` and `scenario.test.ts`:**
  - `slowWork` (`cpu`/`wait`, default `wait`) and `apiMs` (1 to 60,000) are read,
    defaulted and rejected with their path;
  - `lab-autograder`'s Submit solution is `cpu`.
- **`graph.test.ts`:**
  - `lab-autograder/bad-sync-grading`'s Submit solution compute steps carry
    `inlineSlowMs: 3000`; `good`'s don't;
  - a design with an external API edge marks `callsApi`;
  - "Not simulated yet" no longer lists slow work.
- **New `src/lib/loadsim/cascades.test.ts`** (hand-built, steady loads):
  - **slots:** a feature with `apiMs: 2000` on one 8-vCPU instance at 100 req/s serves
    about 40 req/s (80 ÷ 2 s). The rest wait, then time out, and the binding limit is
    `"slots"`;
  - **connections:** with 50 ms database holds, 10 connections allow about 200
    database req/s per instance, and the binding limit is `"connections"` above that;
  - **cascade:** a database driven past its capacity lengthens holds, so timeouts
    appear at the instance (with `limit: "connections"`) as well as at the database;
  - **inline slow work:** with 500 ms, `cpu` adds CPU (1 vCPU saturates at about 1.4
    req/s) and `wait` doesn't (it's capped by slots at about 160 req/s);
  - **external call:** adds `apiMs` to the answer time;
  - **too slow:**
    - 4.8 s of inline wait plus the round trip fails every request as `too-slow` at the
      instance;
    - 6 s of inline work fails even at 1 req/s;
    - jobs on a queue are never too slow;
  - **steady holds:** a steady overload settles, and once it has, no step's admitted
    rate differs by more than 10% from the one before;
  - **unchanged:** a design where no limit binds and every answer is under 5 s gives
    output identical to a run with the limits made huge (a test switch in `CAPACITY`);
  - **conservation and determinism** hold, also with an outage.
- **`loadsim-pilots.test.ts`:** the spec's table:
  - `bad-sync-grading` against `good` (CPU binds, not slots);
  - `notification-system/bad-sync-delivery`: slots bind at both instances during the
    spike, with the slot cascade note (added in Task 1 as the slot demo);
  - `bad-no-cache` with timeouts at the API instances;
  - the unchanged pilots;
  - the video library's `too-slow`;
  - the hand-built `apiMs: 2000`.
- **Page:**
  - `load-node.test.tsx`: the three gauge formats, each with failures;
  - `run-summary.test.tsx`: the `too-slow` text, and the two cascade notes (shown only
    when slots or connections bound).

**Acceptance criteria:**
- [x] The new tests fail for the right reasons; every existing test still passes.

**Verification:**
- [x] `npx vitest run src/lib tests/loadsim-pilots.test.ts src/components/loadsim`, with the
  failures listed.

**Results (2026-11-05):**
- **Baseline:** the full probe output at `a844a4d` is in the session scratchpad
  (`probe-baseline-a844a4d.txt`). The unchanged pilots' summaries are pinned in
  `tests/loadsim-unchanged-baseline.json`, measured at `a844a4d`, and compared exactly.
- **Full suite:** 50 failed, 1,326 passed, 2 skipped. All 50 are new or rewritten tests,
  failing because the fields, limits and `too-slow` don't exist yet:
  `cascades.test.ts` 26, `loadsim-pilots.test.ts` 12, `graph.test.ts` 4,
  `run-summary.test.tsx` 3, `load-node.test.tsx` 2, `scenario.test.ts` 2,
  `validate.test.ts` 1.
- **Already passing, as guards:** the unchanged pilots, the "binds nothing" cases, jobs
  never too slow, no call without `apiMs` or without an edge, conservation and
  determinism, and no cascade note when only CPU binds. The `apiMs` and `slowWork`
  rejection tests pass today only because the fields are unknown; Task 2 makes them real.
- **`tsc`:** errors only in these test files, all for the new fields. Lint is clean.
- **Two existing graph tests rewritten** to the new expectation: slow work is no longer
  listed under "Not simulated yet".
- **Hand-checks that differ from the wording above:**
  - connections: 49 ms of query plus the 1 ms hop makes the 50 ms hold, with 100 database
    copies so the database itself stays under 10% busy;
  - too slow: 4,900 ms of slow work (4,930 ms answer) is served and 4,990 ms (5,020 ms)
    fails. 4.8 s plus the round trip is 4,830 ms, under 5 s;
  - `wait` at about 160 req/s uses 1 ms of compute, so one vCPU's CPU doesn't bind first.
- **Slot demo moved** (your decision, 2026-11-05): the autograder keeps `cpu`, so CPU
  binds there at about 30:36 and no slot note appears. The slot gauge and note are shown
  on `notification-system/bad-sync-delivery` instead, with two pilot tests; the spec's
  example note, pilot table and success criteria are amended to match.
- **Not asserted:** database timeouts in `course-registration/bad-no-cache`. With 10
  connections per instance, the database's backlog can't reach 5 s in steady state, so
  only the API timeouts and a smaller database backlog are asserted.

**Dependencies:** none

**Files:** the test files above

**Estimated scope:** M

---

## Task 2: Brief fields

**Description:**
- `BriefLoadFeature.slowWork?` and `.apiMs?`, in the validator.
- `FeatureLoad.slowWork` (default `"wait"`) and `.apiMs` (default `null`).
- The docs.
- `lab-autograder`'s block: `submit-solution: { …, slowWork: cpu }`.

**Acceptance criteria:**
- [x] The brief tests pass.
- [x] Every brief still validates.

**Verification:**
- [x] `npx vitest run src/lib/challenges src/lib/loadsim/scenario.test.ts tests/challenges.test.ts`

**Results (2026-11-05):**
- That command: 470 passed. Full suite: 47 failed, 1,329 passed, 2 skipped. The three
  brief tests now pass, and the 47 left are all Tasks 3–6's.
- `FeatureLoad.slowWork` and `.apiMs` are required, defaulted in `featureLoads`. Seven
  hand-built loads in `model.test.ts`, `outages-model.test.ts` and `summary.test.ts` gained
  `slowWork: "wait", apiMs: null`; no behaviour changes, and the unchanged-pilot baseline
  still matches exactly.
- `apiMs` accepts any number from 1 to 60,000, fractions included, like `dbMs`.
- `tsc`: the brief-field errors are gone; what's left is `limit`, `too-slow`,
  `CAPACITY.instance`, `inlineSlowMs` and `callsApi` in the new tests. Lint is clean.

**Dependencies:** Task 1

**Files:** `src/lib/challenges/types.ts`, `validate.ts`, `src/lib/loadsim/scenario.ts`,
`types.ts`, `docs/challenges/brief-format.md`, `challenges/lab-autograder/brief.yaml`

**Estimated scope:** S

---

## Task 3: Graph marks

**Description:**
- Compute steps get `inlineSlowMs` and `callsApi`.
- "Not simulated yet" is updated as in the plan.

**Acceptance criteria:**
- [x] The graph tests pass.
- [x] The link shortener's snapshot is unchanged.

**Verification:**
- [x] `npx vitest run src/lib/loadsim/graph.test.ts`

**Results (2026-11-05):**
- Graph tests: 33 passed, snapshot unchanged (the new keys are only added when set).
  Full suite: 43 failed, 1,333 passed, 2 skipped; the 43 are all Tasks 4–6's.
- **Compute steps:** `inlineSlowMs` when the feature has slow work and the instance has
  no queue to hand it to (the same test the job paths use); `callsApi` when the instance
  has a link to an external API (an outgoing edge, or a two-way one).
- **"Not simulated yet":** slow work is no longer listed, and the old helper that found
  queued slow work is gone. An external API is dropped from the list when a feature with
  `apiMs` calls it. The graph only knows that if it's given the loads, so
  `buildFlowGraph` takes an optional `loads`, and `simulateLoad` passes them. This
  matters because the canvas reads `run.graph.notSimulated`, not the summary.
- **For Task 6:** an external API that is called isn't on any request path, so its gauge
  will read "No traffic" rather than "Not simulated yet". Worth a better status there.
- `tsc`: only `limit`, `too-slow` and `CAPACITY.instance` are left. Lint is clean.

**Dependencies:** Task 1

**Files:** `src/lib/loadsim/graph.ts`, `types.ts`

**Estimated scope:** S

---

## Task 4: Model

**Description:**
- **`CAPACITY.instance`:** slots, connections and the smoothing steps.
- **Compute costs:** inline slow work and `apiMs` added to costs and base times.
- **Budgets:** three per compute station, with the binding limit on frames.
- **Holds:** worked out per compute hop after the latency pass, then smoothed.
- **Too slow:** the `too-slow` check against each hop's nearest compute ancestor.
- **Failures:** counted per feature at compute nodes.

**Acceptance criteria:**
- [x] The model tests in `cascades.test.ts` pass.
- [x] The outages and queues tests still pass.

**Verification:**
- [x] `npx vitest run src/lib/loadsim`: 6 failed, 358 passed. All 6 are expected moves
  for Task 5 (listed below).

**Second pass (2026-11-05): admission solved each step** (your decision after the stop).
- **The change:** the smoothing is replaced by a solve each step, as amended in the spec
  and plan. Connections now limit only database requests.
- **`cascades.test.ts`:** all 26 pass, including the steady-holds test. The cascade
  design settles, and `model.test.ts`'s jobs-at-a-saturated-database case passes again.
- **Full suite:** 17 failed, 1,359 passed.
  - Tasks 5–6 haven't run yet (5): the slot and connection notes, and the gauge.
  - Expected `too-slow` moves (6): twice capacity ×3, failures so far, and in
    `run-summary.test.tsx` the 92.6% and the playback-end share.
  - The database is no longer named first (6). In `course-registration/bad-no-cache`
    the database peaks at 107% as before, but the API instances now saturate in the
    same step, and the tie goes to the lower id. In `summary.test.ts`'s database-bound
    design, the pool holds the database to about 93%, so it never saturates. Two pilot
    tests, two summary tests and two page texts move.
- **Results under the solved model** (default loads):

  | Design | Served | Failed (`too-slow`) | Limit at API 1 |
  |---|---|---|---|
  | `course-registration/bad-no-cache` | 59.5% (was 92.6%) | 40,455 (30,328) | connections |
  | `notification-system/bad-sync-delivery` | 50.3% | 49,691 (26,242) | slots |
  | `lab-autograder/bad-sync-grading` | 22.9% | 13,568 (9,354) | cpu |

- **Timing:** with nothing binding, it's the same as before (link shortener about 15 ms,
  registration good about 60 ms). With a limit binding, it's slower:
  `bad-no-cache` takes about 115 ms against 25 ms before, and notifications about 33 ms
  against 20 ms. That's over the 100 ms re-run target, so it needs speeding up.
- ~~**Open (yours to decide):** the `too-slow` cliff.~~ Decided: give up early (below).

**Third pass (2026-11-05): give up while waiting** (your decision).
- **The rule:** a request waits at a stop only as long as its answer can still come in
  5 s. That's the time to get there (this step's waits) plus its work there, plus its
  slowest way on. For the way on, the instances use the solve's predicted waits for this
  step, and every other stop uses last step's waits. A stop's backlog holds what its
  least patient waiting request allows.
- **Why the prediction matters:** with last step's waits for the way on,
  `bad-no-cache`'s two identical API instances got 1,142 and 286 `too-slow`. A capped
  backlog answers at almost exactly 5,000 ms, so a few ms of error tipped whole groups
  over, and rounding decided which instance. With the solve's prediction, both get 0.
- **Results** (default loads):

  | Design | Served | Failed | `too-slow` |
  |---|---|---|---|
  | `course-registration/bad-no-cache` | 90.4% (92.6% today) | 9,638: 4,563 at each API, 512 at the database | 0 |
  | `notification-system/bad-sync-delivery` | 76.3% | 23,657 | 16 |
  | `lab-autograder/bad-sync-grading` | 22.8% | 13,593 | 9,354: 3 s jobs saturate the CPU, so its queueing alone passes 5 s |
  | `lecture-video-library/bad-sync-transcode` | 93.8% | 6,171 | 722: the 60 s uploads |
  | `campus-food-guide/good` | 99.6% (99.6%) | 416 (376) | 2 |

- **`cascades.test.ts`:** all 27 pass. The slot test's backlog is now about 3 s of
  admissions (118), not 5 s, and a new test checks that none of its admitted requests is
  too slow.
- **Full suite:** 20 failed, 1,357 passed, all for Task 5 or later:
  - Tasks 5–6 not built yet (5): the slot and connection notes, and the gauge;
  - expected moves (5): twice capacity ×2, failures so far, and the 92.6% ×2;
  - routing (4): `model.test.ts`'s "serves the same share through a CDN" cases now differ
    by about 1e-6 of the share, because each extra hop leaves 1 ms less patience. The bug
    they guard moved it by about 0.5, so 4 decimal places still catch it;
  - the database is no longer named first (6).
- **Timing:** still over target with a limit binding (`bad-no-cache` about 115–130 ms).
  Task 7 measures the re-run; the likely fix is warm-starting each step's solve.

**First pass (2026-11-05): stopped and reported.** The plan's model was in place
(uncommitted), and the steady-holds test failed, as the plan's stop rule foresaw.
- `npx vitest run src/lib/loadsim`: 8 failed, 356 passed. `tsc` is clean apart from the
  page test (Task 6).
- **Holds swing (stop condition).** In the cascade design (one instance, one database at
  about 466 reads a second, 600 offered), admission doesn't settle. It locks into a
  9-step cycle (1.8 s with 0.2 s steps). The instance admits about 2,000 a second, which
  floods the database (430% busy, 309 waiting). The smoothed holds then lengthen, and
  admission falls to about 29 a second. The database drains to idle, and the cycle
  repeats. The settled mean is 298 a second, against about 434 at equilibrium.
  Linearised, near the database's capacity a 5-step mean has a loop gain of about 12, so
  no average of past steps damps it. The lag between a hold and the admission it
  controls is the cause.
- **Connections throttle every request (a plan bug).** The plan admits
  `min(CPU, slots, connections)` of everything offered. But the spec says a free
  connection limits only database requests. As built, a feature that never touches the
  database is held back by another feature's connection waits. It shows in
  `model.test.ts`'s jobs-at-a-saturated-database case: Save requests, answered at the
  queue, get throttled by Look's reads.
- **Expected moves, for Task 5:**
  - `model.test.ts`'s "one component at twice its capacity" (3 tests) and
    `series.test.ts`'s failures so far: `too-slow` once the 5 s backlog fills;
  - `summary.test.ts`'s database-bound design: its failures move to the instance (a
    connection limit now binds);
  - `model.test.ts`'s jobs at a saturated database: the same move, plus the bug above.

**Dependencies:** Tasks 2 and 3

**Files:** `src/lib/loadsim/model.ts`, `capacities.ts`, `types.ts`

**Estimated scope:** L

---

## Task 5: Summary and the probe gate

**Description:**
- **Summary:** the `too-slow` group, and the two cascade note templates.
- **Probe diff** against the baseline. Classify every moved design:
  - `too-slow` (one of the 32);
  - inline slow work (one of the six);
  - a slot or connection limit now binding.

  Record the list here.
- **Update existing tests** that pin moved numbers, each with a comment pointing at the
  spec.

**Acceptance criteria:**
- [x] The summary and pilot tests pass.
- [x] Every moved design has a reason. No stop was needed.

**Verification:**
- [x] `npx vitest run src/lib/loadsim tests/loadsim-pilots.test.ts`: all pass. The full
  suite has 2 failures left, both Task 6's gauge tests (1,377 passed).
- [x] The probe diff, with each design classified (below).

**Results (2026-11-05):**
- **Cascade notes** (`summary.ts`, `cascadeNotes`). They come after the outage and graph
  notes, before the cache notes, one per instance and limit:
  - slots: "Alerts API 1 ran out of request slots at 0:00: Fan out alert's 2 s of slow
    work held them. Requests for Publish alert and Alert preferences timed out there
    too." The holder is the feature with the most slot time. What held them is
    "N s of slow work", "N s external call", both, or "requests". The other features
    come in brief order;
  - connections: "Registration API 1's database connections were all busy from 0:00,
    because Registration DB was saturated. 4,563 requests timed out there, not at the
    database."
- **Three choices made on the way** (beyond the plan):
  - **Headline:** an instance held back by connections is never the headline, as a busy
    worker never is. The database is, if it saturates; otherwise it's the busiest. The
    instance's own note says the rest. Without this, `bad-no-cache` named Registration
    API 1 (a same-step tie) and advised more vCPUs, which wouldn't help.
  - **"…while Course DB was 93% busy"** when the database never saturated. The pools
    often hold it just under full, and the plan would have named no database at all.
  - **"…timed out there, not at the database"** instead of "at the API", which read
    wrongly for instances not called an API. The spec and plan examples are updated.
- **Probe gate:** 36 of 86 designs moved, and every one has a reason. All 32 designs whose
  slowest answers passed 5 s at `a844a4d` moved, plus the 4 with only inline slow work.
  Nothing else moved. Full output: `probe-raw.txt` and `classify-final.txt` in the
  session scratchpad.

  **Corrected in Task 7.** The figures first recorded here came from a probe saved before
  the last fix in this task: the 1e-6 ms allowance for answers at exactly 5 s. That probe
  still had `too-slow` groups from rounding, for example 1,924 at each file storage API
  in `bad-no-metadata-db`. Re-run on the finished Task 5 model, the same 36 designs move
  for the same reasons and nothing is unexplained. Only some sizes change: the table
  below is the re-run.

  | Reason | Designs (served before → after) |
  |---|---|
  | Over 5 s before (32) | food guide ×5 (99.6 → 99.6%, failed 376 → 415), chat ×6 (84.2 → 84.1%), course assistant ×5 (89.9 → 89.8%), file storage ×5 (54.6 → 54.6%, failed 45,373 → 45,408; `bad-capacity-overflow` 41.0 → 40.9%), video library ×4 (95.3 → 95.2%), price watch ×4 (48.2 → 48.2%; `bad-always-on-vms` 98.8 → 98.8%, failed 1,200 → 1,224), plus `bad-sync-transcode`, `bad-inline-check` and `course-registration/bad-no-cache` below |
  | Slow work in the request (6) | `club-photo-wall/bad-sync-thumbnails` (100 → 100%, slower answers), `course-link-checker/bad-sync-crawl` (100 → 21.3%, slots), `lab-autograder/bad-sync-grading` (100 → 22.8%, CPU), `lecture-video-library/bad-sync-transcode` (95.3 → 93.8%), `notification-system/bad-sync-delivery` (100 → 76.4%, slots), `textbook-price-watch/bad-inline-check` (48.2 → 48.1%) |
  | Connections now bind | `course-registration/bad-no-cache` (92.6 → 90.4%; 4,563 timed out at each API, 512 at the database) |

  Among the 32, every design moves by at most 0.1 points of served. They fail a few more
  requests than before, since a request now waits only as long as still fits in 5 s.
- **Tests updated, each with a comment pointing at the spec:**
  - `model.test.ts`: "twice its capacity", re-worked by hand: 4,780 ms of patience,
    334.6 waiting, the first failure at step 47, 3,865.4 failed. The routing cases
    compare to 4 places, not 6.
  - `series.test.ts`: failures so far.
  - `summary.test.ts`: the saturated-database note now uses two VMs (20 connections).
    New tests cover one VM holding the database at 93% (about 13 a second admitted,
    hand-checked) and the timeouts moving to the VM.
  - `run-summary.test.tsx`: 92.6% → 90.4% ×2, and the database's peak 129% → 107%.
- **Model:** the `too-slow` check allows 1e-6 ms of rounding, because a capped backlog
  answers at exactly 5,000 ms.

**Dependencies:** Task 4

**Files:** `src/lib/loadsim/summary.ts`, existing tests as needed

**Estimated scope:** M

---

## Task 6: Page

**Description:**
- `nodeStatus` and `nodeStatusAt` read `frame.limit`.
- The failure list shows the `too-slow` text.
- "Not simulated yet" follows the graph.

**Acceptance criteria:**
- [x] The page tests pass.

**Verification:**
- [x] `npx vitest run src/components/loadsim`: 85 passed.

**Results:**
- **`nodeStatus`** takes `limit`, and `nodeStatusAt` passes `frame.limit`:
  - `slots` gives "Saturated · 80 of 80 slots", with 80 read from `CAPACITY.instance`;
  - `connections` gives "Waiting for a database connection";
  - CPU or no limit keeps today's text;
  - " · N failed" follows in every case.
  - The limit is checked before "No traffic", so an instance whose slots are full but
    whose CPU is idle still reads as saturated.
- **No other page code changed:**
  - The failure list already shows each group's text, so `too-slow` reads "Gave up on
    {instance}: answers took over 5 s." (tested in `run-summary.test.tsx` in Task 5).
  - Timeout groups already say where requests piled up ("Timed out waiting at X").
  - "Not simulated yet" already follows the graph: the canvas reads
    `run.graph.notSimulated`, and the summary copies it.
  - The table's "Peak busy" already counts slot and connection use, since utilisation
    is the highest of the three. It doesn't name the limit, and the plan doesn't ask it to.
- **Left as is: a called external API reads "No traffic".** No brief sets `apiMs` in
  this module, so no page shows one yet. Worth a status of its own when
  `brief-load-rollout` adds `apiMs`.
- **Checks:** the full suite passes (1,379 tests). `tsc` and lint are clean.
- **Browser:** left for Task 7, which runs the planned checks on a production build.

**Dependencies:** Task 5

**Files:** `src/components/loadsim/load-node.tsx`, `run-summary.tsx`

**Estimated scope:** S

---

## Task 7: Docs, full checks, browser checks

**Description:**
- **Docs:**
  - README: slow work, external calls, limits and "too slow";
  - capability map status;
  - the spec's Results section.
- **Full checks.**
- **Browser** (production build, 1440×900, tab in front):
  - `lab-autograder/bad-sync-grading`: the API's CPU fills near the deadline ("Saturated"),
    and Browse exercises fails alongside;
  - `notification-system/bad-sync-delivery`: the slot gauge ("Saturated · 80 of 80
    slots") and the slot cascade note during the spike (moved here in Task 1: the
    autograder's grading is `cpu`, so CPU binds there first);
  - `course-registration/bad-no-cache`: the connection gauge and its note.
- **Lighthouse** on `/simulate`, playback fps, and a switch-off re-run's timing.

**Acceptance criteria:**
- [x] The spec's success criteria hold, with two exceptions, both noted below:
  - the re-run timing is over 100 ms for the video library, which was over it before;
  - Browse exercises failing in the autograder shows only as failures at the API
    instances, not by name.

**Verification:**
- [x] `npm test` (1,381 passed, 2 skipped, after the headline fix), `npx tsc --noEmit`, `npm run lint` and
  `npm run build`: all clean.
- [x] Browser notes, Lighthouse, fps and timing recorded here.

**Notes (2026-11-06):**
- **Docs:**
  - the README has a "Limits and slow work" paragraph, the slot and connection gauge
    examples, and the shorter "not simulated yet" list;
  - the capability map lists `loadsim-failures` at `a844a4d` and this module on its
    branch;
  - the spec has its Results section.
- **Timing first, and two speed-ups.** Per-step solving made every design slower: 1.8×
  at the median, with `bad-no-cache` 6.7× (20 → 134 ms in node) and the video library
  at 136 ms (74 before).
  - **Bit-identical** (a hash of every run's frames and summary, with and without an
    outage, matches the code before):
    - stations get an index and their kind, and a hop's wait is summed from arrays
      instead of looking stations up by name;
    - jobs, queue hops and worker hops are flags worked out once;
    - the predicted-wait pass uses the same arrays;
    - with an outage, the solve's path terms are rebuilt only when a share has
      changed, not every step.
  - **Within the solve's tolerance:** each step's solve starts from the last step's
    levels. Each level's root is bracketed next to where it starts, since g(x) =
    x − allowed(x) rises with slope at least 1, so the root is within |g| of x. Before,
    `bad-no-cache` took about 38 sweeps and 1,000 evaluations on each of its 154 binding
    steps. The largest change to any number in any run is 3.6 × 10⁻⁶ relative (one
    step's failures, 1.29533 vs 1.29533), and the probe text is identical.
  - **Result, in node:** `bad-no-cache` 38 ms, notifications 29 ms, median 28 ms (31
    before these changes). The video library is still 110 ms, against 74 ms before: it
    runs 1,200 steps over 204 hops, so the per-hop work of each step adds up.
- **Correction to Task 5's numbers:** that task's probe was saved before its last fix,
  so some sizes were stale. Re-run, the same 36 designs move for the same reasons. The
  table there is updated.
- **Browser** (production build, 1440×900; the in-app pane for the checks, Chrome
  DevTools with the tab in front for timing, fps and Lighthouse):
  - **`lab-autograder/bad-sync-grading`:** "Lab API 1 saturated at 30:36", and at 32:00
    both instances read "Saturated · 515 failed" (CPU, so no slot text). 22.8% served;
    "Gave up on Lab API 1: answers took over 5 s." (4,677 at each) and "Timed out
    waiting at Lab API 1." (2,119 at each). Browse exercises runs on the same instances,
    so its failures are among these, but nothing on the page names it: the cascade
    notes are for slots and connections only.
  - **`notification-system/bad-sync-delivery`:** at 2:00 both instances read "Saturated
    · 80 of 80 slots · 4,735 failed", and both slot notes show. The headline said "Add
    instances behind a load balancer, or give them more vCPUs", but more vCPUs don't
    help an instance that's out of slots. **Fixed, at your request:**
    - an instance whose slots bound when it first saturated now gets "{X} saturated at
      {m:ss}: all 80 of its request slots are held. Move the slow work to a queue, or
      add instances behind a load balancer." The queue comes first because more
      instances can't save the link checker's 60 s crawl;
    - CPU-limited instances keep the vCPU advice;
    - two pilot tests were written first (the new headline, and the autograder keeping
      its CPU one);
    - only `notification-system/bad-sync-delivery` and
      `course-link-checker/bad-sync-crawl` get the new headline, and the probe is
      unchanged;
    - checked on the page after a rebuild.
  - **`course-registration/bad-no-cache`:** at 2:00 both instances read "Waiting for a
    database connection · 1,705 failed" and Registration DB "Saturated · 193 failed".
    The headline names the database and a cache, and both connection notes show.
  - **Console:** no errors or warnings.
- **Lighthouse:** 100 for accessibility, best practices, SEO and agentic browsing, on a
  fresh navigation (58 audits) and as a snapshot with an outage in place (39). None
  failed.
- **Playback** at 1× (notifications): 60 fps, p95 frame 17.0 ms.
- **Switch-off re-run,** click to the second animation frame, playback running:
  - `course-registration/bad-no-cache`: 51 to 94 ms;
  - `lab-autograder/good`: 55 to 100 ms;
  - `notification-system/bad-sync-delivery`: 53 to 78 ms;
  - `lecture-video-library/bad-video-in-db`: 124 to 180 ms, against 91 to 152 ms on
    a build of `a844a4d` (a webpack build, since Turbopack wouldn't build the
    worktree). Over the target before and after.
  - The in-app pane was hidden, so its timings were throttled (over 1 s for some). The
    numbers above are from Chrome with the tab in front.

**Dependencies:** Task 6

**Files:** `README.md`, `CAPABILITY-MAP-dataflow-sim.md`, `SPEC-loadsim-cascades.md`,
`src/lib/loadsim/model.ts` (speed-ups), this file

**Estimated scope:** M
