# Spec: Phase 6, more briefs

Status: **implemented** (2026-10-28); approved as proposed: these four briefs, a review stop after `lab-monitor`,
and the cache-for-shards gap recorded as a finding only. Plan:
[tasks/phase6-briefs/plan.md](tasks/phase6-briefs/plan.md).
Content only: briefs and fixtures in `challenges/`, plus docs. No engine change is planned;
anything the engine gets wrong is recorded as a finding. Branch: `feat/phase6-briefs`, from
`main` (`344d300`).

## Objective

Students have twelve challenges. Add **four more**, so a semester has sixteen. Each brief's
main lesson must be one the engine or a brief rule can check. Since phase 5, the engine
also charges for slow work done inline, polling and files served by the API, so this
round favours lessons the **engine** catches, not only rules.

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
| Campus food guide | Static front end in static hosting behind a CDN |
| Printing credits top-up | Payment provider called from the server; webhook back to the server |
| Lecture recording library | Media pipeline: object storage, conversion workers, playback through a CDN |
| Course page link checker | Work split into stages, each with its own queue and workers |

**Never required by any brief:**
- database **shards** (every brief scales reads, none scales writes);
- **cloud functions**, VMs, edge compute and WebRTC;
- a client uploading **straight to object storage**.

## How starters were chosen

The same four tests as phases 4 and 5, applied to the 19 starters not yet adapted
(`nvidia_genai/architect-it/src/shared/starters.ts`):
- **checkable:** the lesson maps to components, connections or config;
- **campus-scale;**
- **new:** adds something from the list above;
- **teachable by single flaws:** at least three bad designs, each missing one thing.

## Proposed briefs

Numbers are set during calibration against each good design:
- throughput and cost get 15–30 % headroom;
- latency is 2× the good design, rounded up to the next 10 ms.

Rule ids are provisional, and every rule gets a `title`. "Engine" means the generic
checks catch the flaw; "rule" means only the brief's own rule does.

### 1. `lab-monitor`: Lab machine monitor (from `metrics-monitoring`)

**Scenario:** the faculty's 400 lab machines each report CPU, memory and disk use every 15
seconds. Technicians open a dashboard of the last hour for a lab, and a technician's phone
gets a push when a machine's disk is nearly full. **The hard part:** a steady stream of
writes, far larger than the reads, that one database can't absorb.

**Lesson:** scaling **writes**.
- The API puts readings on a queue.
- Workers write them in batches to a **sharded** database (`shards ≥ 3`, replicated).
- The dashboard reads through a cache.

**Good design:**
- clients: lab machines (desktop) and the technicians' laptops;
- load balancer → two API instances → queue → workers → sharded database;
- workers → technician phone over Web Push;
- the API reads the dashboard data through a cache.

| Bad design | Flaw | Caught by |
|---|---|---|
| `bad-single-shard` | Database has one shard | Engine: `nfr-throughput` (400 per shard); rule `sharded-db` |
| `bad-direct-writes` | API writes readings straight to the database, no queue or workers | Rules `ingest-queued` and `workers-write` (the engine may also fail throughput) |
| `bad-no-cache` | Dashboard reads hit the database | Engine: `topo-cache` warning, and likely `nfr-throughput` |
| `bad-client-to-db` | Lab machines write to the database directly | Engine: `topo-client-data` warning; rule `no-client-to-db` |

**Expected finding:** the engine adds cache memory to database capacity (200 req/min per
GB) even for writes. So a design that swaps shards for a big cache could pass throughput.
The rule `sharded-db` covers it, and the gap goes in the findings.

### 2. `textbook-price-watch`: Textbook price watch (from `camelcamelcamel`)

**Scenario:** students watch the price of their course textbooks at an online bookstore and
get a push when a price drops below their target. **The hard part:** almost nobody uses it
for most of the semester, and then everyone does in the first two weeks.

**Lesson:** pay per request.
- The API runs on **cloud functions** instead of always-on servers.
- Price checks call the bookstore's API from **background workers**, through a queue.
- The bookstore's key never reaches the phone.

**Good design:**
- phone and laptop → load balancer → two function nodes;
- functions → replicated database, plus a small cache;
- functions → queue → workers → bookstore (external API);
- workers → database, and workers → phone over Web Push.

| Bad design | Flaw | Caught by |
|---|---|---|
| `bad-always-on-vms` | API on two VMs instead of functions | Engine: `nfr-cost` |
| `bad-inline-check` | Adding a watch fetches the price inline (no queue or workers) | Engine: `nfr-latency` via `backgroundWorkMs`; rules |
| `bad-client-calls-store` | Phone calls the bookstore API itself | Engine: `topo-api-keys` warning; rule `store-from-server` |
| `bad-client-to-db` | Laptop reads the database directly | Engine: `topo-client-data` warning; rule |

**Uses:** first use of cloud functions and of the cost budget as the main lesson. The
starter's availability target of 99.5 % suits functions.

### 3. `club-auction`: Society charity auction (from `online-auction`)

**Scenario:** during a fundraiser week, a student society auctions donated items. Everyone
watching an item sees the highest bid change live. In the last minute many bids arrive at
once, and exactly one must win.

**Lesson:** contention plus live updates.
- Bids go through **one queue and one worker**, so they're decided in order.
- The current price is **pushed** over SSE, not polled.
- Item pages are read through a cache.

**Good design:**
- phones and laptops → load balancer → two API instances;
- API → bids queue → bid worker → replicated database;
- API → cache;
- API → clients over SSE.

`watch-item` has a `pollingRpm`.

| Bad design | Flaw | Caught by |
|---|---|---|
| `bad-polling` | No push; watchers poll for the price | Engine: `nfr-throughput` via `pollingRpm`; rule `live-price` |
| `bad-direct-bids` | API writes bids straight to the database | Rules `bids-queued` and `bid-worker` only (ordering isn't modelled, as in `course-registration/bad-direct-enrol`) |
| `bad-single-db-replica` | One database copy | Engine: `nfr-availability`; rule `bids-replicated` |
| `bad-client-to-db` | Laptop reads the database directly | Engine: `topo-client-data` warning; rule |

### 4. `club-photo-wall`: Society photo wall (from `instagram`)

**Scenario:** members post photos from society events, and everyone browses a wall of the
latest photos.

**Lesson:** media without the API in the middle.
- The phone uploads the photo **straight to object storage** with an upload link from the
  API.
- Workers make thumbnails.
- The wall's images are served through a CDN.

**Good design:**
- phone and laptop → load balancer → two API instances → replicated database, plus a
  cache for the wall;
- phone → photos (object storage), for the direct upload;
- API → queue → workers → photos and database;
- clients → CDN → photos.

`post-photo` has `backgroundWorkMs`; `browse-wall` has `fileRpm`.

| Bad design | Flaw | Caught by |
|---|---|---|
| `bad-upload-through-api` | Photos go phone → API → object storage | Rule `direct-upload` only (the CDN still serves views, so the engine doesn't charge) |
| `bad-sync-thumbnails` | API makes thumbnails inline | Engine: `nfr-latency` via `backgroundWorkMs`; rules |
| `bad-no-cdn` | Wall images come from the API | Engine: `nfr-throughput` via `fileRpm`; rule |
| `bad-client-to-db` | Laptop reads the database directly | Engine: `topo-client-data` warning; rule |

**Overlap:** it shares the worker and CDN lessons with the lecture library. What's new is
the direct upload. See "Alternates" if you'd rather have a brief with less overlap.

### Expected engine count

About **13 of 16** new bad designs caught by the engine. The three that need rules are
`bad-direct-writes` (maybe), `bad-direct-bids` and `bad-upload-through-api`. Across
sixteen briefs, that would be about 58 of 69.

### Alternates, if you'd rather swap one

- **`paper-trading`** (from `robinhood`): a finance-class trading game. Prices come from a
  market-data API called by the server and are pushed over WebSocket; orders go through a
  queue in order. It overlaps the auction.
- **`group-project-notes`** (from `google-docs`): shared notes edited live. It mostly
  repeats the chat brief.
- **`study-buddy`** (from `tinder`): match students by course and notify both on a match.
  It overlaps alerts.
- **`campus-news-digest`** (from `google-news`): workers pull outside feeds, and readers
  get a cached digest through a static front end. It overlaps the food guide and the link
  checker.

## How each brief is built

As in phase 5, following "Adding a brief" in `docs/challenges/brief-format.md`:

1. **`brief.yaml`:**
   - in my own words, with `source` naming the starter;
   - campus-scale numbers;
   - the workload fields where the lesson needs them;
   - reflection questions on what the checks can't see.
2. **`fixtures/good.yaml`:** calibrated with the probe, changing the design or the targets
   but never the engine.
3. **The bad fixtures** listed above, each one change from the good design.
   - Every engine catch goes into `expect`.
   - If the engine gets something wrong, write the expectation it *should* meet and add a
     `knownGap`.
4. **`docs/challenges/phase1-findings.md`** gets a phase 6 section: per brief, what the
   engine catches and what only the rules catch, plus any new findings.

`lab-monitor` is built end to end first and reviewed before the other three, because it's
the first brief to depend on shards.

## Verification

- **`npm test`:**
  - every new fixture meets its `expect`, or is a documented `knownGap`;
  - existing fixtures, `tests/demos.test.ts` and `tests/calibration.test.ts` pass.
- **`npm run build`:** all sixteen briefs validate.
- **`npx tsc --noEmit`** and **`npm run lint`**.
- **Browser:**
  - each new brief opens from the picker;
  - importing its `good.yaml` passes, and one `bad-*.yaml` fails the check it names.

## Boundaries

- **Always:**
  - existing briefs, fixtures, demos and engine unchanged;
  - brief text rewritten in my own words, with `source` filled in;
  - campus-scale numbers.
- **Ask first:**
  - any engine change (for example, not counting cache memory toward write capacity);
  - changing an existing brief;
  - swapping a brief for an alternate.
- **Never:**
  - weaken a fixture's expectations;
  - use `agentic_srs/system_design_concepts/` or the book PDFs in `architecture_practice/`.

## Success criteria

1. Four new briefs, each with a calibrated good design and four single-flaw bad designs,
   and all of them caught.
2. The engine catches at least 11 of the 16 new bad designs; each miss is explained in the
   findings.
3. All tests, the build, `tsc`, lint and the browser checks pass.

## Open questions

1. **These four?** Or swap one for an alternate, most likely `club-photo-wall` because of
   its overlap.
2. **Review stop.** Build `lab-monitor` end to end and review it before the other three,
   as in phase 5?
3. **Cache-for-shards gap.** If `lab-monitor` confirms that a big cache can stand in for
   shards, record it as a finding only (proposed), or fix the engine in this branch?
