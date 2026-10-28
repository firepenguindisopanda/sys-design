# Spec: Phase 4, new briefs

Status: **approved** (2026-10-28) with all three proposals: these four briefs, keep course
registration, and spec → plan → tasks with a review stop after `lab-autograder`.
Plan: [tasks/plan.md](tasks/plan.md).
Phase 4 from HANDOVER ("new briefs"). Content only: briefs and fixtures in `challenges/`,
plus docs. Branch: `feat/phase4-briefs`, from `main` (`c84db82`).

## Objective

Students have four challenges. Add **four more**, each teaching a pattern none of the
current four covers, so a semester has eight distinct exercises. Every new brief must
give real feedback: its main lesson has to be something the engine or a brief rule can
check, not only a reflection question.

Users: students practising; you, setting challenges for the software architecture
course.

## What's covered today

| Brief | Lesson the checks enforce |
|---|---|
| Campus link shortener | Read scaling: load balancer, cache on the read path, replicated database |
| Course group chat | Real-time over WebSocket; servers publish to and subscribe from a queue |
| Assignment submission store | Large files in object storage, records in a database, CDN for downloads |
| Campus alerts | Async fan-out: queue, task workers, Web Push sent server → client |

**Not yet covered:** long-running jobs with stored results, contention under a burst,
IoT devices as clients, Server-Sent Events, calling an external API from the server,
and write bursts.

## How starters were chosen

From the 28 `architect-it` starters not yet adapted
(`nvidia_genai/architect-it/src/shared/starters.ts`), a starter qualifies when:

1. **Checkable:** its main lesson maps to components and connections the engine or a
   rule can test. Starters whose core is an algorithm or a data structure (top-K,
   distributed cache, rate limiter, collaborative editing, search ranking) don't.
2. **Campus-scale:** it rewrites naturally as something a UWI student recognises, at
   the scale the engine's capacity model is tuned for.
3. **New:** it adds a pattern from the "not yet covered" list above.
4. **Teachable by single flaws:** at least three bad designs, each missing one thing,
   that the checks catch.

## Proposed briefs

Numbers (RPM, NFR targets) are set during calibration against each good design, as in
phase 1, and aren't fixed here. Rule ids are provisional; every rule gets a `title`.

### 1. `lab-autograder`: Programming lab autograder (from `leetcode`)

**Scenario.** Students submit code for weekly programming labs. Each submission is
compiled and run against hidden tests in an isolated sandbox, and the result shows up
within seconds. Submissions spike in the hour before a lab closes. Out of scope:
plagiarism checks, contests, discussion.

**Requirements.** `browse-exercises` (read exercise text), `submit-solution` (accept,
store, queue for grading), `view-result` (look up status and score).

**Lesson: long-running work goes to a queue and workers, and results are stored.**

| Rule | Checks | Severity |
|---|---|---|
| `grading-queued` | compute → message queue | fail |
| `workers-run-tests` | message queue → task worker | fail |
| `results-stored` | task worker → database | fail |
| `no-client-to-db` | client ↛ database (forbidden) | fail |

**Bad fixtures:** `bad-sync-grading` (the API runs the tests itself, no queue),
`bad-no-worker` (queue with nothing consuming it), `bad-results-not-stored` (worker not
connected to the database), `bad-client-to-db`.

### 2. `course-registration`: Course registration rush (from `ticketmaster`, `flash-sale`)

**Scenario.** Registration opens at 8:00. Thousands of students refresh the section
list and try to add the same popular sections at once; a section must never go over
its seat limit. Out of scope: fees, waitlists, prerequisites checking.

**Requirements.** `browse-sections` (read-heavy, with seats left), `enrol` (claim a
seat), `view-timetable`.

**Lesson: absorb the read spike with a cache, and serialise seat claims through a
queue so they can't race.**

| Rule | Checks | Severity |
|---|---|---|
| `catalog-cache` | compute → cache | fail |
| `enrol-queued` | compute → message queue | fail |
| `seat-worker` | message queue → task worker | fail |
| `db-replicas` | a database with `replicas ≥ 2` | fail |
| `no-client-to-db` | client ↛ database | fail |

**Bad fixtures:** `bad-no-cache` (fails throughput as well as the rule),
`bad-direct-enrol` (API writes seats straight to the database), `bad-single-db-replica`,
`bad-client-to-db`.

**Limit:** the checks see the *structure* (claims go through one queue and worker), not
whether the worker's seat check is atomic. Overselling, transactions and holds are in
the reflection questions. See open question 2.

### 3. `shuttle-tracker`: Campus shuttle tracker (from `uber`)

**Scenario.** GPS units on the campus shuttles report their position every few seconds.
Students open a map and see shuttles move live, with an ETA for their stop. Out of
scope: ticketing, driver apps, route planning.

**Requirements.** `report-location` (from the shuttle's GPS unit), `live-map` (push
positions to students), `stop-eta`.

**Lesson: IoT devices are clients too, and live updates are pushed server → client.**

| Rule | Checks | Severity |
|---|---|---|
| `shuttles-report` | IoT device → compute | fail |
| `live-positions` | compute → mobile/desktop over SSE or WebSocket | fail |
| `latest-in-cache` | compute → cache (latest positions in memory) | fail |
| `no-client-to-db` | client ↛ database | fail |

The engine's `topo-sse-dir-<edge>` already warns when an SSE edge is drawn the wrong
way.

**Bad fixtures:** `bad-polling` (students fetch positions over plain HTTP),
`bad-sse-wrong-direction` (SSE drawn client → server), `bad-no-cache`,
`bad-client-to-db`.

### 4. `course-assistant`: Course Q&A assistant (from `chatgpt`)

**Scenario.** Students ask questions about the course notes. The answer comes from an
external AI model's API and streams in word by word; past conversations are kept. The
API key must never reach the browser. Out of scope: training a model, grading,
uploading documents.

**Requirements.** `ask-question` (send a question, stream the answer), `history`
(list and reopen past conversations).

**Lesson: call paid third-party APIs from the server, and stream long responses.**

| Rule | Checks | Severity |
|---|---|---|
| `llm-from-server` | compute → external API | fail |
| `no-client-to-llm` | client ↛ external API (forbidden) | fail |
| `stream-answers` | compute → mobile/desktop over SSE | fail |
| `history-db` | compute → database | fail |

The engine's `topo-api-keys-<edge>` also warns when a client calls an external API.

**Bad fixtures:** `bad-client-calls-llm` (the browser calls the model, so the key is
exposed), `bad-no-streaming` (HTTP only), `bad-no-history`, `bad-client-to-db`.

### Alternates, if you'd rather swap one

- **`lecture-video-library`** (from `youtube`): upload recordings, transcode with
  workers, stream through a CDN. A good exercise, but mostly combines the submission
  store (object storage, CDN) and alerts (queue, workers).
- **`lecture-check-in`** (from `ad-click-aggregator`): every student checks in during
  the first two minutes of a lecture; a queue absorbs the write burst. The only
  write-scaling option, but the engine's write model is rough, so calibration may
  struggle.

## How each brief is built

The steps in `docs/challenges/brief-format.md` ("Adding a brief"), once per brief:

1. `brief.yaml`, rewritten in my own words with `source` naming the starter;
   campus-scale numbers; reflection questions on what the checks can't see.
2. `fixtures/good.yaml`, then calibrate with the probe so it passes with 15–30 %
   headroom on throughput and cost. Change the design or the targets, never the engine.
3. The bad fixtures listed above, each one change from the good design.
4. `npx vitest run -t <id>`; anything the engine gets wrong is written as the
   expectation it *should* meet, with `knownGap` explaining why it doesn't.
5. `docs/challenges/phase1-findings.md` gets a phase 4 section: what the engine
   catches by itself and what only the rules catch, per brief.

The first brief is built end to end and reviewed before the other three, as in
phase 1, so problems with the approach show up once rather than four times.

## Verification

- `npm test`: every new fixture meets its `expect` (or is a documented `knownGap`);
  existing fixtures and `tests/demos.test.ts` unchanged.
- `npm run build`: all eight briefs validate.
- `npx tsc --noEmit`, `npm run lint`.
- Browser: each new brief opens from the picker with its Brief tab; importing its
  `good.yaml` passes and one `bad-*.yaml` fails the rule it names (design-io makes this
  a file pick).

## Boundaries

- **Always:** campus-scale scenarios; text rewritten, never copied; `source` on every
  brief; single-flaw bad fixtures; targets calibrated against the good design.
- **Ask first:** any engine change (including fixing a gap a new brief exposes); new rule
  types or validator fields; new component kinds; more or fewer than four briefs.
- **Never:** weaken an existing fixture's expectations; change the four existing briefs'
  numbers; use text from `agentic_srs/system_design_concepts/` or the book PDFs.

## Success criteria

1. Four new briefs load in the picker and validate in the build.
2. Each has a passing good design and at least three bad designs, each caught by its
   intended check (or marked `knownGap` with a reason).
3. The findings doc says, for each new brief, what the engine catches alone.
4. Tests, types, lint and build pass, with existing results unchanged.

## Open questions

1. **These four?** Proposal: autograder, registration rush, shuttle tracker, Q&A
   assistant. Together they add queue-and-worker jobs with stored results, contention
   structure, IoT clients, SSE, and server-side API calls. Swap in an alternate if you
   prefer.
2. **Registration's contention lesson is only partly checkable.** Proposal: keep it.
   The checks enforce the structure that prevents races (one queue, one consumer), and
   it's the most familiar scenario for UWI students. The atomic seat check goes in the
   reflection questions. Alternative: replace it with `lecture-video-library`.
3. **Process.** Proposal: the usual spec → plan → tasks, one branch, one commit per
   brief, and a review stop after the first brief (`lab-autograder`).
