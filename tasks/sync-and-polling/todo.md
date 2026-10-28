# Tasks: `sync-and-polling`

Spec: [SPEC-sync-and-polling.md](../../SPEC-sync-and-polling.md). Plan: [plan.md](plan.md).

Standing verification: `npm test`, `npx tsc --noEmit` and `npm run lint` pass;
`tests/demos.test.ts` and every good design's numbers are unchanged; fixture expectations
are only strengthened.

---

## Task 1: Feature fields

**Description:** Write these tests first:
- **`validate.test.ts`:**
  - a brief whose feature has `backgroundWorkMs: 3000` and `pollingRpm: 2400` loads with
    both fields;
  - 0, -5 or `"fast"` is rejected with the file and the field path (for example
    `functionalRequirements[0].feature.backgroundWorkMs`);
  - a brief without the fields loads with no such keys.
- **`design.test.ts`:** `buildDesign` copies the fields into features, and adds no keys
  when they're absent.
- **`design-file.test.ts`:**
  - a sandbox design whose features carry both fields survives export then import;
  - an export without them has no new lines.

Then add the optional fields to `FeatureBlock` (`src/lib/types.ts`) and `BriefFeature`
(`src/lib/challenges/types.ts`). Read them in `readRequirement` with `num(…, 1)`, and copy
them in `design.ts` and `design-file.ts` with conditional spreads.

**Acceptance criteria:**
- [x] New tests fail first, then pass; all existing tests pass

**Verification:**
- [x] `npx vitest run src/lib/challenges` and `npx tsc --noEmit`

**Dependencies:** None

**Files:** `src/lib/types.ts`, `src/lib/challenges/{types,validate,design,design-file}.ts`
and their tests

**Estimated scope:** S

---

## Task 2: Engine unit tests

**Description:** In `src/lib/simulation.test.ts`, add a `describe("inline work and
polling")` block, using the file's `node`, `edge` and `feature` helpers. It covers every
case listed in the spec's Tests section:
- **Inline work:**
  - queue + task worker: nothing added;
  - queue with no consumer: added;
  - queue consumed only by compute: added;
  - queue edge from another compute node: added;
  - no field: nothing changes;
  - two inline features: only the larger is added.
- **Polling:**
  - SSE to a client: pushed;
  - WebSocket from client to load balancer to the hosting node: pushed;
  - SSE drawn client → server: polled;
  - Web Push only from a worker: polled;
  - when polled, the target uses `pollingRpm`;
  - no field: nothing changes.
- **Messages:** the feature name appears in the `nfr-latency` and `nfr-throughput` detail
  when passing and when failing.

**Acceptance criteria:**
- [x] The cases that need the change fail against today's engine; the "nothing changes"
  and "pushed" cases already pass

**Verification:**
- [x] `npx vitest run src/lib/simulation.test.ts` shows only the expected failures

**Dependencies:** Task 1 (the fields exist on `FeatureBlock`)

**Files:** `src/lib/simulation.test.ts`

**Estimated scope:** S

---

## Task 3: Engine change and messages

**Description:** In `src/lib/simulation.ts`:
1. Add `handsOffWork` and `pushesToClients`.
2. In `runVerification`, find the inline features and the polled features.
3. Add the largest inline `backgroundWorkMs` to the latency.
4. Use `pollingRpm` for polled features in `demandedRpm`.
5. Append to the `nfr-latency` and `nfr-throughput` details. Use the spec's wording, one
   sentence per feature.
6. Drop "Background work … isn't included" from the latency text when work is inline.

**Acceptance criteria:**
- [x] Task 2's tests pass
- [x] The probe is unchanged for every fixture, because no brief has the fields yet

**Verification:**
- [x] `npm test`
- [x] `PROBE=1 npx vitest run tests/probe.test.ts` gives the same numbers as `main`

**Dependencies:** Task 2

**Files:** `src/lib/simulation.ts`

**Estimated scope:** S

---

## Task 4: Briefs, fixture expectations, latency guard

**Description:** First, add the new expectations, so they fail:
- `nfr-latency` in `fails` for:
  - `lab-autograder/bad-sync-grading` and `bad-no-worker`;
  - `notification-system/bad-sync-delivery` and `bad-no-worker`;
  - `lecture-video-library/bad-sync-transcode`.
- `nfr-throughput` in `fails` for `chat-app/bad-http-polling`,
  `shuttle-tracker/bad-polling` and `shuttle-tracker/bad-sse-wrong-direction`.
- In `tests/latency.test.ts`, a "strictly faster" list for `bad-sync-grading`,
  `bad-sync-delivery` and `bad-sync-transcode`.

Then add the six fields from the spec's table to the briefs.

**Acceptance criteria:**
- [x] The new expectations fail before the brief edits and pass after them
- [x] The probe matches the spec's prototype table exactly
- [x] Good designs, other fixtures and the calibration test are unchanged

**Verification:**
- [x] `npm test`
- [x] Compare the probe output with `main`: only the nine rows in the spec's table move

**Dependencies:** Task 3

**Files:** six `brief.yaml` files, nine fixtures, `tests/latency.test.ts`

**Estimated scope:** S

---

## Task 5: Docs, full checks, browser check

**Description:**
- **`brief-format.md`:**
  - the two feature fields, with when and how to pick a value;
  - the `nfr-latency` and `nfr-throughput` rows say what each now includes.
- **`phase1-findings.md`:** a section "Update: findings 10 and 7", with the results table
  and 42 of 53; mark 7 and 10 as addressed in the original list.
- **`HANDOVER.md`:** update it.
- **Browser check** (DevTools, 1440 wide): import `lab-autograder/bad-sync-grading` and
  `shuttle-tracker/bad-polling`, run them, and read the latency and throughput rows with
  their details. Check the console.

**Acceptance criteria:**
- [x] All four spec success criteria met
- [x] `npm test`, `tsc`, lint and `npm run build` pass

**Verification:**
- [x] Results recorded in the notes below and in `plan.md`

**Dependencies:** Task 4

**Files:** `docs/challenges/brief-format.md`, `docs/challenges/phase1-findings.md`,
`HANDOVER.md`, `tasks/sync-and-polling/*`

**Estimated scope:** S

---

## Notes

- **Task 1:** 4 new tests (validator, `buildDesign`, sandbox round trip with and without
  the fields). The 3 that need the fields failed first; "writes neither field" already
  passed. A shared `optionalWorkload()` in `design.ts` adds the fields only when set; it's
  used by `design.ts` and twice in `design-file.ts`. 487 passed; `tsc` clean.
- **Task 2:** 17 cases in "inline work and polling". Against the old engine exactly the
  expected 10 failed: 4 inline, 4 polled and the 2 message tests. The 7 "pushed" and
  "nothing changes" cases already passed.
- **Task 3:** `handsOffWork` and `pushesToClients` in `simulation.ts`.
  - `runVerification` adds the largest inline `backgroundWorkMs` to latency, and uses
    `pollingRpm` for polled features in the demand.
  - Details get one sentence per feature, and the latency text drops "Background work …
    isn't included" when work is inline.
  - 504 passed. The probe was identical to `main` for all 192 lines.
- **Task 4:** strengthened 8 fixtures. The spec said nine, but
  `course-link-checker/bad-sync-crawl` already listed `nfr-latency`. Added the "strictly
  faster" list to `tests/latency.test.ts`.
  - Before the brief edits, exactly those 11 tests failed. After adding the six fields,
    507 passed.
  - The probe diff against `main` is exactly the spec's nine rows (3025, 2031, 60049 and
    60060 ms; targets 2700 and 4020). Good designs, other fixtures and demos are
    unchanged.
- **Task 5:**
  - `brief-format.md`: the two fields and how to pick values, plus the `nfr-latency` and
    `nfr-throughput` rows.
  - `phase1-findings.md`: "Update: findings 10 and 7 addressed" (42 of 53); findings 7
    and 10 marked as addressed.
  - `HANDOVER.md`.
  - Browser (DevTools, 1440):
    - Lab autograder `bad-sync-grading.yaml` → Fail, 3025 ms against ≤ 50. The latency
      detail says "Submit solution waits for 3000 ms of slow work. Put it on a queue that
      a task worker consumes."
    - Shuttle tracker `bad-polling.yaml` → Fail, 1660 req/min against ≥ 4020. The
      throughput detail says "Live map isn't pushed to clients, so they poll: 3600
      req/min instead of 900. Push updates over SSE or a WebSocket."
    - Latency there still shows the usual pass text (33 ms).
    - Console: only React Flow's attribution warning.
- `npm test` 507 passed, 1 skipped; `tsc`, lint and `npm run build` pass.
