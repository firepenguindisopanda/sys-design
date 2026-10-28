# Tasks: `latency-targets`

Spec: [SPEC-latency-targets.md](../../SPEC-latency-targets.md). Plan: [plan.md](plan.md).

Standing verification: `npm test`, `npx tsc --noEmit`, `npm run lint` pass;
`tests/demos.test.ts` and every fixture's `expect` unchanged; no engine change.

---

## Task 1: Guard test first

**Description:** New `tests/calibration.test.ts`: load the briefs; for each brief, run its
`good` fixture and check

- latency ≤ `nfr.maxLatencyMs`;
- `nfr.maxLatencyMs` ≤ 3 × latency.

**Acceptance criteria:**
- [x] Against today's briefs, the second check fails for exactly the seven briefs whose
  targets change (shuttle-tracker only just: 100 ms is 3.03 × 33 ms) and passes for
  course-assistant (2.0×); the first check passes for all eight

**Verification:**
- [x] `npx vitest run tests/calibration.test.ts` shows the expected failures

**Dependencies:** None

**Files:** `tests/calibration.test.ts`

**Estimated scope:** S

---

## Task 2: The seven targets

**Description:** Set `maxLatencyMs` in each `challenges/<id>/brief.yaml` to the spec's
table: link-shortener 70, file-storage 90, chat-app 60, notification-system 70,
lab-autograder 50, course-registration 70, shuttle-tracker 70. course-assistant stays 120.

**Acceptance criteria:**
- [x] Task 1's tests pass
- [x] The probe shows every good design at the spec's latency and passing
- [x] Only `link-shortener/bad-gap-no-edges` gains an `nfr-latency` fail
- [x] All existing tests unchanged

**Verification:**
- [x] `npm test`; probe compared with the spec; standing checks

**Dependencies:** Task 1

**Files:** seven `challenges/*/brief.yaml`

**Estimated scope:** XS

---

## Task 3: Docs, full checks, browser spot check

**Description:** The calibrating step and `nfr` example in
`docs/challenges/brief-format.md`; "Calibration done" and the finding 12 update in
`docs/challenges/phase1-findings.md`; `HANDOVER.md`. In the browser, start the
lab-autograder challenge: the Requirements tab shows 50 ms; importing `good.yaml` shows
the latency row passing at 25 ms against ≤ 50 ms.

**Acceptance criteria:**
- [x] Docs updated
- [x] Browser shows the new target; no console errors
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` pass

**Dependencies:** Task 2

**Files:** `docs/challenges/brief-format.md`, `docs/challenges/phase1-findings.md`,
`HANDOVER.md`, `tasks/plan.md`, `tasks/todo.md`

**Estimated scope:** S

### Checkpoint
- [x] All three spec success criteria met; ready for review (nothing committed until
  asked)
