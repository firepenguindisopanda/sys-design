# Tasks: `loadsim-route-scale`

Spec: [SPEC-loadsim-route-scale.md](../../SPEC-loadsim-route-scale.md). Plan:
[plan.md](plan.md).

**Standing verification:**
- `npm test`, `npx tsc --noEmit` and `npm run lint` pass.
- No change to `src/lib/simulation.ts`, `challenges/`,
  `tests/loadsim-unchanged-baseline.json` or `src/lib/loadsim/__snapshots__/`. Check with
  `git diff --stat main -- src/lib/simulation.ts challenges tests/loadsim-unchanged-baseline.json src/lib/loadsim/__snapshots__`,
  which should show nothing.

---

## Task 0: Baseline

**Description:**
- Create `fix/loadsim-route-scale` from `main` (`ed03bcf`). The spec, plan and map edits
  come along uncommitted.
- Save the probe and load-model probe outputs, without timings, to the scratchpad, as in
  `config-bounds`.

**Acceptance:**
- [x] Both outputs are saved, and the branch exists.

**Scope:** XS

## Task 1: Count route steps while building

**Description:**
- Add `ROUTE_BUDGET` to `capacities.ts`.
- Add `TooManyRoutesError` and the optional `budget` parameter to `buildFlowGraph`.
- Wrap the seven step-creation sites in the counting helper.
- Tests first:
  - **`graph.test.ts`:**
    - stacked 5 × 4 and 12 × 4 throw `TooManyRoutesError` within 100 ms;
    - stacked 4 × 4 builds with 1,706 steps;
    - an exactness test: every fixture, both demos and 50 seeds each of `random` and `app`
      build with `budget = routeSteps` and throw with `routeSteps − 1`.
  - **`tests/stress-growth.test.ts`:** the `[loadsim-route-scale]` pin is replaced by the
    budget tests, and the 26, 106 and 426 guard stays.

**Acceptance criteria:**
- [x] The new tests pass, and the graph snapshot test is unchanged.
- [x] The default suite has no expected failures.

**Verification:**
- [x] `npx vitest run src/lib/loadsim tests/stress-growth.test.ts`

**Dependencies:** Task 0
**Files:** `src/lib/loadsim/capacities.ts`, `src/lib/loadsim/graph.ts`, `src/lib/loadsim/graph.test.ts`, `tests/stress-growth.test.ts`
**Scope:** S

### Checkpoint A: after Task 1
- [x] Standing verification passes.
- [x] Both probe outputs match Task 0's byte for byte.

## Task 2: Readiness message

**Description:** `missingForLoad` adds the spec's message when `buildFlowGraph` throws
`TooManyRoutesError`, and only when nothing else is missing. Tests first in
`readiness.test.ts`.

**Acceptance criteria:**
- [x] Stacked 5 × 4 gives exactly the spec's message.
- [x] Stacked 4 × 4 and every fixture give `[]`.
- [x] A design with no client gives only its own message.

**Verification:**
- [x] `npx vitest run src/lib/loadsim/readiness.test.ts`

**Dependencies:** Task 1
**Files:** `src/lib/loadsim/readiness.ts`, `src/lib/loadsim/readiness.test.ts`
**Scope:** XS

## Task 3: The page checks before running

**Description:** in `LoadSimApp`, a ready design with anything missing goes to
`LoadSimView` without mounting `ReadyPage`.

**Acceptance criteria:**
- [x] The existing load-sim view and page tests pass unchanged.
- [x] The browser check in Task 5 shows the message for stacked 5 × 4, with no freeze.

**Verification:**
- [x] `npx vitest run src/components/loadsim`

**Dependencies:** Task 2
**Files:** `src/components/loadsim/load-sim-app.tsx`
**Scope:** XS

## Task 4: Ladder

**Description:**
- In `tests/stress-scale.test.ts`:
  - the child records a refusal on `TooManyRoutesError` and counts route steps with
    `budget = 1_000_000`;
  - the parent passes a refusal within budget and prints "refused: too many routes";
  - the three `stacked` entries come out of `PINNED`.
- Run the ladder once.

**Acceptance criteria:**
- [x] `STRESS=1` gives 26 passed and 3 expected failures (`engine-path-scale`). Stacked
      5–7 × 4 are refused within the 2 s load-model budget.
- [x] Without `STRESS`, the file only skips.

**Verification:**
- [x] `STRESS=1 npx vitest run tests/stress-scale.test.ts --reporter=verbose`

**Dependencies:** Task 1
**Files:** `tests/stress-scale.test.ts`
**Scope:** XS

### Checkpoint B: after Tasks 2–4
- [x] Standing verification passes.

## Task 5: Browser checks and wrap-up

**Description:**
- **Browser checks**, on the dev server in Chrome DevTools:
  - write a stacked 5 × 4 design file, import it, and press Simulate load. `/simulate`
    shows the message at once, and the tab stays responsive, including after a reload;
  - the link shortener's reference design still plays on `/simulate`.
- **Then:**
  - compare the probes with Task 0's;
  - run the full checks and the build;
  - write Results into the spec and update the map;
  - commit on `fix/loadsim-route-scale`, with no co-author line.

**Acceptance criteria:**
- [x] The browser checks behave as described, with a screenshot of the message.
- [x] Both probe outputs are byte-identical to Task 0's.
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build` pass.
- [x] The spec's success criteria 1–4 are each met, with the evidence in Results.

**Dependencies:** Tasks 1–4
**Files:** `SPEC-loadsim-route-scale.md`, `CAPABILITY-MAP-stress.md`, `tasks/loadsim-route-scale/todo.md`
**Scope:** S

### Checkpoint: complete
- [x] All acceptance criteria met.
- [ ] Review with you before merging into `main`.
