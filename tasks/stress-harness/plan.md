# Implementation Plan: `stress-harness`

Spec: [SPEC-stress-harness.md](../../SPEC-stress-harness.md) (approved 2026-11-06).
Capability map: [CAPABILITY-MAP-stress.md](../../CAPABILITY-MAP-stress.md). Task
checklist: [todo.md](todo.md). Branch: `test/stress-harness`, from `main` (`c2b2baf`).

**Baseline before any task (2026-11-06):** `npx vitest run` gives 48 files passed and 2
skipped, 1,473 tests passed and 2 skipped, in 14.6 s on this machine. The spec allows the
stress files to add at most 20 s.

## Overview

The module is tests and test helpers only. It has four parts:
- **A generator** (`src/test/gen-designs.ts`) of seeded designs in three shapes.
- **An invariant checker** (`src/test/invariants.ts`) that returns what's broken instead of
  asserting. The same checker serves the default suite, the `STRESS_SEEDS` run and replays.
- **Default-suite test files:**
  - invariants over fixtures, demos and generated designs;
  - import edge cases;
  - a deterministic growth pin for the load model's routes.
- **An opt-in ladder** (`STRESS=1`) that runs each size case in its own child process with a
  hard time limit, and pins the engine and load-model blow-ups to their owners.

Nothing under `src/lib/` (outside `src/test/`) or `src/components/` changes.

## Dependency graph

```
T1 generator + its tests
        │
        ▼
T2 invariant checker + mutation tests
        │
        ├──────────────────────────────┐
        ▼                              ▼
T3 invariant suite              T4 import edge cases (record-first cases run here;
   (fixtures, demos, seeds)        config-bounds pins)
        │                              │
        ├──────────────────────────────┘
        ▼
T5 growth pin (loadsim-route-scale)      ← needs only T1, ordered here to keep one branch linear
        │
        ▼
Checkpoint: default suite within budget
        │
        ▼
T6 opt-in ladder in child processes; first run; pins for engine-path-scale and
   loadsim-route-scale
        │
        ▼
T7 STRESS_SEEDS=2000, full checks, results into the spec and map
```

T3 and T4 don't depend on each other. T4 needs only T1's helpers for building files, not
the checker. They're done in order on one branch, since each is small.

## Architecture decisions

### Generator (`src/test/gen-designs.ts`)

- **PRNG:** a small mulberry32 (`rng(seed)` returns a function giving 0–1). It has no
  global state, so tests can run in parallel and still give the same designs.
- **API:**
  `generateDesign({ seed, shape, nodes? }): GeneratedDesign`. A `GeneratedDesign` is a
  `BuiltDesign` plus `functionalReqs` (so it can be exported like a store state) and a
  `description` such as `random seed 1234, 9 nodes`.
  - **Built like the fixtures:** it goes through the same `design()` helper's path
    (`buildCompactDesign`), so it matches what the fixtures produce.
- **Shapes** (as in the spec):
  - **`random`:**
    - 2–14 nodes by default, or `nodes` when given;
    - clients are the first ~10%, at least one, and at least one node is compute;
    - about 2 edges per node, with no self-loops and at most one edge per unordered pair;
    - 1–3 features with random workload fields, each placed 85% of the time.
  - **`app`:**
    - clients, then **service blocks**, each block a load balancer → 1–4 compute → an
      optional cache → a database;
    - optional queue → worker → database branches, and an optional CDN → static
      hosting front;
    - with `nodes` given, it adds blocks until it reaches that size. This is how the
      ladder gets `app` designs of 100–200 nodes, while the default run keeps 5–30;
    - features are placed on the blocks' compute nodes.
  - **`stacked`:** `{ layers, width }`. A client, then the layers of load balancers, each
    layer fully connected to the next, then one VM and a database. One feature is placed on
    the VM.
- **Config ranges:** a table in the generator, `CONFIG_RANGES`, keyed by kind and field:
  - database `replicas` 1–8 and `shards` 1–16;
  - `task_worker` `concurrency` 1–64;
  - cache `memoryGb` 0.5 up to 4× the default, in steps of 0.5;
  - object storage `storageGb` 1 up to 4× the default;
  - compute `capacity.vcpus` (steps of 0.5), `memoryGb` and `storageGb`, from the
    inspector's minimum up to 4× the catalog default.

  Its comment says `config-bounds` will replace it with the shared limits. It's
  deliberately kept apart from the inspector, so this module changes no product code.

### Invariant checker (`src/test/invariants.ts`)

- **`brokenInvariants(subject, opts)`** returns `{ id, text }[]`, for example
  `{ id: "L3", text: "served + failed = requests: 99,990 + 5 ≠ 100,000" }`.
  - **Subject:** a built design plus `brief | null`.
  - **Options:** `{ determinism?: boolean; outage?: boolean; roundTrip?: boolean }`, all
    true by default. The default run turns determinism off for most seeds (spec: fixtures
    and every tenth seed).
- **Inner checks:** each invariant is a small pure function over the run results
  (`checkEngine(result)`, `checkLoadRun(run)`, `checkRoundTrip(...)`). The mutation tests
  feed these doctored results directly, without running the model.
- **Tolerance:** `1e-6 × requests + 1e-6` for counts. It's one constant, `COUNT_TOLERANCE`.
- **What runs:**
  - **Engine:** `runVerification`.
  - **Load model:** `simulateLoad`, with `defaultScenario(brief)` and
    `featureLoads(features, brief)`.
  - **Outage:** the first node in node order for which `canSwitchOff(kind)`, off from a
    third of the window with no `onAt`.
  - **Round trip:** `exportDesignFile` with the design as a store state, then
    `importDesignFile` with `[brief]` (or every brief for the sandbox), then the engine and
    load model again. Results are compared without `ranAt`, and summaries compared as JSON.
- **Throws:** a throw anywhere becomes an E1 or L1 entry with the message. It never fails
  the test file outright, so one bad design doesn't hide the others.

### Test files

- **`tests/stress-invariants-*.test.ts`:** the plan said one file. Task 3 split it into
  four (fixtures in two halves, random with the demos, and app), with the shared test
  bodies in `src/test/stress-suite.ts`. One file ran its tests one after another and took
  42 s.
  - **Designs:**
    - every fixture (via `challenges` from `src/test/loadsim-designs.ts`);
    - both demos, read from the store after `loadDemo` / `loadFanInDemo` as in
      `tests/demos.test.ts`;
    - `random` seeds 1–100 by default (`STRESS_SEEDS` sets the count; it was 200 before
      Task 3's budget cut);
    - `app` seeds 1–25, a quarter of the random count.
  - **Replay:** `STRESS_SEED=n` runs only that seed in both shapes, with every option on.
  - **Failure message:** names the design and prints
    `STRESS_SEED=<n> npx vitest run tests/stress-invariants`.
- **`tests/stress-import.test.ts`:** a small `fileWith(patch)` helper starts from the
  link shortener's `good.yaml` text and changes one thing.
  - **Pins:** the `config-bounds` pins are `it.fails` and run the import only.
  - **Handoff pin:** it stores the `.inf` file with an in-memory `HandoffStorage` (a `Map`),
    then calls `loadHandoff`.
  - **Scenario fields:** only the cases not in `scenario-controls.test.tsx`: `" "`, `-5`,
    `1e9`, `Infinity`, `NaN`, `0x10` and `12.6` for requests, and `NaN` and `-5` for the
    window.
- **`tests/stress-growth.test.ts`:**
  - **Counting:** `routeSteps(graph)` counts the `PathStep`s under every class root
    (`buildFlowGraph`).
  - **Ratio:** for `stacked` with width 4, the ratio from 4 to 5 layers must be ≤ 1.5.
  - **Pinned:** this is `it.fails` with the name
    `[loadsim-route-scale] route steps grow with nodes, not paths`.
  - **Today's numbers:** a plain test also records them as a guard on the helper itself.
    1 layer gives a known small count, so a counting bug can't make the pin pass by accident.
- **`tests/stress-scale.test.ts`:** two modes in one file.
  - **Parent** (`STRESS=1`, no `STRESS_CASE`): for each case, it runs
    `spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/stress-scale.test.ts", "--pool=threads"], { env: { STRESS_CASE: <json>, STRESS: "" }, timeout })`.
    - It reads the child's one JSON result line from stdout.
    - It asserts the times against the budget.
    - A timeout counts as over budget.
  - **Child** (`STRESS_CASE` set): it builds the case's design and times `runVerification`,
    then `simulateLoad`. It prints `STRESS_RESULT {"engineMs":…,"loadMs":…}` after each
    part, so a hang in the load model still reports the engine's time.
  - **Default run:** with neither variable set, the file has only skipped tests.
  - **Threads pool:** `--pool=threads` keeps the hanging work in a thread of the child
    process. Killing the child then stops it, instead of leaving an orphaned fork spinning at
    100% CPU (a risk on Windows).
  - **Hard limit:** 10 × (engine budget + load budget). An expected failure is an
    `it.fails` named after its owner, so the ladder's only failures are those pins.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The default stress files take more than 20 s | Med: `npm test` slows down for every change | T3 measures. Determinism only on fixtures and every tenth seed. Cut to `random` 1–100 if it's still over, and say so in the spec. Never drop an invariant. |
| A generated design hits the engine or load-model blow-up inside the default suite and hangs it | High: the whole suite stalls | The default sizes are 2–14 (`random`) and up to 30 (`app`). The probe ran 300 `random` designs of this size cleanly. T3 records the slowest design's time, so a slow one is seen before it hangs. |
| A record-first import case crashes the worker (as `.inf` does in the model) | Med | Record-first cases run the import only, never the model, until their outcome is known. |
| Killing a timed-out child leaves processes behind on Windows | Med: CPU stays pegged after the run | `--pool=threads`, and T6 checks with `tasklist` that no stray `node` processes remain after a timeout. |
| The growth pin passes by accident (a helper bug that undercounts) | Med: the pin stops guarding | A plain test pins today's exact counts for 1–3 layers alongside the `it.fails`. |
| `it.fails` on a case that passes on a fast machine | Low | Only the ladder depends on time, and it's opt-in. The default pins are counts and validation outcomes, which are the same on every machine. |
| Generated designs that export refuses, e.g. a placement on a non-compute node | Low | `gen-designs.test.ts` exports 500 designs of each shape. The generator places features only on compute. |

## Open questions

None blocking. If T4's record-first cases or T6's first ladder run turn up a new failure
with no owner, the work stops and asks before pinning it (spec, "Ask first").
