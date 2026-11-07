# Tasks: `config-bounds`

Spec: [SPEC-config-bounds.md](../../SPEC-config-bounds.md). Plan: [plan.md](plan.md).

**Standing verification:**
- `npm test`, `npx tsc --noEmit` and `npm run lint` pass.
- No change under `src/lib/simulation.ts`, `src/lib/loadsim/` or `challenges/`. Check with
  `git diff --stat main -- src/lib/simulation.ts src/lib/loadsim challenges`, which should
  show nothing.

---

## Task 0: Baseline

**Description:**
- Create `fix/config-bounds` from `main` (`07f00a1`). The spec, plan and map edits come
  along uncommitted.
- Save `PROBE=1 npx vitest run tests/probe.test.ts --reporter=verbose` and
  `LOADSIM_PROBE=1 npx vitest run tests/loadsim-probe.test.ts --reporter=verbose` to the
  scratchpad, keeping only the printed results, without timings.

**Acceptance:**
- [x] Both outputs are saved, and the branch exists.

**Scope:** XS

## Task 1: The limits module

**Description:** write `src/lib/config-limits.ts` (`CONFIG_LIMITS`, `limitFor`,
`configProblem`, `clampConfigValue`, `parseConfigInput`, `numericConfigFields`,
`clampPatch`) and its tests in `src/lib/config-limits.test.ts`, tests first. Add the
check of the generator's ranges to `src/test/gen-designs.test.ts`.

**Acceptance criteria:**
- [x] Every catalog default, every node of every fixture (via `challenges`) and both demos
      have no `configProblem`.
- [x] `configProblem`:
  - accepts each limit's min and max;
  - refuses min − 0.01, max + 0.01, 1.5 for a whole-number field, `NaN` and `Infinity`;
  - uses the spec's wording.
- [x] `clampConfigValue` and `parseConfigInput`:
  - `""`, `" "`, `abc`, `NaN` and `Infinity` give null;
  - `-1` gives the min, `20` replicas gives 8, `1e9` gives the max, `0.75` cache memory
    gives 0.75 and `2.6` replicas gives 3.
- [x] `clampPatch`:
  - clamps `{ replicas: 20 }` to 8 and `{ capacity: { vcpus: 0 } }` to 0.5;
  - drops `{ replicas: NaN }`;
  - leaves `{ engine: "document" }` alone.
- [x] Every range in the generator's `CONFIG_RANGES` lies within `CONFIG_LIMITS`.

**Verification:**
- [x] `npx vitest run src/lib/config-limits.test.ts src/test/gen-designs.test.ts`
- [x] `npx tsc --noEmit`, `npm run lint`

**Dependencies:** Task 0
**Files:** `src/lib/config-limits.ts`, `src/lib/config-limits.test.ts`, `src/test/gen-designs.test.ts`
**Scope:** S

## Task 2: Validator

**Description:**
- In `readDesign`, check each numeric config value with `configProblem` and fail at its
  path.
- Refuse an edge whose source and target are the same.
- Tests first:
  - in `validate.test.ts`: one out-of-range value (nested `capacity.vcpus`, for the path)
    and one self-loop;
  - in `tests/stress-import.test.ts`:
    - the 16 `[config-bounds]` `it.fails` become `it`, named without the owner prefix;
    - the "today, … is accepted" guards are removed;
    - the self-loop recorded-first test now expects a refusal at its path.

**Acceptance criteria:**
- [x] Each flipped pin passes with the message starting `test.yaml: <path>`, and the
      handoff pin gives an error.
- [x] The default suite has exactly 1 expected failure (the growth pin).
- [x] `npm run build` passes, so every fixture fits.

**Verification:**
- [x] `npx vitest run src/lib/challenges/validate.test.ts tests/stress-import.test.ts`
- [x] `npm run build`

**Dependencies:** Task 1
**Files:** `src/lib/challenges/validate.ts`, `src/lib/challenges/validate.test.ts`, `tests/stress-import.test.ts`
**Scope:** S

### Checkpoint A: after Tasks 1–2
- [x] Standing verification passes.
- [x] The probe and load-model probe outputs match Task 0's byte for byte.

## Task 3: Store

**Description:** `updateNodeConfig` runs its patch through `clampPatch`. Tests in
`store.test.ts`, written first.

**Acceptance criteria:**
- [x] Replicas of 20 are saved as 8, and capacity vCPUs of 0 as 0.5, keeping the other
      capacity fields.
- [x] A patch of `{ replicas: NaN }` keeps the old value.
- [x] Engine and mode changes pass through unchanged.
- [x] The existing "changing a config field" stale-results test passes unchanged.

**Verification:**
- [x] `npx vitest run src/lib/store.test.ts`

**Dependencies:** Task 1
**Files:** `src/lib/store.ts`, `src/lib/store.test.ts`
**Scope:** XS

## Task 4: Inspector

**Description:** add `ConfigNumberField` in `node-inspector.tsx`, with its text state,
commit while in range, snap or revert on blur, and `min` and `max` from `limitFor`. Move
the six number inputs to it.

**Acceptance criteria:**
- [x] A static render (existing `inspector-card.test.tsx` style) shows, for a selected
      database, `min="1"` and `max="8"` on Replicas and `max="16"` on Shards, and, for a
      selected VM, `min="0.5"` and `max="64"` on vCPUs.
- [x] The existing inspector and a11y tests pass unchanged. Every input keeps its label and
      accessible name.

**Verification:**
- [x] `npx vitest run src/components/simulator`

**Dependencies:** Tasks 1, 3
**Files:** `src/components/simulator/node-inspector.tsx`, `src/components/simulator/inspector-card.test.tsx`
**Scope:** S

### Checkpoint B: after Tasks 3–4
- [x] Standing verification passes.

## Task 5: Browser checks and wrap-up

**Description:** do the spec's browser checks on `npm run dev` (in-app browser, or Chrome
DevTools if the pane is hidden):
- in the inspector, 20 replicas snaps to 8 on leaving the field;
- clearing Memory GB and leaving the field shows the old value;
- Run simulation still runs;
- importing a design while a node is selected updates the field;
- an imported file with `replicas: .inf` shows an error naming the field;
- on `/simulate`, a saved design with `.inf` in session storage shows the message after a
  reload.

Then:
- run the probes against Task 0's output;
- run the full checks and the `STRESS=1` ladder once;
- write Results into the spec, update the map, and commit on `fix/config-bounds`, with no
  co-author line.

**Acceptance criteria:**
- [x] Each browser check behaves as described, with a screenshot of the snapped field and of
      `/simulate`'s message.
- [x] Both probe outputs are byte-identical to Task 0's.
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build` pass. The ladder
      still has 23 passes and 6 expected failures.
- [x] The spec's success criteria 1–5 are each met, with the evidence in Results.

**Dependencies:** Tasks 1–4
**Files:** `SPEC-config-bounds.md`, `CAPABILITY-MAP-stress.md`, `tasks/config-bounds/todo.md`
**Scope:** S

### Checkpoint: complete
- [x] All acceptance criteria met.
- [ ] Review with you before merging into `main`.
