# Implementation Plan: Design challenge briefs, phase 1

Spec: [SPEC.md](../SPEC.md) (approved). Task checklist: [todo.md](todo.md).

## Overview

Build a data-only challenge format (YAML briefs and fixtures), a small rule evaluator, and a
vitest suite that runs every fixture through the unchanged `runVerification`. The output is
a green test suite plus a findings note listing which bad designs the engine fails to catch.
No existing file under `src/` changes.

## Dependency graph

```
vitest setup + engine smoke test        (proves runVerification loads under vitest)
        │
   types.ts ──────────────┬───────────────┐
        │                 │               │
   validate.ts       design.ts         rules.ts
        │                 │               │
        └──────── load.ts + tests/challenges.test.ts ────────┘
                          │
              link-shortener brief + fixtures   (first full slice; review)
                          │
        ┌─────────────────┼─────────────────┐
   chat-app        file-storage     notification-system   (independent)
        └─────────────────┼─────────────────┘
                          │
             brief-format.md, phase1-findings.md
```

## Architecture decisions

- **New code lives in `src/lib/challenges/`**, content in `challenges/` at the repo root.
  Content is data in git, matching the dcit-practice "activities in git" direction.
- **`design.ts` builds nodes itself** from `COMPONENT_CATALOG` instead of importing
  `createNode` from `store.ts`. Importing the store would pull in zustand and break the
  "no changes to existing files" rule if we tried to export it. The duplication is about
  ten lines.
- **Validation is hand-written** and returns typed objects or throws an `Error` whose
  message starts with `<file>: <field path>:`. The schema is small enough that a library
  isn't worth the dependency.
- **The fixture suite generates tests at collection time** (read `challenges/` with Node
  `fs` and `yaml`, then `describe` per brief and `it` / `it.fails` per fixture), so adding
  a fixture needs no test code.
- **Known gaps use `it.fails`.** When phase 2 fixes a gap, that test turns red, forcing the
  `knownGap` mark to be removed.
- **Numbers are calibrated against the good fixture only.** If a bad fixture passes, it is
  a finding, not a reason to change NFRs.

## Task list

### Phase A: Foundation
- [x] Task 1: Set up vitest and prove the engine runs under it
- [x] Task 2: Challenge types and brief/fixture validation
- [x] Task 3: Compact design builder
- [x] Task 4: Rule evaluator

### Checkpoint A
- [x] `npm test` and `npx tsc --noEmit` green; no existing `src/` file modified

Notes from Phase A:
- **vitest 4, not 5.** vitest 5 needs `@types/node` ≥ 22; the project pins `^20`. vitest 4.1
  supports 20, so no existing dependency changed.
- **No jsdom.** `@xyflow/react` loads fine in the node environment.
- **Edge shorthand is parsed in `validate.ts`**, not `design.ts`, because validation needs
  node ids to check edges. `design.ts` only builds.
- **`npm run lint` is broken on Next 16** (`next lint` was removed; it treats `lint` as a
  directory). Pre-existing, not caused by this work. `npx eslint src` is clean. Fixing the
  script (e.g. `"lint": "eslint ."`) is an existing-file change, so it's left for you to approve.
- Validation also checks enum config values (`engine`, `mode`) and rejects rule ids that
  start with engine prefixes (`placement-`, `topo-`, `nfr-`), since both share the
  `expect.fails` namespace.

### Phase B: First complete brief (vertical slice)
- [x] Task 5: Loader, fixture suite, link-shortener brief and good fixture
- [x] Task 6: Link-shortener bad fixtures and gap probes

### Checkpoint B (human review)
- [x] `npm test` green (40 passed, 3 expected fail, 1 skipped probe); tsc and `npm run lint` clean
- [x] Review the link-shortener brief, fixtures and test output before writing three more

Notes from Phase B:
- **`npm run lint` is now `eslint .`** (approved), replacing the removed `next lint`.
- **Edge syntax.** Unquoted `- a -> b : http` is a YAML mapping, so the validator accepts
  that mapping form as well as a quoted string. The spec's example still reads correctly.
- **Filtering by brief:** a positional arg to vitest filters files, not test names. Use
  `npx vitest run -t link-shortener` instead of `npm test -- link-shortener`.
- **Probe tool:** `PROBE=1 npx vitest run tests/probe.test.ts --reporter=verbose` prints
  each fixture's estimates and non-passing checks. Skipped by default.
- **Calibration:** link-shortener good design scores latency 31/≤120 ms, throughput
  1660/≥1300 rpm, availability 99.9/≥99.9 %, cost $224/≤$275. The NFRs needed no
  change except cost ($250 → $275, for headroom) and the cache size (6 GB) in the good
  fixture, since throughput is capped by the data tier.

Findings so far (input to Task 11):
| Fixture | Engine result | Cause |
|---|---|---|
| `bad-gap-cache-unconnected` | Identical to good: 31 ms, 1660 rpm | `estimateThroughputRpm` and `estimatePathLatency` credit any cache on the canvas |
| `bad-gap-lb-unconnected` | 99.9 %, no `topo-lb` warning | `estimateAvailability` and the `topo-lb` check only test that an LB exists |
| `bad-gap-no-edges` | Every NFR passes (92 ms fallback latency) | No connectivity check; `estimatePathLatency` falls back to a fixed estimate with no edges |
| `bad-client-to-db` | Engine flags nothing; only the brief rule catches it | No engine check for clients wired to a database (`topo-db-no-compute` only fires with zero compute) |
| `good` | Availability exactly at 99.9 % | The engine's availability is additive and caps at 99.95 %, so 99.9 % targets leave no headroom |

### Phase C: Remaining briefs (independent; can run in parallel)
- [x] Task 7: Chat app brief and fixtures
- [x] Task 8: File storage brief and fixtures
- [x] Task 9: Notification system brief and fixtures

### Checkpoint C
- [x] All four briefs green; every brief has one good and ≥3 bad fixtures
  (60 passed, 4 expected fail, 1 skipped probe; tsc and lint clean; no existing `src/` file changed)

Notes from Phase C:
- **Edge rule endpoints accept a list** (`to: [compute, load_balancer]`). Needed because
  chat clients reach compute through a load balancer, and push may come from a worker
  or compute. A single value still works. New code only; engine untouched.
- **Rules can't check string config** (e.g. a queue's `mode: pubsub`); `minConfig` is
  numeric only. The chat brief relies on publish and subscribe edges instead.
- **Task workers can't host features** (the engine only places features on compute), so
  the notification fan-out feature sits on the API and the worker's own load isn't modelled.

| Brief | Good design score (latency / throughput / availability / cost) | Targets |
|---|---|---|
| link-shortener | 31 ms / 1660 rpm / 99.9 % / $224 | ≤120 / ≥1300 / ≥99.9 / ≤$275 |
| chat-app | 50 ms / 1660 rpm / 99.95 % / $239 | ≤150 / ≥1200 / ≥99.9 / ≤$300 |
| file-storage | 43 ms / 1260 rpm / 99.95 % / $252 | ≤250 / ≥1000 (demand 1020) / ≥99.9 / ≤$300 |
| notification-system | 75 ms / 1908 rpm / 99.95 % / $263 | ≤200 / ≥1650 / ≥99.9 / ≤$300 (was $250) |

More findings (input to Task 11):
| Fixture | Engine result | Cause |
|---|---|---|
| `chat-app/bad-gap-bus-unconnected` | `topo-queue` passes, availability bonus applied | `topo-queue` and `estimateAvailability` only test that a queue exists |
| `chat-app/bad-http-polling`, `bad-no-pubsub`, `bad-no-subscribers` | Engine flags nothing; HTTP scores 51 ms vs 50 ms for WebSocket | No protocol-fitness or fan-out checks; polling cost isn't modelled |
| `file-storage/bad-files-in-db` | Scores *better* than good: 31 ms, $224 vs 43 ms, $252 | Object storage hop costs 28 ms vs 10 ms for a DB hop; blob size isn't modelled |
| `file-storage/bad-no-metadata-db` | Throughput jumps to 6996 rpm; availability fails only because the replica bonus is lost | `estimateThroughputRpm` caps by the data tier only when a database exists |
| `notification-system/good` | Two warnings: phone and worker "used as hop" | `topo-intermediate` treats a client that receives push and sends requests, and a worker that pushes, as intermediates |
| `notification-system/bad-sync-delivery` | Throughput passes 1660 vs 1650 | Queue + worker only adds a 15 % throughput bonus; synchronous fan-out isn't penalised |

### Phase D: Documentation
- [x] Task 10: Brief authoring guide
- [x] Task 11: Phase 1 findings note

### Checkpoint: Complete
- [x] All eight spec success criteria met; ready for review (nothing committed until asked)

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `edges.ts` imports `MarkerType` from `@xyflow/react` at runtime; it may not load in the node environment | Med | Task 1 tests this first. Fallback: `environment: "jsdom"` (approved). |
| `npm install` pulls fresh versions; `next lint` may be broken on Next 16 | Low | Treat lint as informational if it fails for reasons unrelated to new code; report it. |
| Good designs can't meet course-scale NFRs under the current model (e.g. DB tier caps throughput near 400 rpm per shard) | Med | Calibrate NFRs to the good fixture with headroom; if a reasonable design can't pass, record it as a finding instead of contorting the brief. |
| Bad fixtures catch the flaw only incidentally (e.g. failing throughput for an unrelated reason) | Med | Each bad fixture starts as a copy of `good.yaml` with exactly one change. |
| Engine check ids that embed edge ids (`topo-api-keys-<edgeId>`) | Low | `design.ts` gives edges deterministic ids `<source>-><target>`. |

## Parallelization

Tasks 2, 3 and 4 depend only on the types and could run in parallel, but they are small
and share `types.ts`, so they run in sequence here. Tasks 7, 8 and 9 touch separate
folders and are safe to run in parallel after Checkpoint B.

## Open questions

None. The spec's three open questions were answered: the scenarios are fine, good fixtures
may have warnings, and jsdom is allowed if needed.
