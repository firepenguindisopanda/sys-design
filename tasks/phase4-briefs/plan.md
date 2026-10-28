# Implementation Plan: Phase 4, new briefs

Spec: [SPEC-phase4-briefs.md](../../SPEC-phase4-briefs.md) (approved). Task checklist:
[todo.md](todo.md). Branch: `feat/phase4-briefs`, from `main` (`c84db82`). Earlier
steps: [phase1/](../phase1/plan.md), [reachability/](../reachability/plan.md),
[data-checks/](../data-checks/plan.md), [challenge-slice1/](../challenge-slice1/plan.md),
[challenge-panels/](../challenge-panels/plan.md), [design-io/](../design-io/plan.md),
[confirm-replace/](../confirm-replace/plan.md).

## Overview

Four new briefs in `challenges/`, each with a calibrated good design and at least three
single-flaw bad designs. No code changes: the loader, harness and picker already pick
up any folder in `challenges/`. The first brief is built end to end and reviewed before
the other three.

## Dependency graph

```
T1 lab-autograder (brief, good, calibrate, bad, tests)
        │
   ── review stop ──
        │
        ├──────────────────┬──────────────────┐
        ▼                  ▼                  ▼
T2 course-registration  T3 shuttle-tracker  T4 course-assistant   (independent)
        │                  │                  │
        └──────────────────┼──────────────────┘
                           ▼
T5 findings doc, HANDOVER, browser check, build
```

## Architecture decisions

- **No code.** If a brief needs something the format can't express, it's recorded as a
  `knownGap` or a reflection question and raised with you, not fixed in the engine
  (spec boundary).
- **Calibrate on the good design only.** Targets come from the probe's numbers for
  `good.yaml` plus 15–30 % headroom on throughput and cost; availability follows the
  phase 1 note (99.9 % needs a load balancer, two compute nodes and a replicated
  database). Bad fixtures are written after calibration, so each fails for its one flaw
  and not because the targets moved.
- **Each bad fixture is a copy of `good.yaml` with one change**, and `expect` lists only
  the ids that one change should trip.
- **Engine-only results are recorded.** For each brief, the probe output for every
  fixture goes into the findings doc: which flaws the engine catches with its own
  checks, and which only a rule catches.
- **One commit per brief**, so each can be reviewed or reverted on its own.

## Task list

### Phase A: First brief, then review
- [x] Task 1: `lab-autograder`

### Checkpoint A (review stop)
- [x] Autograder tests pass; you've reviewed the brief text, the good design and the
  bad designs before the other three start (approved; committed as `f8a9743`)

Notes from Task 1:
- **Calibration.** First probe of `good`: 45 ms, 988 rpm, 99.95 %, $239. Throughput was
  capped by the data tier (replicated database 460 rpm + 200 rpm per cache GB, ×1.15 for
  a credited queue). A 4 GB exercise cache gives 1449 rpm and $251. Targets: latency
  100 ms (estimate 45), throughput 1150 (the features' total is 1100; 26 % headroom),
  availability 99.9 %, cost $300 (16 % headroom).
- **Probe results:**

  | Fixture | Latency | Throughput | Avail. | Cost | Caught by |
  |---|---|---|---|---|---|
  | `good` | 45 ms | 1449 | 99.95 % | $251 | passes |
  | `bad-sync-grading` | 25 ms | 1260 | 99.9 % | $212 | rules only (3 fails) |
  | `bad-no-worker` | 25 ms | 1260 | 99.9 % | $227 | rules (2 fails) + engine `topo-queue` warn |
  | `bad-results-not-stored` | 35 ms | 1449 | 99.95 % | $251 | rule only |
  | `bad-client-to-db` | 45 ms | 1449 | 99.95 % | $251 | rule + engine `topo-client-data` warn |

- **New finding (for Task 5):** the engine adds the background path (queue → worker →
  database) to the request's latency, so the synchronous design scores *faster* (25 ms
  against 45 ms) and dropping the worker's database connection "saves" 10 ms. It's
  finding 10 again from the other side: async work is penalised where synchronous work
  isn't. Not fixed here (no engine changes in phase 4).
- `npm test` 297 passed, 1 skipped; `tsc`, lint and `npm run build` pass.

### Phase B: Remaining briefs
- [x] Task 2: `course-registration`
- [x] Task 3: `shuttle-tracker`
- [x] Task 4: `course-assistant`

### Checkpoint B
- [x] All eight briefs' tests pass; existing fixtures unchanged

Notes from Phase B (one commit each: `4a60ea9`, `f34aabe`, `72d17a2`):

| Brief | Good design | Targets | Cache used to lift the data tier |
|---|---|---|---|
| `course-registration` | 51 ms, 2369 rpm, 99.95 %, $275 | 100 ms, 1850 rpm, 99.9 %, $350 | 8 GB |
| `shuttle-tracker` | 63 ms, 1660 rpm, 99.9 %, $224 | 100 ms, 1400 rpm, 99.9 %, $275 | 6 GB |
| `course-assistant` | 72 ms, 1060 rpm, 99.9 %, $206 | 120 ms, 850 rpm, 99.9 %, $260 | 3 GB |

What catches each bad design (engine fail / engine warn / rule):

| Fixture | Engine | Rules |
|---|---|---|
| `course-registration/bad-no-cache` | fail `nfr-throughput` (528 rpm), warn `topo-cache` | `catalog-cache` |
| `course-registration/bad-direct-enrol` | nothing; scores faster (31 ms vs 51) | `enrol-queued`, `seat-worker` |
| `course-registration/bad-single-db-replica` | fail `nfr-availability` (99.2 %) | `db-replicas` |
| `course-registration/bad-client-to-db` | warn `topo-client-data` | `no-client-to-db` |
| `shuttle-tracker/bad-polling` | nothing; scores faster (33 ms vs 63) | `live-positions` |
| `shuttle-tracker/bad-sse-wrong-direction` | warn `topo-sse-dir` ×2 | `live-positions` |
| `shuttle-tracker/bad-no-cache` | fail `nfr-throughput` (460 rpm), warn `topo-cache` | `latest-in-cache` |
| `shuttle-tracker/bad-client-to-db` | warn `topo-client-data` | `no-client-to-db` |
| `course-assistant/bad-client-calls-llm` | warn `topo-api-keys`; scores faster (50 ms vs 72) | `llm-from-server`, `no-client-to-llm` |
| `course-assistant/bad-no-streaming` | nothing; scores faster (60 ms vs 72) | `stream-answers` |
| `course-assistant/bad-no-history` | fail `topo-data-store`, fail `nfr-availability` (99.6 %); throughput jumps to 25200 rpm | `history-db` |
| `course-assistant/bad-client-to-db` | warn `topo-client-data` | `no-client-to-db` |

- Two expectations were strengthened when the probe showed the engine also catches the
  flaw: `bad-single-db-replica` adds `nfr-availability`; `bad-no-history` adds
  `nfr-availability`.
- **Pattern for the findings:** every "do it synchronously / skip the push" design
  scores *faster* than the good one (queues, workers, SSE and server-side API hops add
  latency; their benefits aren't modelled). Removing a database still raises
  throughput (finding 6).
- No `knownGap` was needed: every intended flaw is caught, by a rule where the engine
  can't.
- `npm test` 360 passed, 1 skipped; `tsc`, lint and `npm run build` pass; no file under
  the four existing briefs or `tests/demos.test.ts` changed.

### Phase C: Docs and verification
- [x] Task 5: Findings, HANDOVER, browser check, build

### Checkpoint C
- [x] All four spec success criteria met; ready for review (nothing committed until
  asked, apart from the per-brief commits you approve)

Notes from Task 5:
- **Findings:** "Update: phase 4" section in `docs/challenges/phase1-findings.md`: per-brief
  tally (16 bad designs, 11 caught by the engine, 5 only by rules), finding 12 (latency
  is the longest chain of hops, so async and push designs score slower than their
  shortcuts; cause in `estimatePathLatency`'s walk), finding 6 again, and the
  eight-brief total (27 of 37 caught by the engine).
- **Browser (Chrome DevTools, 1440 wide):** for each new brief, picked it from the menu
  (opened on its Brief tab with its title), imported `good.yaml` (Pass, same numbers as
  the probe, every rule passing) and one bad fixture:
  - `lab-autograder/bad-sync-grading`: Fail, 25 ms; the three queue/worker rules fail;
  - `course-registration/bad-direct-enrol`: Fail, 31 ms; `enrol-queued` and
    `seat-worker` fail;
  - `shuttle-tracker/bad-sse-wrong-direction`: Fail; `live-positions` fails, two
    "SSE direction" warnings;
  - `course-assistant/bad-client-calls-llm`: Fail, 50 ms; the two model-API rules fail.
  No confirm dialog appeared between imports (each import is a fresh baseline); console
  only had React Flow's attribution warning.
- `HANDOVER.md`: items 10–12 added (audit, confirm-replace, phase 4), engine tally,
  branch state, next step, starter count (23 left).
- `npm test` 360 passed, 1 skipped; `tsc`, lint and `npm run build` pass.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A rule the spec drafted can't be written in the format (e.g. "compute → mobile or desktop over SSE") | Med | Edge rules already take lists of kinds and protocols; checked by `npm run build` on the first draft of each brief |
| Task workers can't host features, so the autograder's grading load and the registration seat worker aren't modelled | Med | Same as the alerts brief: features sit on the API; the worker's role is checked by rules; noted in each brief's reflection and the findings |
| An external API's 45 ms per hop makes the assistant's latency target hard to calibrate | Low | Calibrate on the good design; latency target set from its estimate |
| A bad fixture trips extra checks besides its flaw | Med | `expect` lists only intended ids; others aren't checked. The probe output shows extras; if one is a false positive, it's a finding, not a fixture change |
| The engine misses a flaw the brief is about | Med | Write the expectation it should meet and mark `knownGap`; raise it in the findings (finding numbers continue from 11) |
| Spec Markdown words add Tailwind classes to the build | Low | Harmless; noted in the audit step |

## Parallelization

After the review stop, T2–T4 are independent folders. Each is S–M and they share the
calibration pattern, so doing them in sequence in this session keeps them consistent.

## Open questions

None. The spec's three questions were answered with the proposals.
