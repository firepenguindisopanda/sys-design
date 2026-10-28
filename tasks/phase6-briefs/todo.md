# Tasks: Phase 6, more briefs

Spec: [SPEC-phase6-briefs.md](../../SPEC-phase6-briefs.md). Plan: [plan.md](plan.md).

Standing verification: `npm test`, `npx tsc --noEmit` and `npm run lint` pass; the twelve
existing briefs' probe output is unchanged; fixture expectations only get stronger.

---

## Task 1: `lab-monitor` (from `metrics-monitoring`)

**Rules:**
- `ingest-queued`: compute → message_queue;
- `workers-write`: task_worker → database;
- `sharded-db`: database `minConfig: { shards: 3 }`;
- `dashboard-cache`: compute → cache;
- `no-client-to-db`.

**Acceptance criteria:**
- [x] Brief validates; requirements `report-metrics`, `view-dashboard`, `disk-alert`
- [x] `good` passes the engine and every rule, with no warnings, calibrated
- [x] `bad-single-shard`, `bad-direct-writes`, `bad-no-cache` and `bad-client-to-db` each
  fail their intended ids
- [x] Probed whether one shard plus a big cache passes throughput, and recorded the result
  (it does: 1908 rpm, $263)
- [x] Probe table recorded in `plan.md`

**Dependencies:** None

**Files:** `challenges/lab-monitor/**`

**Estimated scope:** M

### Checkpoint A (review stop)
- [x] You've reviewed the lab monitor before Tasks 2–5 start

---

## Task 2: `textbook-price-watch` (from `camelcamelcamel`)

**Rules:**
- `api-on-functions`: component `functions`, min 1;
- `checks-queued`: compute → message_queue;
- `workers-check`: task_worker → external_api;
- `store-from-server`: forbidden client → external_api;
- `drop-alerts`: task_worker → client over web_push;
- `no-client-to-db`.

**Acceptance criteria:**
- [x] `add-watch` has `backgroundWorkMs`; `good` uses functions and passes with cost
  headroom
- [x] `bad-always-on-vms` fails `nfr-cost` (and `api-on-functions`)
- [x] `bad-inline-check` fails `nfr-latency` and the queue/worker rules
- [x] `bad-client-calls-store` warns `topo-api-keys` and fails `store-from-server`
- [x] `bad-client-to-db` fails as in other briefs
- [x] Probe table recorded

**Dependencies:** Checkpoint A

**Files:** `challenges/textbook-price-watch/**`

**Estimated scope:** M

---

## Task 3: `club-auction` (from `online-auction`)

**Rules:**
- `bids-queued`: compute → message_queue;
- `bid-worker`: message_queue → task_worker;
- `live-price`: compute or load_balancer → client, over sse or websocket;
- `bids-replicated`: database `replicas ≥ 2`;
- `no-client-to-db`.

**Acceptance criteria:**
- [x] `watch-item` has `pollingRpm`; `good` passes, calibrated
- [x] `bad-polling` fails `nfr-throughput` and `live-price`
- [x] `bad-direct-bids` fails the two queue rules (the engine isn't expected to catch it)
- [x] `bad-single-db-replica` fails `nfr-availability` and `bids-replicated`
- [x] `bad-client-to-db` fails as in other briefs
- [x] Probe table recorded

**Dependencies:** Checkpoint A

**Files:** `challenges/club-auction/**`

**Estimated scope:** M

---

## Task 4: `club-photo-wall` (from `instagram`)

**Rules:**
- `direct-upload`: client → object_storage;
- `thumbnails-queued`: compute → message_queue;
- `workers-thumbnail`: task_worker → object_storage;
- `wall-via-cdn`: cdn → object_storage;
- `no-client-to-db`.

**Acceptance criteria:**
- [x] `post-photo` has `backgroundWorkMs`; `browse-wall` has `fileRpm`; `good` passes,
  calibrated
- [x] `bad-upload-through-api` fails `direct-upload` (the engine isn't expected to catch it)
- [x] `bad-sync-thumbnails` fails `nfr-latency` and the queue/worker rules
- [x] `bad-no-cdn` fails `nfr-throughput` and `wall-via-cdn`
- [x] `bad-client-to-db` fails as in other briefs
- [x] Probe table recorded

**Dependencies:** Checkpoint A

**Files:** `challenges/club-photo-wall/**`

**Estimated scope:** M

---

## Task 5: Findings, docs, full checks, browser checks

**Description:**
- **`phase1-findings.md`:** a phase 6 section.
  - A per-brief table of what the engine and the rules catch.
  - The new engine total across sixteen briefs.
  - Any new findings, including the cache-for-shards result.
- **`brief-format.md`:** "Adding a brief" references stay accurate (no change expected).
- **`HANDOVER.md`:** update it.
- **Checks:** `npm run build` and the full suite. Compare the probe for the twelve existing
  briefs with `main`.
- **Browser** (DevTools, 1440 wide): for each new brief,
  - open it from the picker;
  - import `good.yaml` → Pass;
  - import one `bad-*.yaml` → fails the check it names.
- **Console:** check for errors.

**Acceptance criteria:**
- [x] All three spec success criteria met

**Verification:**
- [x] Results recorded in the notes below and in `plan.md`

**Dependencies:** Tasks 2–4

**Files:** `docs/challenges/phase1-findings.md`, `HANDOVER.md`, `tasks/phase6-briefs/*`

**Estimated scope:** S

---

## Notes

See the notes in [plan.md](plan.md), with probe tables per brief, the findings and the browser
results. One change from the task text: `club-photo-wall/bad-no-cdn` carries a `knownGap`
(finding 17), because the engine doesn't charge `fileRpm` there.
