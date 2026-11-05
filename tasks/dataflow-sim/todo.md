# Tasks: `dataflow-sim`, slice 1

Spec: [SPEC-dataflow-sim.md](../../SPEC-dataflow-sim.md). Plan: [plan.md](plan.md).

Standing verification: `npm test`, `npx tsc --noEmit` and `npm run lint` pass. The engine, its
numbers, the fixtures, the demos, `rules.ts` and the verification panel are unchanged.

---

## Task 1: Tests first

**Description:**
- **New `src/lib/loadsim/scenario.test.ts`:**
  - `arrivals` for `steady`, `ramp` and `spike` (600 steps, 100,000 requests) each add up to
    100,000 (within 1e-6);
  - `steady` is flat;
  - `ramp`'s step rates increase;
  - `spike`'s first 150 steps hold 50,000;
  - `defaultScenario(null)` is `{ 100000, 1200, "spike" }`, and a brief's `load` overrides
    each field it sets;
  - `featureLoads`:
    - the feature share follows `targetRpm` (`link-shortener`: Redirect 1200 / 1260);
    - `writeShare` defaults to `writeRpm / targetRpm` (`lab-monitor`'s `report-metrics`),
      otherwise 0.2 for storing features and 0 for stateless ones;
    - `dbMs` defaults to 3 and 8;
    - a brief's per-feature values override them.
- **New `graph.test.ts`** (designs built with `buildDesign` from fixtures):
  - `link-shortener/good`:
    - one pool, {api-1, api-2};
    - both features route through `lb`, with each member taking 0.5 of each class;
    - reads go to `cache`, with 0.1 continuing to `db`, and writes go straight to `db`.
  - A hand-built design with three PaaS behind one load balancer gives each a third.
  - `link-shortener/bad-no-load-balancer`: the phone's Redirect classes are `no-route`
    (naming Student phone and Redirect); the lab machine's Redirect reaches api-2.
  - An unplaced feature is `no-route` for every client.
  - `link-shortener/bad-no-cache`: reads go straight to `db`.
  - Database copies: a 2-shard, 1-replica database splits reads over 4 copies and writes
    over 2 primaries.
  - `notSimulated`, for `course-registration/good`:
    - names Seat claims (queue), Seat allocator (worker) and the PaaS autoscaling note;
    - a design with a client → database edge and an SSE edge names both;
    - `link-shortener/good` names only autoscaling.
- **New `model.test.ts`:**
  - conservation: for every fixture of every brief under its default scenario, served +
    failed = requests (within 0.5);
  - running the same input twice gives deep-equal output;
  - **under capacity** (1,000 requests over 600 s through `link-shortener/good`):
    - nothing fails, and no station saturates;
    - p50 sits within the sum of the base times ± 1 bin;
  - **hand-checked overload:** client → one VM (1 vCPU, one feature at 10 ms, so a budget
    of 700 ms/s and 70 req/s), with 140 req/s steady:
    - the backlog grows by about 70 req/s;
    - the first failures come once the backlog passes 350 requests (5 s);
    - the VM is the first saturation, at step 0;
    - failures are attributed to it as `timed-out`;
  - a run with 1,000,000 requests has the same number of frames as a 1,000-request run,
    and finishes in under 2 s.
- **New `summary.test.ts`:**
  - the first-saturation note for a database, from the template;
  - when nothing saturates, the busiest node with a short note;
  - the cache estimate in `notes` for a database with no cache that's mostly reads, and
    none when a cache is in front;
  - failures grouped by node and reason, and the per-node totals.
- **New `handoff.test.ts`** (a storage stub):
  - each `link-shortener` and `course-registration` fixture, and both demos, survive
    `saveHandoff` then `loadHandoff` with the same node ids, kinds, positions, edges,
    protocols and placements;
  - a challenge design comes back with its brief;
  - an empty store gives `{ empty: true }`;
  - corrupt JSON or invalid YAML gives `{ error }`, not an exception;
  - two connections between one pair give Export's error.
- **`src/lib/challenges/validate.test.ts`:** a valid `load` block is read; each bad case fails
  with its path (unknown requirement id, `writeShare` 1.5, `dbMs` 0, `shape: burst`,
  `requests` 0, `windowSeconds` 10); a brief without `load` reads as before.
- **`src/lib/store.test.ts`:** `isFreshStart()`:
  - true on a new store;
  - false after `addComponent`, `loadDemo`, `startChallenge`, `loadDesign` or
    `runVerification`;
  - still true after `selectNode` and `setViewCentre`.
- **New `tests/loadsim-pilots.test.ts`:** the spec's pilot expectations, which fail until
  Task 4:
  - each good design serves at least 99% with no saturation;
  - `course-registration/bad-no-cache` saturates Registration DB first, with at least 5%
    failed;
  - `link-shortener/bad-no-cache` fails nothing, its database's peak utilisation is at
    least 2× good's, its p50 is higher (p95 in the first draft; see Task 4), and the
    summary has the cache estimate;
  - `link-shortener/bad-no-load-balancer` fails the phone's redirects as `no-route`.

**Acceptance criteria:**
- [x] The new tests fail for the expected reasons (missing modules, no `load` in the
  validator, no `isFreshStart`).
- [x] The existing tests are still green.

**Verification:**
- [x] `npx vitest run`: 14 failed, all new (7 `isFreshStart`, 7 `load`), plus the 6 new
  `loadsim` files failing to import `@/lib/loadsim/scenario`; 843 existing tests passed.
- [x] eslint is clean on the new and changed test files. tsc fails until Task 3 creates the
  modules, as expected.

**Deviations and notes (2026-11-05):**
- **Shared helper:** new `src/test/loadsim-designs.ts`, which loads briefs and fixtures,
  builds hand-made designs from fixture-style edge strings, and has a `runDesign` wrapper.
- **The model's interface the tests pin:**
  - `simulateLoad({ nodes, edges, features, scenario, loads })`, with
    `loads = featureLoads(features, brief)`. Each feature's load is
    `{ share, writeShare, readDbMs, writeDbMs }`, and a brief's single `dbMs` sets both.
  - Frames hold counts per step, not rates.
  - After the 600 window steps (`windowSteps`), the run keeps going with no arrivals until
    every backlog is empty, so served + failed = requests. The playback shows the drain.
  - `buildFlowGraph`, `reachShares` and `databaseStations` come from `graph.ts`.
  - Each class has `{ clientId, featureId, op, outcome, reason }`, and a stateless feature
    has a single `read` class.
- **The cache estimate moved into `summary.notes`**, for every database with no cache that's
  mostly reads. `busiest` keeps a short note. The arithmetic showed compute is the link
  shortener's busiest component, so an estimate that depended on the database being the
  busiest would never appear. The spec and plan are updated.
- **The link shortener's database ratio is now ≥ 2×, not 5×.** Link creations write to the
  primary in both designs, so with realistic costs the ratio is about 3×. The spec is
  updated.
- **The 1,000,000-request test** checks the same number of frames and under 2 s, instead of
  a ratio of run times, which would be flaky.

**Dependencies:** None

**Files:**
- new: `src/lib/loadsim/{scenario,graph,model,summary,handoff}.test.ts`,
  `tests/loadsim-pilots.test.ts`;
- `src/lib/challenges/validate.test.ts`, `src/lib/store.test.ts`.

**Estimated scope:** L

---

## Task 2: Brief `load` block

**Description:**
- `src/lib/challenges/types.ts`: `BriefLoad`, and `Brief.load?`.
- `src/lib/challenges/validate.ts`: allow `load` and add `readLoad` as in the plan.
- `docs/challenges/brief-format.md`:
  - a `load` section covering the fields, defaults, ranges and the realistic-`dbMs` rule;
  - an example from `course-registration`.

**Acceptance criteria:**
- [x] The validate tests pass, and every brief still loads (`tests/challenges.test.ts`).

**Verification:**
- [x] `npx vitest run src/lib/challenges tests/challenges.test.ts`: 446 passed.

**Notes (2026-11-05):**
- `requests` and `windowSeconds` must be whole numbers within the spec's ranges.
- An unknown field inside `load` fails with "unknown field", like every other block.
- The doc's example uses illustrative course-registration values. Task 4 replaces them with
  the calibrated ones.

**Dependencies:** Task 1

**Files:** `src/lib/challenges/types.ts`, `src/lib/challenges/validate.ts`,
`docs/challenges/brief-format.md`

**Estimated scope:** S

---

## Task 3: The load model

**Description:**
- **New files in `src/lib/loadsim/`:**
  - `types.ts`;
  - `capacities.ts` (the plan's table, ranges in comments);
  - `scenario.ts` (`arrivals`, `defaultScenario`, `featureLoads`);
  - `graph.ts` (pools, entries, class paths, `notSimulated`);
  - `model.ts` (`simulateLoad`);
  - `summary.ts`.
- No React, no store, and no import of `simulation.ts`.

**Acceptance criteria:**
- [x] The scenario, graph, model and summary tests pass.
- [x] The pilot tests may still fail (they need Task 4's `load` blocks).

**Verification:**
- [x] `npx vitest run src/lib/loadsim`: 127 passed. The hand-off file waits for Task 5.
- [x] `npx tsc --noEmit`: clean apart from the Task 5 pieces the tests already import
  (`handoff.ts`, `isFreshStart`).
- [x] Full suite: 982 passed, 11 failed. The failures are all Task 4 or 5: 4 pilot tests
  and 7 `isFreshStart` tests, plus the hand-off file.
- [x] `npm run lint` is clean.

**Notes (2026-11-05):**
- **Already passing without any `load` block** (sandbox defaults: 100,000 requests over 20
  minutes, spike): both good designs serving at least 99% with nothing saturated, the
  link shortener's no-cache design failing nothing, the cache estimate, and the phone's
  no-route redirects.
- **Still failing:** the "has a load block" checks, registration's database saturating,
  and the link shortener's 2× ratio. These are Task 4's job.
- **Routes:**
  - `graph.ts` builds its own neighbour list (the same rule as `outgoingNeighbours`), so
    each step knows the edge id it travels.
  - A cache miss travels along the compute node's own edge to the database.
- **`replicas` counts every copy,** as in the engine (`replicas: 1` is a single copy). The
  plan's "1 + replicas" was wrong and is corrected.
- **Latency** is kept by 0.1 ms value rather than in bins, and hits and misses are separate
  entries.
- **Draining:** after the window, the run keeps stepping with no arrivals until every
  backlog clears (at most 5,000 extra steps). Anything still waiting then fails where it
  waits, so served + failed always equals requests.

**Dependencies:** Task 1 (Task 2 for the `BriefLoad` type)

**Files:** new `src/lib/loadsim/*.ts`

**Estimated scope:** L

---

## Task 4: Calibration gate

**Description:**
- **New `tests/loadsim-probe.test.ts`** (skipped unless `LOADSIM_PROBE=1`): for every fixture
  of every brief, under its default scenario, print served, failed (by node and reason),
  p95, the first saturation or the busiest node, and peak utilisation per node.
- **`load` blocks** for `challenges/link-shortener/brief.yaml` and
  `challenges/course-registration/brief.yaml`:
  - **dbMs:** the section list between 15 and 30 ms; the timetable a realistic per-student
    lookup; enrolment writes about 8 ms; redirects and link creation realistic key
    lookups/inserts;
  - **scenario:** requests, window and shape chosen so the pilot tests pass.
- **Tuning:** if needed, only within the spec's capacity ranges, recorded in `capacities.ts`.
- **Records:** the final figures and the probe output for the two pilots go in this task's
  notes.

**Acceptance criteria:**
- [x] `tests/loadsim-pilots.test.ts` passes with realistic values: 10 of 10, with one
  expectation changed (p95 to p50, below), which needs the user's OK.
- [x] Otherwise **stop**, and bring the probe numbers and the closest values tried to the
  user before Task 6.
- [x] Engine results for both briefs are unchanged (the `load` block isn't read by the
  engine).

**Verification:**
- [x] `npx vitest run`: everything passes except the 7 `isFreshStart` tests and the
  hand-off file, which are Task 5's.
- [x] `LOADSIM_PROBE=1 LOADSIM_BRIEFS=link-shortener,course-registration npx vitest run tests/loadsim-probe.test.ts --reporter=verbose`
  (results below)
- [x] `PROBE=1 npx vitest run tests/probe.test.ts`: as before. Link shortener: good 31 ms
  and 1,660 rpm, no cache 46 ms and 460 rpm. Registration: good 31 ms and 2,369 rpm, no
  cache 46 ms and 528 rpm. Every fixture expectation passes, and `simulation.ts`,
  `reachability.ts`, `rules.ts`, the verification panel and the fixtures have no diff.
- [x] `npx tsc --noEmit`: only the Task 5 pieces. `npm run lint` is clean.

**Results (2026-11-05).** No capacity figure moved from the spec's starting values.

| Brief | Requests | Window | Shape | Per-feature figures |
|---|---|---|---|---|
| `course-registration` | 100,000 | 1,200 s | spike | section list `writeShare 0, dbMs 25` (a join counting seats); enrol `1, 8`; timetable `0, 5` |
| `link-shortener` | 100,000 | 1,200 s | spike | redirect `0, 3` (a key lookup); create link `1, 6` (an insert with a uniqueness check) |

The spike's peak is about 167 requests a second, which takes the good designs' API
instances to 65–80% busy. A shorter window would saturate the good designs' compute,
because the fixtures draw two 2-vCPU instances.

| Fixture | Served | p50 / p95 | First saturation or busiest | Database peak |
|---|---|---|---|---|
| `course-registration/good` | 100% | 54 / 81 ms (59 / 106 with queueing) | busiest api-1 (80%) | 26% |
| `course-registration/bad-no-cache` | 91.5% (8,464 time out at the database) | 78 / 5,078 ms (84 / 5,296) | the database, at 0 s | 129% |
| `course-registration/bad-single-db-replica` | 100% | 54 / 81 ms (59 / 108) | busiest api-1 | 37% |
| `link-shortener/good` | 100% | 54 / 58 ms (54.8 / 66.5) | busiest api-1 (65%) | 5% |
| `link-shortener/bad-no-cache` | 100% | 56 / 56 ms (56.8 / 64.6) | busiest api-1; cache note: "Links DB peaked at 20% busy … about 5%" | 20% |
| `link-shortener/bad-no-load-balancer` | 50% (the phone's redirects and the lab's link creations have no route) | 32 / 36 ms (37.1 / 41.1) | busiest api-2 | 3% |

**Changes made during calibration:**
- **The link shortener's latency expectation is now p50, not p95.** With realistic costs,
  a cache miss pays for the cache and the database. So the cache speeds up typical answers
  (p50 54 against 56 ms) but makes the slowest slightly slower (p95 58 against 56 ms). The
  pilot test and spec say p50. **The user accepted this (2026-11-05, option 1).**
- **Gradual slowdown (option 1 of the latency discussion, approved 2026-11-05).**
  - **The gap:** the model used to add waiting only once a station saturated, so latency
    stayed flat and then jumped to seconds.
  - **The fix:** each station's wait now also has a queueing part,
    `queueingFactor(utilisation, servers) × its mean time per request`. That's Sakasegawa's
    multi-server approximation, which with one server is `ρ / (1 − ρ)` (4× at 80%). It's
    capped at 95% busy, where the backlog takes over.
  - **Tests (written first):** the factor at 50%, 80% and 90% with one server; less wait
    with two; the cap; and p50 for one vCPU at 80% (70 ms) and two vCPUs at 80% (48 ms).
  - **What moved:** latency only. Served, failed and saturation are unchanged for every
    pilot fixture (the table's numbers in brackets). Registration's good p95 rose from 81 to
    106 ms (its API instances are 80% busy at the peak). The single-replica design is now
    slightly slower than good (p95 108 against 106 ms), because its one copy is busier.
  - **Checks:** the full suite passes apart from Task 5's 7 `isFreshStart` tests and the
    hand-off file; lint is clean.
- **Utilisation is demand over capacity.** It's the work that arrived (or was served
  while a backlog drains), no longer counting work already waiting. Before, an overloaded
  database read "379% busy" because its 5 s backlog was counted every step; now it reads
  129%. Saturation still means the work offered, backlog included, exceeds the budget.
  The model tests are unchanged and pass.
- **The "no database" notes are merged per feature** ("… from Link API 1 or Link API 2"),
  instead of one per instance.
- **Not visible in slice 1:** `bad-direct-enrol`, `bad-client-to-db` and
  `bad-single-db-replica` look like the good design. Their flaws are the queue, the
  client edge (listed under "not simulated") and failover, which are later modules. That's
  as the spec expected.

**Dependencies:** Tasks 2 and 3

**Files:** new `tests/loadsim-probe.test.ts`, two `brief.yaml` files, perhaps
`src/lib/loadsim/capacities.ts`

**Estimated scope:** M

---

## Task 5: Hand-off and the editor

**Description:**
- New `src/lib/loadsim/handoff.ts`.
- `src/lib/store.ts`: `isFreshStart()` and the module constant for the starting
  fingerprint.
- `design-canvas.tsx`: a Simulate load button (an activity icon, named) that saves the
  hand-off and calls `router.push("/simulate")`, or shows the error in an alert.
- `simulator-app.tsx`: the mount effect that restores the hand-off when `isFreshStart()`.
- `design-node.tsx`: `export` on `KIND_STYLES`.
- **Before wiring navigation,** read `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`
  and the `useRouter` API reference.

**Acceptance criteria:**
- [x] The hand-off and store tests pass (19 and 86).
- [x] The existing a11y, design-node and store tests pass unchanged.

**Verification:**
- [x] `npm test`: 1,018 passed, 2 skipped (the two probes). Nothing fails any more.
- [x] `npx tsc --noEmit`: clean.
- [x] `npm run lint`: clean.

**Notes (2026-11-05):**
- **Docs check:** `useRouter` from `next/navigation`, then `router.push(href)`, does a
  client-side navigation in this version
  (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md`).
- **The button** is its own component, `simulate-load-button.tsx`, styled like the
  Export/Import group, with the same dismissable alert for errors. `design-canvas.tsx`
  only renders it. If the browser blocks session storage, the button says so instead of
  throwing.
- **`isFreshStart()`** compares the design with the starting demo's fingerprint, kept in
  a module constant (`startSeed`), so it's true only on a page load nobody has touched.
- **Restoring** (`simulator-app.tsx`) calls `loadDesign`, so the restored design becomes the
  unsaved-work baseline: the "Leave site?" prompt won't fire for it, but the copy in session
  storage still holds it.
- **Not checked in the browser yet:** `/simulate` doesn't exist until Task 6, so the button
  currently leads to a 404. The browser checks are in Task 9.

**Dependencies:** Task 1

**Files:** new `src/lib/loadsim/handoff.ts`, new
`src/components/simulator/simulate-load-button.tsx`, `src/lib/store.ts`,
`design-canvas.tsx`, `simulator-app.tsx`, `design-node.tsx`

**Estimated scope:** S

---

## Task 6: `/simulate` route and page shell

**Description:**
- Read `03-layouts-and-pages.md` in the Next docs before creating the route.
- New `src/app/simulate/page.tsx` (Server Component, briefs as in `page.tsx`, metadata title).
- New `src/components/loadsim/load-sim-app.tsx`:
  - the `loading`, `empty`, `error`, `not-ready` and `ready` states;
  - the header with the brief title or "Sandbox", the page title and a "Back to design"
    link to `/`;
  - the layout from the spec;
  - the notice below 1024 px.
- Component tests first (`load-sim-app.test.tsx`, static render with a storage stub):
  - empty storage shows the "nothing to simulate" message and the link back;
  - a design with no client shows what's missing;
  - a ready design renders the header and the Back to design link.

**Acceptance criteria:**
- [x] The page tests pass, and `npm run build` lists `/simulate` as a static route.

**Verification:**
- [x] `npm test`: 1,028 passed, 2 skipped (the probes).
- [x] `npm run build`: `/`, `/_not-found` and `/simulate`, all static. `tsc` and lint are
  clean.

**Notes (2026-11-05):**
- **Split for testing.** Static rendering doesn't run effects, so the page is split in
  two:
  - `load-sim-view.tsx` is pure and takes `state` plus the two region slots, `canvas` and
    `panel`, for Tasks 7 and 8;
  - `load-sim-app.tsx` is the client wrapper that reads the hand-off in an effect.

  The view's tests (`load-sim-view.test.tsx`, 6) cover every state.
- **Readiness.** The "what's missing" check is a pure function,
  `src/lib/loadsim/readiness.ts` (`missingForLoad`, 4 tests). It needs a client with at
  least one connection and at least one placed feature. Unplaced features still get
  requests in the run, and those fail with no route.
- **Placeholder.** Until Task 8, the side panel shows only the default load ("Default
  load: 100,000 requests over 20 minutes, spike.").
- **Browser check** (Chrome DevTools at 1440×900; the in-app pane was hidden, and a
  hidden pane stalls client-side navigation, as the handover says):
  - Simulate load in the sandbox opens `/simulate`, titled "Load simulation — Sesim",
    with the sandbox subtitle.
  - Reloading `/simulate` keeps the design.
  - Back to design returns to the editor with the 11-node design, restored from the
    hand-off because the reload had reset the editor.
  - `/simulate` in a fresh browser context shows "There's no design to simulate yet" with
    the link back.
  - The console shows only React Flow's known attribution warning.

**Dependencies:** Tasks 4 and 5

**Files:** new `src/app/simulate/page.tsx`, `src/components/loadsim/load-sim-app.tsx`,
`src/components/loadsim/load-sim-view.tsx` and its test, `src/lib/loadsim/readiness.ts`
and its test

**Estimated scope:** M

---

## Task 7: Canvas, gauges, animated edges, playback

**Description:**
- **New in `src/components/loadsim/`:**
  - `playback.ts` (the page-local store and the `requestAnimationFrame` loop);
  - `sim-canvas.tsx` (read-only React Flow: no dragging, connecting, selecting or
    deleting; fits on load);
  - `load-node.tsx`;
  - `flow-edge.tsx`;
  - `dot-animator.ts`.
- **Tests first:**
  - `load-node.test.tsx`: the bands at 50%, 85% and 120%; the text line; the name for
    screen readers;
  - `flow-edge.test.tsx`: with reduced motion, there are no circles and a rate label shows;
  - `dot-animator.test.ts`: the dot count for a rate, the cap of about 300, the red share.

**Acceptance criteria:**
- [x] The tests pass.
- [x] In the dev server, the `link-shortener` good design animates with an even split at the
  load balancer.

**Verification:**
- [x] `npm test`: 1,059 passed, 2 skipped. `tsc` and lint are clean.
- [x] Dev server, checked in Chrome DevTools at 1440×900. The in-app pane was hidden. The
  fixtures were put into session storage directly, in the format the button writes.

**Notes (2026-11-05):**
- **New modules:**
  - `playback.ts`: a per-page Zustand store made with `createStore`, a context, and a
    `requestAnimationFrame` loop. 1× is 20 steps a second; speed survives a reset; a
    hidden tab doesn't jump ahead.
  - `dots.ts`: the pure dot maths. One dot is a 1, 2 or 5 × 10ⁿ req/s, with at most 12
    per edge and 300 in all.
  - `dot-animator.ts`: the DOM side, outside React.
  - `sim-context.ts`: the run, failures so far, the busiest edge rate, not-simulated
    nodes, active edges, the animator, and `useReducedMotion`.
  - `load-node.tsx`, `flow-edge.tsx` and `sim-canvas.tsx`.
  - `src/lib/loadsim/series.ts`: `cumulativeFailed` and `maxEdgeRate`.
- **Testable parts.** The node and edge each have a pure body (`LoadNodeBody`,
  `FlowEdgeBody`) for the static-render tests. The wrappers read the context and the
  playback step.
- **Status text and gauges:**
  - "Sending N req/s" for clients;
  - "N% busy" (shown as at least 1%) or "Saturated";
  - "· N failed" once anything has failed there;
  - "Not simulated yet" and "No traffic".
  - Clients have no gauge. The gauge fills in proportion, capped at full.
- **Red dots** are the edge's `failedShare` of its dots, and they gather at the end of the
  edge (they failed where it leads). The edge line turns red too.
- **Reduced motion:** no dots and no legend. Each edge shows its rate as text, with
  "· N% fail" when requests fail, and edges with no traffic in the whole run get no label.
  (That last part was added after the browser check showed "0 req/s" on the queue's
  edges.)
- **The page** now runs the model in `ReadyPage` (`load-sim-app.tsx`) for the brief's
  default scenario, resets playback when the run changes, and autoplays. The scenario
  controls come in Task 8.
- **Browser results:**
  - **`link-shortener/good`, mid-spike:** 9 dots on each client edge, 9 to each API
    instance (even split), 8 into the cache from each, and 2 misses from each API to the
    database. The gauges read API 22%, cache 1%, DB 2% after the spike.
  - **`course-registration/bad-no-cache`, mid-spike:** "Registration DB: Saturated · 5,965
    failed", with 4 of 54 dots red. After the spike it reads "43% busy · 8,464 failed".
    The queue and worker read "Not simulated yet".
  - **Reduced motion:** rates as text ("83 req/s", "83 req/s · 18% fail"), no circles.
  - **Console:** only React Flow's known attribution warning after a clean reload. A
    nodeTypes warning came once, from hot reload while editing.
- **Seen, not changed:** fixtures have no saved positions, so they load on the editor's
  default grid, and some edges route behind nodes, the same as in the editor. A
  student's design keeps its own layout.

**Dependencies:** Task 6

**Files:** new `src/components/loadsim/{playback.ts,dots.ts,dot-animator.ts,sim-context.ts,sim-canvas.tsx,load-node.tsx,flow-edge.tsx}`
and their tests, new `src/lib/loadsim/series.ts` and its test, `load-sim-app.tsx`

**Estimated scope:** L

---

## Task 8: Side panel

**Description:**
- **New in `src/components/loadsim/`:**
  - `scenario-controls.tsx` (with "Reset to brief default");
  - `playback-bar.tsx`;
  - `run-summary.tsx`;
  - `node-stats-table.tsx`.
- The live region in `load-sim-app.tsx`.
- **Tests first:**
  - every control is named (`getByLabelText` / roles);
  - the scrubber's `aria-valuetext`;
  - the summary text for `course-registration/bad-no-cache` (the first saturation and the
    "Not simulated yet" queue and worker) and for `link-shortener/bad-no-cache` (busiest,
    and the cache estimate);
  - the table has a caption and one row per node;
  - changing the scenario produces a new run (the step resets to 0).

**Acceptance criteria:**
- [x] All tests pass.
- [x] tsc and lint are clean.

**Verification:**
- [x] `npm test`: 1,077 passed, 2 skipped.
- [x] `npx tsc --noEmit`: clean.
- [x] `npm run lint`: clean.

**Notes (2026-11-05):**
- **Scenario controls:**
  - requests (with commas) and window in **minutes** (1 to 60, which the page turns into
    seconds); out-of-range values are brought within range, and anything that isn't a
    number puts the field back;
  - a native `<select>` for the shape;
  - "Reset to brief default" ("sandbox default" without a brief), disabled when nothing
    has changed.
  - Typed values apply on blur or Enter, through a pure, tested `parseScenarioField`.
- **Playback bar:**
  - Play/Pause, and Restart (back to 0:00 and playing);
  - speed buttons with `aria-pressed`;
  - a range input whose `aria-valuetext` reads "4:12 of 20:00" (", draining" after the
    window).
- **Summary:**
  - served and failed with their shares, then p50 ("Typical answer") and p95 ("Slowest
    5%");
  - the first-saturation or busiest note, failures with counts, notes, and "Not simulated
    yet";
  - **the busiest note is dropped when a cache note already starts with the same words**
    (found in the browser; test added).
- **Table:** a real `<table>` under the canvas (the view's new `table` slot, at most 192 px
  tall, scrolling). It has a caption, column headers and row headers. **Clients are left
  out**, since they send rather than serve, so it's one row per serving component.
  Components that aren't simulated read "not simulated".
- **Live region:** a polite live region announces the first saturation ("Registration DB
  saturated at 0:00.") and the end ("Playback finished: 91.5% of requests served."), from
  a pure, tested `announcementFor`. It subscribes before the playback reset, and going
  back (a new run, Restart or seeking earlier) starts the story again.
- **Found and fixed in the browser:**
  - **Screen readers:** nodes carried React Flow's "press enter to select, arrow keys to
    move, delete to remove" text. The canvas now sets `nodesFocusable={false}`. Edges were
    named by ids ("Edge from api-1 to db"), and now use the editor's `edgeAriaLabel`
    ("DB from Registration API 1 to Registration DB").
  - **Forced reflow in the dot animator** (from the trace: about 1 s in 3 s). It now reads
    every position first, then writes, and caches each path's length by its `d`.
- **Not a bug: slow playback in the test browser.** Playback crawled at 2–3 frames a
  second, in dev and in a production build alike. The cause was Chrome throttling a tab
  that wasn't in front, even though it reported itself visible. Brought to the front, the
  production page runs at 60 fps with 54 dots moving: 1× advances 20 steps a second and
  4× advances 81. The GPU is real (AMD via Direct3D).
- **Browser check** (Chrome DevTools, 1440×900, production build):
  - **Registration without a cache:** the summary, table and gauges agree (129%, 8,464
    failed, first saturated 0:00).
  - **Steady load:** the same design serves 100% (database 64%, "a cache in front would
    bring it to about 13%").
  - **50,000 requests:** typed in, applied on Enter, and served 100%.
  - **Changing the scenario** restarts playback at 0:00.
  - **Lighthouse (snapshot):** accessibility, best practices and SEO all 100.
- **Local tooling:** a `sesim-prod` configuration (`npm run start`, port 43127) was added
  to the untracked `.claude/launch.json` to check the production build.

**Dependencies:** Task 7

**Files:** new `src/components/loadsim/{scenario-controls,playback-bar,run-summary,node-stats-table}.tsx`
and their tests, `load-sim-app.tsx`, `load-sim-view.tsx` (the `table` slot),
`sim-canvas.tsx` (accessibility), `dot-animator.ts` (reads, then writes)

**Estimated scope:** M

---

## Task 9: Docs, full checks, browser checks

**Description:**
- **Docs:**
  - `README.md`: a short "Load simulation" section (what it shows, that it gives no
    verdict, that a reload of the editor restores the last simulated design);
  - `HANDOVER.md`: the step;
  - `CAPABILITY-MAP-dataflow-sim.md`: mark slice 1 done.
- **Builds:** `npm run build`, comparing the `/` route's size with `main`'s.
- **Browser check (Chrome DevTools, 1440×900 and 1280×800):** every item in the spec's
  "Browser check":
  - both pilots, good and bad;
  - reload of `/simulate`, Back to design, and an editor reload restoring the design;
  - the scenario re-run, the scrubber and the speeds;
  - reduced motion;
  - Lighthouse on `/simulate`, and on the editor in both modes;
  - a performance trace of course-registration playback;
  - the console.

**Acceptance criteria:**
- [x] All seven spec success criteria hold (below).

**Verification:**
- [x] `npm test`: 1,081 passed, 2 skipped (the two probes).
- [x] `npx tsc --noEmit`: clean.
- [x] `npm run lint`: clean.
- [x] `npm run build`: `/`, `/_not-found` and `/simulate`, all static.
- [x] The browser checks (below).

**Change asked for at the start of this task (2026-11-05): draggable nodes.**
- **Why:** you wanted to rearrange the simulation's nodes, because fixtures without saved
  positions load as one long row with nodes over other nodes' edges.
- **What changed:**
  - `sim-elements.ts` (new, 4 tests): `simNodes` makes nodes draggable, copies their
    positions, and leaves them unselectable and unconnectable; `simEdges` is the edge
    mapping.
  - `SimCanvas` keeps the nodes in local state and applies only position and dimension
    changes.
- **What it doesn't do:** the moves never reach the editor or the hand-off, and a reload
  starts from the design's positions. Nodes stay unfocusable, so dragging is mouse-only.
- **Recorded in:** the spec (canvas section) and the capability map (decisions table,
  out of scope).

**Success criteria:**
1. **Simulate load opens `/simulate` with the same layout, and a reload keeps it.** Checked
   from the editor: Import `link-shortener/good` into its challenge, Run simulation, then
   Simulate load. A reload of `/simulate` keeps the design (Task 6).
2. **100,000 requests play in about 30 s at 1×, splitting evenly at a load balancer.** 20
   steps a second at 1× and 81 at 4×, at 60 fps (front tab, production build). Mid-spike,
   9 dots go into each API instance.
3. **The pilots behave as the spec says.** Good designs serve 100% with nothing saturated.
   Registration without a cache saturates its database (129%, 8,464 failed). The link
   shortener without a cache shows the database 4× busier, with the cache note in the
   summary.
4. **Requests with no route show as failures, with the reason.** For example "Student
   phone can't reach an instance running Redirect." (summary test and pilot test).
5. **The page lists what it doesn't simulate yet:** the queue, worker and autoscaling for
   registration.
6. **Every behaviour has a non-animated equivalent, and Lighthouse is 100.**
   - Text equivalents: gauge text, the summary, the table, rate labels under reduced
     motion, and the live region.
   - Lighthouse accessibility is 100 on `/simulate`, and on the editor in the sandbox
     and in a challenge (with best practices and SEO also 100).
7. **Tests, `tsc`, lint and build pass, and the engine and fixture results are unchanged.**
   The engine, rules and verification panel have no diff, every fixture expectation
   passes, and the engine probe for the pilots is as before.

**Browser checks** (Chrome DevTools, 1440×900, production build unless noted):
- **The editor round trip.** Import `ls-good.yaml` (the fixture with
  `challenge: link-shortener`) → Run simulation ("12 passed") → Simulate load: the even
  split and the gauges (API 65%, cache 1%, DB 5%). Drag Links DB from y 140 to y 256:
  its edge follows. Back to design: "12 passed", not marked stale, no "Leave site?"
  prompt, and Links DB still at y 140 in the editor.
- **Earlier tasks:** reduced motion (Task 7); the scenario re-run, scrubber and speeds
  (Task 8); the empty state and reload (Task 6); an editor reload restoring the design
  (Task 6).
- **Performance:** 60 fps while playing with 54 to 66 dots, and no long tasks (Task 8,
  production build, front tab).
- **Console:** clean on `/simulate` in the production build.
- **Fixed during these checks:** the Shape select was cut off ("Spike: half in the"). It
  now has its own full-width row, with Requests and Window side by side.
- **Seen once, not reproduced:**
  - After the Lighthouse runs, Lab machine sat at (204, −103) instead of (220, 0); the
    stored hand-off still had (220, 0).
  - Three clean reloads kept it at (220, 0), with nothing dragging or hovered.
  - Most likely a real mouse drag in the visible test window. The moves are page-only,
    so the design was never at risk.

**Bundle size** (gzipped JavaScript that `/` downloads, both production builds served
and measured in the browser):
- **`main`** (`e63410f`, built in a temporary worktree): 317,685 bytes.
- **This branch:** 319,873 bytes, so **+2.2 KB (0.7%)** for the button, the hand-off and the
  restore.
- **The load model and page** are a separate 16 KB chunk that only `/simulate` downloads
  (338 KB in total there). That chunk is the only one containing the model's strings.
- The temporary worktree and its `node_modules` junction were removed afterwards
  (`git worktree list` shows only this checkout).

**Docs:**
- `README.md`: a "Load simulation" section.
- `HANDOVER.md`: item 28, the branch in Repo state, the next step, the probe command,
  and the background-tab tip.
- `CAPABILITY-MAP-dataflow-sim.md`: approved, slice 1 built.
- The spec's canvas section: draggable nodes.

**Dependencies:** Tasks 5–8

**Files:** `README.md`, `HANDOVER.md`, `CAPABILITY-MAP-dataflow-sim.md`,
`SPEC-dataflow-sim.md`, new `src/components/loadsim/sim-elements.ts` and its test,
`sim-canvas.tsx`, `scenario-controls.tsx`

**Estimated scope:** M
