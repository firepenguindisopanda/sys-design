# Spec: Phase 2, step 2: data-tier checks

Status: **implemented** (2026-10-27). Approved with the proposed answers: `topo-data-store` fails,
`topo-client-data` warns, static hosting and CDN count as client-side.
Builds on [SPEC-reachability.md](SPEC-reachability.md) (implemented) and findings 6 and 8
in [phase1-findings.md](docs/challenges/phase1-findings.md).
Branch: `feat/engine-data-checks`, from `feat/engine-reachability`.
Plan: [tasks/data-checks/plan.md](tasks/data-checks/plan.md).

## Objective

Two small engine checks for flaws students commonly make with data:

1. **No data store** (finding 6). Today a design with nowhere to keep data passes, and
   removing the database even *raises* estimated throughput, because the data tier only
   caps capacity when a database exists. A new check fails a design whose features store
   data when no database or object storage is on a request path.
2. **Clients wired to a database or cache** (finding 8). All four `bad-client-to-db`
   fixtures pass every engine check today; only brief rules catch them. A new check warns
   on every edge that connects a client-side node directly to a database or cache.

Success means the engine catches the four client-to-database fixtures and a new
no-database fixture by itself, while good fixtures and both demos keep their exact
results.

### What this step does not fix

`file-storage/bad-no-metadata-db` keeps object storage, so it **has** a data store and
the new check passes it. "Submission records need a queryable database" is specific to
that scenario, so it stays a brief rule. Changing how throughput is estimated without a
database is also out of scope: the new check fails such designs instead.

## Assumptions

1. **"Stores data" means `storageGb > 0`.** A feature's `resources.storageGb` is the
   signal that it keeps data. Authors of stateless features set it to `0`. Every feature
   in the four current briefs has `storageGb` of 0.5 or more.
2. **Local disk on compute doesn't count.** A VM's disk isn't durable shared storage, so
   only a `database` or `object_storage` node counts as a data store. This is the
   "stateless app servers" lesson.
3. **The data store must be on a request path**, using the reachable set from step 1.
   An unconnected database doesn't count (and `topo-reachable` already names it).
4. **"Client-side" uses the engine's existing `isClientishKind`**: mobile, desktop, IoT,
   static hosting and CDN. It's the same set the existing `topo-api-keys` security check
   uses; static hosting and CDNs can't hold secrets either.
5. **Direction doesn't matter for the client check.** Any edge between a client-side node
   and a database or cache is flagged, whichever way it was drawn.
6. **Object storage is not flagged** for client edges: direct client uploads and downloads
   with signed URLs are a normal pattern (the file-storage brief's good design uses a CDN
   in front of object storage).

## What changes

### `src/lib/simulation.ts`

**New check `topo-data-store`** (category `topology`), emitted when at least one feature
is placed on compute:

| Situation | Status | Detail |
|---|---|---|
| A placed feature has `storageGb > 0` and no `database` or `object_storage` node is reachable | **fail** | "Redirect and Create link store data, but no database or object storage is on a request path. Data kept on app servers is lost when they restart or scale." |
| A data store is reachable, or every placed feature has `storageGb` 0 | pass | "Data has a durable store." / "Placed features don't store data." |

**New check `topo-client-data-<edge>`** (category `topology`), one per offending edge:

| Situation | Status | Detail |
|---|---|---|
| An edge connects a client-side node and a `database` or `cache`, either direction | **warn** | "Lab machine talks to Links DB directly. That puts database credentials on the client; go through compute instead." |

The id follows the existing per-edge pattern (`topo-api-keys-<edge>`,
`topo-sse-dir-<edge>`), e.g. `topo-client-data-lab-pc->db`.

Unchanged: every estimate, every constant, every existing check.

### Fixtures

- **New** `challenges/link-shortener/fixtures/bad-no-database.yaml`: the good design
  without the database (the cache stays). Expect `fails: [topo-data-store, db-replicas]`.
  Today the engine fails it only by accident: availability drops to about 99.6 % because
  the replica bonus is gone, while throughput *rises* from 1660 to the compute limit. The
  fixture doesn't assert `nfr-availability`, so it tests the new check, not the accident.
- **Strengthened** (assertions added, none removed): each `bad-client-to-db` fixture adds
  its engine warning, e.g. `warns: [topo-client-data-lab-pc->db]`.

| Fixture | Added expectation |
|---|---|
| `link-shortener/bad-client-to-db` | `warns: [topo-client-data-lab-pc->db]` |
| `chat-app/bad-client-to-db` | `warns: [topo-client-data-laptop->db]` |
| `file-storage/bad-client-to-db` | `warns: [topo-client-data-ta-pc->db]` |
| `notification-system/bad-client-to-db` | `warns: [topo-client-data-phone->db]` |

## Expected results

- **Good fixtures:** identical estimates and no new warnings (each has a reachable
  database and no client-to-database edge).

  | Brief | Latency / throughput / availability / cost |
  |---|---|
  | link-shortener | 31 ms / 1660 rpm / 99.9 % / $224 |
  | chat-app | 50 ms / 1660 rpm / 99.95 % / $239 |
  | file-storage | 43 ms / 1260 rpm / 99.95 % / $252 |
  | notification-system | 75 ms / 1908 rpm / 99.95 % / $263 |

- **Demos:** unchanged (`tests/demos.test.ts`). BeUWI has a reachable database and no
  client-to-database edge; the fan-in demo's database is reachable from its VMs.
- **Tally:** caught by the engine rises from 11 to 15 of the original 20 bad designs,
  plus the new `bad-no-database`. Brief-rule-only drops from 9 to 5:
  `chat-app/bad-http-polling`, `chat-app/bad-no-pubsub`, `file-storage/bad-files-in-db`,
  `file-storage/bad-no-metadata-db`, `notification-system/bad-sync-delivery`.

## Commands

```bash
npm test
npx vitest run -t link-shortener
PROBE=1 npx vitest run tests/probe.test.ts --reporter=verbose
npx tsc --noEmit
npm run lint
```

## Project structure

```
src/lib/simulation.ts           topo-data-store, topo-client-data-<edge>
src/lib/simulation.test.ts      unit tests for both checks
challenges/link-shortener/fixtures/bad-no-database.yaml   new
challenges/*/fixtures/bad-client-to-db.yaml               warns added
docs/challenges/brief-format.md      check table: two new rows
docs/challenges/phase1-findings.md   update section: findings 6 (partly) and 8 fixed
```

## Code style

Match the existing per-edge security check in `runVerification`:

```ts
for (const e of edges) {
  const src = byId.get(e.source);
  const tgt = byId.get(e.target);
  if (!src || !tgt) continue;
  const pair = [src, tgt];
  const client = pair.find((n) => isClientishKind(n.data.componentKind));
  const store = pair.find((n) => DATA_TIER.has(n.data.componentKind));
  if (!client || !store) continue;
  checks.push({ id: `topo-client-data-${e.id}`, ... });
}
```

## Testing strategy

- **Test first.** Add `bad-no-database.yaml` and the four `warns` lines before changing
  the engine, and watch those five tests fail.
- **Unit (`simulation.test.ts`):** `topo-data-store` fails with no data store, passes with
  a reachable database, passes with reachable object storage only, fails when the only
  database is unreachable, passes when every placed feature has `storageGb: 0`, and isn't
  emitted with no placed features. `topo-client-data` warns for client → DB, DB → client,
  static hosting → cache and a WebSocket client ↔ DB, and doesn't warn for client →
  object storage or compute → DB.
- **Regression:** probe table above, `tests/demos.test.ts`, and every existing fixture.

## Boundaries

- **Always:** keep `npm test`, `npx tsc --noEmit` and `npm run lint` green; run the probe
  after each engine change.
- **Ask first:** changing either check's severity from what's approved; changing how
  throughput is estimated; editing demo data; adding storage-specific rules to briefs.
- **Never:** remove or weaken an existing fixture expectation; change brief NFRs or
  scoring constants; start findings 5, 7, 9, 10 or 11 in this step.

## Success criteria

1. `bad-no-database` passes, failing `topo-data-store` and `db-replicas`.
2. The four `bad-client-to-db` fixtures pass with their new `warns` assertions.
3. Good fixtures keep the estimates above with no new warnings; demos unchanged.
4. Unit tests cover the cases listed under Testing strategy.
5. `npm test`, `npx tsc --noEmit` and `npm run lint` are green.
6. `brief-format.md` lists both checks; the findings update records 6 as partly fixed
   (no-store designs) and 8 as fixed, with the new tally.

## Open questions

1. **`topo-data-store` severity.** Proposal: **fail**. Losing all data on a restart is a
   correctness problem, not a style issue, and authors can opt out with `storageGb: 0`.
2. **`topo-client-data` severity.** Proposal: **warn**, matching the existing
   `topo-api-keys` security check. Briefs that treat it as fatal already have a
   `no-client-to-db` rule at `fail`.
3. **Static hosting and CDN count as client-side.** Proposal: yes, reusing
   `isClientishKind`. The alternative (mobile, desktop and IoT only) would miss a static
   site that queries a database from the browser.
