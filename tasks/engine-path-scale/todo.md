# Tasks: `engine-path-scale`

Spec: [SPEC-engine-path-scale.md](../../SPEC-engine-path-scale.md). Plan: [plan.md](plan.md).

**Standing verification:**
- `npm test`, `npx tsc --noEmit` and `npm run lint` pass.
- No change to `src/lib/loadsim/`, `challenges/` or `tests/demos.test.ts`. Check with
  `git diff --stat main -- src/lib/loadsim challenges tests/demos.test.ts`, which should
  show nothing.

---

## Task 0: Baseline

**Description:** create `fix/engine-path-scale` from `main` (`e396546`), and save the
engine probe output, without timings, to the scratchpad.

**Acceptance:**
- [x] The output is saved, and the branch exists.

**Scope:** XS

## Task 1: `longestRequestPath`

**Description:** add `PATH_WALK_BUDGET`, `HopGraph` and `longestRequestPath`, with the
walk, the step counter and the linear fallback, to `simulation.ts`. It isn't used yet.
Tests first in `simulation.test.ts`.

**Acceptance criteria:**
- [x] A small acyclic graph gives its longest path, with `estimated: false`.
- [x] A WebSocket pair (a → b and b → a, 15 ms each) gives 30 ms, the walk's round-trip
      quirk.
- [x] With a budget that the walk exactly needs, the result isn't estimated. With one
      less, it is, and on an acyclic graph the estimate equals the exact result.
- [x] A dense cyclic graph (`random` 200 nodes, seed 1, built as the engine would) returns
      within 500 ms, with `estimated: true`.

**Verification:**
- [x] `npx vitest run src/lib/simulation.test.ts`

**Dependencies:** Task 0
**Files:** `src/lib/simulation.ts`, `src/lib/simulation.test.ts`
**Scope:** S

## Task 2: Use it in the engine and the latency check

**Description:** `estimatePathLatency` builds its hop graph as now and calls
`longestRequestPath`. `runVerification` uses `.ms` and adds the sentence when the result
is estimated. Tests first.

**Acceptance criteria:**
- [x] `runVerification` on `random` 200 nodes, seed 1, returns within 500 ms, and its
      `nfr-latency` detail ends with the sentence.
- [x] `chat-app/good` and both demos give exactly the same `nfr-latency` check (status,
      detail, actual) as on `main`, with no sentence. The values are pinned in the test.
- [x] `tests/demos.test.ts` and `tests/challenges.test.ts` pass unchanged.

**Verification:**
- [x] `npx vitest run src/lib/simulation.test.ts tests/demos.test.ts tests/challenges.test.ts`

**Dependencies:** Task 1
**Files:** `src/lib/simulation.ts`, `src/lib/simulation.test.ts`
**Scope:** S

### Checkpoint A: after Tasks 1–2
- [x] Standing verification passes.
- [x] The engine probe output matches Task 0's byte for byte.

## Task 3: Ladder

**Description:** empty `PINNED` in `tests/stress-scale.test.ts` and run the ladder once.

**Acceptance criteria:**
- [x] `STRESS=1` gives 29 passed and no expected failures. `random` 200 nodes runs within
      its 500 ms engine budget.

**Verification:**
- [x] `STRESS=1 npx vitest run tests/stress-scale.test.ts --reporter=verbose`

**Dependencies:** Task 2
**Files:** `tests/stress-scale.test.ts`
**Scope:** XS

## Task 4: Browser checks and wrap-up

**Description:**
- **Browser check:** on the dev server in Chrome DevTools, import a `random` 200-node seed 1
  design file and press Run simulation. The editor answers within a second, and the
  Latency budget row shows the sentence.
- **Then:**
  - compare the engine probe;
  - run the full checks and the build;
  - write Results into the spec, and mark the map complete;
  - commit on `fix/engine-path-scale`, with no co-author line.

**Acceptance criteria:**
- [x] The browser check behaves as described, with a screenshot of the latency row.
- [x] The engine probe is byte-identical to Task 0's.
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build` pass.
- [x] The spec's success criteria 1–4 are each met, with the evidence in Results.

**Dependencies:** Tasks 1–3
**Files:** `SPEC-engine-path-scale.md`, `CAPABILITY-MAP-stress.md`, `tasks/engine-path-scale/todo.md`
**Scope:** S

### Checkpoint: complete
- [x] All acceptance criteria met.
- [ ] Review with you before merging into `main`.
