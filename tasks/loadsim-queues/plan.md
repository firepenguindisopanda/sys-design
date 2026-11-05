# Implementation Plan: `loadsim-queues`

Spec: [SPEC-loadsim-queues.md](../../SPEC-loadsim-queues.md) (approved 2026-11-05). Capability
map: [CAPABILITY-MAP-dataflow-sim.md](../../CAPABILITY-MAP-dataflow-sim.md). Task checklist:
[todo.md](todo.md). Branch: `feat/loadsim-queues`, from `main` (`9aad70c`).

## Overview

- **Graph:** a compute instance that has an edge to a queue in `queue` mode sends its
  queued requests there. Queued means writes, plus every request of a feature with slow
  work. From the queue, a job's path runs through the consumer workers, then on through
  later stages or to the database.
- **Model:**
  - a queued request is answered at the queue;
  - the job carries on with its own totals and timings;
  - queues and workers get stations;
  - jobs never time out;
  - the drain covers job backlogs for at most one more window.
- **Brief:** an optional `batch` per feature in the `load` block. New pilot blocks for
  `lab-autograder` and `lab-monitor`.
- **Page:** queue and worker gauges, a "Background jobs" summary block, queue and worker
  rows in the table. The playback already covers the drain.

## Dependency graph

```
T1 tests: graph, model, scenario/validate `batch`, pilots, page (failing)
        │
        ├──────────────────────┐
        ▼                      ▼
T2 brief `batch`:         T3 graph: job paths, stages, slow-work split,
   types, validator,         queue notes, notSimulated
   featureLoads, docs          │
        │                      ▼
        │                 T4 model: job hops and stations, answer at the queue,
        │                    job totals and timings, drain cap, frames, summary data
        └──────────┬───────────┘
                   ▼
T5 calibration gate: probe, autograder and lab-monitor `load` blocks,
   pilot table ── stop and report if a pilot expectation can't be met realistically
                   │
                   ▼
T6 page: gauges, Background jobs block, table rows, reduced-motion text
                   │
                   ▼
T7 docs, full checks, probe before/after, browser checks, Lighthouse, performance
```

T2 and T3 can go in either order after T1. The page waits for T5.

## Architecture decisions

### Paths: a job is the rest of the request's path (`graph.ts`, `types.ts`)

- **No second graph.** A queued class's path is one tree, as in slice 1:
  client → … → compute → **queue** → worker → (database | next queue → worker …).
- **A new field on `PathStep`, `job`:** true for the queue step and everything after it.
  The model reads it to tell the two parts apart.
- **Where queued requests go.** In `dataSteps(computeId, feature, op)`: if this instance
  has edges to queues in `queue` mode, and the request is queued (`op === "write"`, or the
  feature has `backgroundWorkMs`), the next steps are its queues, split evenly, instead of
  the database.
  - Reads of a slow-work feature skip the cache too: every request of that feature is a
    job.
  - **Refinement of the spec:** the spec says the *pool* hands off. Each instance uses its
    *own* queue edges, so every dot travels an edge that's really drawn. In every fixture,
    all instances of a pool share the same queues, so the results are the same. An
    instance in a handing-off pool with no queue edge of its own keeps the slice 1 path.
- **Consumers.** A queue's next steps are the task workers it has an edge to, split evenly.
  - A queue with no worker is a leaf: its jobs are never done.
  - A queue's edge to compute (pub/sub style) is ignored. Only `queue` mode is followed.
- **Stages.** At a worker:
  - if it has edges to `queue`-mode queues that lead to workers, the job passes on;
  - otherwise, if the feature stores data and the worker has database edges, the job
    writes (op `write`, split evenly);
  - otherwise it ends at the worker.
  - A `seen` set stops cycles, as in routing.
- **Slow-work split.** The number of worker stages on a path is known once the path is
  built. A second pass sets each worker step's `slowMs` to `backgroundWorkMs ÷ stages` and
  stores it on the step (a new optional field). With branches of different lengths, each
  branch uses its own stage count.
- **Notes** (in `graph.notes`):
  - a queue with no consumer that receives jobs gets the "no worker reading it" note. The
    count is filled in by the model, via a `{queueId}` template the summary completes;
  - a worker that ends a storing feature's job with no outgoing edge at all gets the
    "results go nowhere" note.
    - **Refinement of the spec:** the spec says "no database". But
      `notification-system/good`'s push workers have no database and do deliver, over Web
      Push. So the note needs no outgoing edge, which still catches
      `lab-autograder/bad-results-not-stored`.
- **`notSimulated`.**
  - Queues in `queue` mode, and workers fed by one, are no longer listed.
  - A pub/sub topic is listed as "(pub/sub): not simulated yet".
  - Worker edges to external APIs or clients are already covered by the external-API and
    push entries.

### Model: one stepping loop, two kinds of hop (`model.ts`)

- **Hops** carry `job` from their step. A request hop whose children are job hops (the
  compute → queue hand-off) is where the client is answered. For request accounting, its
  answered share is `servedOut` at the **queue hop**: the client is answered once the job
  is accepted.
- **Two latency maps:**
  - `latency` (requests): queue hops add their base time (1 ms hop + 2 ms enqueue) plus the
    queue station's wait, then answer.
  - `jobLatency`: for job hops, timing restarts at the queue hop's answer. A job's time is
    the time from queued to its leaf (worker or database).
- **Stations:**

  | Station | Budget (ms/s) | Cost per job | Servers | Times out? |
  |---|---|---|---|---|
  | Queue | 1000 | 1000 ÷ 3,000 ms (3,000 messages/s) | 1 | no |
  | Worker | `concurrency × 1000` (no ceiling) | 5 ms + `slowMs` | `concurrency` | no |
  | Database (job writes) | as today | `writeDbMs ÷ batch` | as today | requests only |

  All figures go into `capacities.ts` under `queue` and `worker`, with comments.
- **No timeouts for jobs.** Job entries keep waiting, because the worker retries. The
  timeout step still measures *all* the work waiting at the station, jobs included,
  because a request waits behind every job in front of it. When that's over the limit, it
  drops only request entries, enough to bring the total back to the limit, or all of them
  if that isn't enough. A database shared by both counts job work in its utilisation and
  waits, so worker writes slow the API's queries, and a write backlog can time them out.
- **How long a job waits** (added in Task 4). Workers measure waits first in, first out:
  a job taken now waited since the step when the arrivals first reached the total taken
  so far. Requests keep the backlog's drain time, which is close enough when waits are
  capped at 5 s.
- **Where jobs wait.** In the model, jobs back up at the **worker** station, which is the
  slow one. The frame reports that backlog on the **queue** node they came from, because
  that's where the jobs really sit, and the queue's gauge shows it. The worker's frame
  shows its utilisation and jobs done.
- **Dots on job edges.** An edge into a worker carries the jobs the worker *takes* in the
  step, not the ones arriving, so a growing backlog shows as more dots into the queue than
  out of it. Other edges keep slice 1's rule: what arrives at the hop. The worker →
  database edge carries jobs, so batching doesn't thin its dots.
- **Never done.** Jobs reaching a queue with no consumer are added to a running count on
  that queue (in `frame.nodes[queue].backlog` and the summary). They are never served.
- **Drain.** The loop keeps stepping while either:
  - request backlog > EPS, for at most `MAX_DRAIN_STEPS` as today; or
  - job backlog > EPS, for at most `STEPS` extra steps (one window, decision 2).

  Afterwards, request leftovers fail as today, and job leftovers count as **still waiting**.
  `windowSteps` already marks the window, and the playback bar already says "draining"
  after it.
- **Saturation notes.**
  - Worker and queue stations never become `firstSaturation`: a busy worker is the point of
    a queue.
  - Instead, each queue gets its own record: `fellBehindAt` (the first step its consumers
    hit 100%), `peakBacklog`, `peakAt` and `emptyAt`.
- **Determinism and cost.** Job hops add at most a few hops per queued class. The 1,000,000
  request check (one run under 2 s) stays.

### Summary (`types.ts`, `summary.ts`)

- **`Summary.jobs`:**
  ```
  {
    queued, done, stillWaiting, neverDone,
    p50Ms, p95Ms,
    perQueue: Record<id, {
      queued, done, stillWaiting, neverDone,
      peakBacklog, peakAt, emptyAt, fellBehindAt
    }>,
  } | null
  ```
  It's null when the design has no jobs.
- **Notes from `perQueue`**, in the spec's wording, for example "Sandbox workers fell
  behind at 0:40. The queue peaked at 312 jobs and was empty again by 7:10."
- **`NodeSummary` is unchanged in shape.** A queue's `peakBacklog` is its jobs, and a
  worker's `peakUtilisation` is real.

### Brief `batch` (`challenges/types.ts`, `validate.ts`, `scenario.ts`)

- `BriefLoad.features[id].batch?`: a whole number from 1 to 1,000, validated with the
  file-and-path message style.
- `FeatureLoad.batch`: defaults to 1. It applies only to job writes; API writes are
  unaffected.

### Page (`src/components/loadsim/`)

- **`gaugeText`** gains two cases, by node kind:
  - **queue:** "Empty", "312 waiting", or "312 waiting · nobody reads it". It reads the
    frame backlog and the summary's `neverDone`.
  - **worker:** "{n}% busy · {k} of {c} slots".
- **`nodeStatusAt(run, id, kind, step, failedSoFar, notSimulated)`:** a pure helper that
  `LoadNode` calls. It reads the frame, the queue's "nobody reads it" state from the graph,
  and the worker's `concurrency`, so a real run's gauge text can be tested without
  rendering the canvas.
- **`announcementFor`:**
  - "Requests stopped arriving; the queues are draining." when playback crosses
    `windowSteps` with jobs still waiting;
  - "Playback finished: X% of requests served, N of M jobs done." at the end of a run that
    had jobs.
- **`RunSummary`:** a "Background jobs" block when `summary.jobs` isn't null. It shows
  queued, done, still waiting and never done, typical and slowest time to done
  (formatted as seconds or minutes), and the queue notes.
- **`NodeStatsTable`:** queues and workers are no longer "not simulated". For a queue,
  "First saturated" shows `fellBehindAt`.
- **`FlowEdge`:** no change. Job hops fill `frame.edges` like any hop, so dots appear on
  compute → queue → worker → database. Reduced motion already shows rates as text.

## Risks

| Risk | Mitigation |
|---|---|
| The autograder's reference design can't drain within one more window at a realistic rush, because its fixture's workers keep the default concurrency of 4 | T5 sizes the pilot's `load` block (requests and window) to a realistic deadline rush the design can absorb. If none exists, stop and report, rather than raise numbers |
| `lab-monitor` shows no difference at a realistic load, since one shard takes about 175 writes/s | T5 picks the block's load and `batch` from realistic figures, and reports if the difference is only "busier", which is allowed by slice 1's realism decision |
| Exempting job entries from timeouts changes request results at a shared database | Only designs with jobs can change. The probe diff in T7 must show that no design without a `queue`-mode queue moves |
| A longer drain makes playback longer (up to 60 s at 1×) | Accepted (decision 2). The bar already labels the drain |
| A hop that answers a request but also has children breaks `remainder` accounting | A dedicated `answersAt` flag, not `remainder`, plus a conservation test over every fixture for both requests and jobs |

## Verification at the end

- `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build` all pass.
- Probe before and after (saved in the scratchpad): only designs with a `queue`-mode queue
  that receives jobs move.
- In Chrome DevTools at 1440×900:
  - `lab-autograder/good`: the queue fills and drains, and the workers are busy;
  - `bad-no-worker`: jobs pile up, with the note;
  - `course-registration/good`: unchanged apart from the enrol jobs.
- Lighthouse 100 on `/simulate`, and a smooth production-build trace with the tab in front.
