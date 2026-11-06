# Implementation Plan: `brief-load-rollout`

Spec: [SPEC-brief-load-rollout.md](../../SPEC-brief-load-rollout.md) (approved 2026-11-06,
open questions 1–4 as recommended). Capability map:
[CAPABILITY-MAP-dataflow-sim.md](../../CAPABILITY-MAP-dataflow-sim.md). Task checklist:
[todo.md](todo.md). Branch: `feat/brief-load-rollout`, from `main` (`c7f8aca`).

## Overview

- **One small code change:** an optional per-feature `slowMs` in the `load` block, the
  slow work's realistic time on the load page. It defaults to `backgroundWorkMs`, which
  the engine keeps using.
- **Twelve `load` blocks**, one commit per brief. Each block has its story in a comment,
  and a scenario whose average is the brief's total `targetRpm`.
- **One new test file,** `tests/loadsim-briefs.test.ts`, with each brief's pilot
  expectations.

## Dependency graph

```
T1 tests (failing): the twelve briefs' expectations, and slowMs. Save the load-probe and
   engine-probe baselines at c7f8aca first.
        │
        ├────────────────────┬─────────────────────┬──────────────────────┐
        ▼                    ▼                     ▼                      ▼
T2 slowMs field         T3 request-only        T4 external calls      T5 files and photos
   (types, validator,      food guide, chat,      printing credits,      file storage,
   scenario, graph,        shuttle, auction       course assistant,      photo wall
   docs)                                          price watch
        │
        ▼
T6 slow jobs: link checker, video library, notifications (the ones that may need slowMs)
        │
        ▼
T7 docs, full checks, browser checks
```

T3, T4 and T5 don't need `slowMs`, so they can go before or after T2. They're listed in
this order so the simplest briefs settle the scenario rule before the harder ones.

## Architecture decisions

### `slowMs` (`types.ts`, `validate.ts`, `scenario.ts`, `graph.ts`)

- **`BriefLoadFeature.slowMs?: number`:** validated as a number of ms from 1 to 600,000.
  It's allowed only on a feature that has `backgroundWorkMs`, so it can't add slow work
  the engine doesn't know about. Otherwise the build fails with the file and field, like
  every other brief field.
- **`FeatureLoad.slowMs: number | null`**, set by `featureLoads` (null when unset).
- **`graph.ts`:** both places that read `feature.backgroundWorkMs` read
  `loads?.[id]?.slowMs ?? feature.backgroundWorkMs`:
  - the queue path: how jobs split the slow work between stages;
  - the inline path: `inlineSlowMs`.

  Whether a feature has slow work at all, and so goes on a queue, still comes from
  `backgroundWorkMs`.
- **Unchanged when unset:** no brief sets `slowMs` until T6, so the load probe after T2 is
  identical to the baseline.
- **The engine never reads it,** like the rest of the `load` block.

### The blocks

- **The scenario:** `requests = Σ targetRpm × windowSeconds ÷ 60`, so the average is the
  brief's own rate. The shape and window follow the story (spec section A). A brief whose
  story needs more gets it only with your OK (spec Boundaries).
- **The per-feature figures** (spec section B): `writeShare` 0 for read-only features;
  `dbMs` realistic, with a comment; `slowWork` where a brief has inline slow work;
  `apiMs` for the four briefs with external calls (the course assistant's is the time to
  the first streamed words, about 1,000 ms).
- **Each brief's commit:** the block, its tests passing, and a load-probe diff in which
  only that brief's fixtures moved.

### Tests (`tests/loadsim-briefs.test.ts`)

One `describe` per brief, under its default scenario:
- **The reference design:** at least 99.9% served, a p95 under 1,000 ms, no compute
  instance or database saturated (`firstSaturation` null, or a worker behind a queue),
  and no jobs still waiting or never done.
- **Each flaw the page can show now** (spec section C, column 2), with its number pinned
  once calibrated. In T1 these assert the direction (for example "Alerts API 1 runs out
  of slots"), and their exact numbers are added in the brief's own task.

The reference-design tests fail in T1 for the six briefs that look broken today. They may
already pass for the other six, so for those T1 also checks that the brief has a `load`
block, a test that fails until the block exists.

## Risks

| Risk | Mitigation |
|---|---|
| A figure is a judgement call (`dbMs` for a list, `apiMs` for a provider) | Each figure has a comment with its reasoning; anything unusual goes in the task notes for your review |
| Calibration moves a flaw between columns of the spec's table | Expected; each move is recorded in the task notes, and the spec's table is updated in T7 |
| The video library's realistic transcode time is minutes, so its workers may still fall behind | `slowMs` is the job's realistic time. If no realistic value lets the reference design drain, stop and report rather than pick an unrealistic one |
| A reference design needs a fixture or feature-field change | Not allowed without asking (it moves the engine). Stop and report |
| Re-runs get slower with more blocks | Unlikely, since every scenario gets smaller; T7 measures it anyway |
| Another brief's results move | The load-probe diff before each commit; any move outside the brief stops the work |
