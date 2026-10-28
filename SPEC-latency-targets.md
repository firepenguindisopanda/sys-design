# Spec: recalibrate the briefs' latency targets

Status: **implemented** (2026-10-28); approved with all three proposals: the 2× rule, the 3× guard
test, and a combined plan and task list. Plan: [tasks/latency-targets/plan.md](tasks/latency-targets/plan.md). Follows the finding 12 fix (`request-latency`,
`063d6db`), whose open question 1 left the targets alone. Module id `latency-targets`.
Branch: `chore/latency-targets`, from `main` (`063d6db`).

## Objective

Each brief's `maxLatencyMs` should say something about the design. Today the targets were
set against the old "longest chain anywhere" latency, and the finding 12 fix made good
designs 12–44 ms faster, so seven of the eight targets are now three to six and a half
times the good design's latency. A target that nothing realistic can miss teaches students that latency doesn't
matter, and leaves no room for the finding 10/7 fix to catch slow shortcuts through
`nfr-latency` later.

Users: students reading the "Latency budget" row and the Requirements tab; you, writing
new briefs.

## Current numbers

From the probe on `main` (`PROBE=1 npx vitest run tests/probe.test.ts`):

| Brief | Target | Good design | Ratio | Slowest bad design (excluding no-edges) |
|---|---|---|---|---|
| link-shortener | 120 ms | 31 ms | 3.9× | `bad-no-cache` 46 ms |
| file-storage | 250 ms | 43 ms | 5.8× | `bad-no-metadata-db` 58 ms |
| chat-app | 150 ms | 30 ms | 5.0× | `bad-client-to-db` 37 ms |
| notification-system | 200 ms | 31 ms | 6.5× | all 31 ms |
| lab-autograder | 100 ms | 25 ms | 4.0× | all 25 ms |
| course-registration | 100 ms | 31 ms | 3.2× | `bad-no-cache` 46 ms |
| shuttle-tracker | 100 ms | 33 ms | 3.0× | `bad-no-cache` 48 ms |
| course-assistant | 120 ms | 60 ms | 2.0× | `bad-no-history` 75 ms |

No fixture asserts `nfr-latency`, and both demos use their own sandbox NFRs, not a brief's.

## Change

**Rule:** a brief's latency target is **twice its good design's latency, rounded up to the
next 10 ms**. Only the eight `brief.yaml` files change; the engine doesn't.

| Brief | Today | Proposed |
|---|---|---|
| link-shortener | 120 | **70** |
| file-storage | 250 | **90** |
| chat-app | 150 | **60** |
| notification-system | 200 | **70** |
| lab-autograder | 100 | **50** |
| course-registration | 100 | **70** |
| shuttle-tracker | 100 | **70** |
| course-assistant | 120 | 120 (unchanged) |

Why twice, not the 15–30 % headroom used for throughput and cost:

- **Correct variants need room.** The engine charges 25 ms for an extra compute hop, 28 ms
  for object storage and 45 ms for an external API. A student who adds an API gateway or a
  second service in front of the database shouldn't fail latency for a sound design. Twice
  the good latency leaves at least 25 ms, one compute hop, in every brief (the tightest is
  lab-autograder: 25 ms good, 50 ms target).
- **Latency isn't where these briefs separate designs.** The engine's latency is a rough
  hop sum. Missing caches already fail on throughput; a tight latency target would only
  duplicate that with a less convincing reason.

Effect on fixtures: every good design still passes. The only bad design that newly fails
`nfr-latency` is `link-shortener/bad-gap-no-edges` (92 ms against 70), which already fails
five checks; fixtures only assert the ids they list, so no test changes.

## Interaction with findings 10 and 7

The project convention is that engine fixes keep the good designs' numbers. If the finding
10/7 fix follows that and only makes synchronous and polling shortcuts slower, these targets
stay valid and won't need redoing. The fix would then be able to catch a shortcut through
`nfr-latency` once it costs more than one extra hop over its good design, which today's
loose targets would hide.

## Tests

Test first, in a new `tests/calibration.test.ts`:

- for each brief, the good design's latency is **at most** the target (already implied by
  `expect.pass`, but stated here with the numbers in the failure message);
- for each brief, the target is **at most three times** the good design's latency, so a
  later engine change that makes good designs much faster turns this red instead of silently
  loosening the targets, as finding 12 did. Three, not two, so a brief may choose a little
  more headroom without breaking the test (open question 2).

Regression: all existing tests unchanged, including `tests/challenges.test.ts` and
`tests/demos.test.ts`.

## Docs

- `docs/challenges/brief-format.md`: the calibrating step gives the latency rule (twice the
  good design's latency, rounded up to 10 ms) next to the throughput and cost headroom, and
  the `nfr` example uses a calibrated number.
- `docs/challenges/phase1-findings.md`: "Calibration done" lists the new targets; the
  finding 12 update's "latency targets weren't changed" line points here.
- `HANDOVER.md`: built item 14; the candidate list drops recalibration.

## Boundaries

- **Always:** good designs pass; demos and every fixture's expectations unchanged; tests,
  types, lint and build green.
- **Ask first:** changing any other NFR (throughput, availability, cost); changing a good
  design to fit a target; any engine change.
- **Never:** weaken a fixture's expectations; change the engine to fit a target.

## Success criteria

1. Every brief's `maxLatencyMs` matches the table above.
2. `tests/calibration.test.ts` passes, and fails if a target is set above three times the
   good design's latency.
3. All existing tests, `tsc`, lint and `npm run build` pass.

## Open questions

1. **The rule itself.** Proposal: twice the good latency, rounded up to 10 ms. Alternative:
   about 1.3× (the throughput headroom), e.g. link-shortener 40 ms, which would also fail
   the no-cache designs on latency; rejected above because it fails correct designs with
   one extra hop.
2. **Calibration guard.** Proposal: the "at most three times" test. Alternative: no guard,
   and rely on re-running the probe after each engine change.
3. **Paperwork.** Eight numbers, one test file and docs. Proposal: this spec plus a short
   combined plan and task list, approved together, as for `request-latency`.
