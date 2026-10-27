# Implementation Plan: Phase 2, step 1: score what is connected

Spec: [SPEC-reachability.md](../../SPEC-reachability.md) (approved). Task checklist:
[todo.md](todo.md). Branch: `feat/engine-reachability`. Phase 1 plan and tasks:
[phase1/](../phase1/plan.md).

## Overview

Add `reachableNodeIds` (nodes on a request path from clients), then make the engine
credit load balancers, caches, CDNs, task workers and queues only when they are on that
path, and add a `topo-reachable` check. The four phase 1 known gaps become ordinary
passing tests; every good fixture keeps its numbers and both demos are unchanged.

## Dependency graph

```
demo pin test (baseline, before any engine change)
        │
reachability.ts  ──────────────┐
        │                      │
credit: LB, cache, CDN, worker │   (closes cache + LB gaps)
        │                      │
credit: queue + topo-queue warn│   (closes bus gap)
        │                      │
topo-reachable check ──────────┘   (closes no-edges gap)
        │
docs: brief-format, findings, spec status
```

## Architecture decisions

- **One reachable set per verification run.** `runVerification` computes it once and
  passes it to `estimatePathLatency`, `estimateThroughputRpm` and `estimateAvailability`,
  so every estimator and check agrees on what's connected.
- **A single `creditedKinds` helper** in `simulation.ts` returns the set of component
  kinds that earn credit, using the rules in the spec. Existing `hasLb`-style booleans are
  derived from it, so each call site changes by one expression and the diff stays small.
- **Queue consumers use the reachability traversal** (an edge drawn out of the queue, or
  a two-way edge), as approved.
- **Gap fixtures keep their `bad-gap-*` names** so references in the phase 1 findings
  stay valid; the findings note marks them fixed.
- **Pin the demos before touching the engine**, so the demo test is a true regression
  check rather than written to match new output.

## Task list

### Phase A: Baseline and helper
- [x] Task 1: Pin both demos in a regression test
- [x] Task 2: Reachability helper

### Checkpoint A
- [x] Suite green (still 4 expected fail); demos pinned; helper tested

### Phase B: Engine credit rules (test first: remove each `knownGap`, watch it fail, fix)
- [x] Task 3: Credit load balancers, caches, CDNs and task workers only when connected
- [x] Task 4: Credit queues only with a consumer; `topo-queue` warns otherwise
- [x] Task 5: `topo-reachable` check

### Checkpoint B
- [x] 0 expected failures; good-fixture estimates unchanged (probe); demos unchanged;
      tsc and lint green

Notes from Phases A and B:
- **Credited node ids, not kinds.** The plan's `creditedKinds` became `creditedNodeIds`:
  a set of kinds can't tell a connected cache from an unconnected one when a design
  has two.
- **Bonus:** the engine now also flags `chat-app/bad-no-subscribers` and
  `notification-system/bad-no-worker` (`topo-queue` warns), which only brief rules
  caught before.
- **Latency fallback unchanged:** a design with no edges still gets the fixed estimate
  (92 ms); `topo-reachable` fails it instead.

### Phase C: Documentation
- [x] Task 6: Update the authoring guide, findings note and spec status

### Checkpoint: Complete
- [x] All seven spec success criteria met; ready for review (nothing committed until asked)

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A good fixture's numbers move because a component it relies on isn't counted as reachable (e.g. edge direction drawn "backwards") | Med | Run the probe after every engine task and compare with the spec's table; investigate any change before continuing |
| `topo-reachable` warns on good fixtures or demos for nodes that are legitimately "leaves" | Med | Leaves are reachable (they have an incoming edge), so this only fires for truly disconnected nodes; the demo pin and `pass: true` fixtures would catch it |
| Client-less designs (fan-in demo) treated as unreachable | Med | Root fallback to nodes with no incoming edges; the fan-in demo is pinned |
| The latency estimate for a design with no edges stays at its fixed fallback | Low | Intended: `topo-reachable` fails such designs; latency modelling is a later step |
| Scope creep into database or compute credit | Low | Out of scope in the spec; note candidates in the findings instead |

## Parallelization

None worth it: Tasks 3 to 5 all edit `simulation.ts`, and each builds on the previous
one. Task 6 is small.

## Open questions

None. The spec's three questions were answered with the proposals.
