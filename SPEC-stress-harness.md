# Spec: stress and edge-case harness (`stress-harness`)

The first module of [CAPABILITY-MAP-stress.md](CAPABILITY-MAP-stress.md). Branch
`test/stress-harness`. Status: **built** (2026-11-06); see Results at the end. Approved the
same day, with the proposed answers to the open questions: `engine-path-scale` is in the
map, the ladder budgets are as in the table, and the generator is hand-written. Plan and
tasks: [tasks/stress-harness/](tasks/stress-harness/).

## Objective

Give the simulator a test suite that feeds it designs nobody has hand-written: large ones,
odd shapes and malformed files. It checks that every result still makes sense. The suite
should:

- **Catch new bugs:** any change that makes the engine, the load model or import crash,
  hang, or return impossible numbers fails a test that names the design and how to replay it.
- **Pin the known bugs:** the bugs the probes found are written as expected failures
  (`it.fails`), each naming the module that fixes it. When that module lands, its expected
  failures start passing, so vitest reports them, and the module turns them into ordinary
  tests.
- **Leave the product alone:** no change under `src/lib/` (outside `src/test/`) or
  `src/components/`. Fixes belong to `config-bounds`, `loadsim-route-scale` and
  `engine-path-scale`.

### What holds today

These are the probe results the harness starts from (details in the map):
- **All checks hold:** every invariant below, on all 86 fixtures and 300 random designs of
  2–13 nodes, with an outage too. The run took 21 s with every check doubled for determinism.
- **Bounds missing on import:** imported out-of-range config (`replicas: 0`, `-1`, `1.5`,
  `.nan`, `.inf`) is accepted. Running the model with `.inf` crashes the test worker out of
  memory.
- **Load model:** its time grows about 6× per layer of stacked load balancers (36 s at 6
  layers of 4).
- **Engine:** a random 200-node design never returns.

## Tech stack

Vitest 4 in the `node` environment, as now. A hand-written seeded generator, with no new
dependency (see open question 3). Node's `child_process`, used only by the opt-in scale run.

## Commands

```bash
npm test
```
The default suite, including the new invariant, import and growth tests.

```bash
STRESS=1 npx vitest run tests/stress-scale.test.ts --reporter=verbose
```
The opt-in size ladder. Each case runs in its own child process with a hard time limit,
and the run prints every case's time.

```bash
STRESS_SEEDS=2000 npx vitest run tests/stress-invariants
```
More generated designs than the default 100 random designs (always with a quarter as many
`app` designs).

```bash
STRESS_SEED=1234 npx vitest run tests/stress-invariants
```
Replays one generated design, in both shapes, and skips the fixtures. Every failure message
prints this command. `tests/stress-invariants` matches all four invariant files.

`npx tsc --noEmit`, `npm run lint` and `npm run build` must stay clean.

## Project structure

| File | What |
|---|---|
| `src/test/gen-designs.ts` | The seeded generator, `generateDesign({ seed, shape, nodes })`. It returns a built design (as `fixtureDesign` does) plus a short description such as `random seed 1234, 9 nodes`. |
| `src/test/gen-designs.test.ts` | Tests of the generator itself |
| `src/test/invariants.ts` | `brokenInvariants(design, brief)` returns the list of invariants that don't hold, empty when all do |
| `src/test/stress-suite.ts` | The invariant suite's test bodies, shared by the four files below |
| `tests/stress-invariants-fixtures-1.test.ts`, `-2` | The invariants over every other brief's fixtures |
| `tests/stress-invariants-random.test.ts` | The invariants over both demos and the `random` designs |
| `tests/stress-invariants-app.test.ts` | The invariants over the `app` designs |
| `tests/stress-import.test.ts` | Hand-written import edge cases |
| `tests/stress-growth.test.ts` | Deterministic growth checks (counts, not times), in the default suite |
| `tests/stress-scale.test.ts` | The opt-in size ladder; skipped unless `STRESS=1` |

### The generator

It uses one small seeded generator (mulberry32), so the same seed always gives the same
design on any machine. It has three shapes:

- **`random`:**
  - **Nodes:** N nodes. About a tenth are clients, with at least one, and at least one is
    compute; the rest are any kind.
  - **Edges:** about 2 per node, with any protocol. There are no self-loops and at most one
    edge between a pair of nodes, because export refuses two.
  - **Features:** 1–3. Each has a target of 0–3,000 req/min and 1–200 ms of compute. Each of
    `backgroundWorkMs`, `pollingRpm`, `fileRpm` and `writeRpm` is set about 30% of the time.
    Each feature is placed on a compute node 85% of the time.
- **`app`:** the shape students draw.
  - The core is clients → load balancer → 1–4 compute → an optional cache → a database.
  - It optionally adds a queue → worker → database branch and a CDN → static hosting front.
  - Sizes run from 5 to about 30 nodes.
- **`stacked`:** a client, then L layers of W load balancers, each layer fully connected to
  the next, then one compute node and a database. This is the shape that makes the load
  model slow; it's used only in the growth and scale tests.

**Config.** Values are random but in range. The minimum is the inspector's, and the
maximum is the inspector's where it has one (replicas 8, shards 16, worker concurrency 64).
Otherwise the maximum is 4× the catalog default. Out-of-range values never go into the
generator; they're tested only through import (below).

## Invariants

They are checked on every design in the invariant suite. Counts can be fractional (for
example, 100,000.0000000067 served), so a count "equals" another when they are within
1e-6 × requests.

**Engine (`runVerification`):**
- E1: it doesn't throw.
- E2: the four estimates are finite and ≥ 0, and availability is ≤ 100.
- E3: `overall` is the worst status among the checks.
- E4: two runs give the same result, apart from `ranAt`.

**Load model (`simulateLoad`, with the brief's scenario and loads, or the sandbox
defaults):**
- L1: it doesn't throw.
- L2: every number in the summary and in every frame is finite.
- L3: served + failed = requests.
- L4: the failure groups add up to failed.
- L5: no per-node count is negative, and utilisation is ≥ 0.
- L6: p50 ≤ p95.
- L7: for background jobs, done + still waiting + never done = queued.
- L8: two runs give the same result.
- L9: with the first component that can be switched off turned off a third of the way
  in, L1–L3 still hold.

**Round trip:**
- R1: export succeeds. This holds for every fixture and every generated design, because the
  generator never makes a design export would refuse.
- R2: importing the export gives the same engine result and the same load summary.

**Failure messages.** A failure names the invariant (e.g. `L3 served + failed = requests`),
the design (a fixture name or the generator's description), the numbers involved and, for
generated designs, the replay command.

**Default run.**
- **Designs:** all fixtures, both demos, `random` seeds 1–100 (2–14 nodes) and `app` seeds
  1–25.
  - **Changed in Task 3 (2026-11-06):** the default run was 200 and 50 seeds. Those took
    `npm test` from 14.6 s to about 36.8 s, 22 s more against a budget of 20 s. With 100 and
    25 seeds it takes about 30.7 s, 16 s more.
  - This is the plan's agreed mitigation, and `STRESS_SEEDS=200` still runs the original
    count.
  - Most of the cost is the fixtures: with only 40 random designs, the suite still takes
    about 28.8 s.
  - **Re-measured at Checkpoint B.** The machine's speed drifted during the session: the
    unchanged suite went from 14.6 s to about 18.3 s. So the Task 3 numbers compared
    against a baseline that had moved.
    - Measured side by side (alternating runs, twice each), the baseline took 18.1 and
      18.6 s, 200/50 seeds took 37.8 and 37.1 s, and 100/25 seeds took 31.1 and 31.8 s.
    - So 200 seeds add about 19.1 s, just inside the 20 s budget with no room to spare, and
      100 seeds add about 13.2 s.
    - The default stays at 100 unless you choose otherwise.
- **Determinism:** E4 and L8 run on the fixtures and every tenth seed, to stay within budget.
- **Budget:** the stress files may add at most 20 s to `npm test` on this machine; the
  plan measures it.

## Known bugs, pinned

Each pin is an `it.fails` whose name starts with the module that fixes it, e.g.
`[config-bounds] refuses replicas: .inf`.

| Owner | Expected failure |
|---|---|
| `config-bounds` | Importing a database with `replicas` or `shards` of `0`, `-1`, `1.5`, `.nan`, `.inf` or `1000000`, worker `concurrency` of `0` or `.nan`, or a compute `capacity.vcpus` of `-1` is refused with a message naming the file and the field's path. These run the import only, never the model, because `.inf` crashes the worker. |
| `config-bounds` | A saved `/simulate` design (the session-storage text) with `replicas: .inf` gives `loadHandoff` an error, not a design. Today it gives a design, which crashes the page every time it's reloaded. |
| `loadsim-route-scale` | Growth: the flow graph for `stacked` designs with 4 to 5 layers of 4. Its route steps may grow at most 1.5× from one layer to the next (the node count grows 1.2×). Today they grow 4×. The count uses `buildFlowGraph`. If `loadsim-route-scale` changes how routes are held, it updates the counting helper in the same change. |
| `engine-path-scale` | Only in the opt-in ladder: Run simulation on a `random` 200-node design within its budget. The engine exposes no count to pin instead. |

## Import edge cases (`tests/stress-import.test.ts`)

Cases already in `design-file.test.ts` and `handoff.test.ts` aren't repeated. Each case
says what should happen.

**Refused, with a message naming the file (and the path, where there is one):**
- an empty file, or one with only comments;
- a top level that is a list, a string or a number;
- invalid YAML (a tab indent, an unclosed bracket);
- a YAML alias bomb (already refused by the `yaml` library);
- unknown keys at the top level, on a node and in `config`;
- a config value of the wrong type;
- a duplicate node id, or a duplicate edge;
- an edge to an unknown node, a malformed edge line, or an unknown protocol;
- an unknown kind;
- an `at` that has three numbers, a string, `.nan` or `.inf`;
- an unknown challenge id.

**Accepted, and unchanged through export and import:**
- CRLF line endings;
- Unicode labels and purpose notes, and labels of 10,000 characters;
- a 2,000-node file (import only; the engine isn't run). This must take ≤ 2 s.

**Recorded first, then pinned:**

The plan's first task runs these and writes the result into this spec. A crash, a hang or
an impossible result becomes a new finding, pinned with `it.fails` and added to the map.
Anything else is pinned as it is.

Recorded in Task 4 (2026-11-06). None of the four crashes or gives an impossible result,
so each is pinned as it behaves:

| Case | What happens |
|---|---|
| A self-loop `a -> a` | **Accepted.** The edge stays in the design, and the design keeps every invariant (engine, load model, outage, export and import). The canvas refuses to draw one, so import is looser than the editor. This is harmless today; `config-bounds` could bring import in line. |
| A UTF-8 BOM | **Accepted.** The design is the same as without the BOM. |
| `a -> b` and `b -> a` in one file | **Accepted** as two edges. It keeps every invariant and exports, because Export only refuses two connections in the same direction. |
| A saved `/simulate` design whose brief is gone | **An error, not a design:** `retired-brief-design.yaml: challenge: no challenge called "retired-brief"`. The page shows it instead of crashing. |

**Scenario fields.** `parseScenarioField` is checked with `""`, `" "`, `abc`,
`1,000,000`, `-5`, `1e9`, `Infinity`, `NaN`, `0x10` and `12.6`. Only cases not already in
`scenario-controls.test.tsx` are added.

## Opt-in scale ladder (`STRESS=1`)

**Cases:**
- `random` and `app` designs at 25, 50, 100 and 200 nodes, three seeds each;
- `stacked` designs of 3 to 7 layers of 4.

**How each case runs.** Each case gets its own child process with a hard limit of 10× its
budget, so a hang becomes a failed case instead of a stuck run.

**What it reports.** Engine and load-model times per case. It fails a case over budget,
except where a pin expects it.

| Size | Engine budget | Load model budget |
|---|---|---|
| up to 50 nodes | 200 ms | 2 s |
| 100–200 nodes | 500 ms | 5 s |
| `stacked`, any depth | 200 ms | 2 s |

The budgets are proposals (open question 2). Times depend on the machine, which is why the
ladder never runs in the default suite.

## Code style

The repo's conventions apply: plain-English test names, `@/` imports, no `any` (lint), and
a comment citing this spec where a test isn't obvious.

```ts
// SPEC-stress-harness.md: every invariant on every generated design.
describe.each(seeds("random", 200))("random design, seed %i", (seed) => {
  it("keeps every invariant", () => {
    const d = generateDesign({ seed, shape: "random" });
    expect(brokenInvariants(d, null), d.description).toEqual([]);
  });
});

it.fails("[config-bounds] refuses replicas: .inf", () => {
  expect(importWithDbReplicas(".inf")).toHaveProperty("error");
});
```

## Testing strategy

- **The harness is tests.** Its own correctness is checked by `gen-designs.test.ts`:
  - the same seed gives the same design;
  - every config value is in range;
  - there are no self-loops and at most one edge per pair;
  - every generated design exports;
  - each shape has the node counts and kinds it promises.
- **A mutation check for `brokenInvariants`.** Feed it doctored results: served bumped by
  1, a `NaN` estimate, an `overall` better than its worst check. Each must report the right
  invariant, so a check that can't fail is caught.
- **Before merging:**
  - the full suite;
  - `STRESS_SEEDS=2000` once;
  - the `STRESS=1` ladder once, with its times recorded in this spec's Results section.

## Boundaries

- **Always:**
  - tests and test helpers only;
  - fixed seeds, and every failure names its design and its replay command;
  - keep the default suite within its budget;
  - run `npm test`, `tsc`, lint and the build before committing;
  - update the map's status when this lands.
- **Ask first:**
  - adding a dependency (e.g. fast-check);
  - changing an existing test;
  - raising a budget or a tolerance;
  - turning a "record first" case into a pin that expects a crash.
- **Never:**
  - change product code to make a stress test pass;
  - weaken an invariant to get a green run;
  - run the load model on a config that crashes the worker in the default suite;
  - leave probe files behind.

## Success criteria

1. `gen-designs.test.ts` and the mutation check pass.
2. Every invariant holds on all fixtures, both demos, `random` seeds 1–100 and `app` seeds
   1–25 (the default since Task 3), and once with `STRESS_SEEDS=2000`.
3. Each known bug in the table is an `it.fails` named after its owner, and vitest reports
   them as expected failures.
4. Every import edge case is written down with its outcome. Any new problem is a pin in the
   map.
5. The stress files add ≤ 20 s to `npm test`.
6. `STRESS=1` runs to the end with no hang. Its only failing cases are the pinned ones, and
   their times are recorded.
7. `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build` pass.

## Open questions

All three were answered with the spec's approval (2026-11-06), using the proposed answers:
1. **`engine-path-scale`:** approved as a module in the map.
2. **The ladder's budgets:** as in the table.
3. **Generator:** hand-written, with no new dependency.

## Results (2026-11-06)

Built on `test/stress-harness`, Tasks 1–7 in
[tasks/stress-harness/todo.md](tasks/stress-harness/todo.md), which has the details for
each task. No product code changed.

### Success criteria

1. **Met: the generator and the mutation check pass.**
   - `gen-designs.test.ts`: 17 tests over 500 seeds per shape. A value pushed one step past
     its maximum made the range test fail.
   - `invariants.test.ts`: 20 tests. Each doctored result is reported with exactly the
     expected invariant id.
2. **Met: every invariant holds.**
   - The default run (86 fixtures, 2 demos, 100 `random` and 25 `app` designs) passes.
   - `STRESS_SEEDS=2000` passes too: 2,588 designs (86 fixtures, 2 demos, 2,000 `random`
     and 500 `app`) in 116 s.
   - Not one invariant broke on any design, so this module found no new bug in the engine
     or the load model on designs up to 30 nodes.
3. **Met: the known bugs are pinned.** There are 17 expected failures in the default suite
   and 6 in the ladder:

   | Owner | Default suite | Ladder (`STRESS=1`) |
   |---|---|---|
   | `config-bounds` | 16: 15 out-of-range config imports, plus the saved `/simulate` design with `replicas: .inf` | — |
   | `loadsim-route-scale` | 1: route steps from 4 to 5 stacked layers (today ×4) | 3: `stacked` 5, 6 and 7 × 4 |
   | `engine-path-scale` | — | 3: `random` 200 nodes, seeds 1–3 |

   Each `config-bounds` pin has a plain test showing the file is accepted today, and the
   growth pin has a plain test fixing today's counts. So each pin fails for the reason it
   names.
4. **Met: every import case has its outcome written down.** See the import section above.
   - None of the four record-first cases crashes or gives an impossible result, so the map
     has no new finding.
   - One note for `config-bounds`: import accepts a self-loop that the canvas refuses to
     draw.
5. **Met: the stress files add about 13 s to `npm test`** (budget 20 s), measured side by
   side because the machine's speed drifted during the session. See the default-run notes
   under Invariants. At the spec's original 200/50 seeds they add about 19 s; the default
   is 100/25.
6. **Met: `STRESS=1` runs to the end.** Two runs took 239 and 241 s.
   - 23 cases are within budget and 6 are expected failures; there were no other failures.
   - No `node` process was left behind after killing hung children.
   - Times are in the table below.
7. **Met: all checks pass.** `npm test` gives 1,776 passed, 17 expected failures and 32
   skipped, in 25.7 s on the final run. `npx tsc --noEmit`, `npm run lint` and
   `npm run build` are clean.

### The ladder (second run, with the pins)

| Case | Engine | Load model | Route steps |
|---|---|---|---|
| `random` 25 nodes, seeds 1–3 | 3–4 ms | 15–48 ms | 0–12 |
| `random` 50 nodes | 4–8 ms | 41–53 ms | 8–28 |
| `random` 100 nodes | 11–354 ms | 54–70 ms | 4–42 |
| `random` 200 nodes, seeds 1 and 2 | **never returned** (killed at 70 s) | not reached | — |
| `random` 200 nodes, seed 3 | **1,589 ms** | 93 ms | 18 |
| `app` 25 nodes | 2–3 ms | 56–174 ms | 32–84 |
| `app` 50 nodes | 3 ms | 97–179 ms | 64–123 |
| `app` 100 nodes | 4 ms | 105–167 ms | 60–162 |
| `app` 200 nodes | 5–6 ms | 213–290 ms | 76–207 |
| `stacked` 3 × 4 | 3 ms | 171 ms | 426 |
| `stacked` 4 × 4 | 3 ms | 586 ms | 1,706 |
| `stacked` 5 × 4 | 4 ms | **3,566 ms** | 6,826 |
| `stacked` 6 × 4 | 9 ms | **24,324 ms** | 27,306 |
| `stacked` 7 × 4 | 17 ms | **killed at 37 s** | 109,226 |

The case closest to its budget is the `random` 100-node seed 3 engine (331 and 354 ms
against 500). It's the same path-walking cost as the 200-node hang, so `engine-path-scale`
should bring it down too.

### Changes from the plan

- **The invariant suite is four files, not one.** One file took 42 s, because tests within
  a file run one after another. The shared bodies are in `src/test/stress-suite.ts`.
  Splitting further was slower, because this machine is CPU-bound.
- **The default is 100 `random` and 25 `app` seeds,** not 200 and 50, for the budget (see
  criterion 5).
- **The outage run passes the `baseline` it already has.** Without one, `simulateLoad`
  runs the design a second time, which made the outage check twice as costly. No check
  changed.
- **The import tests start from the reference design as Export writes it,** not the raw
  fixture, because that's what students import.

### What the fix modules inherit

- **`config-bounds`:**
  - 16 pins in `tests/stress-import.test.ts`;
  - the plain "today, … is accepted" tests beside them, which turn around at the same time;
  - `CONFIG_RANGES` in `src/test/gen-designs.ts`, to replace with the shared limits;
  - the self-loop note.
- **`loadsim-route-scale`:**
  - the growth pin and its count guard in `tests/stress-growth.test.ts`;
  - the three `stacked` ladder pins.
- **`engine-path-scale`:** the three `random` 200-node ladder pins. The engine has no cheap
  count to pin in the default suite.
