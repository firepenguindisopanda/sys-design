# Spec: Phase 5, more briefs

Status: **approved** (2026-10-28) with all three proposals: these four briefs, the external
API hop fix in this branch, and the phase 4 process with a review stop after
`campus-food-guide`. Plan: [tasks/plan.md](tasks/plan.md). Content only (briefs and fixtures in `challenges/`, plus
docs), except one possible engine fix (open question 2). Branch: `feat/phase5-briefs`, from
`main` (`af052cf`). Findings 10 and 7 come after this phase.

## Objective

Students have eight challenges. Add **four more**, each teaching a pattern none of the eight
covers, so a semester has twelve distinct exercises. As in phase 4, each brief's main lesson
has to be something the engine or a brief rule can check, not only a reflection question.

Users: students practising; you, setting challenges for the software architecture course.

## What's covered today

| Brief | Lesson the checks enforce |
|---|---|
| Campus link shortener | Read scaling: load balancer, cache on the read path, replicated database |
| Course group chat | Real-time over WebSocket; servers publish to and subscribe from a queue |
| Assignment submission store | Large files in object storage, records in a database, CDN for downloads |
| Campus alerts | Async fan-out: queue, task workers, Web Push sent server → client |
| Programming lab autograder | Long-running jobs on a queue and workers, with stored results |
| Course registration rush | Cache for a read spike; seat claims serialised through one queue and worker |
| Campus shuttle tracker | IoT devices as clients; positions pushed over SSE; latest values in a cache |
| Course Q&A assistant | Paid external API called from the server; answers streamed over SSE |

**Never used by any brief:** static hosting (and the engine's `topo-cdn` check), cloud
functions, VMs, edge compute and WebRTC. **Lessons not yet covered:** a static front end
served from a CDN, a media pipeline, callbacks from an outside service (webhooks), and work
split into stages.

## How starters were chosen

The same four tests as phase 4, applied to the 23 starters not yet adapted
(`nvidia_genai/architect-it/src/shared/starters.ts`): **checkable** (the lesson maps to
components and connections), **campus-scale**, **new** (adds something from the lists above),
and **teachable by single flaws** (at least three bad designs, each missing one thing).

## Proposed briefs

Numbers (RPM, NFR targets) are set during calibration against each good design and aren't
fixed here. Latency targets follow the new rule: twice the good design's latency, rounded up
to the next 10 ms (`tests/calibration.test.ts` checks it). Rule ids are provisional; every rule
gets a `title`.

### 1. `campus-food-guide`: Campus food guide (from `yelp`)

**Scenario.** A web app listing the campus food vendors: menus, prices, opening hours and
student ratings. Almost everyone checks it between 11:30 and 1:00. The app is a single-page
site (HTML, CSS and JavaScript) that calls an API for data. Out of scope: ordering, payment,
vendor accounts.

**Requirements.** `browse-vendors` (read-heavy), `view-vendor` (menu and reviews),
`post-review`.

**Lesson: serve the front end as static files from a CDN; the API serves only data, with a
cache for the lunchtime reads.**

| Rule | Checks | Severity |
|---|---|---|
| `pages-on-cdn` | CDN → static hosting | fail |
| `clients-use-cdn` | client → CDN | fail |
| `menu-cache` | compute → cache | fail |
| `no-client-to-db` | client ↛ database (forbidden) | fail |

The engine already warns about static hosting without a CDN (`topo-cdn`) and adds 40 ms of
latency for it, so with the 2× latency target the engine may catch `bad-no-cdn` by itself.

**Bad fixtures:** `bad-no-cdn` (browsers load the pages straight from static hosting),
`bad-pages-from-api` (no static hosting; the API servers send the pages), `bad-no-cache`,
`bad-client-to-db`.

### 2. `lecture-video-library`: Lecture recording library (from `youtube`)

**Scenario.** Lecturers upload recorded lectures (1 to 2 GB each). Each recording is converted
into a few qualities for phones and laptops, which takes minutes. Students stream them, most
of all in the week before exams. Out of scope: live streaming, captions, comments.

**Requirements.** `upload-recording`, `browse-lectures`, `watch-lecture`.

**Lesson: large media goes in object storage, slow conversion runs in background workers,
and playback comes through a CDN.**

| Rule | Checks | Severity |
|---|---|---|
| `recordings-in-object-storage` | compute → object storage | fail |
| `transcode-queued` | compute → message queue | fail |
| `workers-transcode` | message queue → task worker | fail |
| `renditions-stored` | task worker → object storage | fail |
| `playback-via-cdn` | CDN → object storage | fail |

**Bad fixtures:** `bad-sync-transcode` (the API converts the video itself, no queue),
`bad-video-in-db` (recordings stored in the database), `bad-no-cdn` (students stream from the
API servers), `bad-client-to-db`.

`bad-video-in-db` will be caught only by its rule: the engine still scores files in a
database better than object storage (finding 5). `bad-sync-transcode` will be caught only by
its rules until findings 10 and 7 are fixed, which gives that work one more test case.

### 3. `printing-credits`: Printing credits top-up (from `payment-system`)

**Scenario.** Students buy printing credits by card through an outside payment provider. The
student pays on the provider's own page, so card numbers never touch the university's
servers. The provider then confirms each payment by calling the system back (a webhook), and
only then are credits added. Every payment is kept in a ledger. Out of scope: refunds, the
print queue itself, campus ID cards.

**Requirements.** `start-payment` (ask the provider for a payment page), `payment-confirmed`
(the provider's webhook adds the credits), `view-balance`.

**Lesson: the server, not the browser, holds the provider's secret key; a payment counts
when the provider confirms it by webhook; money records live in a replicated database.**

| Rule | Checks | Severity |
|---|---|---|
| `provider-from-server` | compute → external API | fail |
| `no-client-to-provider` | client ↛ external API (forbidden) | fail |
| `webhook-to-server` | external API → compute or load balancer | fail |
| `ledger-replicas` | a database with `replicas ≥ 2` | fail |
| `no-client-to-db` | client ↛ database | fail |

The engine's `topo-api-keys-<edge>` also warns when a client calls an external API.

**Bad fixtures:** `bad-client-calls-provider` (the browser calls the provider with the key),
`bad-no-webhook` (credits are added when the browser says the payment worked),
`bad-single-db-replica`, `bad-client-to-db`.

**Limits:** the provider's hosted page isn't drawn (it isn't part of the student's system),
and "credit exactly once when the webhook is retried" isn't checkable; both go in the
reflection questions. **Engine issue:** the good design's payment provider has an edge in
(the server calls it) and an edge out (the webhook), so `topo-intermediate` warns that it's
"used as a hop". That is a false warning, like finding 9. See open question 2.

### 4. `course-link-checker`: Course page link checker (from `web-crawler`)

**Scenario.** Every night, a service checks every link on every course page of the
university's learning site and reports broken ones to each lecturer. A lecturer can also start
a check of one course. Fetching a page and checking its links are separate steps; a slow or
dead website must only hold up its own links. Results are kept for the semester. Out of scope:
fixing links, checking page content, pages behind a login.

**Requirements.** `start-check` (a lecturer, or the nightly run), `view-report`.

**Lesson: split a long job into stages, each with its own queue, so one slow step can't stall
the rest.**

| Rule | Checks | Severity |
|---|---|---|
| `crawl-queued` | compute → message queue | fail |
| `stage-handoff` | task worker → message queue (page fetchers pass links to link checkers) | fail |
| `workers-fetch` | task worker → external API (the sites being checked) | fail |
| `report-stored` | task worker → database | fail |
| `no-client-to-db` | client ↛ database | fail |

**Bad fixtures:** `bad-single-stage` (one set of workers fetches pages and checks links, no
second queue), `bad-sync-crawl` (the API fetches pages itself), `bad-results-not-stored`,
`bad-client-to-db`.

**Limit:** there's no scheduler component, so the nightly run is drawn as a request from the
lecturer's machine; the brief says so.

### Alternates, if you'd rather swap one

- **`lecture-check-in`** (from `ad-click-aggregator`): 300 students check in during a
  lecture's first two minutes; a queue absorbs the write burst. The only write-burst option,
  but the engine credits a queue with just +15 % capacity, so the brief rules would do nearly
  all the catching, and its checks look like the autograder's.
- **`lecture-live-questions`** (from `fb-live-comments`): students post and upvote questions
  live during a lecture. Mostly repeats the chat brief.
- **`campus-chess`** (from `online-chess`): real-time games over WebSocket. Mostly repeats
  the chat brief.

## How each brief is built

As in phase 4, following "Adding a brief" in `docs/challenges/brief-format.md`:

1. `brief.yaml`, in my own words, with `source` naming the starter; campus-scale numbers;
   reflection questions on what the checks can't see.
2. `fixtures/good.yaml`, calibrated with the probe: 15–30 % headroom on throughput and cost,
   latency at 2×. Change the design or the targets, never the engine.
3. The bad fixtures listed above, each one change from the good design.
4. `npx vitest run -t <id>`. If the engine gets something wrong, write the expectation it
   *should* meet and add a `knownGap` explaining why it doesn't.
5. `docs/challenges/phase1-findings.md` gets a phase 5 section: per brief, what the engine
   catches by itself and what only the rules catch.

`campus-food-guide` is built end to end first and reviewed before the other three.

## Verification

- `npm test`: every new fixture meets its `expect` (or is a documented `knownGap`); existing
  fixtures, `tests/demos.test.ts` and `tests/calibration.test.ts` pass.
- `npm run build`: all twelve briefs validate.
- `npx tsc --noEmit`, `npm run lint`.
- Browser: each new brief opens from the picker; importing its `good.yaml` passes and one
  `bad-*.yaml` fails the rule it names.

## Boundaries

- **Always:** campus-scale scenarios; text rewritten, never copied; `source` on every brief;
  single-flaw bad fixtures; targets calibrated against the good design.
- **Ask first:** any engine change beyond open question 2; new rule types or validator
  fields; new component kinds; more or fewer than four briefs.
- **Never:** weaken an existing fixture's expectations; change the existing briefs' numbers;
  use text from `agentic_srs/system_design_concepts/` or the book PDFs.

## Success criteria

1. Four new briefs load in the picker and validate in the build.
2. Each has a passing good design and at least three bad designs, each caught by its intended
   check (or marked `knownGap` with a reason).
3. The findings doc says, for each new brief, what the engine catches alone.
4. Tests, types, lint and build pass, with existing results unchanged.

## Open questions

1. **These four?** Proposal: food guide, lecture video library, printing credits and link
   checker. Together they add static hosting with a CDN, a media pipeline, webhooks from an
   outside service, and staged work. Swap in an alternate if you prefer.
2. **The false "used as a hop" warning on an external API.** Proposal: fix it in this branch,
   test first, as its own commit before `printing-credits`: exempt external APIs in
   `topo-intermediate`, as finding 9 did for client devices and workers. It is a one-line
   change to the exemption list; no existing design has an external API with edges both ways,
   so no other result moves. Alternative: leave the engine alone, accept the warning on the
   good design, and record it as finding 13.
3. **Process.** Proposal: as in phase 4: spec → plan → tasks, one branch, one commit per brief
   (plus the engine fix if approved), and a review stop after `campus-food-guide`.
