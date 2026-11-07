# Implementation Plan: `engine-path-scale`

Spec: [SPEC-engine-path-scale.md](../../SPEC-engine-path-scale.md) (approved 2026-11-06).
Capability map: [CAPABILITY-MAP-stress.md](../../CAPABILITY-MAP-stress.md). Task
checklist: [todo.md](todo.md). Branch: `fix/engine-path-scale`, from `main` (`e396546`).

## Overview

- **The walk** in `estimatePathLatency` moves into a small exported pure function,
  `longestRequestPath`, which counts its steps and falls back to a linear estimate past a
  budget.
- **`estimatePathLatency`** builds the same hop graph as now, calls it, and passes on
  whether the result is an estimate.
- **The latency check** adds one sentence when it is.
- **The ladder's** last three pins become ordinary cases.

## Dependency graph

```
T0 baseline: branch, engine probe saved
        │
        ▼
T1 longestRequestPath (walk + budget + linear fallback), its unit tests
        │
        ▼
T2 estimatePathLatency and the latency check use it; the dense-design and unchanged tests
        │
        ├────────────────────────┐
        ▼                        ▼
T3 ladder pins flip         T4 browser, probe identical, full checks, docs, commit
```

## Architecture decisions

### `longestRequestPath` (in `simulation.ts`, exported for tests)

```ts
export type HopGraph = { out: Map<string, { to: string; ms: number }[]>; roots: string[] };
export function longestRequestPath(g: HopGraph, budget = PATH_WALK_BUDGET): { ms: number; estimated: boolean };
```

- **The exact walk:** today's `visit`, as it is, with a step counter. The counter
  increments where `visit` is entered, the same place the scratch measurement counted (at
  most 42 for fixtures). Past the budget, the walk stops by throwing a private sentinel,
  which is caught at the top.
- **The fallback:** a memoised longest path from each root, where an edge back onto the
  current path adds its hop and ends there. It's the version measured in the spec. Its
  comment says it's exact only without cycles.
- **Result:** `{ ms: max, estimated: false }` from the walk, or `{ ms, estimated: true }`
  from the fallback.

`estimatePathLatency` keeps building `outgoing` exactly as now (`isAfterResponse`, the
reverse hops for WebSocket and WebRTC, `hopLatencyMs`) and the roots from `requestRoots`.
- **The hop graph:** it hands those to `longestRequestPath` instead of walking itself.
- **What stays as it is:** the `edges.length === 0` shortcut and the adjustments after the
  walk (static and CDN, cache-aside, the 20 ms floor).
- **Return value:** it returns `{ ms, estimated }`.

### Latency check

`runVerification` reads `.ms` where it read the number. If `estimated` is true, it appends
` This design has too many paths to time each one, so this is an estimate.` to the
`nfr-latency` detail, after `latencyScope` and `inlineNotes`, so the existing text and its
tests are untouched.

### Ladder

`PINNED` becomes `{}`. Its comment records that `engine-path-scale` removed the last pins.
The `it.fails` branch stays, for future pins.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Moving the walk changes a result | High: every brief's latency | The walk's body is moved, not rewritten. The engine probe and `demos.test.ts` must be identical, and T2 has a test comparing `chat-app/good` (cycles) and both demos before and after. |
| The counter sits somewhere that counts differently from the measurement | Low | Only the threshold moves; results below it are the walk's own. T1 tests a graph that takes exactly `budget` steps, and one that takes `budget + 1`. |
| The fallback is slow on huge graphs | Low | It visits each node and edge once. T2 times the 200-node design end to end at under 500 ms. |
| 100,000 walk steps before the fallback cost too much | Low | Each step copies a small `Set`. T2's timing covers it, and the ladder's budget is 500 ms. |

## Open questions

None.
