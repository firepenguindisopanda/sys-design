# Implementation Plan: `write-capacity`

Spec: [SPEC-write-capacity.md](../../SPEC-write-capacity.md) (approved). Task checklist:
[todo.md](todo.md). Branch: `fix/write-capacity`, from `main` (`ded3cd0`). Builds on
[file-serving/](../file-serving/plan.md) and [workload-fields/](../workload-fields/plan.md).

## Overview

Two engine changes, with the brief and fixture updates that follow from them:

1. **`writeRpm` and a "Write capacity" check (finding 16):**
   - a fourth optional feature field, plumbed like the other three, with a "Writes" box on
     the feature card;
   - a new `nfr-write-throughput` check, sized by shards only.
2. **`filesFromStore` ignores a client edge straight to object storage (finding 17),** with
   new message wording.

Then `lab-monitor` is recalibrated and the photo wall's `knownGap` is removed. The spec's
prototype gives every expected number.

## Dependency graph

```
T1 writeRpm plumbing + "Writes" box (tests first)
        │
        ▼
T2 engine tests: write capacity + file serving, failing
        │
        ▼
T3 engine change (write check, filesFromStore, wording)
        │
        ▼
T4 lab-monitor recalibration + fixture updates + photo wall knownGap removal
        │
        ▼
T5 docs, full checks, browser check
```

## Architecture decisions

- **The write check sits next to `nfr-throughput`, not inside it.** Overall throughput keeps
  its current model, so no other brief moves. The check is pushed only when a placed
  feature has `writeRpm`, like `topo-data-store` appears only once features are placed.
- **Write capacity:**
  - Σ 400 × shards over databases on a request path (`reach`). The prototype used `reach`,
    so a database nothing reaches adds nothing.
  - × 1.15 under the same queue-and-worker condition `estimateThroughputRpm` uses, then
    `Math.round`, to avoid the 459 floating-point result.
- **`filesFromStore` keeps static hosting.** A client edge to static hosting is a page load.
  A client edge to object storage is treated as an upload; reads from storage need a CDN
  edge to count.
- **The `FeatureWorkload` row gets a fourth entry.** The grid stays `grid-cols-3`, so in the
  sandbox the fourth box wraps to a second line. In a challenge the lab monitor's
  `report-metrics` shows one box ("Writes 1500").
- **The prototype numbers are the expected values.** Stop if any differs, apart from the
  rounding fix (459 → 460).

## Task list

- [x] Task 1: `writeRpm` plumbing and the "Writes" box
- [x] Task 2: Engine tests, failing
- [x] Task 3: Engine change
- [x] Task 4: `lab-monitor` and photo wall fixtures
- [x] Task 5: Docs, full checks, browser check

### Checkpoint
- [x] All four spec success criteria met; ready for review (nothing committed until
  asked)

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Another brief or demo moves | High | The write check only runs with `writeRpm`; the probe is compared with `main` line by line |
| A client edge to object storage was a real download in some design | Low | Only the photo wall has such edges, and all of them are uploads; the brief-format doc says to draw downloads through a CDN |
| The fourth box crowds the card | Low | It wraps to its own line in the sandbox; checked in the browser |
| The lower `sharded-db` threshold reads as a weaker rule | Low | The engine now enforces the number; `bad-single-shard` still fails the rule |
