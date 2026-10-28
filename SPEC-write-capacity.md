# Spec: write capacity and upload edges (findings 16 and 17)

Status: **implemented** on `fix/write-capacity`; approved (2026-10-28) as proposed: `sharded-db` lowered to `shards ≥ 2`, only
`lab-monitor` marks writes, one combined plan and task list. Plan:
[tasks/write-capacity/plan.md](tasks/write-capacity/plan.md).
Engine changes from findings 16 and 17 in `docs/challenges/phase1-findings.md`. Module id
`write-capacity`. Branch: `fix/write-capacity`, from `main` (`ded3cd0`).

## Objective

Phase 6 found two places where the engine scores a design better than it should.

- **Finding 16: cache memory counts as write capacity.** The database tier's capacity is
  400 req/min per shard (× a replica factor), plus 200 per GB of cache, whatever the
  requests are. In `lab-monitor`, one shard with a big cache passes throughput and costs
  less than the good design's shards. Only the brief's `sharded-db` rule catches it. In
  reality, a cache and read replicas only help **reads**; writes all go to the shards'
  primaries.
- **Finding 17: an upload edge looks like a download.** The file-serving check counts any
  client edge to object storage as clients fetching files from a store. In
  `club-photo-wall`, the phone's direct-upload edge hides that `bad-no-cdn` serves the
  wall's images through the API, so it's a `knownGap` today.

Users: students reading the results; you, writing write-heavy briefs.

## Change

### Finding 16: a separate write check

1. **A fourth optional feature field, `writeRpm`:** the requests per minute of this
   feature that write to the database. Plumbing:
   - types, the validator (a number ≥ 1), and `optionalWorkload`;
   - the panel's Workload row gets a fourth box, "Writes" (req/min). The row wraps to two
     lines in the sandbox; in a challenge only set fields show, as now.
2. **A new engine check, `nfr-write-throughput`** ("Write capacity"). It's added only when a
   placed feature has `writeRpm`, so every existing result is unchanged.
   - **Demand:** the sum of placed features' `writeRpm`.
   - **Capacity:** for each database on a request path, 400 × shards.
     - Replicas and caches don't add to it.
     - A queue plus a task worker (the existing load-levelling condition) adds 15 %, as
       it does for overall throughput.
     - Rounded to a whole number.
   - **Messages:**
     - Fail: "The database can't take the writes: each shard takes about 400 writes a
       minute, and caches and replicas only help reads. Add shards, or batch writes through
       a queue and workers."
     - Pass: "The database's shards can take the writes."
3. **`nfr-throughput` is unchanged.** It still includes the cache, because reads dominate in
   every other brief. The write check sits next to it.

### Finding 17: only reads count as fetching from a store

4. **`filesFromStore`:** a client edge **straight to object storage** no longer counts. It's
   how a direct upload is drawn.
   - Still counted: an edge from a client to static hosting (a web host clients only read
     from), or to a CDN in front of static hosting or object storage.
   - A design where clients download straight from object storage with no CDN is now
     charged. Brief rules already ask for the CDN in those cases.
5. **Message wording:** "The files for X don't reach clients through a CDN or from static
   hosting, so your servers serve them too: +N req/min. Put them in a store behind a CDN."
   This replaces "don't come from static hosting or object storage", which would now be
   wrong for an upload-only edge.

### `lab-monitor` recalibration (needed by 2)

With writes counted correctly, three shards can't take 1500 writes a minute (1380 with
the queue), so the brief changes:

| What | Before | After |
|---|---|---|
| `report-metrics` | — | `writeRpm: 1500` (every reading is a write) |
| `good.yaml` (and `bad-direct-writes`, `bad-no-cache`, `bad-client-to-db`) | 3 shards | **4 shards** |
| `minThroughputRpm` | 1700 | **2200** (good is 2576: 17 % headroom; `bad-no-cache` 2115 still fails) |
| `maxMonthlyCostUsd` | 350 | **380** (good is $314: 21 % headroom) |
| Rule `sharded-db` | `shards ≥ 3` | **`shards ≥ 2`** (open question 1) |
| New fixture `bad-cache-for-shards` | — | 1 shard, 8 GB cache: passes overall throughput (2369) but fails `nfr-write-throughput` (460) and `sharded-db` |

`bad-single-shard` also fails `nfr-write-throughput` (460 against 1500), so it gets that id
too.

## Prototype results

The prototype was built against `ded3cd0` and then reverted.
- **Unchanged:** the probe for every brief except `lab-monitor` and
  `club-photo-wall/bad-no-cdn`, and both demos.
- **`club-photo-wall/bad-no-cdn`:** now fails `nfr-throughput` (target 4340 against 1678
  capacity). Its `knownGap` is removed and the expectation stands.
- **Rounding bug:** one prototype run gave a write capacity of 459 for one shard, because
  `Math.floor(400 × 1.15)` lands just under 460 in floating point. The real change rounds
  instead.

| `lab-monitor` fixture | Throughput (target 2200) | Write capacity (target 1500) | Result |
|---|---|---|---|
| `good` (4 shards) | 2576 | 1840 | passes |
| `bad-single-shard` | 988 | 460 | fails both, plus `sharded-db` |
| `bad-direct-writes` (4 shards, no queue) | 2240 | 1600 | passes both; rules only, as today |
| `bad-no-cache` | 2115 | 1840 | fails `nfr-throughput` |
| `bad-cache-for-shards` (new) | 2369 | 460 | fails `nfr-write-throughput`, plus `sharded-db` |
| 3 shards (not a fixture) | 2046 | 1380 | fails both |

- **Test results:** all existing tests passed except the two that should change: the
  photo wall's `knownGap`, which now meets its expectation, and a temporary probe fixture.
- **Engine count:** from 57 to **59 of 70**. (This first said 58, an arithmetic slip
  corrected during the build: both designs below are new engine catches.)
  - `club-photo-wall/bad-no-cdn` moves to the engine.
  - The new `bad-cache-for-shards` is engine-caught.
  - `bad-direct-writes` still needs rules: the queue only adds 15 %.

## Tests (written first)

- **`src/lib/simulation.test.ts`, `describe("write capacity")`:**
  - no feature with `writeRpm`: no `nfr-write-throughput` check;
  - 1 shard: capacity 400;
  - 3 shards: 1200;
  - replicas and a cache don't raise it;
  - a queue plus a task worker gives × 1.15, rounded (1 shard → 460);
  - a database off every request path doesn't count;
  - pass and fail messages.
- **`src/lib/simulation.test.ts`, `describe("file serving")`:**
  - client → object storage only: charged (new case);
  - client → static hosting: still not charged;
  - the new message wording.
- **Field plumbing:** extend the validator, `buildDesign`, design file and
  `FeatureWorkload` tests with `writeRpm` and the "Writes" box.
- **Fixtures:**
  - `lab-monitor` as in the table;
  - `bad-single-shard` gains `nfr-write-throughput`;
  - remove `club-photo-wall/bad-no-cdn`'s `knownGap`.

## Docs

- **`brief-format.md`:**
  - `writeRpm`;
  - the `nfr-write-throughput` row;
  - the updated rule for when files count as coming from a store.
- **`phase1-findings.md`:** "Update: findings 16 and 17 fixed", with the tables above and
  59 of 70.
- **`HANDOVER.md`** (untracked).

## Boundaries

- **Always:**
  - every brief except `lab-monitor` and `club-photo-wall/bad-no-cdn` keeps its probe
    numbers;
  - demos unchanged;
  - fixture expectations only get stronger;
  - tests, types, lint and build stay green.
- **Ask first:**
  - removing the cache from overall `nfr-throughput`;
  - marking writes in other briefs;
  - a direction or "upload" marker on edges.
- **Never:** weaken a fixture's expectations.

## Success criteria

1. One shard plus any cache fails `lab-monitor`'s write check; the good design passes
   with 4 shards.
2. `club-photo-wall/bad-no-cdn` fails `nfr-throughput` without a `knownGap`.
3. All other probe numbers are unchanged, and all tests, `tsc`, lint and build pass.
4. A browser check shows the "Write capacity" row on `lab-monitor/bad-cache-for-shards`,
   and the "Writes" box on the lab monitor's feature card.

## Open questions

1. **`sharded-db` threshold.** The engine now decides how many shards are enough, so I'd
   lower the rule to `shards ≥ 2` (the idea: split the writes) and let the write check
   say "not enough". Or keep it at 3 (a 3-shard design passes the rule but fails the
   engine), or raise it to 4 (the rule gives away the answer).
2. **Writes in other briefs.** Proposed: only `lab-monitor` marks writes for now, so no
   other brief moves. Marking `place-bid`, `report-location` and others could follow
   later.
3. **Plan format.** One combined plan and task list, as before?
