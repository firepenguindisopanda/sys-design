# Tasks: `file-serving`

Spec: [SPEC-file-serving.md](../../SPEC-file-serving.md). Plan: [plan.md](plan.md).

Standing verification: `npm test`, `npx tsc --noEmit` and `npm run lint` pass;
`tests/demos.test.ts` and every good design's numbers are unchanged; fixture expectations
are only strengthened.

---

## Task 1: `fileRpm` plumbing

**Description:** First, extend the existing tests for the other two fields:
- **`validate.test.ts`:** the field is accepted, and 0, -5 or `"fast"` is rejected with
  the field path.
- **`design.test.ts`:** the field is copied only when set.
- **`design-file.test.ts`:** the field survives a sandbox round trip, and nothing is
  written when it's absent.

Then add `fileRpm` to `FeatureBlock`, `BriefFeature`, `readRequirement` and
`optionalWorkload`.

**Acceptance criteria:**
- [x] New assertions fail first, then pass; all existing tests pass

**Verification:**
- [x] `npx vitest run src/lib/challenges` and `npx tsc --noEmit`

**Dependencies:** None

**Files:** `src/lib/types.ts`, `src/lib/challenges/{types,validate,design}.ts` and tests

**Estimated scope:** XS

---

## Task 2: Engine unit tests

**Description:** Add `describe("file serving")` to `src/lib/simulation.test.ts`, starting
from `base()` with a feature carrying `fileRpm`.
- **Not charged:**
  - client → CDN → static hosting;
  - client → CDN → object storage;
  - client → static hosting.
- **Charged:**
  - no store;
  - CDN → load balancer;
  - CDN → database;
  - object storage reached only by compute.
- **Totals:** two features both add their `fileRpm`; a feature without it changes nothing.
- **Message:** the feature is named in the pass and the fail case.

**Acceptance criteria:**
- [x] The "charged" and message cases fail against today's engine; the "not charged" and
  "nothing changes" cases already pass

**Verification:**
- [x] `npx vitest run src/lib/simulation.test.ts` shows only the expected failures

**Dependencies:** Task 1

**Files:** `src/lib/simulation.test.ts`

**Estimated scope:** S

---

## Task 3: Engine change and message

**Description:** In `src/lib/simulation.ts`:
1. Add `filesFromStore`.
2. In `runVerification`, add `fileRpm` to the demand for placed features when the files
   don't come from a store.
3. Append the spec's sentence for each such feature to the `nfr-throughput` detail.

**Acceptance criteria:**
- [x] Task 2's tests pass
- [x] The probe is identical to `main`, because no brief has the field yet

**Verification:**
- [x] `npm test`; compare the probe with `main`

**Dependencies:** Task 2

**Files:** `src/lib/simulation.ts`

**Estimated scope:** XS

---

## Task 4: Briefs and fixture expectations

**Description:** First, add `nfr-throughput` to `fails` in these fixtures, and check that
they fail:
- `campus-food-guide/bad-pages-from-api`
- `lecture-video-library/bad-no-cdn`
- `lecture-video-library/bad-video-in-db`
- `file-storage/bad-files-in-db`

Then add `fileRpm` to the three briefs from the spec's table.

**Acceptance criteria:**
- [x] The four fail before the brief edits and pass after them
- [x] The probe diff against `main` is exactly the four targets in the spec, including
  file-storage at 2220 against 1260
- [x] Good designs, other fixtures and the calibration test are unchanged

**Verification:**
- [x] `npm test`; compare the probe with `main`

**Dependencies:** Task 3

**Files:** three `brief.yaml` files, four fixtures

**Estimated scope:** XS

---

## Task 5: Docs, full checks, browser check

**Description:**
- **`brief-format.md`:**
  - `fileRpm` with how to pick a value;
  - the `nfr-throughput` row.
- **`phase1-findings.md`:**
  - an "Update: finding 15 addressed" section (45 of 53);
  - finding 15 marked addressed;
  - finding 5 notes the throughput catch.
- **`HANDOVER.md`:** update it.
- **Browser check** (DevTools, 1440 wide): import
  `campus-food-guide/bad-pages-from-api`, run it, and read the throughput row and its
  detail. Check the console.

**Acceptance criteria:**
- [x] All three spec success criteria met
- [x] `npm test`, `tsc`, lint and `npm run build` pass

**Verification:**
- [x] Results recorded in the notes below and in `plan.md`

**Dependencies:** Task 4

**Files:** `docs/challenges/brief-format.md`, `docs/challenges/phase1-findings.md`,
`HANDOVER.md`, `tasks/file-serving/*`

**Estimated scope:** S

---

## Notes

- **Task 1:** extended the three field tests (validator, `buildDesign`, sandbox round
  trip). They failed first, then passed once `fileRpm` was in the types, the validator
  and `optionalWorkload`. 509 passed; `tsc` clean.
- **Task 2:** 11 cases in "file serving". Against the old engine exactly the expected 6
  failed: 5 "charged" cases and the message. The 3 "not charged" cases and "nothing
  changes" already passed. The message test was tightened before implementing, so it
  checks a definite pass (`fileRpm` 50) and a definite fail (10,000,000).
- **Task 3:** `filesFromStore` in `simulation.ts`, the extra demand, and the message after
  the polling notes. 519 passed; the probe was identical to `main`.
- **Task 4:** strengthened 4 fixtures, which failed before the brief edits. Added
  `fileRpm` to the three briefs; then 519 passed.
  - The probe diff against `main` is exactly the spec's four rows. The file-storage row
    that was worked out by hand matched: 2220 against 1260.
  - No good design, demo or other fixture moved.
- **Task 5:**
  - `brief-format.md`: `fileRpm` and the throughput row.
  - `phase1-findings.md`: "Update: finding 15 addressed" (45 of 53), finding 15 marked
    addressed, finding 5 partly addressed.
  - `HANDOVER.md`.
  - Browser (DevTools, 1440): food guide `bad-pages-from-api.yaml` → Fail, 1660 req/min
    against ≥ 3690. The detail says "The files for Browse vendors don't come from static
    hosting or object storage, so your servers serve them too: +2400 req/min. Put them in
    a store behind a CDN." Console: only React Flow's attribution warning.
- `npm test` 519 passed, 1 skipped; `tsc`, lint and `npm run build` pass.
