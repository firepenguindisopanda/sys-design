# Implementation Plan: `file-serving`

Spec: [SPEC-file-serving.md](../../SPEC-file-serving.md) (approved). Task checklist:
[todo.md](todo.md). Branch: `fix/file-serving`, from `main` (`deb41ca`). Follows
[sync-and-polling/](../sync-and-polling/plan.md), whose field plumbing this reuses.

## Overview

A third optional feature field, `fileRpm`, follows the same path as `pollingRpm`. If no
client can fetch files from static hosting or object storage (directly or through a CDN
in front of one), each `fileRpm` is added to the throughput target, and the detail names
the feature. Three briefs get the field, and four fixtures get stronger expectations.

## Dependency graph

```
T1 field plumbing: tests, then types + validator + optionalWorkload
        │
        ▼
T2 engine unit tests ("file serving"), failing
        │
        ▼
T3 engine change in simulation.ts
        │
        ▼
T4 briefs + fixture expectations (expectations first, failing)
        │
        ▼
T5 docs, full checks, browser check
```

## Architecture decisions

- **One design-wide helper, `filesFromStore(nodes, edges)`:** true if a client has an
  edge to static hosting or object storage, or to a CDN that has an edge to one of them.
  - It works from edges, like `pushesToClients`, so it reads like the spec's rule.
  - It isn't per feature, because one store serves all of a design's files.
- **Demand only.** Capacity, latency, availability and cost don't change. The demand sum
  becomes `targetRpm` (or `pollingRpm` when polled), plus `fileRpm` when the servers serve
  the files.
- **The message is appended to the `nfr-throughput` detail**, after any polling notes,
  pass or fail. It uses the spec's wording.
- **Reuse `optionalWorkload`.** It gains `fileRpm`, so `design.ts`, the store and the
  design file pick it up, with no `undefined` keys.
- **The prototype numbers are the expected values.** The hand-worked file-storage row
  (target 2220 against capacity 1260) is checked in Task 4. Stop if any number differs.

## Task list

- [x] Task 1: `fileRpm` plumbing (tests first)
- [x] Task 2: Engine unit tests, failing
- [x] Task 3: Engine change and message
- [x] Task 4: Briefs and fixture expectations
- [x] Task 5: Docs, full checks, browser check

### Checkpoint
- [x] All three spec success criteria met; ready for review (nothing committed until
  asked)

Notes: see [todo.md](todo.md). Every number matched the prototype and the hand-worked
file-storage row; the engine now catches 45 of 53 bad designs; 519 tests pass; `tsc`,
lint, build and the browser check pass.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A good design or demo moves | High | The prototype showed none; compare the probe with `main` line by line |
| The file-storage row differs from the hand calculation | Med | Checked explicitly in Task 4 before going on |
| A design with a CDN whose origin is the API is charged though the CDN would cache | Low | Intended by the spec (files belong in a store); the message says what to change; a unit test pins it |
| Students read "+3000 req/min" as API calls | Low | The message says these are the feature's files |
