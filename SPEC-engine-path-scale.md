# Spec: a budget for the engine's latency walk (`engine-path-scale`)

The last module of [CAPABILITY-MAP-stress.md](CAPABILITY-MAP-stress.md). Branch
`fix/engine-path-scale`. Status: **built** (2026-11-06); see Results at the end. Plan and
tasks: [tasks/engine-path-scale/](tasks/engine-path-scale/).

## Objective

Run simulation estimates latency with `estimatePathLatency` (`src/lib/simulation.ts:154`).
It walks every simple path from each request root and keeps the longest total of hop
times.
- **The quirk:** when the walk steps onto a node already on its path, it still counts that
  last hop before stopping. So a WebSocket or WebRTC edge, which adds a reverse hop, counts
  a round trip.
- **The cost:** the number of simple paths grows exponentially with how tangled the design
  is. The size ladder found random 200-node designs where the engine never returned
  (seeds 1 and 2) or took 1.5 s (seed 3), and a 100-node design at 354 ms against 500.
  Run simulation would freeze the editor the same way.

**Measured on 2026-11-06,** with a copy of the walk, in a scratch test since deleted:

| Designs | Count | With cycles | Most steps the walk takes | Linear version gives the same answer |
|---|---|---|---|---|
| Fixtures and both demos | 87 | 6 (the five chat-app designs, and the BeUWI demo) | 42 | all 87 |
| Generated, no cycles | 410 | 0 | 126 | all 410 |
| Generated, with cycles | 976 | 976 | over 2,000,000 for 4 | 661 (315 differ) |

The linear version is a memoised longest path, where an edge back onto the current path
adds its hop and ends. It's exact without cycles, but with cycles the longest path depends
on how a node was reached, so it can't replace the walk outright.

**Done means:**
- Run simulation answers quickly on any design;
- every design the walk handles today (every fixture, every demo, and anything under the
  budget) gives exactly the same result.

## Decisions (2026-11-06)

| Question | Decision |
|---|---|
| Approach | **Budget, then estimate.** The exact walk stays. It stops after `PATH_WALK_BUDGET` steps, and the linear version is used instead, with the latency check saying so. |
| The budget | **100,000 steps**, over 2,000× the most any fixture or demo needs (42), and a few milliseconds of work |
| How the student learns it's an estimate | One sentence added to the latency check's detail, only when the budget is hit |

## Changes

1. **`simulation.ts`:**
   - **Budget:** `estimatePathLatency` counts the walk's steps. Past `PATH_WALK_BUDGET`
     (100,000, exported), it abandons the walk and returns the linear version's longest
     path instead, with `estimated: true`.
   - **Same as now otherwise:** without hitting the budget, the walk and its result are
     exactly as now.
   - **What follows the walk is unchanged.** The static-hosting, CDN and cache-aside
     adjustments and the 20 ms floor apply to either result, in the same order.
   - **Return value:** the function returns `{ ms, estimated }`. Its one caller,
     `runVerification`, reads `ms` where it read the number before.
2. **Latency check (`nfr-latency`):** when `estimated` is true, its detail gains this
   sentence at the end:

   > This design has too many paths to time each one, so this is an estimate.

   The status, `actual` and `target` work as now, from the estimate.
3. **Harness:**
   - in `tests/stress-scale.test.ts`, the three `[engine-path-scale]` ladder pins
     (`random` 200 nodes, seeds 1–3) become ordinary cases, and `PINNED` becomes empty;
   - a deterministic default-suite test covers the fallback (below).

## Not changing

- **The exact walk, the hop times, `isAfterResponse` and `requestRoots`.**
- **Every result for a design within the budget.** That includes every fixture, both
  demos and every brief. The engine probe and `tests/demos.test.ts` must be byte-identical
  and unchanged.
- **The load model and the brief rules.**

## Commands

```bash
npm test
```
```bash
npx vitest run src/lib/simulation.test.ts tests/demos.test.ts
```
```bash
PROBE=1 npx vitest run tests/probe.test.ts --reporter=verbose
```

Compare its output with `main`'s.

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
| `src/lib/simulation.ts` | `PATH_WALK_BUDGET`, the step count, the linear fallback, `{ ms, estimated }`, the extra sentence |
| `src/lib/simulation.test.ts` | Fallback and unchanged-result tests |
| `tests/stress-scale.test.ts` | The engine pins become ordinary cases |

## Code style

```ts
/** Steps the exact latency walk may take before falling back to an estimate (SPEC-engine-path-scale.md). */
export const PATH_WALK_BUDGET = 100_000;
```

The fallback is a small local function next to the walk, with a comment saying when it
differs from the walk (cycles), so a later reader doesn't "simplify" the walk into it.

## Testing strategy (tests first)

- **`simulation.test.ts`:**
  - **The budget hit:** a dense design runs `runVerification` in under 500 ms, and its
    latency check's detail ends with the sentence. Use one the ladder found, `random`
    200 nodes seed 1, or a generated design that needs over 100,000 steps; T1 picks the
    smallest such generated design so the test is quick.
  - **The budget missed:** a WebSocket fixture (`chat-app/good`) and both demos give
    exactly today's result, with no sentence.
  - **Matching on a cycle-free design:** on a cycle-free design forced over the budget,
    the estimate equals the exact walk. A budget lowered for the test does this; the
    parameter is optional, as in `loadsim-route-scale`.
- **Unchanged numbers:** save the engine probe before Task 1 and compare byte for byte at
  the end. `tests/demos.test.ts` and `tests/challenges.test.ts` pass unchanged.
- **Ladder:** 29 passed and no expected failures. `random` 200 nodes runs within its
  500 ms engine budget.
- **Browser:** import the dense design and press Run simulation. The editor stays
  responsive, and the latency row shows the sentence.

## Boundaries

- **Always:**
  - write the tests first;
  - keep every result within the budget identical;
  - keep the sentence only for the fallback.
- **Ask first:**
  - changing the budget;
  - changing the exact walk or a hop time;
  - changing a fixture's expectations or a demo pin.
- **Never:**
  - replace the exact walk for designs within the budget;
  - change the load model.

## Success criteria

1. Run simulation on `random` 200-node seeds 1–3 answers within 500 ms each, with the
   estimate sentence.
2. The engine probe output, `tests/demos.test.ts` and every fixture's expectations are
   unchanged, and no design within the budget shows the sentence.
3. The `STRESS=1` ladder has no expected failures, and the default suite has none.
4. `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build` pass, and the browser
   check behaves as described.

## Open questions

None. The approach and the budget are your answer of 2026-11-06.

## Results (2026-11-06)

Built on `fix/engine-path-scale`. The task notes are in
[tasks/engine-path-scale/todo.md](tasks/engine-path-scale/todo.md).

**How it's built:**
- **`requestHopGraph`** builds the hop graph exactly as before: no hops after the
  response, a reverse hop for each two-way edge, and the same hop times.
- **`longestRequestPath`** walks it with today's code plus a step counter, and falls back
  to the linear estimate past 100,000 steps.
- **Both are exported for tests.** `estimatePathLatency` calls them and passes on
  `estimated`, and the latency check adds its sentence only then.

### Success criteria

1. **Met: dense designs answer quickly, as an estimate.**
   - **Engine:** in the `STRESS=1` ladder the engine took 49, 45 and 36 ms on `random`
     200-node seeds 1–3. Before, it never returned on seeds 1 and 2 and took 1.5 s on
     seed 3.
   - **In the browser:** Run simulation on seed 1 (imported, 200 nodes) did its work in
     28–38 ms and painted the results in 136–245 ms. The Latency budget row reads "… This
     design has too many paths to time each one, so this is an estimate." (905 ms against
     100), and the console has no errors.
   - **Another design over the budget:** the `random` 100-node seed 3 design, at 354 ms
     before, now takes 26 ms, so it now gets the estimate too.
2. **Met: nothing within the budget changed.**
   - The engine probe (264 lines) is byte-identical to `main`, both after Task 2 and at the
     end.
   - `tests/demos.test.ts`, `tests/challenges.test.ts` and every fixture's expectations
     pass unchanged.
   - A new test pins `chat-app/good` (30 ms, which has two-way edges) and both demos (96 ms
     and 20 ms) as they were on `main`, with no sentence.
3. **Met: no expected failures anywhere.** The ladder gives 29 passed and none expected to
   fail, in 44 s instead of about 4 minutes, since no case is killed any more. The default
   suite gives 1,833 passed and 32 skipped.
4. **Met: all checks pass.** `npm test`, `npx tsc --noEmit`, `npm run lint` and
   `npm run build` pass.

### Unit tests of the walk

- **A small acyclic graph** gives its longest path.
- **The round-trip quirk** still holds: a two-way pair of 15 ms hops gives 30 ms.
- **At the budget's edge:** with a budget equal to the steps the walk needs, the result is
  exact. One step less gives the estimate, which on that acyclic graph equals the exact
  result.
