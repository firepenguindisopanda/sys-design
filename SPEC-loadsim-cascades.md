# Spec: load simulation, slow work and cascades (`loadsim-cascades`)

Status: **approved** (2026-11-05). Open questions 1–4 are all as recommended:
1. the brief marks slow work as `cpu` or `wait`, defaulting to `wait`;
2. each instance has 80 request slots and 10 database connections;
3. external calls are simulated only where the brief sets `apiMs`;
4. a request whose answer would take over 5 s fails as `too-slow`.

Amended after review (2026-11-05):
- holding times are smoothed over 5 steps (replaced in Task 4 by solving admission each
  step; see section A);
- a `too-slow` failure counts against the instance holding the request;
- a rule says which limit binds, and when a cascade note appears;
- the gauge has one format;
- functions keep 80 slots until autoscaling;
- `apiMs` waits for the brief rollout;
- the 32 designs that "too slow" moves, and the six with slow work in the request, are
  listed in section A.

Amended in Task 1 (2026-11-05): the slot-cascade demo moves from the autograder to
`notification-system/bad-sync-delivery`. With grading marked `cpu`, the autograder's
instances run out of CPU at about 30:36, long before slots: a 3 s hold allows about 26
requests a second per instance, and each sees about 5. The autograder still shows grading
filling the API, through its CPU gauge.

The next module in [CAPABILITY-MAP-dataflow-sim.md](CAPABILITY-MAP-dataflow-sim.md), after
queues ([SPEC-loadsim-queues.md](SPEC-loadsim-queues.md)) and failures
([SPEC-loadsim-failures.md](SPEC-loadsim-failures.md)). Branch: `feat/loadsim-cascades`,
from `main` (`a844a4d`).

## Objective

Several briefs teach "don't do slow work while the user waits", and the load page can't
show it yet:
- **Slow work inside the request:** a feature's `backgroundWorkMs`, when its compute
  doesn't hand it to a queue, is listed under "Not simulated yet". So
  `lab-autograder/bad-sync-grading` (3 s of grading inside the API) looks as healthy as
  the reference design on the load page.
- **External API calls** are listed as not simulated, so a slow payment provider or AI
  service costs nothing.
- **Nothing limits how many requests an instance works on at once.** In real systems, a
  slow database or a slow call holds a thread and a database connection. When they run
  out, requests pile up in front of the instance, and the tier upstream fails too, even
  for features that don't touch the slow part. That's the cascade, and it's why one slow
  dependency takes a whole site down.

After this module, a student should **see**:
- **Grading inside the request** fill the API: submissions use up its CPU, and near the
  deadline, browsing and checking results time out too.
- **Waiting inside the request** run out the API's slots: sending pushes one by one holds
  each request for 2 s, so publishing an alert and changing preferences time out too.
- **A saturated database** back up into the API: its connections stay busy longer, the
  instances' connection pools run out, and requests time out at the API, not only at
  the database.
- **A slow external call** hold slots, so a few seconds per call caps how many requests an
  instance can serve, however many vCPUs it has.

The page still gives no verdict.

## Change

### A. The model (`src/lib/loadsim/`)

**Two limits per compute instance** (open question 2):
- **Request slots:** an instance works on at most 80 requests at once, Cloud Run's default
  concurrency. A request holds a slot from arriving at the instance to its answer
  leaving: its compute, its database time (including waits there), any slow work done
  inline, and any external call.
- **Database connections:** each instance has a pool of 10 connections, a common default.
  A request holds one for its database time, including waiting at the database.

Both are admission limits. In a step, an instance admits no more requests than a free
slot (and, for database requests, a free connection) allows, given how long requests
are holding them. The rest wait in front of the instance, and time out after 5 s like
any wait.

**How long requests hold a slot** depends on the waits downstream, and those depend on
how many requests the instances admit. So admission is solved each step: every instance
admits what its slots and connections allow, given the waits that its own admission (and
the other instances') causes downstream this step. (Amended in Task 4: smoothing holds
over the last 5 steps swung in a 1.8 s cycle between about 30 and 2,000 admitted a
second. Any look back at past steps lags, and near a database's capacity the feedback is
too strong for an average to damp.) The model stays deterministic, and a test checks that
a steady overload gives a steady admission rate.

**Connections limit only database requests.** A request that doesn't use the database
isn't held back when the pool is full; requests that do wait for a connection, up to the
timeout, at their instance.

**The limit that binds.** For each instance at each step, the model records which limit
held it back: CPU, slots or connections (or none). The gauge, the table and the notes all
read that record.

**Cloud functions and edge compute** get the same 80 slots for now. In reality a
function handles one request at a time and scales out, which belongs with autoscaling
(`loadsim-delivery`). The page's "Not simulated yet" list already names autoscaling for
them.

**Slow work inside the request** (open question 1). A feature with `backgroundWorkMs`
whose compute doesn't hand the request to a queue does the work inline. The brief says
which kind it is, with a new per-feature `slowWork` in the `load` block:
- **`cpu`** (running tests, transcoding, making thumbnails): it costs CPU at the
  instance, like `computeMsPerRequest`, and holds a slot meanwhile;
- **`wait`** (crawling pages, waiting on another service), the default: it costs no CPU
  but holds a slot for its whole time.

**External API calls** (open question 3). A new per-feature `apiMs` in the `load` block:
a feature with it calls an external API in the request, if its compute has an edge to
one. The call takes `apiMs` (no capacity limit on the provider), holds a slot, and adds
to the answer time. A job's call from a worker holds the worker's slot in the same way.
Without `apiMs`, calls stay unsimulated, as now.

**Too slow to answer** (open question 4). A request whose answer would take longer than
the 5 s timeout fails as `too-slow`. It's counted against the **instance holding it**,
where the client gave up waiting: "Gave up on Lab API 1: answers took over 5 s." The
instance's note names what made it slow downstream, if anything did. Today a request
that waits under 5 s at each stop, but takes longer overall, still counts as served.
Jobs are never too slow: nobody is waiting on them.

Inline slow work or an external call that alone takes 5 s or more always fails as
`too-slow`, however quiet the system is. A browser or load balancer would give up on it
too.

**Giving up while waiting** (amended in Task 4). A client gives up once its answer would
take over 5 s, not after 5 s at one stop. So a request waits at a stop only as long as
what's left of the 5 s allows: after the time it took to get there, its work there, and
its slowest way on to an answer. Where several kinds of request share a stop, its backlog
holds no more than the least patient of them allows. Those that can't wait time out there,
as before. In a steady overload, what times out is then just the excess over capacity, and
every request served still answers in time. `too-slow` is left for answers that pass 5 s
anyway: slow work or a call too long to fit, or queueing for a CPU that's already
saturated by long requests.

Without this, each stop held a full 5 s of backlog, so nearly every answer served from it
passed 5 s by a few milliseconds. `course-registration/bad-no-cache` served 59.5% instead
of 92.6%, and a steady overload served almost nothing successfully. With it,
`bad-no-cache` serves 90.4%.

**What doesn't change:**
- capacities, and the queues and outages modules;
- workers: their `concurrency` already works as slots.

**What moves, and why** (measured on `main` at `a844a4d`, before any change):
- **"Too slow" moves 32 of the 86 fixture designs.** Today their slowest 5% of answers
  take 5.1 to 6.3 s: requests that waited just under 5 s at a saturated server, plus
  their other stops. Those become `too-slow` failures, so the failed counts rise and the
  slowest-5% figure stays under about 5 s.
  - Nearly all 32 are in briefs still on the generic default load, reference designs
    included: campus food guide, chat, course assistant, file storage, lecture video
    library and textbook price watch.
  - From the pilots, only `course-registration/bad-no-cache` moves.
  - They settle when each brief gets a calibrated `load` block (`brief-load-rollout`).
- **Six designs do slow work inside the request:**
  - **The autograder** marks its grading as `cpu`.
  - **The link checker and video library** (60 s each) fail every such request as
    `too-slow`.
  - **Notifications and price watch** (2 s, waiting) hold slots. Notifications runs out
    of them during the spike. Price watch's single function runs out of CPU first (417%,
    with about 59 of 80 slots in use).
  - **The photo wall's thumbnails** really are CPU work, but count as waiting until its
    brief gets a `load` block.
- **Designs where a slot or connection limit now binds**, listed by the probe diff.

**Probe check:** the last task diffs the probe against `a844a4d` and records every design
that moved, under one of the reasons above. Any other move is a bug.

### B. The brief `load` block

- **`slowWork: cpu | wait`** per feature: optional, default `wait`. It only matters for a
  feature with `backgroundWorkMs`.
- **`apiMs`** per feature: optional, a number of ms from 1 to 60,000.
  - **No brief sets it in this module.** The four briefs with external APIs
    (`printing-credits`, `course-assistant`, `course-link-checker`, `textbook-price-watch`)
    have no `load` block yet. They get `apiMs` with their calibrated blocks in
    `brief-load-rollout`. Until then, a hand-built test is the only thing exercising
    external calls.
- **The pilot `lab-autograder`** sets `submit-solution: { slowWork: cpu }`. Grading runs
  the student's code, so it's CPU.
- **`docs/challenges/brief-format.md`** documents both fields.

### C. The page

- **Gauges:** an instance's text names the limit that binds, then any failures, in one
  format:
  - CPU: "Saturated · 1,204 failed", as today;
  - slots: "Saturated · 80 of 80 slots · 1,204 failed";
  - connections: "Waiting for a database connection · 1,204 failed".
- **Failures:** the summary's failure list adds the `too-slow` group, and each timeout
  group says where requests piled up.
- **Notes, one per cascade.** An instance gets a note when slots or connections, not CPU,
  were its binding limit for at least one step. The note names:
  - the first moment it happened;
  - the feature holding the most slot time (for slots), or the database keeping
    connections busy (for connections);
  - the other features whose requests failed at that instance.

  For example:
  - "Alerts API 1 ran out of request slots at 0:00: Fan out alert's 2 s of slow work held
    them. Requests for Publish alert and Alert preferences timed out there too."
  - "Registration API 1's database connections were all busy from 0:20, because
    Registration DB was saturated. 1,840 requests timed out there, not at the database."
- **"Not simulated yet"** stops listing slow work and external calls the module now
  simulates.

## Pilot expectations (checked by tests)

Under each pilot's default load:

| Fixture | Expected |
|---|---|
| `lab-autograder/bad-sync-grading` | The API instances saturate before the deadline, and requests time out there. Browse exercises and View result fail too, so far more fail than in `good`, where nothing does |
| `lab-autograder/good` | Unchanged: grading is on the queue |
| `notification-system/bad-sync-delivery` (default load, no block) | Both API instances run out of slots from 0:00, during the spike: Fan out alert's 2 s of waiting needs about 153 slots each, while CPU runs at about 95%. Each gets a slot cascade note naming Fan out alert, with Publish alert and Alert preferences failing there too |
| `course-registration/bad-no-cache` | Timeouts at the API instances as well as at the database, because their connection pools are full. The database's own backlog is smaller than today |
| `course-registration/good`, `link-shortener/*`, `lab-monitor/*` | Unchanged: no limit binds, and no answer passes 5 s |
| `lecture-video-library/bad-sync-transcode` (default load, no block) | Every Upload recording request fails as `too-slow`: 60 s of slow work in the request |
| A hand-built design with an external call of `apiMs: 2000` | Each instance serves at most about 40 req/s (80 slots ÷ 2 s), however many vCPUs it has |

## Tests (written first)

- **Model:**
  - **slots:** 80 slots and 2 s holds give about 40 req/s per instance, and excess
    requests wait, then time out;
  - **connections:** a 10-connection pool and 100 ms database holds give about 100 db
    req/s per instance;
  - **cascade:** a saturated database lengthens holds, so the pool fills and timeouts
    appear at the instance;
  - **inline slow work:** `cpu` costs CPU and holds slots; `wait` holds slots only;
  - **external call:** adds to the answer time and holds a slot;
  - **too slow:** a request whose answer would pass 5 s fails as `too-slow`, counted
    against the instance holding it;
  - **jobs** are never too slow;
  - **5 s or more** of inline slow work or an external call always fails, even with no
    load;
  - **steady holds:** a steady overload gives a steady admission rate, with no step
    swinging more than 10% from its neighbours once it settles;
  - **binding limit:** each instance's record says CPU, slots, connections or none;
  - **unchanged:** designs where no limit binds and no answer passes 5 s give identical
    results;
  - **conservation and determinism** still hold, with outages too.
- **Brief:** `slowWork` and `apiMs` are validated and default correctly.
- **Pilots:** the table above.
- **Page:**
  - the gauge's one format for CPU, slots and connections, each with failures;
  - the `too-slow` failure;
  - a cascade note appears only when slots or connections bound, and names the holder
    and the other features that failed.

## Boundaries

- **Unchanged:** the engine, the rules, the verification panel, the fixtures and the
  editor.
- **Not in this module:**
  - rate limits on external APIs;
  - retries and back-off;
  - autoscaling, push and files (`loadsim-delivery`);
  - per-language thread models. The 80 and 10 are one realistic default each.

## Success criteria

- The pilot expectations hold. Every existing load test still passes, or moves only for
  one of the reasons in "What moves, and why", with the reason recorded.
- All tests, `tsc`, lint and `next build` pass. Lighthouse on `/simulate` stays at 100,
  playback at 60 fps, and a switch-off re-run under 100 ms.
- In the browser, `lab-autograder/bad-sync-grading` shows the API's CPU filling up near
  the deadline, with Browse exercises failing alongside it.
- In the browser, `notification-system/bad-sync-delivery` shows the slot gauge and the
  slot cascade note during the spike.

## Results (2026-11-06)

Built on `feat/loadsim-cascades` in seven tasks. The plan and task notes are in
[tasks/loadsim-cascades/](tasks/loadsim-cascades/).

- **Pilots** (all pilot tests pass, under each brief's default load):

  The first three were checked in the browser; the last only by its test.

  | Fixture | Result |
  |---|---|
  | `lab-autograder/bad-sync-grading` | Lab API 1 saturates at 30:36 ("Saturated · 515 failed" by 32:00, CPU, so no slot text). 22.8% served; 4,677 at each API are given up on as too slow, and 2,119 time out waiting |
  | `notification-system/bad-sync-delivery` | Both instances read "Saturated · 80 of 80 slots" from 0:00. The headline advises a queue or more instances, and the slot note naming Fan out alert's 2 s of slow work, and Publish alert and Alert preferences failing there too. 76.4% served |
  | `course-registration/bad-no-cache` | Both instances read "Waiting for a database connection"; 4,563 time out at each, and 512 at the database. The headline names the database and a cache. 90.4% served (92.6% before) |
  | `lecture-video-library/bad-sync-transcode` | Every 60 s upload fails as too slow |

- **Changed from the draft** (each in the task notes, with your approval):
  - the slot demo moved from the autograder to notifications, because grading is `cpu`
    and its CPU binds first;
  - admission is solved each step instead of smoothed over 5 steps, which swung;
  - connections hold back only database requests;
  - a request waits at a stop only as long as its answer can still come back in 5 s;
  - an instance held back by its connections is never the headline;
  - an instance out of slots when it saturates gets its own headline: "all 80 of its
    request slots are held. Move the slow work to a queue, or add instances behind a
    load balancer", instead of advice to add vCPUs;
  - the connection note says "timed out there, not at the database", and
    "while {db} was N% busy" when the database never saturates.
- **What moved:** 36 of 86 designs, each for a reason in "What moves, and why", and
  nothing else: all 32 already over 5 s (each by at most 0.1 points of served), plus the
  4 with only inline slow work.
- **Checks:**
  - 1,381 tests pass, 2 skipped;
  - `tsc`, lint and `next build` are clean;
  - Lighthouse on `/simulate` is 100 for accessibility, best practices, SEO and agentic
    browsing, on a fresh load and with an outage in place;
  - playback holds 60 fps (p95 frame 17 ms);
  - no console errors.
- **Timing:** solving admission each step made every run slower. Two speed-ups, one
  bit-identical and one within the solve's tolerance (at most 3.6 × 10⁻⁶ relative on
  any number, probe unchanged), brought `bad-no-cache` from 134 to 38 ms in node. A
  switch-off re-run, click to second frame in the browser:
  - the pilots: 51 to 100 ms (`course-registration/bad-no-cache` 51–94,
    `lab-autograder/good` 55–100, `notification-system/bad-sync-delivery` 53–78);
  - **`lecture-video-library` is over:** 124 to 180 ms, against 91 to 152 ms at
    `a844a4d`. It was already over 100 ms before this module; its 1,200 steps and 204
    hops make the per-step work count.

## Open questions

1. **Slow work inside the request: CPU or waiting?**
   - **Recommended:** the brief says per feature (`slowWork: cpu | wait`), defaulting to
     `wait`. Grading and transcoding are CPU, and crawling and calling services are
     waiting. They teach different things: CPU work saturates the instance, waiting runs
     out its slots.
   - The alternative is to treat all slow work as CPU. It's simpler, but a 60 s crawl
     would cost 60 s of CPU, which isn't realistic.
2. **The limits.**
   - **Recommended:** 80 request slots per instance (Cloud Run's default concurrency), and
     10 database connections per instance (a common pool default).
   - The alternative is slots only, with no connection pool. It's simpler, but then a
     slow database can't back up into the API, which is the main cascade.
3. **External API calls.**
   - **Recommended:** a per-feature `apiMs` in the brief's `load` block; without it,
     calls stay unsimulated.
   - The alternative is a default (for example 300 ms) for every feature on a compute node
     with an external API edge. It needs no brief changes, but it charges calls to
     features that don't make them.
4. **Requests that take too long overall.**
   - **Recommended:** a request whose answer would take over 5 s fails as `too-slow`.
     Clients give up whether the time was spent waiting or being served.
   - This moves existing results: 32 of the 86 designs (see "What moves, and why" in
     section A).
   - The alternative is to keep today's rule, where only a wait over 5 s at one stop
     fails.
