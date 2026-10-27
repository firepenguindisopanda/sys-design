# Tasks: Phase 2, step 2: data-tier checks

Spec: [SPEC-data-checks.md](../SPEC-data-checks.md). Plan: [plan.md](plan.md).

Standing verification for every task: `npm test`, `npx tsc --noEmit` and `npm run lint`
pass, and `PROBE=1 npx vitest run tests/probe.test.ts --reporter=verbose` shows the good
fixtures unchanged with no new warnings:

| Brief | Latency / throughput / availability / cost |
|---|---|
| link-shortener | 31 ms / 1660 rpm / 99.9 % / $224 |
| chat-app | 50 ms / 1660 rpm / 99.95 % / $239 |
| file-storage | 43 ms / 1260 rpm / 99.95 % / $252 |
| notification-system | 75 ms / 1908 rpm / 99.95 % / $263 (two existing `topo-intermediate` warnings only) |

---

## Task 1: `topo-client-data` warning

**Description:** First add the engine warning to each `bad-client-to-db` fixture's
expectations and confirm the four tests fail. Then add `topo-client-data-<edge>` to
`runVerification`: for every edge where one end is client-side (`isClientishKind`) and the
other is a `database` or `cache`, in either direction, push a warning naming both nodes.
Add unit tests to `simulation.test.ts`.

**Acceptance criteria:**
- [x] The four fixtures pass with `warns: [topo-client-data-<their edge>]` added
      (`lab-pc->db`, `laptop->db`, `ta-pc->db`, `phone->db`); nothing removed
- [x] Unit tests: warns for client → DB, DB → client, static hosting → cache, WebSocket
      client ↔ DB; no warning for client → object storage or compute → DB
- [x] Detail names both nodes by label, e.g. "Lab machine talks to Links DB directly…"

**Verification:**
- [x] `npx vitest run -t bad-client-to-db`, then the standing checks

**Dependencies:** None

**Files likely touched:** `src/lib/simulation.ts`, `src/lib/simulation.test.ts`, the four
`challenges/*/fixtures/bad-client-to-db.yaml`

**Estimated scope:** S

---

## Task 2: `topo-data-store` check

**Description:** First add `challenges/link-shortener/fixtures/bad-no-database.yaml` (the
good design without the database and its edges; cache kept) expecting
`fails: [topo-data-store, db-replicas]`, and confirm it fails. Then add `topo-data-store`
to `runVerification`, emitted when any feature is placed: fail if a placed feature has
`storageGb > 0` and no `database` or `object_storage` node is in the reachable set;
otherwise pass. Add unit tests.

**Acceptance criteria:**
- [x] `bad-no-database` passes; it doesn't assert `nfr-availability`
- [x] Unit tests: fails with no store; passes with a reachable DB; passes with reachable
      object storage only; fails when the only DB is unreachable; passes when every placed
      feature has `storageGb: 0`; not emitted with no placed features
- [x] The fail detail names the features that store data

**Verification:**
- [x] `npx vitest run -t link-shortener`, then the standing checks

**Dependencies:** None (Task 1 first only to keep edits to `simulation.ts` sequential)

**Files likely touched:** `src/lib/simulation.ts`, `src/lib/simulation.test.ts`,
`challenges/link-shortener/fixtures/bad-no-database.yaml`

**Estimated scope:** S

---

## Checkpoint A
- [x] `npm test` green; `tests/demos.test.ts` unchanged and passing
- [x] Probe table unchanged, no new warnings on good fixtures
- [x] tsc and lint green

---

## Task 3: Check table, findings update, spec status

**Description:** Add both checks to the engine table in
`docs/challenges/brief-format.md`, and a note that stateless features set
`storageGb: 0`. In `docs/challenges/phase1-findings.md`, extend the update section:
finding 8 fixed, finding 6 partly fixed (no-store designs; `bad-no-metadata-db` stays a
brief rule), and the new tally (engine 15 of 20, brief-rule-only 5, plus
`bad-no-database`). Mark `SPEC-data-checks.md` implemented.

**Acceptance criteria:**
- [x] Engine ids in the table match `simulation.ts` (grep cross-check)
- [x] The tally matches the suite: the five brief-rule-only fixtures are named

**Verification:**
- [x] grep cross-check of check ids; manual read-through

**Dependencies:** Checkpoint A

**Files likely touched:** `docs/challenges/brief-format.md`,
`docs/challenges/phase1-findings.md`, `SPEC-data-checks.md`

**Estimated scope:** XS

---

## Checkpoint: Complete
- [x] All six success criteria in SPEC-data-checks.md met
- [x] Ready for review; nothing committed until asked
