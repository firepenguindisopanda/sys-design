# Implementation Plan: `webhook-latency`

Spec: [SPEC-webhook-latency.md](../../SPEC-webhook-latency.md) (approved). Task checklist:
[todo.md](todo.md). Branch: `fix/webhook-latency`, from `main` (`5471f6a`). Earlier engine
steps: [request-latency/](../request-latency/plan.md),
[sync-and-polling/](../sync-and-polling/plan.md).

## Overview

One line in `isAfterResponse` stops the latency walk at edges leaving an external API.
The printing-credits target is recalibrated to match, and tests pin both changes. The
spec's prototype gives every expected number.

## Dependency graph

```
T1 tests: unit cases + guard pair, failing
        │
        ▼
T2 isAfterResponse change + printing-credits target 230 → 140
        │
        ▼
T3 docs, full checks
```

## Architecture decisions

- **Reuse `isAfterResponse`.** A callback from an outside service is one more kind of
  edge the student's request doesn't wait for. Putting it next to queues, workers and
  push keeps one place that defines "after the response".
- **The target changes in the same task as the engine.** Between the two changes the
  calibration test fails, which shows the recalibration is needed. Nothing is committed
  in between.
- **The prototype numbers are the expected values.** If any probe number differs from the
  spec's table, stop and find out why.

## Task list

- [x] Task 1: Tests first (unit cases and the guard pair)
- [x] Task 2: Engine change and printing-credits target
- [x] Task 3: Docs and full checks

### Checkpoint
- [x] All three spec success criteria met; ready for review (nothing committed until
  asked)

Notes: see [todo.md](todo.md). The probe matched the prototype exactly; 509 tests pass;
`tsc`, lint and build pass.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A two-way edge drawn from an external API loses both directions | Low | No fixture or demo has one; the brief-format doc says to draw such edges from your server |
| Another brief moves | Med | The prototype showed none; compare the probe with `main` line by line |
| The lower target fails a printing-credits fixture | Low | Every design in the brief is at 66 ms or less against 140; the fixture tests run it |
