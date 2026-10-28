# Phase 1 findings: does verification catch bad designs?

Date: 2026-10-27. Covers the four pilot briefs in `challenges/` and the engine in
`src/lib/simulation.ts` as of commit `0b9de45` (unchanged in phase 1).

## Update: phase 2, step 1 (connection-aware scoring)

Known gaps 1 to 4 below are **fixed** ([SPEC-reachability.md](../../SPEC-reachability.md)).
The engine now credits load balancers, caches, CDNs, task workers and queues only when
they are on a request path, and a new `topo-reachable` check fails stranded compute and
warns about other disconnected components. The four `bad-gap-*` fixtures are now
ordinary tests and the suite has no expected failures. Good designs and both demos kept
their exact results.

As a side effect, the engine now also flags `chat-app/bad-no-subscribers` and
`notification-system/bad-no-worker` through `topo-queue`. Updated tally:

| Brief | Bad designs | Caught by the engine | Caught only by brief rules | Known engine gaps |
|---|---|---|---|---|
| link-shortener | 7 | 6 | 1 (client → DB) | 0 |
| chat-app | 5 | 2 (unconnected bus, no subscribers) | 3 | 0 |
| file-storage | 4 | 1 | 3 | 0 |
| notification-system | 4 | 2 (push direction, no worker) | 2 | 0 |
| **Total** | **20** | **11** | **9** | **0** |

## Update: phase 2, step 2 (data-tier checks)

([SPEC-data-checks.md](../../SPEC-data-checks.md).) Two new engine checks:

- **Finding 8 fixed.** `topo-client-data-<edge>` warns on any edge between a client-side
  node and a database or cache. All four `bad-client-to-db` fixtures now assert it.
- **Finding 6 partly fixed.** `topo-data-store` fails a design whose features store data
  (`storageGb > 0`) when no database or object storage is on a request path. A new
  fixture, `link-shortener/bad-no-database`, shows the original problem: without a
  database it scores 33,600 rpm and $174/mo, and now fails the new check.
  `file-storage/bad-no-metadata-db` still has object storage, so it passes this check;
  "records need a queryable database" stays a brief rule. Throughput estimation without a
  database is unchanged.

Good designs and both demos kept their exact results. Updated tally:

| Brief | Bad designs | Caught by the engine | Caught only by brief rules |
|---|---|---|---|
| link-shortener | 8 (adds `bad-no-database`) | 8 | 0 |
| chat-app | 5 | 3 | 2 (`bad-http-polling`, `bad-no-pubsub`) |
| file-storage | 4 | 2 | 2 (`bad-files-in-db`, `bad-no-metadata-db`) |
| notification-system | 4 | 3 | 1 (`bad-sync-delivery`) |
| **Total** | **21** | **16** | **5** |

Of the original 20, the engine now catches 15 (was 5 in phase 1, 11 after step 1).

## Update: finding 9 fixed

`topo-intermediate` no longer flags client devices (a phone that receives push and sends
requests is an endpoint) or task workers (consuming a queue and calling on is their job).
`notification-system/good` is now warning-free with unchanged numbers. Static hosting
and data stores used as hops still warn, so the BeUWI demo keeps its warning.

Still open: findings 5, 6 (the database-specific part), 7, 10 and 11, in the order
suggested at the end of this note. The five brief-rule-only fixtures map to findings 5
(files in the database), 6 (no metadata database), 7 (polling), and 10 (synchronous
fan-out, and no pub/sub).

## Update: phase 4 (four new briefs)

([SPEC-phase4-briefs.md](../../SPEC-phase4-briefs.md); estimates per fixture in
`tasks/phase4-briefs/plan.md`.) Four briefs added: `lab-autograder`, `course-registration`,
`shuttle-tracker` and `course-assistant`, each with four single-flaw bad designs. The
engine wasn't changed. "Caught by the engine" counts an engine check that fails or warns
because of the flaw.

| Brief | Bad designs | Caught by the engine | Caught only by brief rules |
|---|---|---|---|
| lab-autograder | 4 | 2 (no worker: `topo-queue` warn; client → DB) | 2 (`bad-sync-grading`, `bad-results-not-stored`) |
| course-registration | 4 | 3 (no cache, single replica, client → DB) | 1 (`bad-direct-enrol`) |
| shuttle-tracker | 4 | 3 (SSE direction, no cache, client → DB) | 1 (`bad-polling`) |
| course-assistant | 4 | 3 (client calls the model API, no database, client → DB) | 1 (`bad-no-streaming`) |
| **Total** | **16** | **11** | **5** |

Every bad design is caught by its intended check, so no `knownGap` was needed. Of the
11, only 4 are engine **fails** (two missing caches on throughput, a single replica and
a missing database on availability or data store); the other 7 are warnings.

**Finding 12: async and push designs score slower than the shortcuts they replace.**
Every "do it inline" or "skip the push" design scores faster than its good design:

| Fixture | Latency | Good design |
|---|---|---|
| `lab-autograder/bad-sync-grading` | 25 ms | 45 ms |
| `lab-autograder/bad-results-not-stored` | 35 ms | 45 ms |
| `course-registration/bad-direct-enrol` | 31 ms | 51 ms |
| `shuttle-tracker/bad-polling` | 33 ms | 63 ms |
| `course-assistant/bad-client-calls-llm` | 50 ms | 72 ms |
| `course-assistant/bad-no-streaming` | 60 ms | 72 ms |

Cause: `estimatePathLatency` reports the **longest chain of hops** from any starting node
(`simulation.ts`, the `visit` walk near line 163), not the time of a request. A
background chain (API → queue → worker → database), a push back to the client (SSE,
12 ms a hop) or a server-side API call (45 ms) all lengthen that chain, while what they
buy (a fast response, fewer requests, a hidden key) isn't modelled. This is finding 10
seen from the other side, and finding 7 for SSE. *Fix:* measure latency along request
paths only (client → … → the node hosting the feature and its data stores), and leave
asynchronous chains out, or score them separately as "time to result".

Finding 6 shows again: `course-assistant/bad-no-history` scores 25,200 rpm without a
database (good design: 1060), though it now fails `topo-data-store` and availability.

So across the eight briefs, the engine alone catches 27 of 37 bad designs; the other 10
rely on brief rules. The five from phase 4 are all in the table above (every row but
`bad-client-calls-llm`, which the engine warns on), so each also scores faster than its
good design; the five from earlier map to findings 5, 6, 7 and 10.

## Update: finding 12 fixed

([SPEC-request-latency.md](../../SPEC-request-latency.md).) Latency now measures the
time to answer a request: it starts from the clients (`requestRoots`) and leaves out
edges a request doesn't wait for: those leaving a message queue or a task worker, and
SSE and Web Push edges. Putting a job on a queue still counts. Credit for components
(reachability) is unchanged.

| Brief | Good design: before → after | Shortcut after |
|---|---|---|
| chat-app | 50 → 30 ms | `bad-no-pubsub` 30, `bad-http-polling` 31 |
| notification-system | 75 → 31 ms | `bad-sync-delivery` 31, `bad-no-worker` 31 |
| lab-autograder | 45 → 25 ms | `bad-sync-grading` 25, `bad-results-not-stored` 25 |
| course-registration | 51 → 31 ms | `bad-direct-enrol` 31 |
| shuttle-tracker | 63 → 33 ms | `bad-polling` 33 |
| course-assistant | 72 → 60 ms | `bad-no-streaming` 60, `bad-client-calls-llm` 30 |

link-shortener and file-storage are unchanged, and so are both demos and every
fixture's expected results. Good designs now **tie** with the shortcuts rather than
lose to them; they don't win, because synchronous work and polling still cost nothing
extra (findings 10 and 7), so brief rules still catch those designs.
`bad-client-calls-llm` stays faster, correctly: the browser skips a hop, and its flaw
is the exposed key. `tests/latency.test.ts` guards the seven pairs.

Latency targets weren't changed, so they are now looser than when they were set (for
example the alerts brief: 200 ms target, 31 ms good design). *Since recalibrated:* see
"Calibration done" below and [SPEC-latency-targets.md](../../SPEC-latency-targets.md).

## Update: phase 5 (four new briefs)

([SPEC-phase5-briefs.md](../../SPEC-phase5-briefs.md); estimates per fixture in
`tasks/plan.md`.) Four briefs added: `campus-food-guide`, `printing-credits`,
`lecture-video-library` and `course-link-checker`, each with four single-flaw bad
designs. They add static hosting behind a CDN, a webhook from an outside service, a media
pipeline and work split into stages. The engine changed once (finding 13).

| Brief | Bad designs | Caught by the engine | Caught only by brief rules |
|---|---|---|---|
| campus-food-guide | 4 | 3 (no CDN: `topo-cdn` warn; no cache; client → DB) | 1 (`bad-pages-from-api`) |
| printing-credits | 4 | 3 (client calls the provider, single replica, client → DB) | 1 (`bad-no-webhook`) |
| lecture-video-library | 4 | 2 (video in a database, client → DB) | 2 (`bad-sync-transcode`, `bad-no-cdn`) |
| course-link-checker | 4 | 2 (synchronous crawl, client → DB) | 2 (`bad-single-stage`, `bad-results-not-stored`) |
| **Total** | **16** | **10** | **6** |

Every bad design is caught by its intended check, so no `knownGap` was needed. Of the 10,
3 are engine **fails**: no cache on throughput, a single replica on availability, and
`course-link-checker/bad-sync-crawl` on latency (60 ms against 50, because the API waits on
the outside websites). That is the first synchronous shortcut the engine catches on latency
since the finding 12 fix. The other 7 are warnings. `lecture-video-library/bad-video-in-db`
counts, but for a side reason: the engine warns that the CDN reaches a database, while
scoring the design better than the good one on latency, throughput and cost (finding 5).
`campus-food-guide/bad-no-cdn` also misses its 70 ms target by 1 ms; that comes from
rounding the target, so it isn't in its expected results.

**Finding 13 (fixed in this phase): an external API that calls back is flagged as a hop.**
The good printing-credits design has the server call the payment provider and the
provider call the server back (a webhook), so `topo-intermediate` warned that the provider
was "used as a hop". External APIs are now exempt, as clients and task workers are since
finding 9; a unit test covers it, and no other result moved.

**Finding 14: a callback is counted as part of the request.** *(Fixed: see "Update:
finding 14 fixed" below.)* The webhook edge (provider →
load balancer) is walked as if the student's request waited for it, so the callback's
load balancer, API and database hops are added to the student's latency.
`printing-credits/bad-no-webhook` scores 66 ms against 111 for the good design. *Fix:*
treat an edge out of an external API as the start of a separate request (like the edges
finding 12 left out), or don't follow edges out of an external API in the latency walk.

**Finding 15: a CDN earns no latency or throughput credit.** *(Addressed for throughput:
see "Update: finding 15 addressed" below.)* Dropping the CDN costs a design
nothing on those scores, and saves the CDN's cost:

| Fixture | Latency | Throughput | Cost | Good design |
|---|---|---|---|---|
| `campus-food-guide/bad-pages-from-api` | 31 ms | 1660 | $224 | 31 ms, 1660, $236 |
| `lecture-video-library/bad-no-cdn` | 49 ms | 1678 | $345 | 49 ms, 1678, $357 |

The CDN only shows up in availability, and only when the score isn't already at the
99.95 % cap (finding 11): the food guide drops to 99.9 % without it, the video library
doesn't move. The engine's one CDN-specific check, `topo-cdn`, fires for static hosting
without a CDN, so a design that serves its pages from the API avoids it entirely. *Fix:*
give requirements a "static" or "media" share of their requests, and charge compute or
object storage for serving that share when no CDN sits in front.

The six rule-only designs map to findings 15 (`bad-pages-from-api`, `bad-no-cdn`), 14
(`bad-no-webhook`, which also scores faster) and 10 (`bad-sync-transcode`, and
`bad-single-stage`: one slow stage holding up the next isn't modelled). The last,
`bad-results-not-stored`, is like `lab-autograder/bad-results-not-stored`: the engine
doesn't notice a worker whose results go nowhere.

So across the twelve briefs, the engine alone catches 37 of 53 bad designs; the other 16
rely on brief rules.

## Update: findings 10 and 7 addressed

([SPEC-sync-and-polling.md](../../SPEC-sync-and-polling.md).) Briefs can now mark a
feature's slow work (`backgroundWorkMs`) and its polling rate (`pollingRpm`).
- **Inline work:** if the feature's compute node doesn't put the work on a queue read by a
  task worker, the request waits for it, so it's added to latency.
- **Polling:** if that node doesn't push to clients (SSE or Web Push to a client, or a
  WebSocket with one, directly or through a load balancer), clients poll, and the
  throughput target uses the polling rate.
- **Messages:** the latency or throughput detail names the feature and what to change.

Six briefs carry the fields:

| Brief | Feature | Field |
|---|---|---|
| lab-autograder | submit-solution | `backgroundWorkMs: 3000` |
| notification-system | fan-out | `backgroundWorkMs: 2000` |
| lecture-video-library | upload-recording | `backgroundWorkMs: 60000` |
| course-link-checker | start-check | `backgroundWorkMs: 60000` |
| chat-app | send-message | `pollingRpm: 2400` |
| shuttle-tracker | live-map | `pollingRpm: 3600` |

| Fixture | Before | After | New engine fail |
|---|---|---|---|
| `lab-autograder/bad-sync-grading` | 25 ms | 3025 ms | `nfr-latency` (≤ 50) |
| `lab-autograder/bad-no-worker` | 25 ms | 3025 ms | `nfr-latency` |
| `notification-system/bad-sync-delivery` | 31 ms | 2031 ms | `nfr-latency` (≤ 70) |
| `notification-system/bad-no-worker` | 31 ms | 2031 ms | `nfr-latency` |
| `lecture-video-library/bad-sync-transcode` | 49 ms | 60049 ms | `nfr-latency` (≤ 100) |
| `course-link-checker/bad-sync-crawl` | 60 ms | 60060 ms | already failed latency |
| `chat-app/bad-http-polling` | target 1300 | target 2700 | `nfr-throughput` (1660) |
| `shuttle-tracker/bad-polling` | target 1400 | target 4020 | `nfr-throughput` (1660) |
| `shuttle-tracker/bad-sse-wrong-direction` | target 1400 | target 4020 | `nfr-throughput` (1660) |

Unchanged: every good design, every other fixture, and both demos. The expectations of
the eight fixtures that newly fail were strengthened. `tests/latency.test.ts` now also
requires the good design to be strictly faster than `bad-sync-grading`,
`bad-sync-delivery` and `bad-sync-transcode`.

A prototype also charged inline work to the API's CPU. That moved no throughput figure,
because the database tier already caps throughput in all of these designs, so it was
left out.

Five designs move from rule-only to engine-caught: `bad-sync-grading`,
`bad-sync-delivery`, `bad-sync-transcode`, `bad-http-polling` and
`shuttle-tracker/bad-polling`. So across the twelve briefs, the engine alone now catches
**42 of 53** bad designs. The 11 that still rely on brief rules:
- **Not about slow work or polling:**
  - `course-registration/bad-direct-enrol`: the queue is there for ordering, not speed.
  - `chat-app/bad-no-pubsub`.
  - `course-assistant/bad-no-streaming`: the answer arrives late, but nothing polls.
- **Stages inside the background work aren't modelled:**
  `course-link-checker/bad-single-stage`.
- **Findings 5, 6, 14 and 15:**
  - `file-storage/bad-files-in-db` and `bad-no-metadata-db`;
  - `printing-credits/bad-no-webhook`;
  - `campus-food-guide/bad-pages-from-api` and `lecture-video-library/bad-no-cdn`.
- **A worker whose results go nowhere:** the two `bad-results-not-stored` designs.

## Update: finding 14 fixed

([SPEC-webhook-latency.md](../../SPEC-webhook-latency.md).) An edge out of an external API is
a callback, a separate request the student's doesn't wait for. The latency walk now
leaves it out, as it does queues, workers and push edges. The call *to* the external API
still counts. Only `printing-credits` has such an edge (its webhook):

| Fixture | Before | After |
|---|---|---|
| `printing-credits/good` | 111 ms | 66 ms |
| `printing-credits/bad-no-webhook` | 66 ms | 66 ms (now ties the good design) |
| `printing-credits/bad-client-to-db` | 111 ms | 66 ms |
| `printing-credits/bad-single-db-replica` | 111 ms | 66 ms |
| `printing-credits/bad-client-calls-provider` | 93 ms | 31 ms |

The brief's latency target was recalibrated from 230 to 140 ms (2× the good design,
rounded up). No fixture's expected results changed, and every other brief and both demos
are unchanged. `bad-client-calls-provider` is faster than the good design because the
browser skips the server hop. Its flaw is the exposed key, which the engine warns about.
`tests/latency.test.ts` now also pins `bad-no-webhook` as no faster than the good design.
The engine count stays at 42 of 53: `bad-no-webhook` is still caught only by its brief
rule, but the engine no longer rewards it.

## Update: finding 15 addressed

([SPEC-file-serving.md](../../SPEC-file-serving.md).) Briefs can now give a feature a
`fileRpm`: the file requests (pages, scripts, video segments) it has clients make. Unless
some client fetches files from static hosting or object storage, directly or through a CDN
in front of one, the servers serve them, and each `fileRpm` is added to the throughput
target. The throughput detail names the feature. Three briefs carry the field:

| Brief | Feature | `fileRpm` |
|---|---|---|
| campus-food-guide | browse-vendors | 2400 |
| lecture-video-library | watch-lecture | 3000 |
| file-storage | download-file | 1200 |

| Fixture | Throughput target: before → after | Capacity | New engine fail |
|---|---|---|---|
| `campus-food-guide/bad-pages-from-api` | 1300 → 3690 | 1660 | `nfr-throughput` |
| `lecture-video-library/bad-no-cdn` | 1310 → 4310 | 1678 | `nfr-throughput` |
| `lecture-video-library/bad-video-in-db` | 1310 → 4310 | 2208 | `nfr-throughput` |
| `file-storage/bad-files-in-db` | 1020 → 2220 | 1260 | `nfr-throughput` |

Unchanged: every good design, every other fixture, and both demos. The four fixtures'
expectations were strengthened. `campus-food-guide/bad-no-cdn` doesn't move, because
students fetch the files straight from static hosting. The `topo-cdn` warning and the
brief rules catch it. A CDN still earns no latency credit, apart from the existing
40 ms charge for static hosting without one.

Three designs move from rule-only to engine-caught: `bad-pages-from-api`,
`lecture-video-library/bad-no-cdn` and `file-storage/bad-files-in-db` (half of finding 5).
`bad-video-in-db` was already counted through a warning. Across the twelve briefs, the
engine alone now catches **45 of 53** bad designs. The 8 that still rely on brief rules:
- `course-registration/bad-direct-enrol`, `chat-app/bad-no-pubsub` and
  `course-assistant/bad-no-streaming`;
- `course-link-checker/bad-single-stage`;
- `file-storage/bad-no-metadata-db` (finding 6);
- `printing-credits/bad-no-webhook`;
- the two `bad-results-not-stored` designs.

The rest of this note is the original phase 1 analysis, kept as written.

## Short answer

**Mostly no, without brief rules.** Across 20 bad designs, the engine on its own catches
the generic structural flaws: no cache, a single database replica, no load balancer, a
capacity overflow, and a Web Push edge drawn the wrong way. It misses almost every flaw
that is specific to a scenario. It also rewards some wrong answers, and it gives credit
to components that sit on the canvas connected to nothing.

The brief rules added in phase 1 catch everything the engine misses except the four
known gaps below. So challenge mode is workable now **if every brief carries rules**,
but the NFR scores students see are not trustworthy until the phase 2 fixes land.

## Results

| Brief | Bad designs | Caught by the engine | Caught only by brief rules | Known engine gaps |
|---|---|---|---|---|
| link-shortener | 7 | 3 (no cache, single replica, no LB) | 1 (client → DB) | 3 |
| chat-app | 5 | 0 | 4 | 1 |
| file-storage | 4 | 1 (capacity overflow) | 3 | 0 |
| notification-system | 4 | 1 (push direction, as a warning) | 3 | 0 |
| **Total** | **20** | **5** | **11** | **4** |

"Caught by the engine" means an engine check fails or warns because of the design's flaw.
`file-storage/bad-no-metadata-db` also fails availability, but only incidentally (see
finding 6), so it is counted under brief rules.

Every good design passes, and each one's estimates are in `tasks/phase1/plan.md`.

## Known gaps (all four fixed in phase 2, step 1)

These four fixtures run as `it.fails`. When a phase 2 fix makes one pass, its test turns
red and the `knownGap` line in the fixture must be removed.

| # | Fixture | What the engine does | Cause in `simulation.ts` | Suggested phase 2 fix |
|---|---|---|---|---|
| 1 | `link-shortener/bad-gap-cache-unconnected` | Scores exactly like the good design: 31 ms, 1660 rpm | `estimateThroughputRpm` adds cache capacity for every cache (around line 202); `estimatePathLatency` applies the cache-aside bonus if a cache and a database both exist (line 154) | Credit a cache only when a compute node that connects to the database also connects to that cache |
| 2 | `link-shortener/bad-gap-lb-unconnected` | 99.9 % availability and no `topo-lb` warning | `estimateAvailability` checks only that a load balancer exists (line 229) and ignores edges (`void edges`, line 252); the `topo-lb` check does the same (line 415) | Count a load balancer only if it has edges to two or more compute nodes |
| 3 | `link-shortener/bad-gap-no-edges` | Every NFR passes; latency falls back to a fixed 92 ms | `estimatePathLatency` returns a fixed estimate when there are no edges (line 105); no check needs components to be connected | Fail `topo-present` (or a new check) when a node has no edges, or when no client reaches a placed feature |
| 4 | `chat-app/bad-gap-bus-unconnected` | `topo-queue` passes and availability gets the queue bonus | The `topo-queue` check (line 453) and `estimateAvailability` (line 250) test only that a queue exists | Credit a queue only with at least one producer edge in and one consumer edge out; warn otherwise |

All four share a root cause: **the engine scores what is on the canvas, not what is
connected.** Fixing that once, by finding the nodes reachable from clients, would close
all four.

## Other findings

These are recorded here, not as known-gap tests, because the brief rules already catch
them or because they are about the scoring model rather than one fixture.

5. **The engine prefers files in the database.** `file-storage/bad-files-in-db` scores
   31 ms and $224 against 43 ms and $252 for the correct design. `hopLatencyMs` charges
   28 ms for any object storage hop (line 87) and about 10 ms for a database hop, and
   blob size isn't modelled. *Fix:* give features a payload size, or make large-blob
   requirements add a heavy latency and cost penalty to database hops. *(Partly addressed
   by the finding 15 fix: with no store for its files, `bad-files-in-db` now fails
   throughput. It still scores better on latency and cost.)*
6. **Removing the database raises throughput.** `file-storage/bad-no-metadata-db` jumps
   from 1260 to 6996 rpm, because `estimateThroughputRpm` caps capacity by the data
   tier only when a database exists (line 195). It fails availability only because it
   loses the replica bonus. *Fix:* when any feature needs storage (`storageGb > 0`) and
   there is no database or object storage, fail with a clear reason.
7. **Protocols don't affect the score.** *(Addressed: the finding 12 fix stopped SSE and
   Web Push adding latency, and a brief's `pollingRpm` now raises the throughput target
   when nothing pushes; see "Update: findings 10 and 7 addressed".)* `chat-app/bad-http-polling` scores 51 ms against
   50 ms for WebSockets. Polling cost isn't modelled. *Fix:* in briefs, keep this as a
   rule; in the engine, optionally add a request-rate multiplier for real-time
   requirements served over HTTP.
8. **Clients wired to a database aren't flagged.** All four `bad-client-to-db` fixtures
   pass every engine check. `topo-db-no-compute` (line 376) fires only when there is no
   compute at all. *Fix:* warn on any edge from a client kind to a database or cache.
9. **False warnings on a correct design.** `notification-system/good` gets
   `topo-intermediate-phone` and `topo-intermediate-worker`. The check treats any
   non-compute node with edges in and out as a hop (line 390), so a phone that receives
   push and sends requests counts, and so does a worker that consumes a queue and pushes.
   *Fix:* exempt clients and task workers, or count a node as a hop only on a
   request path.
10. **Synchronous fan-out isn't penalised.** *(Addressed: a brief's `backgroundWorkMs` is
    added to latency when the work isn't handed to a task worker through a queue; see
    "Update: findings 10 and 7 addressed".)* `notification-system/bad-sync-delivery`
    passes throughput at 1660 against 1650. A queue plus worker only adds 15 % capacity
    (line 218). *Fix:* model fan-out features (one request becoming N deliveries) so
    that serving them inline costs N times the compute.
11. **Availability saturates.** It is a sum of fixed bonuses capped at 99.95 %. A 99.9 %
    target is met exactly by a load balancer, two PaaS nodes and a replicated database
    (`link-shortener/good`), and any extra component pushes the score to the cap.
    Targets above 99.95 % can't be met at all. *Fix:* compute availability from
    redundancy along the request path rather than global bonuses.

## Limits of the challenge format found in phase 1

- **Rules see single edges, not paths.** Briefs list allowed endpoints instead (for
  example `to: [compute, load_balancer]`). Path rules ("client reaches the database
  only through compute") would need a reachability helper, which finding 1 needs anyway.
- **Rules can only check numeric config.** A queue's `mode: pubsub` can't be required;
  the chat brief requires publish and subscribe edges instead.
- **Task workers can't host features.** The engine only places features on compute, so
  a worker's own load isn't modelled. The notification brief places fan-out on the API.

## Calibration done

NFR targets were set against each good design, never by changing the engine. Changes from
the spec's provisional numbers:

- `link-shortener`: cost budget $250 → $275; the good design uses a 6 GB cache because
  the data tier caps throughput.
- `notification-system`: cost budget $250 → $300.
- **Latency targets, after the finding 12 fix** (`latency-targets`): twice the good
  design's latency, rounded up to the next 10 ms. link-shortener 120 → 70 ms,
  file-storage 250 → 90, chat-app 150 → 60, notification-system 200 → 70,
  lab-autograder 100 → 50, course-registration 100 → 70, shuttle-tracker 100 → 70;
  course-assistant stays 120. Every good design still passes; only
  `link-shortener/bad-gap-no-edges` newly fails `nfr-latency` (92 ms).
  `tests/calibration.test.ts` fails if a target goes above three times its good design.
- **printing-credits, after the finding 14 fix** (`webhook-latency`): 230 → 140 ms, for the
  good design's 66 ms.

## Suggested order for phase 2

1. A reachability helper (nodes reachable from clients through edges). It closes known
   gaps 1 to 4 and enables path rules.
2. Storage check (finding 6) and client-to-database warning (finding 8). Both are small.
3. Fix the `topo-intermediate` false positives (finding 9).
4. Scoring-model changes (findings 5, 7, 10, 11). These change every brief's numbers, so
   re-run the probe and re-calibrate each brief afterwards.
