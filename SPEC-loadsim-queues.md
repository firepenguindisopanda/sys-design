# Spec: load simulation, queues and workers (`loadsim-queues`)

Status: **approved** (2026-11-05). Open questions 1–4 are all as recommended:
1. writes plus slow work go on the queue;
2. the run drains after the window, for at most one more window;
3. jobs pass through every stage;
4. a `batch` field is added, with `lab-monitor` as a third pilot.

The next module in [CAPABILITY-MAP-dataflow-sim.md](CAPABILITY-MAP-dataflow-sim.md), after
slice 1 ([SPEC-dataflow-sim.md](SPEC-dataflow-sim.md)) and the routing fix
([SPEC-loadsim-routing.md](SPEC-loadsim-routing.md)). Branch: `feat/loadsim-queues`, from
`main` (`9aad70c`).

## Objective

Ten of the sixteen reference designs use a message queue and task workers, and "a queue
absorbs a spike" is one of the page's core lessons. Today the load page draws queues and
workers but simulates neither: work that would go on a queue goes straight to the
database, and the queue is listed as "not simulated yet". So the page can't tell these
designs apart:

| Brief | Designs that give identical results today |
|---|---|
| `lab-autograder` | all five: `good`, `bad-no-worker`, `bad-results-not-stored`, `bad-sync-grading`, `bad-client-to-db` |
| `course-registration` | `good` and `bad-direct-enrol` (enrolments without a queue) |

After this module, a student should **see**:
- **A queue absorbing a spike:** submissions pour in at the deadline. The API answers each
  one at once, the grading queue grows while the workers run flat out, and the queue drains
  after the rush. Nothing is lost, but results come later.
- **What a queue costs:** the student's answer is fast, but the job behind it waits, and
  the page says how long ("graded within 4 min 10 s").
- **A queue nobody reads:** with no worker, the jobs pile up and none is ever done.
- **Writes at the workers' pace:** writes handed to a worker reach the database at the
  workers' rate, not the clients'.

The page still gives no verdict.

## Change

### A. The model (`src/lib/loadsim/`)

**Handing off.** A compute pool *hands off* when any of its instances has an edge to a
message queue in `queue` mode. Pub/sub topics (`mode: pubsub`) stay unsimulated (see
Boundaries).

**What goes on the queue** (open question 1). For a feature placed in a pool that hands off:
- **Writes:** each write request goes on the queue instead of to the database, so
  `writeShare` decides how much.
- **Slow work:** if the feature has `backgroundWorkMs`, *every* request for it becomes a job,
  reads included.

Everything else (reads of features without slow work) keeps its slice 1 path. A feature in
a pool that doesn't hand off also keeps its slice 1 path. Slow work done inside the request
stays unsimulated until `loadsim-cascades`.

**The request the client waits for.** It runs client → load balancer → compute → queue
and is answered once the job is on the queue. The queue hop adds 1 ms (internal hop) plus
2 ms to enqueue, and counts toward the answer time. The job's later work doesn't.

**Jobs.** A job is a request that has been handed off. It:
1. waits on the queue;
2. is taken by a **consumer**: a task worker with an edge from the queue. With several
   consumers, jobs are split evenly between them;
3. is processed at the worker. A job costs 5 ms of handling plus the feature's
   `backgroundWorkMs`. The worker can run `concurrency` jobs at once, so its capacity is
   `concurrency × 1000 / job ms` jobs per second. There is no utilisation ceiling: workers
   behind a queue are meant to run flat out;
4. writes its result if the feature stores data (`storageGb > 0`) and the worker has an
   edge to a database. The write goes to the primaries like any other write, costing
   `writeDbMs ÷ batch` (open question 4);
5. passes on, if the worker hands off to another queue and worker (a **stage chain**, as in
   `course-link-checker`), to the next stage (open question 3).

**Queue capacity.** A queue accepts up to 3,000 messages a second, in line with a managed
FIFO queue with batching. No campus brief comes near it, so in practice a queue never
saturates. A queue holds any backlog, and a job never times out, because nobody is waiting
on the other end.

**Problems the model reports:**

| Design | What happens | Note on the page |
|---|---|---|
| Queue with no consumer | Jobs pile up and are never done | "Grading jobs has no worker reading it, so 3,400 jobs were never done." |
| Worker with no database for a storing feature | Jobs are done, results stored nowhere | "Sandbox workers' results go nowhere: no database." |
| Workers slower than arrivals | The backlog grows, then drains when arrivals fall | "Sandbox workers fell behind at 0:40. The queue peaked at 312 jobs and was empty again by 7:10." |

**After the window: the drain** (open question 2). When requests stop arriving, the run
keeps going until every queue is empty, for at most one more window. Jobs still waiting
at the end are reported as "still waiting" and are counted apart from failed requests:
the client's request did succeed.

**Accounting.** Request totals keep their meaning: `served + failed = requests`. Jobs get
their own totals: `jobs = done + still waiting + never done`. The conservation test grows to
cover them.

**Summary additions:**
- `jobs`: the totals above, for each queue;
- job timings: typical (p50) and slowest 5% (p95) time from being queued to done, across
  all jobs;
- for each queue: peak backlog, when it peaked, and when it was empty again;
- for each worker: peak busy.

### B. The brief `load` block

- **A new optional field, `batch`, per feature** (open question 4). A worker groups this
  many writes into one database write, so each job's write costs `writeDbMs ÷ batch`. It
  defaults to 1 and only applies to writes a worker makes. `docs/challenges/brief-format.md`
  documents it.
- **A third pilot, `lab-autograder`,** gets a `load` block: a deadline rush sized so the
  reference design's queue builds up and drains within the window plus the drain. It also
  sets `writeShare: 0` for its two read features, so their default 20% writes don't become
  jobs. The block is calibrated with the probe, and as in slice 1 its figures stay
  realistic: no number is raised just to make a flaw show.
- **A fourth pilot, `lab-monitor`,** gets a `load` block with `batch` on `report-metrics`
  (decision 4). Its reference design batches readings through workers, and
  `bad-direct-writes` writes each reading to the database.

### C. The page

- **Queue node gauge:** "Empty", "312 waiting", or "312 waiting · nobody reads it".
- **Worker node gauge:** busy as for compute, for example "100% busy · 4 of 4 slots".
- **Dots:** on compute → queue, queue → worker, and worker → database edges, at the rate
  jobs move along them. A growing backlog shows as dots arriving faster than they leave.
- **Playback:** covers the drain. After the window, the timeline reads "20:00 · arrivals
  stopped" and runs on until the queues are empty.
- **Summary:** a "Background jobs" block after "What happened", with jobs queued, done,
  still waiting and never done, plus typical and slowest time to done. Each queue's note
  is as in the table above.
- **Per-component table:** queues and workers become rows with real figures. For a queue,
  "Peak waiting" is the peak backlog and "First saturated" is when the workers fell behind.
- **"Not simulated yet"** no longer lists queues or workers in `queue` mode. Pub/sub
  topics, worker calls to external APIs, and push from workers stay on the list.
- **Reduced motion:** edges between queues and workers show their rates as text, as other
  edges do.

## Pilot expectations (calibrated in the build, checked by tests)

| Fixture | Expected on the load page |
|---|---|
| `course-registration/good` | Still at least 99% served, nothing saturated. Enrolments are answered at the queue. The allocator writes seats at its own pace. Every job is done |
| `course-registration/bad-direct-enrol` | As today. Now differs from `good`: no jobs, enrolment writes hit the database directly |
| `course-registration/bad-no-cache` | Its database still saturates first, and at least 5% still fail |
| `lab-autograder/good` | The grading queue builds during the rush and drains. Workers peak at 100%. Every job is done by the end of the drain. The slowest 5% of jobs wait minutes, not milliseconds |
| `lab-autograder/bad-no-worker` | No submission is ever graded: every job is "never done" |
| `lab-autograder/bad-results-not-stored` | Jobs are done, with the "results go nowhere" note |
| `lab-autograder/bad-sync-grading` | Unchanged for now: slow work inside the request waits for `loadsim-cascades` |
| `lab-monitor/good` | Readings are answered at the queue. The batch writers' database write load is about `1 ÷ batch` of `bad-direct-writes` |
| `lab-monitor/bad-direct-writes` | No jobs. Every reading writes to the database, which is far busier than in `good` |
| `link-shortener/*` | Unchanged (no queue) |

## Tests (written first)

- **`graph.test.ts`:**
  - handing off and its consumers;
  - which requests become jobs (writes, and all of a slow-work feature);
  - pub/sub left out;
  - stage chains;
  - a queue with no consumer.
- **`model.test.ts`:**
  - **conservation:** requests as before, and `jobs = done + still waiting + never done`
    for every fixture;
  - a worker's capacity follows `concurrency` and job cost;
  - a backlog drains after arrivals fall;
  - the drain stops after one window;
  - the answer time excludes the job's time;
  - `batch` divides a worker's database write cost;
  - the run is deterministic.
- **`scenario.test.ts` and `validate.test.ts`:** `batch` defaults to 1, is optional, and is
  validated (a whole number from 1 to 1,000).
- **`loadsim-pilots.test.ts`:** the table above.
- **Page tests:** the queue and worker gauge text, the "Background jobs" summary, the
  queue notes, and the timeline after the window.

## Boundaries

- **Unchanged:** the engine, the brief rules, the verification panel, the fixtures, and the
  editor. Run simulation's numbers don't move.
- **Left for later modules:**
  - pub/sub fan-out, push from workers, and polling (`loadsim-delivery`);
  - slow work inside the request, worker connection limits, and calls to external APIs
    (`loadsim-cascades`);
  - killing a worker (`loadsim-failures`).
- **Load blocks for the other briefs** wait for `brief-load-rollout`.

## Success criteria

- The pilot expectations hold, and every existing load test still passes.
- Probe before and after: the only designs whose request results change are those with a
  queue in `queue` mode that a placed feature hands work to. Every other design is
  unchanged to the millisecond.
- All tests, `tsc`, lint and `next build` pass. Lighthouse on `/simulate` stays at 100, and
  playback stays smooth in a production build.
- In the browser, `lab-autograder/good` shows the queue filling and draining, and
  `bad-no-worker` shows jobs piling up with the note.

## Open questions

1. **What goes on the queue?**
   - **(a) Recommended:** writes, plus every request of a feature with slow work. This
     follows what the brief already says (`writeShare`, `backgroundWorkMs`) and needs no
     new field.
   - **(b)** The brief's `load` block marks queued features explicitly. This is more
     control, but every brief needs it, and the sandbox needs a rule anyway.
   - **(c)** Every request of every feature on a pool that hands off. This is simple but
     wrong: reads would wait on a queue.
2. **Drain after the window?**
   - **Recommended:** yes. Keep running until the queues are empty, for at most one more
     window, and show it in the playback. Without it, a rush's backlog is cut off at 20:00
     and the lesson ("it catches up") is lost.
3. **Stage chains (queue → worker → queue → worker)?**
   - **Recommended:** yes. A job passes through each stage, and each stage does an equal
     share of the slow work. This covers `course-link-checker` at little extra cost.
   - The alternative is to simulate only the first stage and list later ones as not
     simulated.
4. **Batch writes (`batch` per feature, and `lab-monitor` as a pilot)?**
   - **Recommended:** yes. `lab-monitor` is the brief about batching writes. Without this,
     its reference design and `bad-direct-writes` look the same on the page.
   - The cost is one optional field and one more brief to calibrate.

## Results (2026-11-05)

Built on `feat/loadsim-queues` in seven tasks. The plan and task notes are in
[tasks/loadsim-queues/](tasks/loadsim-queues/).

- **Pilots** (all pilot tests pass):

  | Fixture | On the load page |
  |---|---|
  | `lab-autograder/good` (17,600 requests over 60 min, ramp) | Workers fall behind at 44:54. The queue peaks at 202 jobs and is empty by 62:30. All 3,200 submissions are graded; the typical one in 15 s and the slowest 5% in 2 min 3 s |
  | `lab-autograder/bad-no-worker` | "3,200 waiting · nobody reads it"; 3,200 never done |
  | `lab-autograder/bad-results-not-stored` | As `good`, plus "Sandbox workers' results go nowhere: no database." |
  | `course-registration/good` | 100% served, p95 100 ms, against 105.8 ms in `bad-direct-enrol`. All 15,000 enrolment jobs are done in about 15 ms |
  | `lab-monitor/good` (batch 50) | Database 0.1% busy, against 3.6% in `bad-direct-writes` |

- **Refinements and fixes along the way** (each in the task notes):
  - each compute instance uses its own queue edges;
  - "results go nowhere" needs a worker with no outgoing edge, so push workers don't get it;
  - waits at workers are first in, first out;
  - a request still times out behind jobs, but only requests are dropped;
  - a client that only talks to a queue is now told requests straight from a client aren't
    simulated;
  - the slice 1 cache note needs the database at least 1% busy;
  - "Not simulated yet" no longer lists slow work that a queue's workers do.
- **Unchanged:** every brief without a `queue`-mode queue gives identical probe output.
  Run simulation, the rules and the fixtures are untouched.
- **Checks:**
  - 1,229 tests pass, 2 skipped;
  - `tsc`, lint and `next build` are clean;
  - Lighthouse on `/simulate` is 100 for accessibility, best practices and SEO;
  - playback in a production build holds 60 fps (p95 frame 17 ms);
  - there are no console errors.
- **Findings for later** (not acted on):
  1. `lab-autograder` targets 200 submissions a minute, but its reference design's 4
     sandbox slots realistically grade about 80. The engine doesn't count worker slots.
  2. `lab-monitor`'s "one database can't take it alone" comes from the engine's 400 writes
     a minute per shard. Realistically, direct writes keep one shard 3.6% busy.
