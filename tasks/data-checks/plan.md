# Implementation Plan: Phase 2, step 2: data-tier checks

Spec: [SPEC-data-checks.md](../../SPEC-data-checks.md) (approved). Task checklist:
[todo.md](todo.md). Branch: `feat/engine-data-checks`. Earlier steps:
[phase1/](../phase1/plan.md), [reachability/](../reachability/plan.md).

## Overview

Add two checks to `runVerification`: `topo-client-data-<edge>` (warn when a client-side
node is wired straight to a database or cache) and `topo-data-store` (fail when features
store data but no database or object storage is on a request path). One new fixture and
four strengthened ones prove the engine now catches these on its own.

## Dependency graph

```
topo-client-data  (4 fixtures gain warns; independent of the other check)
topo-data-store   (new bad-no-database fixture; uses the reachable set from step 1)
        │
docs: check table, findings update, spec status
```

The two checks don't depend on each other. They're done one after the other because
both edit `simulation.ts` and `simulation.test.ts`.

## Architecture decisions

- **Each task starts red.** The fixture change for a check lands first in the same task
  and fails; then the check makes it pass. Every task ends with the suite green, so no
  task leaves the branch red.
- **`topo-client-data` sits next to the existing `topo-api-keys` loop** and follows its
  per-edge id pattern. A small `DATA_TIER` set (`database`, `cache`) keeps the condition
  readable.
- **`topo-data-store` reuses the step 1 reachable set** (`reach`), already computed in
  `runVerification`, so "on a request path" means the same thing everywhere.
- **No estimator changes.** Both are topology checks; latency, throughput, availability
  and cost code is untouched, so the probe table can't move unless something is wrong.

## Task list

### Phase A: Checks
- [x] Task 1: `topo-client-data` warning
- [x] Task 2: `topo-data-store` check

### Checkpoint A
- [x] Suite green; probe table unchanged; demos unchanged; tsc and lint green

Notes from Phase A:
- `bad-no-database` scores 33,600 rpm and $174/mo (finding 6 in action), and now fails
  `topo-data-store`. It also fails `nfr-availability` by accident (99.6 %), which it
  doesn't assert.
- `topo-data-store` also fires on `bad-gap-no-edges` (its database is unreachable);
  correct, and not asserted.

### Phase B: Documentation
- [x] Task 3: Check table, findings update, spec status

### Checkpoint: Complete
- [x] All six spec success criteria met; ready for review (nothing committed until asked)

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A good fixture or demo has a client-side → cache edge nobody noticed (e.g. a CDN in front of a cache) | Low | Searched: no good fixture or demo has one; the demo pin and `pass: true` fixtures would catch it anyway, as a warning only |
| `topo-data-store` fails a legitimately stateless brief later | Low | Authors set `storageGb: 0`; documented in the authoring guide |
| A design with no clients and an unreachable store | Low | Roots fall back to nodes with no incoming edges (step 1), so the fan-in demo's database is reachable; pinned in `tests/demos.test.ts` |
| Expectation ids with `->` in them | Low | Already used (`topo-sse-dir-phone->worker`); validator accepts any `topo-` id |

## Parallelization

Not worth it: both tasks edit the same two files.

## Open questions

None. The spec's three questions were answered with the proposals.
