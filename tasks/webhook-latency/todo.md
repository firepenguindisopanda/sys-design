# Tasks: `webhook-latency`

Spec: [SPEC-webhook-latency.md](../../SPEC-webhook-latency.md). Plan: [plan.md](plan.md).

Standing verification: `npm test`, `npx tsc --noEmit` and `npm run lint` pass;
`tests/demos.test.ts` and every fixture's `expect` are unchanged.

---

## Task 1: Tests first

**Description:**
- **In `src/lib/simulation.test.ts`, `describe("request latency")`:**
  - `base()` plus an external API that the API calls (`api-1 -> pay`) and that calls the
    load balancer back (`pay -> lb`) gives the same latency as without the `pay -> lb`
    edge;
  - the call `api-1 -> pay` adds its 45 ms to the plain path.
- **In `tests/latency.test.ts`:** add `["printing-credits", "bad-no-webhook"]` to `PAIRS`.

**Acceptance criteria:**
- [x] The callback case and the guard pair fail against today's engine; the "call still
  counts" case passes already

**Verification:**
- [x] `npx vitest run src/lib/simulation.test.ts tests/latency.test.ts` shows only the
  expected failures

**Dependencies:** None

**Files:** `src/lib/simulation.test.ts`, `tests/latency.test.ts`

**Estimated scope:** XS

---

## Task 2: Engine change and target

**Description:**
- Add `external_api` to the kinds in `isAfterResponse`, and update its comment.
- Run the tests: the calibration test should now fail for printing-credits.
- Set `maxLatencyMs: 140` in `challenges/printing-credits/brief.yaml`.

**Acceptance criteria:**
- [x] Task 1's tests pass; the calibration test passes after the target change
- [x] The probe differs from `main` only in the spec's five printing-credits rows

**Verification:**
- [x] `npm test`
- [x] Compare `PROBE=1 npx vitest run tests/probe.test.ts` with `main`

**Dependencies:** Task 1

**Files:** `src/lib/simulation.ts`, `challenges/printing-credits/brief.yaml`

**Estimated scope:** XS

---

## Task 3: Docs and full checks

**Description:**
- **`brief-format.md`:**
  - the `nfr-latency` row adds callbacks out of external APIs;
  - one line on drawing a webhook.
- **`phase1-findings.md`:**
  - mark finding 14 fixed, with the table;
  - add printing-credits 230 → 140 to "Calibration done".
- **`HANDOVER.md`:** update it.
- **Checks:** `tsc`, lint and `npm run build`.

**Acceptance criteria:**
- [x] All three spec success criteria met

**Verification:**
- [x] Results recorded in the notes below and in `plan.md`

**Dependencies:** Task 2

**Files:** `docs/challenges/brief-format.md`, `docs/challenges/phase1-findings.md`,
`HANDOVER.md`, `tasks/webhook-latency/*`

**Estimated scope:** XS

---

## Notes

- **Task 1:** one unit case in "request latency" and one guard pair.
  - The case's first assertion (the call adds 45 ms: 81 ms) passed already; its second
    (callback adds nothing) failed with 126 against 81.
  - The guard pair failed (111 > 66).
- **Task 2:** `external_api` added to `isAfterResponse`.
  - After that, the only failure was the calibration test for printing-credits (230 >
    3 × 66), as planned.
  - With `maxLatencyMs: 140`, 509 passed.
  - The probe diff against `main` is exactly the four printing-credits rows that move
    (good, `bad-client-to-db` and `bad-single-db-replica` 111 → 66;
    `bad-client-calls-provider` 93 → 31). `bad-no-webhook` stays at 66.
- **Task 3:**
  - `brief-format.md`: the `nfr-latency` row, plus a bullet on drawing webhooks.
  - `phase1-findings.md`: "Update: finding 14 fixed", finding 14 marked fixed, and the
    calibration entry.
  - `HANDOVER.md`.
- `npm test` 509 passed, 1 skipped; `tsc`, lint and `npm run build` pass. No browser check
  (agreed in the spec).
