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
example the alerts brief: 200 ms target, 31 ms good design).

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
   requirements add a heavy latency and cost penalty to database hops.
6. **Removing the database raises throughput.** `file-storage/bad-no-metadata-db` jumps
   from 1260 to 6996 rpm, because `estimateThroughputRpm` caps capacity by the data
   tier only when a database exists (line 195). It fails availability only because it
   loses the replica bonus. *Fix:* when any feature needs storage (`storageGb > 0`) and
   there is no database or object storage, fail with a clear reason.
7. **Protocols don't affect the score.** *(Partly addressed by the finding 12 fix: SSE and
   Web Push no longer add latency. Polling still costs nothing.)* `chat-app/bad-http-polling` scores 51 ms against
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
10. **Synchronous fan-out isn't penalised.** `notification-system/bad-sync-delivery`
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

## Suggested order for phase 2

1. A reachability helper (nodes reachable from clients through edges). It closes known
   gaps 1 to 4 and enables path rules.
2. Storage check (finding 6) and client-to-database warning (finding 8). Both are small.
3. Fix the `topo-intermediate` false positives (finding 9).
4. Scoring-model changes (findings 5, 7, 10, 11). These change every brief's numbers, so
   re-run the probe and re-calibrate each brief afterwards.
