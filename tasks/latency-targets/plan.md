# Implementation Plan: `latency-targets`

Spec: [SPEC-latency-targets.md](../../SPEC-latency-targets.md) (approved). Task checklist:
[todo.md](todo.md). Branch: `chore/latency-targets`, from `main` (`063d6db`). Earlier
steps: [phase1/](../phase1/plan.md), [reachability/](../reachability/plan.md),
[data-checks/](../data-checks/plan.md), [challenge-slice1/](../challenge-slice1/plan.md),
[challenge-panels/](../challenge-panels/plan.md), [design-io/](../design-io/plan.md),
[confirm-replace/](../confirm-replace/plan.md), [phase4-briefs/](../phase4-briefs/plan.md),
[request-latency/](../request-latency/plan.md).

## Overview

Set each brief's `maxLatencyMs` to twice its good design's latency, rounded up to the next
10 ms, and add a guard test that keeps targets within 3× of the good design. Seven numbers
in `brief.yaml` files change; no engine or fixture changes.

## Dependency graph

```
T1 tests/calibration.test.ts, failing on the seven loose targets
        │
        ▼
T2 seven brief.yaml targets
        │
        ▼
T3 docs (brief-format, findings, HANDOVER), full checks, browser spot check
```

## Architecture decisions

- **The guard reads the real briefs and good fixtures,** like `tests/latency.test.ts`
  (`loadChallenges` + `runFixture`), so it checks the content students get.
- **The guard is an upper bound only (≤ 3×),** not the exact 2× rule, so a brief can take
  a little more headroom; the lower bound is the good fixture's existing `expect.pass`,
  restated in the new test with both numbers in the message.
- **Expected values come from the spec's table.** If the probe shows any good design at a
  different latency from the spec, stop and find out why.

## Task list

- [x] Task 1: Guard test first
- [x] Task 2: The seven targets
- [x] Task 3: Docs, full checks, browser spot check

### Checkpoint
- [x] All three spec success criteria met; ready for review (nothing committed until
  asked)

Notes:
- **Task 1:** `tests/calibration.test.ts`, 16 cases (two per brief). Against the old
  targets exactly the seven expected "at most 3×" cases failed (shuttle-tracker at
  100 ms vs 99); all eight "meets the target" cases passed.
- **Task 2:** seven `maxLatencyMs` values changed. The probe shows every good design at
  the spec's latency and passing; the only new `nfr-latency` fail is
  `link-shortener/bad-gap-no-edges` (92 ms vs ≤ 70 ms). Demos and fixtures unchanged.
- **Task 3:** `brief-format.md` (calibrating step, `nfr` example, test table),
  `phase1-findings.md` ("Calibration done", pointer from the finding 12 update),
  `HANDOVER.md` (item 14). Browser (DevTools, 1440×900): lab autograder's Requirements tab
  shows Max latency 50 (locked); importing `good.yaml` and running gives Pass, "Actual
  25 ms · Target ≤ 50 ms". Console: only React Flow's attribution warning.
- `npm test` 390 passed, 1 skipped; `tsc`, lint and `npm run build` pass.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A correct student variant with two extra hops fails latency | Med | 2× leaves at least one compute hop (25 ms) in every brief; the detail text says how to bring latency down |
| A later engine change makes good designs slower and they fail their own target | Med | The good fixtures' `expect.pass` fails loudly in `tests/challenges.test.ts`; recalibrate with the probe then |
| A later engine change makes good designs much faster and targets go loose again | Low | The 3× guard turns red |

## Open questions

None. The spec's three questions were answered with the proposals.
