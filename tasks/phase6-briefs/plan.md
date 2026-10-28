# Implementation Plan: Phase 6, more briefs

Spec: [SPEC-phase6-briefs.md](../../SPEC-phase6-briefs.md) (approved). Task checklist:
[todo.md](todo.md). Branch: `feat/phase6-briefs`, from `main` (`344d300`). Previous round:
[tasks/plan.md](../plan.md) (phase 5).

## Overview

Four new briefs, each with a calibrated good design and four single-flaw bad designs, built
one at a time. `lab-monitor` comes first and stops for review. Then a findings section and
the browser checks. Content only: no engine change.

## Dependency graph

```
T1 lab-monitor ── Checkpoint A (review stop)
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
T2 textbook-      T3 club-auction  T4 club-photo-wall
   price-watch          │               │
        └───────────────┼───────────────┘
                        ▼
T5 findings, docs, full checks, browser checks
```

Tasks 2–4 don't depend on each other, but they're built in order in this session; each is
small and they share the calibration routine.

## How each brief is built (Tasks 1–4)

1. **`brief.yaml`:**
   - rewritten in my own words from the starter's idea, with `source` naming the starter
     (own work, as in phase 5);
   - campus-scale numbers;
   - workload fields only where the lesson needs them;
   - every rule has a `title`;
   - three reflection questions on what the checks can't see.
2. **`good.yaml`:**
   - probe it (`PROBE=1 npx vitest run tests/probe.test.ts`);
   - then set the targets: throughput and cost with 15–30 % headroom, latency at 2× rounded
     up to 10 ms, availability met;
   - change the design or the targets, never the engine;
   - no warnings on the good design.
3. **Bad designs:** one change each from `good`. `expect` lists every rule fail and every
   engine catch the flaw causes, and nothing incidental.
4. **Run** `npx vitest run -t <id>` and the full suite.
5. **Notes:** record the probe table in this plan's notes for the findings.

## Architecture decisions

- **Shards in `lab-monitor`.** The engine's write capacity is 400 per shard (× the replica
  factor), plus 200 per GB of cache.
  - The good design keeps the cache small (1 GB), so the shards do the work, and the
    single-shard design fails throughput clearly.
  - If a single shard with a big cache would pass, that's the expected finding. It's
    recorded, not fixed (spec decision).
- **Functions in `textbook-price-watch`.**
  - Its cost budget is set so the functions design has 15–30 % headroom and two VMs go over
    it.
  - The availability target is 99.5 % (from the starter), since functions earn their own
    availability bonus.
  - If the numbers can't separate the two designs, stop and bring it back as an open
    question rather than bending the brief.
- **Workload fields:**
  - `textbook-price-watch` `add-watch` has `backgroundWorkMs` (fetching the price);
  - `club-auction` `watch-item` has `pollingRpm`;
  - `club-photo-wall` `post-photo` has `backgroundWorkMs` and `browse-wall` has `fileRpm`.
  - Values are picked with a story (as in `brief-format.md`) and checked against the
    capacity of the shortcut design.
- **Picker order.** Briefs appear by title, as the loader sorts them, so the new ones need
  no extra wiring.

## Task list

### Phase A: First brief, then review
- [x] Task 1: `lab-monitor`

### Checkpoint A (review stop)
- [x] Lab monitor tests pass; you've reviewed the brief text, the good design and the bad
  designs before the rest start

Notes from Task 1:
- **Numbers.**
  - Features: report-metrics 1500 (500 machines every 20 s), view-dashboard 120,
    disk-alert 20; total 1640.
  - Good design: 3 shards, 2 replicas, a 2 GB cache, and a queue and workers.
- **First probe of `good`:** 25 ms, 2046 rpm, 99.95 %, $289, no warnings.
- **Targets:**
  - latency 50 ms (2 × 25);
  - throughput 1700 (20 % headroom);
  - availability 99.9 %;
  - cost $350 (21 % headroom).
- **Probe results:**

  | Fixture | Latency | Throughput | Avail. | Cost | Caught by |
  |---|---|---|---|---|---|
  | `good` | 25 ms | 2046 | 99.95 % | $289 | passes |
  | `bad-single-shard` | 25 ms | 988 | 99.95 % | $239 | rule + engine `nfr-throughput` fail |
  | `bad-direct-writes` | 25 ms | 1780 | 99.9 % | $250 | rules only (2): it loses only the queue's 15 %, so it stays above 1700 |
  | `bad-no-cache` | 40 ms | 1586 | 99.95 % | $255 | rule + engine `nfr-throughput` fail + `topo-cache` warning |
  | `bad-client-to-db` | 25 ms | 2046 | 99.95 % | $289 | rule + engine `topo-client-data` warning |

- **Cache-for-shards (finding):** a temporary fixture with 1 shard and a 6 GB cache scored
  1908 rpm (passes 1700) at $263, cheaper than the good design. Only `sharded-db`
  catches it. The engine adds cache memory to database capacity even for writes. The
  temporary fixture was deleted.
- **Checks:**
  - `npm test` 554 passed, 1 skipped; `tsc` and lint pass;
  - the probe for the twelve existing briefs is identical to `main`.

### Phase B: Remaining briefs
- [x] Task 2: `textbook-price-watch`
- [x] Task 3: `club-auction`
- [x] Task 4: `club-photo-wall`

### Phase C: Findings and checks
- [x] Task 5: Findings, docs, full checks, browser checks

### Checkpoint B
- [x] All three spec success criteria met; ready for review (nothing committed until
  asked)

Notes from Tasks 2–4:
- **`textbook-price-watch`:**
  - Features: add-watch 60 (`backgroundWorkMs` 2000) and price-history 300.
  - Good design: one functions node, no load balancer. Probe: 23 ms, 758 rpm, 99.9 %, $132.
  - Targets: 50 ms, 600 rpm (26 % headroom), 99.5 % (from the starter), $160 (21 %).

  | Fixture | Latency | Throughput | Avail. | Cost | Caught by |
  |---|---|---|---|---|---|
  | `good` | 23 ms | 758 | 99.9 % | $132 | passes |
  | `bad-always-on-vms` | 23 ms | 758 | 98.9 % | $245 | rule + engine `nfr-cost` and `nfr-availability` fails |
  | `bad-inline-check` | 2058 ms | 660 | 99.8 % | $93 | rules (2) + engine `nfr-latency` fail |
  | `bad-client-calls-store` | 30 ms | 758 | 99.9 % | $132 | rule + engine `topo-api-keys` warning |
  | `bad-client-to-db` | 23 ms | 758 | 99.9 % | $132 | rule + engine `topo-client-data` warning |

  A PaaS API would come to about $166 by the cost formula (not probed), just over the
  $160 budget. That fits the brief's lesson, and the `api-on-functions` rule says why.
- **`club-auction`:**
  - Features: browse-items 300, place-bid 300, watch-item 600 (`pollingRpm` 2400).
  - The first probe with a 5 GB cache gave 1678 rpm, only 12 % headroom, so the cache went
    to 6 GB. Good: 31 ms, 1908 rpm, 99.95 %, $263.
  - Targets: 70 ms, 1500 rpm (27 %), 99.9 %, $320 (22 %).

  | Fixture | Latency | Throughput | Avail. | Cost | Caught by |
  |---|---|---|---|---|---|
  | `good` | 31 ms | 1908 | 99.95 % | $263 | passes |
  | `bad-polling` | 31 ms | 1908 (target 3000) | 99.95 % | $263 | rule + engine `nfr-throughput` fail |
  | `bad-direct-bids` | 31 ms | 1660 | 99.9 % | $224 | rules only (2) |
  | `bad-single-db-replica` | 33 ms | 1839 | 99.2 % | $243 | rule + engine `nfr-availability` fail |
  | `bad-client-to-db` | 31 ms | 1908 | 99.95 % | $263 | rule + engine `topo-client-data` warning |

- **`club-photo-wall`:**
  - Features: post-photo 40 (`backgroundWorkMs` 3000), browse-wall 800 (`fileRpm` 3200),
    view-photo 300.
  - Good: 31 ms, 1678 rpm, 99.95 %, $281.
  - Targets: 70 ms, 1300 rpm (29 %), 99.9 %, $340 (21 %).

  | Fixture | Latency | Throughput | Avail. | Cost | Caught by |
  |---|---|---|---|---|---|
  | `good` | 31 ms | 1678 | 99.95 % | $281 | passes |
  | `bad-upload-through-api` | 49 ms | 1678 | 99.95 % | $281 | rule only |
  | `bad-sync-thumbnails` | 3049 ms | 1460 | 99.95 % | $242 | rules (2) + engine `nfr-latency` fail |
  | `bad-no-cdn` | 49 ms | 1678 | 99.95 % | $269 | rule only; `knownGap` for `nfr-throughput` (finding 17) |
  | `bad-client-to-db` | 31 ms | 1678 | 99.95 % | $281 | rule + engine `topo-client-data` warning |

Notes from Task 5:
- **Checks:**
  - `npm test` 622 passed, 1 expected fail (the `knownGap`), 1 skipped; `tsc`, lint and
    `npm run build` pass.
  - The probe for the twelve existing briefs is identical to `main`.
- **Findings:** a phase 6 section in `phase1-findings.md`, covering findings 16 and 17 and
  57 of 69.
- **Browser** (DevTools, 1440): all sixteen briefs are in the picker. Each new brief was
  opened from it, and:

  | Brief | `good.yaml` | Bad design | Result |
  |---|---|---|---|
  | Lab monitor | Pass, 25 ms, 2046 rpm | `bad-single-shard` | Fail: 988 against ≥ 1700, plus the "Sharded database" rule |
  | Textbook price watch | Pass | `bad-always-on-vms` | Fail: $245 against ≤ $160, and 98.9 % |
  | Society auction | Pass | `bad-polling` | Fail: target 3000; the detail names "Watch item" |
  | Society photo wall | Pass | `bad-sync-thumbnails` | Fail: 3049 ms; the detail names "Post photo" |

  - As in the workload-fields check, the first Run click after an import sometimes didn't
    register; a second click worked.
  - Console: only React Flow's attribution warning.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The functions design can't be cheaper than VMs with enough headroom | Med | Probe early in Task 2; if it can't, stop and bring options back |
| `bad-direct-writes` or `bad-direct-bids` passes every engine check | Low | Expected: the spec lists them as rule-caught; recorded in the findings |
| A big cache standing in for shards hides the lesson | Low | Rule `sharded-db`; the gap recorded as a finding |
| An existing test changes | Med | Content only; the full suite and the probe for the twelve existing briefs are compared with `main` |
| Brief text drifts toward the starter's wording | Low | Written fresh at campus scale; the `source` field names the starter |
