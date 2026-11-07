# Implementation Plan: `loadsim-route-scale`

Spec: [SPEC-loadsim-route-scale.md](../../SPEC-loadsim-route-scale.md) (approved
2026-11-06). Capability map: [CAPABILITY-MAP-stress.md](../../CAPABILITY-MAP-stress.md).
Task checklist: [todo.md](todo.md). Branch: `fix/loadsim-route-scale`, from `main`
(`ed03bcf`).

## Overview

- **`buildFlowGraph`** counts the route steps it creates. Once the count passes 2,000, it
  throws `TooManyRoutesError`.
- **Readiness** turns that error into a message for the student.
- **The page** checks readiness before it mounts the part that runs the model.
- **The harness** loses its last `loadsim-route-scale` pins.

Nothing about how routes are simulated changes, so every number within the budget stays
the same.

## Dependency graph

```
T0 baseline: branch, probe outputs saved
        │
        ▼
T1 graph: step counter, ROUTE_BUDGET, TooManyRoutesError; growth tests updated
        │
        ├────────────────────────┐
        ▼                        ▼
T2 readiness message        T4 ladder: refusal counts as a pass
        │
        ▼
T3 page: not-ready designs never reach the model
        │
        ▼
T5 browser, probes identical, full checks, ladder, docs, commit
```

## Architecture decisions

### Counting (`graph.ts`)

- **`ROUTE_BUDGET = 2_000`** goes in `capacities.ts`, next to the model's other limits.
- **`TooManyRoutesError`** is exported from `graph.ts`, as in the spec's code style.
- **`buildFlowGraph`** gets a fifth, optional parameter, `budget = ROUTE_BUDGET`, so tests
  can prove the count is exact. `simulateLoad` and every other caller leave it out.
- **The counter:** a local `made` counter and a helper
  `step = (s: PathStep): PathStep => { if (++made > budget) throw new TooManyRoutesError(budget); return s; }`
  wrap each of the seven places that create a route step:
  - `jobFrom`;
  - `workerStep`, both its database steps and the worker step;
  - `dataSteps`, both its database and cache steps;
  - `routeFrom`'s compute and pass-through steps;
  - the class root.
- **When steps are created:** steps are only created when they're kept (`routeFrom`
  returns `null` before creating one for a dead end). So the count equals the steps in the
  finished graph, and T1's exactness test checks this.
- **What happens at the limit:** the throw happens at step 2,001, so no design costs more
  than about 2,000 steps of work, however deep it is.

### Readiness (`readiness.ts`)

- **When it checks:** only when `missingForLoad` has found nothing else, as the spec says.
- **How it checks:** it calls `buildFlowGraph(nodes, edges, features)`, catches
  `TooManyRoutesError`, and pushes the spec's message. Any other error is rethrown.
- **Cost:** within the budget this builds the graph once more on page load. That's at most
  about 2,000 steps, a few milliseconds.

### Page (`load-sim-app.tsx`)

`LoadSimApp` does
`if (state.status === "ready" && missingForLoad(...).length > 0) return <LoadSimView state={state} />;`
before mounting `ReadyPage`.
- `LoadSimView` with a ready design and no canvas already shows the "isn't ready" message
  (`Ready` in `load-sim-view.tsx`). So `ReadyPage`, and its `simulateLoad` in a `useMemo`,
  are never mounted for such a design.
- It's computed with `useMemo` on `state`, so it runs once per handover.
- A side effect: designs that aren't ready for other reasons, such as having no client, no
  longer run the model just to throw the result away.

### Ladder (`tests/stress-scale.test.ts`)

- **The child** wraps `simulateLoad` in `try`. On `TooManyRoutesError` it writes
  `{ engineMs, routeSteps, loadMs, refused: true }`, where `loadMs` is how long the refusal
  took.
- **Route steps:** the child's own count of route steps (for the printed table) builds
  the graph with `budget = 1_000_000`. Every ladder design is far below that (7 × 4 is
  109,226 steps, built in about 0.1 s), so the table keeps showing real counts.
- **The parent** prints "refused: too many routes" for a refusal. A refusal within the
  load-model budget passes.
- **The pins:** `PINNED` loses the three `stacked` entries and keeps the three
  `engine-path-scale` ones.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A step-creation site is missed, so the count undercounts and a huge design still builds | High | T1's exactness test: for every fixture, both demos and 50 generated designs of each shape, building with `budget = routeSteps(graph)` succeeds and `budget = routeSteps(graph) − 1` throws. A missed site makes the second build succeed. |
| The counter changes a graph within the budget | High | The helper returns the same object it's given. The graph snapshot, `loadsim-unchanged-baseline.json` and both probes must be identical. |
| Readiness's extra build slows page load | Low | At most about 2,000 steps, measured once in the browser check. |
| The ladder child's route count is slow on 7 layers | Low | Building 109,226 steps takes about 0.1 s, and it's outside the timed part. The model itself refuses in milliseconds. |

## Open questions

None.
