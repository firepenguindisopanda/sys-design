# Implementation Plan: `request-latency`

Spec: [SPEC-request-latency.md](../../SPEC-request-latency.md) (approved). Task checklist:
[todo.md](todo.md). Branch: `fix/request-latency`, from `main` (`d7dbb15`). Earlier
steps: [phase1/](../phase1/plan.md), [reachability/](../reachability/plan.md),
[data-checks/](../data-checks/plan.md), [challenge-slice1/](../challenge-slice1/plan.md),
[challenge-panels/](../challenge-panels/plan.md), [design-io/](../design-io/plan.md),
[confirm-replace/](../confirm-replace/plan.md), [phase4-briefs/](../phase4-briefs/plan.md).

## Overview

Make `estimatePathLatency` measure the student's request: start from clients, and leave
out queue consumers, task workers and server push. One function changes; everything
else is tests and docs. The prototype in the spec gives the expected numbers for every
fixture, so the tests can pin them.

## Dependency graph

```
T1 engine tests (unit cases + finding-12 guard), failing
        │
        ▼
T2 estimatePathLatency change + nfr-latency detail text
        │
        ▼
T3 docs (findings, brief-format, HANDOVER), full checks, browser spot check
```

## Architecture decisions

- **Reuse `requestRoots()`** from `reachability.ts` for the starting points, so "where a
  request starts" means the same thing for crediting and for latency. The edge filter
  stays local to `estimatePathLatency`: crediting still needs queue → consumer edges.
- **Filter edges, not nodes.** An edge is skipped when its source is a message queue or
  a task worker, or its protocol is SSE or Web Push. Nodes stay in the graph, so the
  enqueue hop (API → queue) still counts.
- **The guard test reads the real fixtures.** `tests/latency.test.ts` loads the briefs
  with `loadChallenges` and compares the good design with each shortcut, so it keeps
  checking the actual content rather than copies of it.
- **The prototype numbers are the expected values.** If the real change gives a
  different number for any fixture, stop and find out why before going on.

## Task list

- [x] Task 1: Tests first (unit cases and the finding-12 guard)
- [x] Task 2: The change in `estimatePathLatency`, and the `nfr-latency` wording
- [x] Task 3: Docs, full checks, browser spot check

### Checkpoint
- [x] All three spec success criteria met; ready for review (nothing committed until
  asked)

Notes:
- **Task 1:** 6 unit cases in `simulation.test.ts` ("request latency") and 7 guard pairs
  in `tests/latency.test.ts`. Against the old engine, exactly the expected 10 failed
  (worker chain, SSE push, Web Push, and all seven pairs); the four "unchanged" cases
  (plain path 46 ms, WebSocket either way, no-client fallback 45 ms, push-only floor
  20 ms) already passed.
- **Task 2:** `isAfterResponse(edge)` skips edges out of a queue or worker and SSE/Web
  Push edges; roots come from `requestRoots()`. The `nfr-latency` detail now says what's
  measured. All tests pass; the probe matches the prototype for all 45 fixtures; demos
  unchanged.
- **Task 3:** findings ("Update: finding 12 fixed", finding 7 annotated), the
  `nfr-latency` row in `brief-format.md`, and `HANDOVER.md`. Browser (DevTools, 1440):
  shuttle tracker `good.yaml` → Pass, 33 ms, detail "Estimated time to answer a
  request meets the NFR. Background work (queue consumers, workers) and server push
  aren't included."; `bad-polling.yaml` → Fail (its rule), 33 ms. Console: only React
  Flow's attribution warning. (One upload attempt failed in the DevTools tool and was
  redone; the numbers above are from the successful runs.)
- `npm test` 374 passed, 1 skipped; `tsc`, lint and `npm run build` pass.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A design with clients that reach compute only through a push edge (no request edge) gets the 20 ms floor | Low | That design already fails `topo-reachable`; a unit test pins the floor so the behaviour is deliberate |
| The demos move after all | Med | The prototype showed none; `tests/demos.test.ts` runs in every check |
| A student reads "25 ms" as grading time | Med | The `nfr-latency` detail and the brief-format doc say what's measured |
| The guard test's pairs drift when fixtures are renamed | Low | It names the fixtures it compares; a missing fixture fails loudly |

## Open questions

None. The spec's three questions were answered with the proposals.
