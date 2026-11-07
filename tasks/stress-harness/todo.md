# Tasks: `stress-harness`

Spec: [SPEC-stress-harness.md](../../SPEC-stress-harness.md). Plan: [plan.md](plan.md).

**Standing verification:**
- `npm test`, `npx tsc --noEmit` and `npm run lint` pass.
- Nothing under `src/lib/` (outside `src/test/`) or `src/components/` changes. Check this
  with `git diff --stat main -- src/lib src/components ':!src/test'`, which shows nothing.
- No existing test changes.
- Baseline: 1,473 passed and 2 skipped, in 14.6 s.

---

## Task 1: Generator

**Description:** `src/test/gen-designs.ts`:
- `rng(seed)` (mulberry32) and `CONFIG_RANGES`;
- `generateDesign({ seed, shape, nodes? })` for `random`, `app` and `stacked`, returning a
  built design, `functionalReqs` and a `description`.

Tests in `src/test/gen-designs.test.ts`, written first.

**Acceptance criteria:**
- [x] The same seed and shape give a deep-equal design. Two different seeds give different
      designs.
- [x] Across 500 seeds per shape:
  - every config value is within `CONFIG_RANGES`;
  - there are no self-loops and at most one edge per unordered pair;
  - placements are only on compute nodes;
  - every design exports (`exportDesignFile` gives no error).
- [x] The shapes have their promised sizes and kinds:
  - `random` has 2–14 nodes, at least one client and at least one compute;
  - `app` has 5–30 nodes by default, and exactly the asked size ±3 with `nodes`;
  - `stacked` with `{ layers: 3, width: 4 }` has 1 + 12 + 2 nodes and 4 + 16 + 16 + 4 + 1
    edges.

**Verification:**
- [x] `npx vitest run src/test/gen-designs.test.ts`
- [x] `npx tsc --noEmit`, `npm run lint`

**Done (2026-11-06), not committed yet:**
- **Tests:** 17, written first and seen failing before the generator existed.
- **Full suite:** 1,490 passed and 2 skipped, in 15.0 s (baseline 14.6 s).
- **Speed:** the 1,000 exports take 3 s alone and 6.5 s under the full suite's parallel
  load, so the loops over every seed have a 30 s timeout.
- **Mutation check:** values made one step over the maximum fail the range test. The change
  was reverted.
- **Beyond the task:**
  - `random` also takes `nodes` (exact size), for the ladder;
  - the generator also varies the database and cache engines and the queue's mode
    (`CONFIG_ENUMS`, mirroring the validator's), so pub/sub queues get exercised.
- **`app` design:** clients connect to every block's load balancer, and features are placed
  on any block's compute.

**Dependencies:** None
**Files:** `src/test/gen-designs.ts`, `src/test/gen-designs.test.ts`
**Scope:** S

## Task 2: Invariant checker

**Description:** `src/test/invariants.ts`:
- the pure checks `checkEngine`, `checkLoadRun` and `checkRoundTrip`;
- `brokenInvariants(subject, opts)`, which runs the engine, the load model, an outage and
  the round trip and collects what's broken;
- `COUNT_TOLERANCE`.

Mutation tests in `src/test/invariants.test.ts`, written first.

**Acceptance criteria:**
- [x] Each of E2, E3, L2–L7 is reported, with the right id, for a doctored result:
  - served + 1;
  - a `NaN` estimate;
  - availability 101;
  - an `overall` better than the worst check;
  - a negative backlog;
  - p50 > p95;
  - failure groups off by 1;
  - jobs off by 1;
  - an `Infinity` in a frame.
- [x] A throw in the engine or the model becomes an E1 or L1 entry with its message, not an
      exception.
- [x] `brokenInvariants` on the link shortener's `good` fixture and on `random` seed 1
      returns `[]`.

**Verification:**
- [x] `npx vitest run src/test/invariants.test.ts`
- [x] `npx tsc --noEmit`, `npm run lint`

**Done (2026-11-06), not committed yet:**
- **Tests:** 20, written first and seen failing before the module existed. Each mutation
  test checks that exactly the one expected id is reported, not just that it is among the
  results.
- **Full suite:** 1,510 passed and 2 skipped, in 15.1 s.
- **Beyond the task:**
  - `canonical(value, nodeIds, edgeIds)` compares results across a round trip. Import
    renames ids that aren't kebab-case but keeps their order, so ids are replaced by their
    position. It has two tests of its own, including that `api-1` isn't matched inside
    `api-10`.
  - A doctored served + 1e-8 isn't reported, which shows the tolerance works.
  - A scratch run (deleted) found that both demos keep every invariant, round trip included.
- **Utilisation:** below zero counts as broken only past 1e-9 (`RATIO_TOLERANCE`), to allow
  for floating-point rounding.
- **Not covered by a mutation test:** E4, L8, L9 and R2. They compare two real runs, so
  they can't be faked with one doctored result. They're simple string comparisons, and
  Task 3 runs them across every design.

**Dependencies:** Task 1
**Files:** `src/test/invariants.ts`, `src/test/invariants.test.ts`
**Scope:** S

### Checkpoint A: after Tasks 1–2
- [x] Standing verification passes.
- [x] Report the generator's and checker's API before writing the suites on top of them.

## Task 3: Invariant suite

**Description:** the invariant suite (one file in the plan, four after the split below),
which checks:
- every fixture and both demos;
- `random` seeds 1–200 and `app` seeds 1–50, cut to 100 and 25 by default for the budget
  (see Done).

Determinism is checked on the fixtures and every tenth seed. `STRESS_SEEDS` and
`STRESS_SEED` work as the spec says, and failure messages carry the replay command.

**Acceptance criteria:**
- [x] Every design keeps every invariant. If one doesn't, stop and report it. It's a new
      finding, not something to loosen.
- [x] `STRESS_SEED=7` runs only seed 7 (two tests, one per shape).
- [x] A deliberately broken check gives a message naming the design and the replay command.
      Break it temporarily in a scratch copy and revert; don't commit this.
- [x] Record the file's own time and the slowest single design's time.

**Verification:**
- [x] `npx vitest run tests/stress-invariants --reporter=verbose`
- [x] `STRESS_SEED=7 npx vitest run tests/stress-invariants`

**Dependencies:** Task 2
**Files:** `src/test/stress-suite.ts`, `tests/stress-invariants-fixtures-1.test.ts`, `-2`,
`tests/stress-invariants-random.test.ts`, `tests/stress-invariants-app.test.ts`, and a
change to `src/test/invariants.ts` (the outage baseline)
**Scope:** S

**Done (2026-11-06), not committed yet:**
- **Every design passes.** At the original counts (86 fixtures, 2 demos, 200 random and
  50 app designs), all 338 keep every invariant.
- **Timing:**
  - **One file:** 42 s on its own: fixtures 18.3 s, app 14.5 s, random 7.7 s, demos 0.3 s.
    The slowest design was `app` seed 30 (2.4 s), then
    `notification-system/bad-client-to-db` (1.0 s).
  - **Four files:** the shared bodies went into `src/test/stress-suite.ts`; run alone,
    the four files take 20.7 s.
  - **Six files are worse:** splitting further (the app seeds over three files) made the
    full suite slower (42–48 s), because this machine is CPU-bound.
- **The outage run was twice as costly as it needed to be.** Without a `baseline`,
  `simulateLoad` runs the design a second time to work out what an outage cost elsewhere
  (`model.ts:1309`). The checker now passes the run it already has. For 50 app designs, the
  outage part went from +7.5 s to +4.4 s. No check changed.
- **Budget:**
  - At 200/50 seeds, `npm test` took 36.8 s, 22 s over the 14.6 s baseline and over the
    20 s budget.
  - The default is now 100/25 seeds (the plan's mitigation), at about 30 s (two runs:
    29.9 s and 30.4 s), so about 15.5 s more.
  - With only 40 seeds it was still 28.8 s, because the fixtures are most of the cost.
- **Replay:** `STRESS_SEED=7` runs exactly two tests (random and app seed 7), and the other
  88 are skipped.
- **Failure message:** with L3 broken on purpose (in a copy that was then restored), the
  message reads `app seed 7, 5 nodes` / `replay: STRESS_SEED=7 npx vitest run
  tests/stress-invariants`, followed by the broken invariant's id and numbers.

## Task 4: Import edge cases

**Description:** `tests/stress-import.test.ts`:
- **First,** run the four record-first cases (self-loop, BOM, `a -> b` with `b -> a`, a
  saved design whose brief is gone). Run the import only, and write their outcomes into the
  spec's import section. If any outcome is a crash, a hang or an impossible result, stop and
  ask before pinning it.
- **Then:** the refused and accepted cases, and the `config-bounds` pins (import only),
  including the `loadHandoff` pin.
- **Finally,** the scenario-field cases not already tested.

**Acceptance criteria:**
- [x] Every refused case checks that the message names the file and, where there is one,
      the path.
- [x] Every accepted case round-trips unchanged. The 2,000-node file imports in ≤ 2 s,
      with the time recorded.
- [x] Each `config-bounds` pin is an `it.fails` named `[config-bounds] …`, and vitest
      reports it as an expected failure. No pin runs the engine or the load model.
- [x] The spec's "Recorded first" list now says what each case does.

**Verification:**
- [x] `npx vitest run tests/stress-import.test.ts --reporter=verbose`

**Dependencies:** Task 1 (file helpers). Not Task 3.
**Files:** `tests/stress-import.test.ts`, `SPEC-stress-harness.md`, possibly
`CAPABILITY-MAP-stress.md` (if there's a new finding, after asking)
**Scope:** M

**Done (2026-11-06), not committed yet:**
- **The file:** 68 tests, of which 52 pass and 16 are expected failures (`[config-bounds]`).
  - The full suite has 1,775 passed, 16 expected failures and 2 skipped, in 27.5 s on
    both runs.
  - `tsc` and lint are clean, and no product code changed.
- **Base file:** the link shortener's reference design as Export writes it, rather than
  the raw fixture, because that's what students actually import. `fileWith` throws if the
  text it replaces isn't there, so a case can't quietly test the unchanged file. This
  caught my first try: Export writes `lb -> api-1: http`, with no space before the colon.
- **Record-first outcomes:** recorded in the spec's import section. None crashes or gives
  an impossible result.
  - A self-loop and `a -> b` with `b -> a` are both accepted and keep every invariant. The
    canvas refuses a self-loop, so import is looser than the editor.
  - A BOM is accepted.
  - A saved design whose brief is gone gives an error naming the missing challenge.
  - No new finding, so the map is unchanged.
- **Pins:**
  - **Out-of-range config:** 15 cases. `replicas` and `shards` at 0, -1, 1.5, `.nan`, `.inf`
    and 1000000; worker concurrency at 0 and `.nan`; and compute `capacity.vcpus` at -1.
  - **Saved design:** the `/simulate` design with `replicas: .inf`.
- **Guards:** `it.fails` passes on any failure, a typo included, so each pin has a plain
  test showing the file is accepted today. Another plain test shows the same files with
  in-range values are accepted. That way, each pin fails for the reason it names.
- **The 2,000-node file** (a generated `random` design, exported) imported in 0.75 s.
- **Messages:**
  - An unknown top-level key reads `test.yaml: colour: unknown field`, with the key as the
    path, not `(root)`. The spec's expectation was mine and wrong; the test now checks the
    real format.
  - The other refusals are clear, e.g. `design.edges[1]: unknown protocol "carrier_pigeon"`
    and `design.nodes[0].at: expected [x, y] with two numbers`.
- **Scenario fields:** `"0x10"` is read as 16 and clamped to 1,000. That's odd but
  harmless, and it's pinned with a comment.

## Task 5: Growth pin

**Description:** `tests/stress-growth.test.ts`:
- a `routeSteps(graph)` helper;
- a plain test pinning today's exact counts for `stacked` 1–3 layers of 4;
- `it.fails("[loadsim-route-scale] route steps grow with nodes, not paths")`, which checks
  the 4 → 5 layer ratio is ≤ 1.5.

**Acceptance criteria:**
- [x] The plain test passes with today's counts, and the `it.fails` is reported as an
      expected failure. Today's ratio is about 4.
- [x] The file runs in under 2 s. It builds flow graphs only and never runs the model.

**Verification:**
- [x] `npx vitest run tests/stress-growth.test.ts --reporter=verbose`

**Dependencies:** Task 1
**Files:** `tests/stress-growth.test.ts`
**Scope:** XS

**Done (2026-11-06), not committed yet:**
- **Steps** for `stacked` designs with 1–6 layers of 4: 26, 106, 426, 1,706, 6,826 and
  27,306. That's exactly 4× per layer, while the nodes go from 7 to 27.
- **Speed:** building the flow graph takes under 30 ms even at 6 layers. The time is all in
  the model's run (36 s at 6 layers), so the count is a cheap stand-in.
- **The file:** two tests, one pass and one expected failure, in 0.76 s. The guard pins
  today's 26, 106 and 426 exactly.

### Checkpoint B: after Tasks 3–5
- [x] Standing verification passes: `tsc` and lint are clean, no product code changed, and
      no existing test changed.
- [x] `npx vitest run` is at most 20 s slower than the baseline.
  - **The machine's speed drifts during a session:** the unchanged baseline took 14.6 s
    this morning and 19 s now. So this was measured by alternating runs without the new
    files (`--exclude` for them) and with them, three times each.
  - **Result:** baseline 19.5, 19.1 and 18.7 s; full 31.9, 31.6 and 31.7 s. The stress
    files add about 12.6 s.
  - **Counts:** 1,776 passed, 17 expected failures and 2 skipped.
  - **200 seeds, re-measured the same way:** about +19.1 s (37.8 and 37.1 s against
    baselines of 18.1 and 18.6 s). That's just inside the budget, so Task 3's cut to 100
    wasn't strictly needed, but it leaves no room to spare. It's noted in the spec, and the
    default stays at 100 unless you choose otherwise.
- [x] Report the timings and any record-first outcomes before the ladder.

## Task 6: Opt-in scale ladder

**Description:** `tests/stress-scale.test.ts`, with its parent and child modes as in the
plan.
- **Cases:**
  - `random` and `app` at 25, 50, 100 and 200 nodes, seeds 1–3;
  - `stacked` with 3–7 layers of 4.
- **First run:** run it once. Each case over budget with a known cause becomes an `it.fails`
  named after its owner: `engine-path-scale` for the engine, `loadsim-route-scale` for the
  load model. A case over budget with no known cause is a stop-and-ask.

**Acceptance criteria:**
- [x] With no environment variables, the file only skips (the default suite is unchanged).
- [x] `STRESS=1` finishes with no hang and prints every case's engine and load-model time.
      Its only failures are expected failures named after an owner.
- [x] After a timed-out case, `tasklist | findstr node` shows no process left from the
      child.

**Verification:**
- [x] `STRESS=1 npx vitest run tests/stress-scale.test.ts --reporter=verbose`
- [x] `npx vitest run tests/stress-scale.test.ts` (skips only)

**Dependencies:** Tasks 1, 5 (the `stacked` shape, and agreement with the growth pin)
**Files:** `tests/stress-scale.test.ts`
**Scope:** S

**Done (2026-11-06), not committed yet:**
- **How a child reports.** Each child writes its results to a temporary file after each
  part, instead of printing them, so the parent never has to parse vitest's output. A
  killed child still reports what it finished. The child also records the route-step count
  (cheap), which tells the load model's blow-up apart from slow work.
- **First run (239 s):** 23 cases within budget and 6 over, each with a clear cause. All
  six are now pinned in `PINNED` with a comment giving the numbers.
  - **`engine-path-scale`:** `random` 200 nodes. Seeds 1 and 2 never returned from the
    engine and were killed at the 70 s limit; seed 3 took 1,525 ms against a 500 ms budget.
  - **`loadsim-route-scale`:** `stacked` 5, 6 and 7 × 4. The load model took 3.3 s,
    24.4 s, and over the 37 s limit, with 6,826, 27,306 and 109,226 route steps.
- **Second run with the pins (241 s):** 23 passed and 6 expected failures, with times
  within about 10% of the first run.
- **Stray processes:** the `node` process ids were the same before and after both runs,
  including three killed children each time, so `--pool=threads` did its job.
- **Closest to its budget:** the `random` 100-node seed 3 engine, at 331 and 354 ms against
  500. It's the same path-walking cost starting to show, and a slower machine could tip it
  over.
- **Everything else is fast.** Even 200-node `app` designs run in 5 ms (engine) and about
  0.2–0.3 s (load model).
- **Default suite with the file present:** 1,776 passed, 17 expected failures and 32
  skipped (30 of them this file), in 32.5 s. `tsc` and lint are clean.

## Task 7: Wrap up

**Description:**
- Run `STRESS_SEEDS=2000` once and the full checks.
- Write a Results section in the spec:
  - timings;
  - the ladder's table;
  - the record-first outcomes;
  - the pins, by owner.
- Mark `stress-harness` built in the map.
- Commit on `test/stress-harness`. Commit messages carry no co-author line (your rule).

**Acceptance criteria:**
- [x] `STRESS_SEEDS=2000 npx vitest run tests/stress-invariants` passes.
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build` pass.
- [x] The spec's success criteria 1–7 are each ticked with evidence in Results.
- [x] The diff touches only `src/test/`, `tests/`, the spec, the map and `tasks/stress-harness/`.

**Verification:**
- [x] The commands above
- [x] `git diff --stat main`

**Dependencies:** Tasks 1–6
**Files:** `SPEC-stress-harness.md`, `CAPABILITY-MAP-stress.md`, `tasks/stress-harness/todo.md`
**Scope:** XS

**Done (2026-11-06):**
- **2,000 seeds:** `STRESS_SEEDS=2000` checked 2,588 designs (86 fixtures, 2 demos, 2,000
  `random` and 500 `app`) in 116 s, and all passed.
- **Full checks:**
  - `npm test`: 56 files passed and 3 skipped; 1,776 tests passed, 17 expected failures
    and 32 skipped, in 25.7 s.
  - `tsc` and lint are clean.
  - `npm run build` succeeded with three static routes, and the build changed no tracked
    file.
- **Docs:** the Results section is in the spec, and the map is marked as `stress-harness`
  built.
- **Commits** on `test/stress-harness`, not pushed:
  1. the capability map and the harness spec, plan and tasks;
  2. the harness itself.

### Checkpoint: complete
- [x] All acceptance criteria met.
- [ ] Review with you before merging into `main`.
