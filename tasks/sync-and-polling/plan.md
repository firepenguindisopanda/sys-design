# Implementation Plan: `sync-and-polling`

Spec: [SPEC-sync-and-polling.md](../../SPEC-sync-and-polling.md) (approved). Task checklist:
[todo.md](todo.md). Branch: `fix/sync-and-polling`, from `main` (`a735869`). Earlier
engine step: [request-latency/](../request-latency/plan.md).

## Overview

Two optional feature fields, `backgroundWorkMs` and `pollingRpm`, go from `brief.yaml`
through the validator into `FeatureBlock`. The engine checks whether each marked feature's
compute node hands its work to a task worker through a queue, and whether it pushes to
clients. Inline work adds to latency; polling raises the throughput target. The check
details name the feature. Six briefs get the fields, and nine fixtures get stronger
expectations. The spec's prototype gives every expected number.

## Dependency graph

```
T1 feature fields: tests, then types + validator + design.ts + design-file.ts
        │
        ▼
T2 engine unit tests (inline work, push, messages), failing
        │
        ▼
T3 engine change in simulation.ts
        │
        ▼
T4 briefs + fixture expectations + latency guard (expectations first, failing)
        │
        ▼
T5 docs, full checks, browser check
```

## Architecture decisions

- **`estimatePathLatency` doesn't change.** It still measures the request path.
  `runVerification` adds the largest inline `backgroundWorkMs` on top of it. The meaning of
  "request path" stays the same as in finding 12, and the unit tests for it are unaffected.
- **Two small edge helpers in `simulation.ts`:**
  - `handsOffWork(nodeId)`: an edge from the node to a `message_queue` that has an edge to
    a `task_worker`.
  - `pushesToClients(nodeId)`: an SSE or Web Push edge from the node to a client, or a
    WebSocket edge between the node and a client, directly or through a `load_balancer`
    that has a WebSocket edge with a client.

  Both work from edges, not from reachability or crediting, so they read like the rule
  the spec states. Clients are `isClientKind` (mobile, desktop, IoT).
- **Capacity doesn't change.** Polling only changes the demand side (`demandedRpm`).
- **Messages are appended to the existing detail** of `nfr-latency` and `nfr-throughput`,
  in both pass and fail, so check ids and rule results stay the same.
- **No `undefined` keys.** `design.ts`, the validator and `design-file.ts` add the fields
  only when present, so existing deep-equality tests and exported files don't change for
  briefs without them.
- **The prototype numbers are the expected values.** If a fixture's number differs from
  the spec's table, stop and find out why before going on.

## Task list

- [x] Task 1: Feature fields (tests first, then plumbing)
- [x] Task 2: Engine unit tests, failing
- [x] Task 3: Engine change and messages
- [x] Task 4: Briefs, fixture expectations, latency guard
- [x] Task 5: Docs, full checks, browser check

### Checkpoint
- [x] All four spec success criteria met; ready for review (nothing committed until
  asked)

Notes: see [todo.md](todo.md). Results:
- Every number matched the prototype.
- Eight fixtures were strengthened (the ninth already had `nfr-latency`).
- The engine now catches 42 of 53 bad designs.
- 507 tests pass; `tsc`, lint and build pass; the browser check passed on both fixtures.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A good design moves after all | High | The prototype showed none; `tests/demos.test.ts` and every `good.yaml` run in each check, and the probe is compared with the spec's table |
| Optional fields leak as `undefined` and break equality tests or exports | Med | Conditional spreads; the round-trip test in Task 1 checks an export without the fields is unchanged |
| "60049 ms" reads as broken | Med | The detail names the feature and says to queue it; the brief-format doc explains the field |
| A student pushes from a worker and is still told they poll | Low | Intended: the feature runs on the API, so the API must push. The detail says what to add; a unit test pins it |
| Sandbox users can't set the fields in the UI | Low | Out of scope (spec); import keeps them |
