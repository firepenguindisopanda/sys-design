# Implementation Plan: Phase 5, more briefs

Spec: [SPEC-phase5-briefs.md](../SPEC-phase5-briefs.md) (approved). Task checklist:
[todo.md](todo.md). Branch: `feat/phase5-briefs`, from `main` (`af052cf`). Earlier
steps: [phase1/](phase1/plan.md), [reachability/](reachability/plan.md),
[data-checks/](data-checks/plan.md), [challenge-slice1/](challenge-slice1/plan.md),
[challenge-panels/](challenge-panels/plan.md), [design-io/](design-io/plan.md),
[confirm-replace/](confirm-replace/plan.md), [phase4-briefs/](phase4-briefs/plan.md),
[request-latency/](request-latency/plan.md), [latency-targets/](latency-targets/plan.md).

## Overview

Four new briefs in `challenges/`, each with a calibrated good design and four single-flaw
bad designs, plus one engine fix: external APIs stop being flagged as hops by
`topo-intermediate`. The loader, harness and picker already pick up any folder in
`challenges/`. The first brief is built end to end and reviewed before the rest.

## Dependency graph

```
T1 campus-food-guide (brief, good, calibrate, bad, tests)
        │
   ── review stop ──
        │
        ├────────────────────────┬──────────────────────────┐
        ▼                        ▼                          ▼
T2 engine fix:              T4 lecture-video-library   T5 course-link-checker
   external API hop             (independent)              (independent)
        │
        ▼
T3 printing-credits
        │
        └────────────────────────┴──────────────────────────┘
                                 ▼
T6 findings doc, HANDOVER, browser check, build
```

## Architecture decisions

- **The only code change is T2,** test first, in its own commit. It adds `external_api` to
  the kinds `topo-intermediate` exempts, with a comment saying why (it's an outside endpoint
  that may call back, not a hop in your system). Anything else a brief exposes in the engine
  is recorded as a `knownGap` or a finding and raised with you, not fixed (spec boundary).
- **Calibrate on the good design only.** Throughput and cost get 15–30 % headroom; latency
  is twice the good design's estimate rounded up to 10 ms (`tests/calibration.test.ts`
  enforces at most 3×); 99.9 % availability needs a load balancer, two compute nodes and a
  replicated database. Bad fixtures are written after calibration.
- **Each bad fixture is a copy of `good.yaml` with one change**, and `expect` lists only the
  ids that change should trip. If the probe shows the engine also catches the flaw, the
  expectation is strengthened to include it (as in phase 4).
- **Engine-only results are recorded** per fixture for the findings doc: what the engine
  catches by its own checks, and what only a rule catches.
- **One commit per brief, plus one for the engine fix**, each made after you approve it.

## Task list

### Phase A: First brief, then review
- [x] Task 1: `campus-food-guide`

### Checkpoint A (review stop)
- [x] Food guide tests pass; you've reviewed the brief text, the good design and the bad
  designs before the rest start

Notes from Task 1:
- **Calibration.** First probe of `good`: 31 ms, 1660 rpm, 99.95 %, $236, no warnings
  (a 6 GB cache lifts the data tier, as in the link shortener). Targets: latency 70 ms
  (2 × 31 rounded up), throughput 1300 (features total 1290; 28 % headroom), availability
  99.9 %, cost $290 (23 % headroom).
- **Probe results:**

  | Fixture | Latency | Throughput | Avail. | Cost | Caught by |
  |---|---|---|---|---|---|
  | `good` | 31 ms | 1660 | 99.95 % | $236 | passes |
  | `bad-no-cdn` | 71 ms | 1660 | 99.9 % | $224 | rules (2) + engine `topo-cdn` warn + engine `nfr-latency` fail (by 1 ms) |
  | `bad-pages-from-api` | 31 ms | 1660 | 99.9 % | $224 | rules only (2) |
  | `bad-no-cache` | 46 ms | 460 | 99.95 % | $178 | rule + engine `nfr-throughput` fail + `topo-cache` warn |
  | `bad-client-to-db` | 31 ms | 1660 | 99.95 % | $236 | rule + engine `topo-client-data` warn |

- **`bad-no-cdn` on latency:** the engine adds a flat 40 ms to the *whole* latency when
  static hosting has no CDN (31 + 40 = 71), so it fails the 70 ms target by 1 ms. Not added
  to its `expect` (agreed at review): the margin comes from rounding, not from a real
  difference the target was set to catch.
- **Finding candidate:** serving the site from the API servers (`bad-pages-from-api`) costs
  nothing in the engine: same latency and throughput as the good design, and $12 cheaper.
- `npm test` 413 passed, 1 skipped; `tsc`, lint and `npm run build` pass.

### Phase B: Engine fix and remaining briefs
- [x] Task 2: External API hop fix (test first)
- [x] Task 3: `printing-credits`

Notes from Task 2: the new case (server → provider, provider → load balancer) failed with
`topo-intermediate-payments` before the change and passes after; `npm test` 414 passed, 1
skipped, nothing else moved.

Notes from Task 3:
- **Calibration.** First probe of `good` (no cache): 126 ms, 460 rpm, with a `topo-cache`
  warning. A 1 GB balance cache clears the warning and lifts the data tier; `view-balance`
  went from 250 to 400 rpm to keep the headroom in range. Final `good`: 111 ms, 660 rpm,
  99.9 %, $194, no warnings. Targets: 230 ms, 520 rpm (features total; 27 % headroom),
  99.9 %, $240 (24 % headroom).
- **Probe results:**

  | Fixture | Latency | Throughput | Avail. | Cost | Caught by |
  |---|---|---|---|---|---|
  | `good` | 111 ms | 660 | 99.9 % | $194 | passes |
  | `bad-client-calls-provider` | 93 ms | 660 | 99.9 % | $194 | rules (2) + engine `topo-api-keys` warn |
  | `bad-no-webhook` | 66 ms | 660 | 99.9 % | $194 | rule only |
  | `bad-single-db-replica` | 111 ms | 600 | 99.1 % | $174 | rule + engine `nfr-availability` fail (added to `expect`) |
  | `bad-client-to-db` | 111 ms | 660 | 99.9 % | $194 | rule + engine `topo-client-data` warn |

- **Finding candidate (webhook latency):** the provider → load balancer edge is walked as
  part of the student's request, so the callback's hops (load balancer, API, database) add
  45 ms: `bad-no-webhook` scores 66 ms against the good design's 111. A callback is a
  separate request from the provider, not part of the student's. As planned, calibrated on
  the good design and recorded, not fixed.
- [x] Task 4: `lecture-video-library`

Notes from Task 4:
- **Calibration.** First probe of `good` with a 6 GB cache: 1908 rpm (46 % headroom over the
  features' 1310); a 5 GB cache gives 1678. Final `good`: 49 ms, 1678 rpm, 99.95 %, $357, no
  warnings. Targets: 100 ms, 1310 rpm (28 %), 99.9 %, $440 (23 %). The brief also has
  `no-client-to-db`, which the spec's rule table left out but its `bad-client-to-db` needs.
- **Probe results:**

  | Fixture | Latency | Throughput | Avail. | Cost | Caught by |
  |---|---|---|---|---|---|
  | `good` | 49 ms | 1678 | 99.95 % | $357 | passes |
  | `bad-sync-transcode` | 49 ms | 1460 | 99.95 % | $318 | rules only (3) |
  | `bad-video-in-db` | 39 ms | 2208 | 99.95 % | $319 | rules (3) + engine `topo-client-data-cdn->videos` warn (added to `expect`) |
  | `bad-no-cdn` | 49 ms | 1678 | 99.95 % | $345 | rule only |
  | `bad-client-to-db` | 49 ms | 1678 | 99.95 % | $357 | rule + engine `topo-client-data` warn |

- **`bad-video-in-db`** scores better than the good design on latency, throughput and cost
  (finding 5). The engine's warning is about the CDN reaching a database ("database
  credentials on the client"), not about video in a database: it catches the design for a
  side reason.
- **Finding candidate (CDN credit):** a CDN in front of object storage earns nothing:
  `bad-no-cdn` has the same latency, throughput and availability and is $12 cheaper. Same
  pattern as the food guide's `bad-pages-from-api`.
- `bad-sync-transcode` is rule-only, as the spec expected (findings 10 and 7).
- [x] Task 5: `course-link-checker`

Notes from Task 5:
- **Calibration.** `good`: 25 ms, 758 rpm, 99.95 %, $272, no warnings. The features total
  only 230 rpm (lecturers' traffic is light), so the throughput target is set against the
  good design (capacity must reach the larger of the two). Targets: 50 ms, 600 rpm (26 %),
  99.9 %, $340 (25 %). The learning site and the linked websites are two external APIs.
- **Probe results:**

  | Fixture | Latency | Throughput | Avail. | Cost | Caught by |
  |---|---|---|---|---|---|
  | `good` | 25 ms | 758 | 99.95 % | $272 | passes |
  | `bad-single-stage` | 25 ms | 758 | 99.95 % | $233 | rule only |
  | `bad-sync-crawl` | 60 ms | 660 | 99.9 % | $194 | rules (4) + engine `nfr-latency` fail (added to `expect`) |
  | `bad-results-not-stored` | 25 ms | 758 | 99.95 % | $272 | rule only |
  | `bad-client-to-db` | 25 ms | 758 | 99.95 % | $272 | rule + engine `topo-client-data` warn |

- **`bad-sync-crawl`** is the first synchronous shortcut the engine catches on latency since
  finding 12: the API waits on the outside sites (a 45 ms hop), 60 ms against 50.
- **`bad-single-stage`** scores the same as the good design and is $39 cheaper; the engine
  doesn't model one slow stage holding up another. **`bad-results-not-stored`** is the same
  design minus one edge; the engine doesn't notice a worker whose results go nowhere.

### Checkpoint B
- [x] All twelve briefs' tests pass; existing fixtures, demos and calibration unchanged

### Phase C: Docs and verification
- [x] Task 6: Findings, HANDOVER, browser check, build

Notes from Task 6:
- Findings doc: "Update: phase 5" (10 of 16 caught by the engine alone; findings 13, 14
  and 15; twelve-brief total 37 of 53). Spec marked implemented; HANDOVER updated.
- **Browser check** (Chrome DevTools, 1440×900): each new brief opens from the picker
  with no confirm prompt. Imported and run:

  | Brief | `good.yaml` | Bad design | Rows not passing |
  |---|---|---|---|
  | campus-food-guide | Pass, 31 ms, 1660, 99.95 %, $236 | `bad-pages-from-api` | both CDN rules |
  | printing-credits | Pass, 111 ms, 660, 99.9 %, $194, no warnings | `bad-no-webhook` | the webhook rule only |
  | lecture-video-library | Pass, 49 ms, 1678, 99.95 %, $357 | `bad-sync-transcode` | the three queue and worker rules |
  | course-link-checker | Pass, 25 ms, 758, 99.95 %, $272 | `bad-single-stage` | the stage hand-off rule only |

  No console errors (only React Flow's attribution warning).
- `npm test` 483 passed, 1 skipped; `tsc`, lint and `npm run build` pass.

### Checkpoint C
- [x] All four spec success criteria met; ready for review

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Static hosting and CDN interact with the latency model in ways no brief has tested (the engine has extra rules for static hosting with and without a CDN) | Med | The probe output for `good` and `bad-no-cdn` is checked by hand at the review stop; surprises become findings |
| The webhook edge (provider → API) adds a cycle to the latency walk and inflates `printing-credits`' latency | Med | Calibrate on the good design whatever the number; if the webhook hop is counted in the request's latency, record it as a finding (it's a callback, not part of the request) rather than change the engine |
| Object storage behind a CDN scores oddly on throughput (the data tier is modelled around databases and caches) | Med | Calibrate on the good design; record what the probe shows for `bad-no-cdn` and `bad-video-in-db` |
| Task workers can't host features, so transcoding and link checking load isn't modelled | Med | As in the alerts and autograder briefs: features sit on the API; the workers' roles are checked by rules; noted in reflection questions |
| The nightly link check has no scheduler component | Low | The brief says the run is drawn as a request from the lecturer's machine |
| A bad fixture trips extra checks besides its flaw | Med | `expect` lists only intended ids; a false positive is a finding, not a fixture change |
| The engine misses a flaw the brief is about | Med | Write the expectation it should meet and mark `knownGap`; record it as a finding (numbers continue from 12; the hop warning is finding 13) |

## Parallelization

After the review stop, T4 and T5 are independent of T2–T3. They share the calibration
pattern, so doing them in sequence in this session keeps them consistent.

## Open questions

None. The spec's three questions were answered with the proposals.
