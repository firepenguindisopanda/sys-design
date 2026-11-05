# Tasks: `loadsim-queues`

Spec: [SPEC-loadsim-queues.md](../../SPEC-loadsim-queues.md). Plan: [plan.md](plan.md).

Standing verification: `npm test`, `npx tsc --noEmit` and `npm run lint` pass. The engine,
its numbers, the fixtures, the demos, `rules.ts`, the verification panel and the editor are
unchanged. Before Task 1, save the probe output
(`LOADSIM_PROBE=1 npx vitest run tests/loadsim-probe.test.ts --reporter=verbose`) to the
scratchpad as the baseline.

---

## Task 1: Tests first

**Description:**
- **`graph.test.ts`:**
  - `course-registration/good`:
    - Enrol's write classes run api → `claims` → `allocator` → `db`, with the steps from
      `claims` onwards marked `job`;
    - Browse sections and View timetable reads keep the cache → database path;
    - `notSimulated` no longer names `claims` or `allocator`.
  - `lab-autograder/good`: every Submit solution class (reads too, since it has slow work)
    ends `jobs` → `sandbox` → `db`, with the worker's `slowMs` 3000.
  - `lab-autograder/bad-no-worker`: Submit solution's path ends at the queue, and the
    notes mention the queue with no worker.
  - `lab-autograder/bad-results-not-stored`: the path ends at the worker, with the "results
    go nowhere" note.
  - `notification-system/good`: jobs end at the push workers, with no "results go
    nowhere" note.
  - `course-link-checker/good`: Start check's job goes `pages` → `fetchers` → `links` →
    `checkers` → `db`. Each worker's `slowMs` is 30000 (two stages).
  - `chat-app/good`: the pub/sub `bus` is not followed (writes go to the database as
    today) and is listed as "(pub/sub): not simulated yet".
  - A design with no queue gives exactly the paths it gave before. A snapshot of
    `link-shortener/good`'s classes keeps this honest.
- **`model.test.ts`:**
  - **conservation**, for every fixture under its default scenario:
    - `served + failed = requests` (as today);
    - `jobs.queued = done + stillWaiting + neverDone` (within 0.5).
  - **hand-checked backlog:**
    - the design: desktop → VM → queue → worker, with concurrency 1 and a stateless
      feature with `backgroundWorkMs: 95`, so a job costs 100 ms and the worker does
      10 jobs/s;
    - the load: 20 req/s steady for 60 s;
    - the backlog grows about 10 jobs/s and peaks near 600 at 60 s;
    - it is empty again about 60 s later;
    - every job is done and none fails;
    - request answer times stay near the base time, with no worker time in them;
    - job p95 is tens of seconds.
  - **drain cap:** the same design at 40 req/s leaves about 1,200 jobs still waiting after
    one extra window, and no request fails.
  - **never done:** `bad-no-worker` under its default load has
    `neverDone = queued > 0` and `done = 0`.
  - **batch:** a worker writing a storing feature's jobs with `batch: 10` puts 1/10 of the
    write work on the database, compared with `batch: 1`.
  - **no job timeouts:** a database saturated by job writes drops no jobs, and requests at
    the same database still time out as before.
  - Queue and worker never become `firstSaturation`.
  - The determinism and 1,000,000-request checks still pass.
- **`scenario.test.ts` and `validate.test.ts`:**
  - `batch` defaults to 1, and a brief's value is used;
  - the validator rejects 0, 1.5 and 1001 with the file and path.
- **`loadsim-pilots.test.ts`:** the spec's pilot table:
  - `course-registration`: `good` still serves at least 99% with nothing saturated, and
    every job is done. `bad-direct-enrol` now has no jobs, while `good` does.
    `bad-no-cache` is unchanged;
  - `lab-autograder`:
    - `good`: the grading queue peaks above 0 and is empty by the end, workers peak at
      100%, and job p95 is over 60 s;
    - `bad-no-worker`: everything is never done;
    - `bad-results-not-stored`: the note;
  - `lab-monitor`: `good`'s database write work is at most about `1 ÷ batch` of
    `bad-direct-writes`'s.
- **Page tests:**
  - **`load-node.test.tsx`:** queue text ("Empty", "312 waiting", "· nobody reads it")
    and worker text ("100% busy · 4 of 4 slots");
  - **`run-summary.test.tsx`:** the Background jobs block (counts, times, notes), and no
    block without jobs;
  - **`node-stats-table`:** a queue row shows peak waiting and "fell behind" time.

**Acceptance criteria:**
- [x] The new tests fail for the right reasons: missing fields, missing behaviour, and the
  autograder and lab-monitor `load` blocks.
- [x] Every existing test still passes.

**Verification:**
- [x] `npx vitest run src/lib/loadsim tests/loadsim-pilots.test.ts src/components/loadsim`,
  with the failures listed.

**Notes (2026-11-05):**
- **Probe baseline** saved before any change, as `queues-probe-baseline.txt` in the session
  scratchpad (272 lines, every fixture of every brief).
- **Full suite:** 35 failed, 1,184 passed and 2 skipped. All 35 failures are new or updated
  tests:

  | File | Failing | Why |
  |---|---|---|
  | `graph.test.ts` | 8 | no job paths, `slowMs` or pub/sub label |
  | `model.test.ts` | 10 | no `summary.jobs` |
  | `loadsim-pilots.test.ts` | 9 | no jobs, and no autograder or lab-monitor `load` block |
  | `run-summary.test.tsx` | 4 | no Background jobs block, and the queue still under "Not simulated yet" |
  | `load-node.test.tsx` | 2 | no queue or worker gauge text |
  | `scenario.test.ts` | 1 | no `batch` |
  | `validate.test.ts` | 1 | `batch` not read |

- **Updated, not new:** two existing tests expected the registration queue and worker
  under "Not simulated yet". They now expect only autoscaling there, as the spec says.
- **Snapshot:** `src/lib/loadsim/__snapshots__/graph.test.ts.snap` records
  `link-shortener/good`'s classes as they are before any change. It's the guard that a
  design without a queue keeps its paths.
- **Passing already, for now:**
  - The three "rejects a batch of …" validator cases pass, because the validator rejects
    any unknown field at the same path. They become real checks once `batch` is a known
    field.
  - The jobs conservation cases skip while `summary.jobs` doesn't exist.
- **Lazy runs:** the model and pilot tests run their designs on first use. Otherwise a
  missing field fails the whole file while it loads, and hides the other tests in it.
- **After review (2026-11-05): 5 tests added and 2 tightened.** Full suite: 128 failed,
  1,099 passed and 2 skipped. The extra failures are the stricter conservation check (next
  bullet) and the tests below.
  - **Added:**
    - an instance without its own queue edge keeps the slice 1 path;
    - a queue splits jobs evenly between two workers;
    - jobs move along compute → queue, queue → worker and worker → database in the
      frames, and the edge into a worker carries what the worker takes (1 a step), not
      what arrives (2 a step);
    - `nodeStatusAt` reads a real run (the autograder's queue at its peak, empty at the
      end, workers at "4 of 4 slots", and "nobody reads it" without a worker);
    - the announcements "Requests stopped arriving; the queues are draining." and
      "Playback finished: …, N of N jobs done."
  - **Tightened:**
    - jobs conservation now requires `summary.jobs` to be non-null exactly when some path
      reaches a queue. Until the field exists, all 86 fixture cases fail, for that reason;
    - the chat pub/sub test also checks that Send message's writes go from the chat
      servers straight to the database.
  - **Pass today, as guards:** the chat pub/sub test, and "no draining announcement
    without jobs".
- **A rule the tests made precise** (now in plan.md): jobs never time out. But a request
  at the same station waits behind every job in front of it, so the timeout decision
  counts all the waiting work, and drops only requests. The test "never times out a job
  at a saturated database, but still times out requests stuck behind them" checks this.

**Dependencies:** none

**Files:** the test files above

**Estimated scope:** M

---

## Task 2: Brief `batch` field

**Description:**
- **`BriefLoad`:** add `features[id].batch?`.
- **Validator:** a whole number from 1 to 1,000, with the file-and-path message.
- **`FeatureLoad.batch`:** defaults to 1 in `featureLoads`.
- **`docs/challenges/brief-format.md`:** the field, with a lab-monitor example, and when
  it's realistic to use it.

**Acceptance criteria:**
- [x] The scenario and validate tests for `batch` pass.
- [x] Every brief still validates (see notes: through the test suite for now).

**Verification:**
- [x] `npx vitest run src/lib/loadsim/scenario.test.ts src/lib/challenges/validate.test.ts`: 50 passed.
- [ ] `npm run build`: blocked until Task 6 (see notes).

**Notes (2026-11-05):**
- **`BriefLoadFeature`** is now a named type, with `batch` validated by the same whole-number helper as `requests` and `windowSeconds`.
- **`npm run build`** type-checks test files too. It stops at the Task 1 page tests, which use `nodeStatusAt` and the new `nodeStatus` fields before Task 6 adds them, so it never reaches the brief validation. Until then, `tests/challenges.test.ts` and `src/lib/challenges/load.test.ts` load and validate every brief (both pass). The build is rechecked in Task 7.
- **The docs example** (`batch: 50` for `report-metrics`) is a placeholder until Task 5 calibrates the real figure.

**Dependencies:** Task 1

**Files:** `src/lib/challenges/types.ts`, `validate.ts`, `src/lib/loadsim/scenario.ts`,
`types.ts`, `docs/challenges/brief-format.md`

**Estimated scope:** S

---

## Task 3: Graph: job paths

**Description:**
- **`PathStep`:** add `job?` and `slowMs?`.
- **`dataSteps`:** route queued requests to the instance's `queue`-mode queues.
- **Queues:** add consumers, stages and database writes at the last stage.
- **Slow work:** a second pass that splits it over the stages.
- **Notes:** the queue with no consumer, and the worker with no database.
- **`notSimulated`:** drop simulated queues and workers, and label pub/sub topics.

**Acceptance criteria:**
- [x] The graph tests pass.
- [x] The `link-shortener` snapshot is unchanged.

**Verification:**
- [x] `npx vitest run src/lib/loadsim/graph.test.ts`: all pass, as do the readiness and routing tests (36 in all).

**Notes (2026-11-05):**
- **Built as planned:** `jobFrom` and `workerStep` in `graph.ts`; `splitSlowWork` divides the slow work over the most worker stages on any branch; `PathStep` gains `job`, `slowMs` and `op` (a job's database step always writes).
- **Slow-work features with no storage** (the hand-checked design) queue too: the queue check comes before the "stateless ends at compute" rule.
- **Off-model client note reworded.** "… only talks to Upload events (queue), which isn't simulated yet" stopped being true. It now says "… and requests straight from a client to it aren't simulated yet, so it sends no requests here." The routing test is updated to match.
- **Full suite:** 76 failed, 1,151 passed and 2 skipped. What's left is Task 4 (model: 60, mostly the jobs conservation cases), Task 5 (pilots: 8) and Task 6 (page: 8). `tsc` shows errors only in test files, and lint is clean.
- **Probe against the baseline:** only briefs with a `queue`-mode queue moved (club-auction, club-photo-wall, course-link-checker, lab-autograder, lab-monitor, lecture-video-library, notification-system, textbook-price-watch). Course registration's summary lines didn't change at 0.1 ms. The rest, chat (pub/sub) included, are identical. The moves are a few ms in answer times, because the model doesn't yet know that job steps come after the answer. Task 4 fixes that.

**Dependencies:** Task 1

**Files:** `src/lib/loadsim/graph.ts`, `types.ts`

**Estimated scope:** M

---

## Task 4: Model: jobs

**Description:**
- **Capacities:** `queue` and `worker` entries in `capacities.ts`.
- **Hops and stations:**
  - job hops and the queue's answer point (`answersAt`);
  - queue and worker stations;
  - database job writes at `writeDbMs ÷ batch`;
  - only request entries time out.
- **Job accounting:**
  - `jobLatency`;
  - never-done counts;
  - per-queue records (`fellBehindAt`, `peakBacklog`, `peakAt`, `emptyAt`).
- **Frames:** worker backlog reported on its queue.
- **Drain:** run up to one extra window while jobs wait, then count the rest as still waiting.
- **Summary:** `Summary.jobs` and the queue notes. Workers and queues are left out of
  `firstSaturation`.
- **Probe:** prints each fixture's job totals, job p50 and p95, and each queue's peak.

**Acceptance criteria:**
- [x] The model tests pass, including conservation for jobs over every fixture.
- [x] Designs without a queue: the probe output is identical to the baseline.

**Verification:**
- [x] `npx vitest run src/lib/loadsim`: 277 passed.
- [x] Diff the probe against the baseline.

**Notes (2026-11-05):**
- **Built as planned:** queue and worker stations, the answer at the queue, `jobTime` per hop, job totals per queue, the timeout rule that drops only requests, worker backlog shown on its queue, never-done counts, the drain cap, and `Summary.jobs` with each queue's note. Workers and queues are left out of `firstSaturation` and `busiest`.
- **One change from the plan: first-in-first-out waits at workers.** The first version used the backlog's drain time, as for requests. Under the default load that put the autograder's typical job at about 3 hours, because the drain time is the wait for a job arriving *now*, which is far from the wait of the job being finished. Workers now keep cumulative arrivals per step. A job taken now arrived when the arrivals first reached the total taken, and its wait is the time since then. Requests keep the old formula, which is close enough for waits capped at 5 s. The hand-checked tests pass either way.
- **Full suite:** 14 failed, 1,213 passed and 2 skipped. What's left is Task 5 (pilots: 5, the autograder and lab-monitor `load` blocks) and Task 6 (page: 9). Source `tsc` and lint are clean. The million-request run still takes well under 2 s.
- **Probe against the baseline:** every brief without a `queue`-mode queue is identical line for line (146 lines). The nine with one moved:
  - **course-registration:** enrolments are answered at the queue, so p95 is 100 ms in `good`, against 105.8 ms in `bad-direct-enrol`. Every one of the 15,000 jobs is done within about 16 ms. `bad-no-cache` now fails 7.4%, down from 8.5%, because the enrolment writes it used to time out at the database now wait as jobs instead. The pilot's at-least-5% expectation still holds.
  - **lab-autograder** (default load, uncalibrated): 34,545 grading jobs against 4 slots of 3 s. Only 6,061 are done by the end of the drain; the typical job waits 19 minutes and the slowest 5% 36 minutes. `bad-no-worker` never does any. This is what Task 5's `load` block is for.
  - **course-link-checker** (default load): the first stage's queue peaks at about 30,000 jobs, and only 746 of 30,435 are done. Its realistic load is far lower, and its block comes in the brief rollout.

**Dependencies:** Tasks 2 and 3

**Files:** `src/lib/loadsim/model.ts`, `summary.ts`, `types.ts`, `capacities.ts`,
`tests/loadsim-probe.test.ts`

**Estimated scope:** L

---

## Task 5: Calibration gate

**Description:**
- **`lab-autograder`:** add a `load` block for a realistic deadline rush. Set
  `writeShare: 0` for Browse exercises and View result, and a realistic `dbMs`.
- **`lab-monitor`:** add a `load` block with `batch` on `report-metrics`, and a load at
  which batching shows.
- **Calibrate:** use the probe, changing only the `load` blocks, never capacities just to
  make a flaw show.
- **Record** the chosen figures, and why they're realistic, in this file.

**Acceptance criteria:**
- [x] Every pilot test passes.
- [x] `course-registration`'s and `link-shortener`'s existing pilot results hold.
- [x] **Stop and report** if an expectation can be met only with unrealistic figures. No need: both blocks use the briefs' own scenarios. Two findings are reported below.

**Verification:**
- [x] `npx vitest run tests/loadsim-pilots.test.ts src/lib/loadsim`: 298 passed.
- [x] Run the probe for the three briefs, and paste the key lines here.

**Notes (2026-11-05):**
- **`lab-autograder`:** 17,600 requests over 3,600 s, `ramp`. The brief says submissions "pile up in the last hour before a lab closes", so the window is that hour and the load rises towards the deadline. About 400 students resubmitting as they fix failing tests gives roughly 3,200 submissions; at 200 of 1,100 req/min, that's 17,600 requests in all. `writeShare` is 0 for Browse exercises and View result, and 1 for Submit solution. `dbMs` is 3 for the key lookups and 8 for storing a result.
  ```
  good: served 100.0%, p50 38 ms, p95 65.1 ms
    jobs: queued 3200, done 3200, still waiting 0, p50 15078 ms, p95 123015 ms; jobs peak 202 empty at 3750 s
    note: Sandbox workers fell behind at 44:54. The queue peaked at 202 jobs and was empty again by 62:30.
  bad-no-worker: jobs never done 3200; note: Grading jobs has no worker reading it, so 3,200 jobs were never done.
  bad-results-not-stored: as good, plus "Sandbox workers' results go nowhere: no database."
  bad-sync-grading: served 100.0%, p95 71.1 ms, no jobs (slow work in the request waits for loadsim-cascades)
  ```
  This matches a hand estimate. The ramp passes the workers' 80 a minute at about minute 45, then builds about 200 jobs by the deadline, which take about 2.5 minutes to clear.
- **`lab-monitor`:** 32,800 requests over 1,200 s, `steady`. The brief's 500 machines every 20 s is 25 readings a second all day; dashboard views and alerts are in the brief's proportion. `report-metrics` is `{ writeShare: 1, dbMs: 8, batch: 50 }`: a 50-row insert in 8 ms. `view-dashboard` is `{ writeShare: 0, dbMs: 20 }`: the last hour for one lab is about 9,000 rows.
  ```
  good:              db peak 0.1%, writers 3.1%, 30,080 jobs all done in about 7 ms
  bad-direct-writes: db peak 3.6%, no jobs
  ```
- **Finding 1, the autograder's throughput target.** The brief targets 200 submissions a minute. With 3 s of grading, the reference design's 4 sandbox slots (the default concurrency) realistically do about 80 a minute. At 200 a minute sustained, the queue would never drain. The engine passes it because it doesn't model worker capacity. The realistic rush above peaks at about 107 a minute. Options for later: give the fixture's sandbox more concurrency, or have the engine count worker slots. Neither is part of this module.
- **Finding 2, lab-monitor at realistic scale.** The brief's story, "one database can't take it alone", comes from the engine's 400 writes a minute per shard. Realistically a database copy takes about 175 writes a second, so direct writes at 25 a second keep one shard only 3.6% busy. The load page shows batching as a far quieter database, not a failing one, as slice 1's realism decision allows. The brief and the load page tell different stories here, which is worth deciding on before the rollout.
- **Cache-note guard (slice 1 fix).** At these loads, `bad-no-cache`'s note read "Readings DB peaked at 0% busy … bring it to about 0%". Cache notes now need the database at least 1% busy. A pilot test covers it, and no other brief's notes changed.
- **Probe:** every brief without a queue is identical to the baseline. The full suite has 9 failures left, all Task 6's page tests.

**Dependencies:** Task 4

**Files:** `challenges/lab-autograder/brief.yaml`, `challenges/lab-monitor/brief.yaml`

**Estimated scope:** M

---

## Task 6: Page

**Description:**
- **`gaugeText`:** the queue and worker cases.
- **`RunSummary`:** the Background jobs block.
- **`NodeStatsTable`:** queue and worker rows.
- **Live region:** check it announces the end of the drain sensibly.

**Acceptance criteria:**
- [x] The page tests pass.
- [x] Gauges, summary and table read correctly for the autograder pilots in a unit
  render.

**Verification:**
- [x] `npx vitest run src/components/loadsim`. Full suite: 1,228 passed and 2 skipped. `tsc` and lint are clean, and `npm run build` passes again, so every brief validates.

**Notes (2026-11-05):**
- **`nodeStatus`** gains `waiting`, `unread` and `concurrency`. The queue reads "Empty", "N waiting" or "N waiting · nobody reads it". The worker reads "N% busy · k of c slots", and "100% busy" rather than "Saturated" when it runs flat out. Its gauge stays amber then, not red: a worker running flat out is doing its job.
- **`nodeStatusAt`** is the pure helper `LoadNode` now calls. `LoadRun` gains `workerSlots` (each worker's concurrency), because the run had no node configs.
- **`RunSummary`** has a Background jobs block after the failures: queued and done, still waiting and never done when there are any, and typical and slowest time to done when any job was done. Times read as ms, s, or min and s. The queue notes stay in the notes list.
- **`announcementFor`:** "Requests stopped arriving; the queues are draining." when playback crosses the window with jobs waiting. The end of a run with jobs adds "N of M jobs done".
- **`NodeStatsTable`:** a queue's "First saturated" is when its workers fell behind.
- **Existing tests updated, by design (Task 4's note):** registration's `bad-no-cache` now serves 92.6% (it was 91.5%), and its end-of-playback announcement now counts its 15,000 enrolment jobs. `summary.test.ts`'s hand-written load gained `batch: 1`.

**Dependencies:** Task 5

**Files:** `src/components/loadsim/load-node.tsx`, `run-summary.tsx`,
`node-stats-table.tsx`

**Estimated scope:** M

---

## Task 7: Docs, full checks, browser checks

**Description:**
- **README:** in the Load simulation section, explain queues and workers, and the
  not-simulated list.
- **`CAPABILITY-MAP-dataflow-sim.md`:** mark `loadsim-queues` built.
- **`SPEC-loadsim-queues.md`:** a Results section.
- **Full checks:** run them, plus the probe before/after diff.
- **Browser** (Chrome DevTools, 1440×900, tab in front):
  - `lab-autograder/good` and `bad-no-worker`;
  - `course-registration/good`.
- **Lighthouse** on `/simulate`, and a performance trace in a production build.

**Acceptance criteria:**
- [x] The spec's success criteria all hold.

**Verification:**
- [x] `npm test` (1,229 passed, 2 skipped), `npx tsc --noEmit`, `npm run lint` and `npm run build` are all clean.
- [x] Probe diff: only designs with a `queue`-mode queue that receives jobs move. The 146 lines for the other briefs are identical.
- [x] Browser notes and the Lighthouse score recorded here.

**Notes (2026-11-05):**
- **Docs:** the README's Load simulation section now covers queues and workers and the new not-simulated list. The capability map status and the spec's Results section are written.
- **Browser** (Chrome DevTools, production build, 1440×900, tab in front):
  - **`lab-autograder/good`:** at 59:54 the queue reads "202 waiting" and the workers "100% busy · 4 of 4 slots" (amber). The timeline runs to step 625, the drain to 62:30. The summary has the Background jobs block (3,200 queued and done, 15 s typical, 2 min 3 s slowest 5%) and the note. The table shows the queue's peak waiting as 202, with 44:54 for both the queue and the workers.
  - **`bad-no-worker`:** "3,200 waiting · nobody reads it", "Never done 3,200", the note, and "Playback finished: 100% of requests served, 0 of 3,200 jobs done."
  - **`course-registration/good`:** 100% served, "Seat claims: Empty", the allocator at "3% busy · 1 of 4 slots", and 15,000 jobs done in about 15 ms.
  - **Console:** no errors or warnings.
- **Fixed in the browser check:** "Not simulated yet" listed "Submit solution: its slow work isn't simulated yet" for the autograder's reference design, where the workers do that work. Slow work is now listed only when some routed request for the feature doesn't reach a queue (`slowWorkOnQueues` in `graph.ts`). A test covers both cases.
- **Lighthouse** (`/simulate`, desktop): accessibility, best practices, SEO and agentic browsing all 100, with 58 audits passed and none failed.
- **Performance:** playback at 1× with the tab in front ran at 60 fps for 4 s (p95 frame 17.0 ms, worst 17.6 ms), with 65 dots on screen.

**Dependencies:** Task 6

**Files:** `README.md`, `CAPABILITY-MAP-dataflow-sim.md`, `SPEC-loadsim-queues.md`, this file

**Estimated scope:** M
