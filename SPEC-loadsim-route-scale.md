# Spec: a route budget for the load model (`loadsim-route-scale`)

A module of [CAPABILITY-MAP-stress.md](CAPABILITY-MAP-stress.md). Branch
`fix/loadsim-route-scale`. Status: **built** (2026-11-06); see Results at the end. Plan
and tasks: [tasks/loadsim-route-scale/](tasks/loadsim-route-scale/).

## Objective

The load model (`/simulate`) follows every path a request can take. Each fork, such as a
load balancer splitting over its instances, multiplies the paths after it:
- **Where it's built:** `buildFlowGraph` (`src/lib/loadsim/graph.ts`) builds one tree of
  route steps per class of requests, with a branch for every way on.
- **Where it runs:** `simulateLoad` (`model.ts`) turns each step into a "hop" and moves
  every hop through every time step.

So both building and running grow with the number of paths. With layers of load balancers,
each fully connected to the next, the harness measured:

| Layers of 4 | Route steps | Load model |
|---|---|---|
| 3 | 426 | 0.17 s |
| 4 | 1,706 | 0.6 s |
| 5 | 6,826 | 3.6 s |
| 6 | 27,306 | 24 s |
| 7 | 109,226 | killed at 37 s |

**Real designs are far below this.**
- The largest fixture has 204 route steps (`lecture-video-library/bad-video-in-db`), and
  generated student-style designs of up to 200 nodes stay under 260.
- But nothing stops a student from stacking load balancers. When they do, `/simulate`
  freezes the tab, and a reload freezes it again, because the design stays in session
  storage.

**Done means:**
- a design with too many routes is refused quickly, with a clear message;
- every design within the budget gives exactly the numbers it gives today.

## Decisions (2026-11-06)

| Question | Decision |
|---|---|
| Merge routes, or a budget | **A budget.** Merging would change how per-path time is tracked (the 5 s timeout and worst-case finish). 79 of the 88 fixtures and demos reach a node by more than one path, so almost every brief's numbers would be at risk. |
| The budget | **2,000 route steps per design**, about 8× the largest real design. Stacked 4 × 4 (1,706) still runs, in about 0.6 s. |
| Order against `loadsim-delivery` | **No longer matters.** The change is a counter and a check, and doesn't touch how routes are simulated (map, open question 2). |

## Changes

1. **Counting while building** (`graph.ts`):
   - `buildFlowGraph` counts the route steps it creates. As soon as the count passes
     `ROUTE_BUDGET` (2,000, exported from `capacities.ts`, where the model's other limits
     live), it stops and throws a `TooManyRoutesError` (new, exported from `graph.ts`).
   - The error carries the budget and says the design passed it. Counting stops at the
     first step over, so building never does more than about 2,000 steps of work.
   - Under the budget, nothing changes: the graph is built exactly as now.
2. **The model:** `simulateLoad` lets the error through. Every caller that runs untrusted
   designs checks first (below), and tests can expect the throw.
3. **Readiness** (`readiness.ts`):
   - `missingForLoad` gains a check: if `buildFlowGraph` throws `TooManyRoutesError`, it
     adds this message:

     > This design has more than 2,000 ways for a request to travel through it, too many to
     > simulate. That usually means load balancers stacked in layers: one load balancer in
     > front of each group of servers is enough.

   - It only runs when the design has no other problem, so the student sees one message at
     a time.
4. **The page** (`load-sim-app.tsx`): `ReadyPage` checks `missingForLoad` before running
   the model. When something is missing, it shows the "isn't ready" message without calling
   `simulateLoad`.
   - Today the model runs even for designs that aren't ready, and the result is thrown
     away.
   - For designs within the budget, the page behaves exactly as now.
5. **Harness:**
   - **`tests/stress-growth.test.ts`:**
     - The pin `[loadsim-route-scale] route steps grow with nodes, not paths` is replaced by
       two ordinary tests:
       - building stacked 5 × 4 and 12 × 4 throws `TooManyRoutesError` within 100 ms;
       - stacked 4 × 4 still builds, with exactly 1,706 steps.
     - The guard pinning 26, 106 and 426 for 1–3 layers stays as it is.
   - **`tests/stress-scale.test.ts`:**
     - The child records a refusal (`refused: true`, with how long it took) when the model
       throws `TooManyRoutesError`.
     - The parent counts a refusal within the load-model budget as a pass.
     - The three `stacked` 5–7 × 4 pins become ordinary cases.
     - The three `engine-path-scale` pins are unchanged.

## Not changing

- **How routes are simulated.** No merging, and no change to hops, timeouts or
  percentiles.
- **Every number within the budget.** The engine probe and the load-model probe are
  byte-identical to `main`, as are `tests/loadsim-unchanged-baseline.json` and the graph
  snapshots.
- **The engine and Run simulation.** Their hang is `engine-path-scale`.
- **The editor's Simulate load button.** It still hands the design over; the message
  appears on `/simulate`.

## Commands

```bash
npm test
```
```bash
npx vitest run src/lib/loadsim tests/stress-growth.test.ts
```
```bash
STRESS=1 npx vitest run tests/stress-scale.test.ts --reporter=verbose
```
```bash
npx tsc --noEmit
```
```bash
npm run lint
```
```bash
npm run build
```

## Project structure

| File | Change |
|---|---|
| `src/lib/loadsim/capacities.ts` | `ROUTE_BUDGET = 2_000` |
| `src/lib/loadsim/graph.ts`, `graph.test.ts` | Count steps while building; `TooManyRoutesError` |
| `src/lib/loadsim/readiness.ts`, `readiness.test.ts` | The too-many-routes message |
| `src/components/loadsim/load-sim-app.tsx` | Check readiness before running the model |
| `tests/stress-growth.test.ts` | The pin becomes the budget tests |
| `tests/stress-scale.test.ts` | Refusals count as passes; the `stacked` pins go |

## Code style

```ts
/** A design with more route steps than the load model can simulate in time (SPEC-loadsim-route-scale.md). */
export class TooManyRoutesError extends Error {
  constructor(readonly budget: number) {
    super(`More than ${budget} route steps`);
    this.name = "TooManyRoutesError";
  }
}
```

The student-facing message lives in `readiness.ts`, in the page's voice, as the other
readiness messages do.

## Testing strategy (tests first)

- **`graph.test.ts`:**
  - stacked 5 × 4 throws `TooManyRoutesError`, and so does a deeper 12 × 4 (4¹² paths),
    quickly;
  - stacked 4 × 4 builds with 1,706 steps;
  - the existing snapshot is unchanged.
- **`readiness.test.ts`:**
  - stacked 5 × 4 gives exactly the message above;
  - stacked 4 × 4 and every fixture give no such message;
  - a design with no client still gives only its own message, not this one.
- **`tests/stress-growth.test.ts` and `tests/stress-scale.test.ts`:** as in Changes 5.
- **Unchanged numbers:** save the probe and the load-model probe before Task 1, and
  compare byte for byte at the end.
- **Browser:**
  - a design with 5 stacked layers of load balancers, imported and opened with Simulate
    load, shows the message at once, with no frozen tab, including after a reload;
  - the link shortener's reference design still plays.

## Boundaries

- **Always:**
  - write the tests first;
  - keep every number within the budget identical;
  - keep the message in the page's voice.
- **Ask first:**
  - changing the budget;
  - changing a snapshot or the load-model baseline;
  - touching how hops are simulated.
- **Never:**
  - merge or prune routes within the budget;
  - change the engine.

## Success criteria

1. Building a flow graph over the budget throws within 100 ms, even 12 layers deep, and
   `/simulate` shows the message instead of freezing.
2. The default suite has no expected failures. The `STRESS=1` ladder has 26 passes and 3
   expected failures, all `engine-path-scale`.
3. The probe, the load-model probe, the baseline JSON and the graph snapshots are unchanged.
4. `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build` pass, and the browser
   checks behave as described.

## Open questions

None. The budget and the approach are your answers of 2026-11-06.

## Results (2026-11-06)

Built on `fix/loadsim-route-scale`. The task notes are in
[tasks/loadsim-route-scale/todo.md](tasks/loadsim-route-scale/todo.md).

### Added while building: a cap on the ways tried

Counting steps wasn't enough. Steps are only made on paths that reach compute running the
feature, so a tall stack whose paths all dead-end would try millions of ways and make no
steps at all. An example is 12 layers in front of compute that doesn't run the feature.

So `buildFlowGraph` also counts the ways it tries and stops at 20 per budgeted step
(40,000). The cap never drops below that, even when a test lowers the budget, so the
exactness test isn't stopped by dead ends.

The test for it: with the cap effectively removed (in a copy), that design took 13.3 s and
was never refused. With the cap, it's refused in about 19 ms.

### Success criteria

1. **Met: designs over the budget are refused, and the page shows a message.**
   - **Refusal times:** building is refused within 100 ms in every case: stacked 5 × 4
     in 4–6 ms, 7 × 4 in 3 ms, 12 × 4 (4¹² paths) in 3–4 ms, and the 12-layer dead-end
     design in 19 ms.
   - **In the browser** (Chrome DevTools, dev server): a stacked 5 × 4 design, imported and
     opened with Simulate load, shows "This design isn't ready to simulate" with the spec's
     message. After a reload it shows the same, with the page loaded in 0.54 s, no long
     tasks and no console errors.
   - **Normal designs still play:** the link shortener's reference design runs with 100%
     served, p50 54.8 ms and p95 66.5 ms, the same as the probe.
2. **Met: no expected failures left in the default suite** (1,826 passed and 32 skipped).
   The `STRESS=1` ladder gives 26 passed and 3 expected failures, all `engine-path-scale`:
   - stacked 5, 6 and 7 × 4 are refused in 5, 4 and 6 ms;
   - stacked 4 × 4 still runs (1,706 steps, 613 ms).
3. **Met: nothing within the budget changed.** The engine probe (264 lines) and the
   load-model probe (292 lines) are byte-identical to `main`, both after Task 1 and at the
   end. `loadsim-unchanged-baseline.json`, the graph snapshot and `simulation.ts` are
   unchanged.
   - **Exactness:** for 188 designs (every fixture, both demos, and 50 each of `random` and
     `app`), building with the design's own step count as the budget succeeds, and with
     one less it throws. So every place that makes a step is counted.
4. **Met: all checks pass.** `npm test`, `npx tsc --noEmit`, `npm run lint` and
   `npm run build` pass.

### Note on suite time

The new tests add about 0.3 s, of which the exactness test is 0.14 s. The machine's speed
drifted again during the session. Side by side, the suite without the stress files took
22.2 s, and the full suite 41.0 s.
