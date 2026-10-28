# Tasks: `write-capacity`

Spec: [SPEC-write-capacity.md](../../SPEC-write-capacity.md). Plan: [plan.md](plan.md).

Standing verification: `npm test`, `npx tsc --noEmit` and `npm run lint` pass; demos and
every brief other than `lab-monitor` and `club-photo-wall/bad-no-cdn` keep their probe
numbers; fixture expectations only get stronger.

---

## Task 1: `writeRpm` plumbing and the "Writes" box

**Description:** Extend these tests first:
- **validator:** the field is accepted; 0, -5 and `"fast"` are rejected;
- **`buildDesign`:** the field is copied only when set;
- **design file:** the field survives a sandbox round trip, and isn't written when absent;
- **`feature-workload.test.tsx`:**
  - in the sandbox, four boxes, including "Writes";
  - in a challenge, only set fields show, including "Writes" with its tooltip.

Then add `writeRpm` to `FeatureBlock`, `BriefFeature`, `readRequirement`,
`optionalWorkload` and the `FIELDS` list in `feature-workload.tsx`.

**Acceptance criteria:**
- [x] The extended tests fail first, then pass; all others pass

**Verification:**
- [x] `npx vitest run src/lib/challenges src/components/simulator`; `npx tsc --noEmit`

**Dependencies:** None

**Files:** `src/lib/types.ts`, `src/lib/challenges/{types,validate,design}.ts`,
`src/components/simulator/feature-workload.tsx`, and their tests

**Estimated scope:** S

---

## Task 2: Engine tests, failing

**Description:** In `src/lib/simulation.test.ts`:
- **`describe("write capacity")`:**
  - no `writeRpm`: no check;
  - capacity is 400 × shards (1 → 400, 3 → 1200);
  - replicas and a cache don't change it;
  - a queue plus a task worker gives 460 for one shard;
  - a database off every request path doesn't count;
  - pass and fail details.
- **`describe("file serving")`:**
  - client → object storage only: charged;
  - client → static hosting: still not charged;
  - the message wording changes to "don't reach clients through a CDN or from static
    hosting".

**Acceptance criteria:**
- [x] The new and changed cases fail against today's engine; the "no check" and "static
  hosting" cases pass already

**Verification:**
- [x] `npx vitest run src/lib/simulation.test.ts` shows only the expected failures

**Dependencies:** Task 1

**Files:** `src/lib/simulation.test.ts`

**Estimated scope:** S

---

## Task 3: Engine change

**Description:** In `src/lib/simulation.ts`:
1. Compute write demand and capacity, and push `nfr-write-throughput` (category
   `throughput`, title "Write capacity") after `nfr-throughput`, with the spec's details.
2. Change `filesFromStore` and the file message.

**Acceptance criteria:**
- [x] Task 2's tests pass
- [x] The probe differs from `main` only in `club-photo-wall/bad-no-cdn`. No brief has
  `writeRpm` yet, so the photo wall's `knownGap` test now fails as expected, because the
  gap is closed.

**Verification:**
- [x] `npm test` (the only failure is that `knownGap`); compare the probe with `main`

**Dependencies:** Task 2

**Files:** `src/lib/simulation.ts`

**Estimated scope:** S

---

## Task 4: `lab-monitor` and photo wall fixtures

**Description:**
- **`club-photo-wall/bad-no-cdn`:** remove its `knownGap`.
- **New `lab-monitor/fixtures/bad-cache-for-shards.yaml`:** 1 shard and an 8 GB cache;
  `fails: [sharded-db, nfr-write-throughput]`.
- **`bad-single-shard`:** add `nfr-write-throughput`.
- Run the tests; these fail first.
- **`lab-monitor/brief.yaml`:**
  - `report-metrics` gets `writeRpm: 1500`;
  - `minThroughputRpm` 2200; `maxMonthlyCostUsd` 380;
  - `sharded-db` gets `shards: 2`, with its `why` updated to say the write check decides
    how many shards.
- **`good`, `bad-direct-writes`, `bad-no-cache` and `bad-client-to-db`:** 4 shards.

**Acceptance criteria:**
- [x] All tests pass, with no `knownGap` left in phase 6
- [x] The lab monitor's probe matches the spec's table (one shard: 460)
- [x] Every other brief is unchanged apart from `club-photo-wall/bad-no-cdn`

**Verification:**
- [x] `npm test`; compare the probe with `main`

**Dependencies:** Task 3

**Files:** `challenges/lab-monitor/**`, `challenges/club-photo-wall/fixtures/bad-no-cdn.yaml`

**Estimated scope:** S

---

## Task 5: Docs, full checks, browser check

**Description:**
- **`brief-format.md`:**
  - `writeRpm`;
  - the `nfr-write-throughput` row;
  - when files count as coming from a store.
- **`phase1-findings.md`:**
  - "Update: findings 16 and 17 fixed" (59 of 70);
  - mark both findings fixed.
- **`HANDOVER.md`:** update it.
- **Checks:** `npm run build`.
- **Browser** (DevTools, 1440 wide):
  - lab monitor: the "Writes 1500" box on Report metrics; `bad-cache-for-shards` shows a
    failing "Write capacity" row;
  - photo wall: `bad-no-cdn` fails throughput with the new wording;
  - console.

**Acceptance criteria:**
- [x] All four spec success criteria met

**Verification:**
- [x] Results recorded in the notes below and in `plan.md`

**Dependencies:** Task 4

**Files:** `docs/challenges/brief-format.md`, `docs/challenges/phase1-findings.md`,
`HANDOVER.md`, `tasks/write-capacity/*`

**Estimated scope:** S

---

## Notes

- **Task 1:** the five extended tests failed first (validator, `buildDesign`, design file,
  and two `FeatureWorkload` cases), then passed. Two text changes beyond the plan, because
  finding 17 makes the old wording wrong: the "Files" tooltip now says "unless clients
  get them from static hosting or through a CDN in front of a store", and the sandbox
  help line in `requirements-panel.tsx` says files count "unless they come through a CDN
  or from static hosting; writes need enough database shards".
- **Task 2:** nine new or changed engine tests failed first; the "not reported" and
  static hosting cases passed already.
- **Task 3:** the write check lives in `estimateWriteCapacityRpm`. `npm test`: the only
  failure was the photo wall's `knownGap`. Probe against `main`: numbers changed only for
  `club-photo-wall/bad-no-cdn` (target 1300 → 4340, capacity 1678, now fails); four other
  file notes changed wording only.
- **Task 4:** `bad-cache-for-shards` and `bad-single-shard` failed first, then passed after
  the brief edits. The `lab-monitor` probe matches the spec's table exactly: good 2576
  ($314), single shard 988 / 460, direct writes 2240 / 1600 (passes), no cache 2115
  (fails), cache for shards 2369 / 460. No `knownGap` is left in any brief. `npm test`:
  637 passed, 1 skipped.
- **Task 5:**
  - **Engine count:** 59 of 70, not the spec's 58. Both `club-photo-wall/bad-no-cdn` and
    the new fixture are new engine catches; the spec is corrected.
  - **Checks:** `tsc`, lint and build are clean.
  - **Browser** (DevTools, 1440 × 900):
    - lab monitor: Report metrics shows one read-only "Writes 1500" box with its tooltip;
      `bad-cache-for-shards` shows Throughput capacity passing (2369 against 2200) and
      Write capacity failing (460 against 1500) with the spec's message;
    - photo wall: `bad-no-cdn` fails throughput (1678 against 4340) with the new wording,
      and has no Write capacity row;
    - sandbox: the fourth box wraps to its own line under Slow work; help line updated;
    - console: only React Flow's attribution warning.
