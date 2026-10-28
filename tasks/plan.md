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
- [ ] Task 2: External API hop fix (test first)
- [ ] Task 3: `printing-credits`
- [ ] Task 4: `lecture-video-library`
- [ ] Task 5: `course-link-checker`

### Checkpoint B
- [ ] All twelve briefs' tests pass; existing fixtures, demos and calibration unchanged

### Phase C: Docs and verification
- [ ] Task 6: Findings, HANDOVER, browser check, build

### Checkpoint C
- [ ] All four spec success criteria met; ready for review

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
