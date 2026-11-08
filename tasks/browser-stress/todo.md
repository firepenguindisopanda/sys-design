# Tasks: `browser-stress`

Spec: [SPEC-browser-stress.md](../../SPEC-browser-stress.md). Plan: [plan.md](plan.md).

**Standing verification:**
- `npm test` gives 1,833 passed, and `npx tsc --noEmit` and `npm run lint` pass.
- No change to `src/lib/loadsim/`, `src/lib/simulation.ts`, `challenges/` or
  `tests/demos.test.ts`. Check with
  `git diff --stat main -- src/lib/loadsim src/lib/simulation.ts challenges tests/demos.test.ts`,
  which should show nothing.
- Port 43127 is never used by these tests.

---

## Task 0: Baseline

**Description:** create `test/browser-stress` from `main` (`136ff73`). Save both probe
outputs to the scratchpad, without timings, and record the `npm test` count.

**Acceptance:**
- [x] The branch exists, both probe outputs are saved, and the count is recorded (1,833
      passed, 32 skipped).

**Scope:** XS

## Task 1: Runner, helpers and a smoke test

**Description:**
- install `@playwright/test` `1.63.0` exactly;
- add `playwright.config.ts`, the `test:browser` script and the `.gitignore` lines;
- write `e2e/support/designs.ts` and `e2e/support/measure.ts` (with the editor helpers);
- add `e2e/smoke.spec.ts`, which:
  - loads the BeUWI demo, presses Run simulation and sees the results;
  - imports `random200` and sees 200 nodes;
  - checks no page errors.

**Acceptance criteria:**
- [x] `npm ls playwright-core` shows one version, 1.63.0, and no browser was downloaded.
- [x] `npm run test:browser` builds, serves on 43128 and passes the smoke test.
- [x] `@/` imports from `src/` resolve in `e2e/`, or the fallback in the plan is in place.
- [x] Vitest doesn't pick up `e2e/`; `npm test` is still 1,833 passed.
- [x] Mutation check: the smoke test fails when Run simulation renders no results.

**Verification:**
- [x] `npm run test:browser`
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint`

**Notes:**
- **Chrome, not Chromium.** `@playwright/test` 1.63.0 wants Chromium build 1243, and only
  1228 (from an older Playwright) was on disk. Rather than download it, the config uses
  the installed Google Chrome 157 (`channel: "chrome"`), which is what students use.
- **`next build` type-checks `e2e/`** (tsconfig includes `**/*.ts`), so a type error
  in a spec stops the web server from starting.
- **`BUDGETS=off`** records the numbers without failing on them, for measuring.

**Dependencies:** Task 0
**Files:**
- `package.json`, `package-lock.json`;
- `playwright.config.ts`, `.gitignore`;
- `e2e/support/designs.ts`, `e2e/support/measure.ts`;
- `e2e/smoke.spec.ts`.

**Scope:** M

## Task 2: Scenario 1, the canvas

**Description:** `e2e/canvas-scale.spec.ts` covers `random200` and `app200`:
- import;
- Run simulation;
- drag a node 300 px in 30 steps;
- pan and zoom.

It measures first, then gates.

**Acceptance criteria:**
- [x] Three runs without budgets are recorded here, plus one headed run to compare frame
      times.
- [x] Budgets go in where the slowest run is at least 3× under them; any other case is
      brought to you before it's pinned or a budget moves.
- [x] `random200`'s latency row ends with "…so this is an estimate."
- [x] Each case prints its line of numbers and has no page errors.

**Measured (2026-11-07, three runs, headless; one headed run matched):**

| Case | Import | Longest task, import | Run | Drag median / worst | Pan median | Zoom median |
|---|---|---|---|---|---|---|
| random 200, seed 1 | 883–1,085 ms | 416–449 ms | 344–419 ms | **50 ms** / 100–117 ms | **50 ms** | **50 ms** |
| app 200, seed 1 | 749–782 ms | 368–393 ms | 130–140 ms | 17 ms / 67 ms | 17 ms | 17 ms |

- **At or near their budget:** `random` 200's median frame while dragging, panning and
  zooming. It's 50 ms (20 fps) against a 50 ms budget. It has 395 edges against `app`
  200's 344, yet takes three times as long per frame.
- **Everything else** is at least 4× under its budget.
- Dragging the first node failed at first: at the minimum zoom (0.2), 200 nodes don't fit,
  and the first one was off screen. The test now drags a node the mouse can reach.

**Verification:** `npx playwright test e2e/canvas-scale.spec.ts`

**Dependencies:** Task 1
**Files:** `e2e/canvas-scale.spec.ts`, maybe `e2e/support/measure.ts`
**Scope:** S

## Task 3: Scenario 2, `/simulate` at 1,000,000 requests

**Description:** `e2e/simulate-scale.spec.ts` covers the BeUWI demo and `app200`:
- Simulate load;
- set requests to 1,000,000 and leave the field;
- play at the fastest speed for 5 s;
- switch a node off and back on.

It measures first, then gates.

**Acceptance criteria:**
- [x] Three runs without budgets are recorded here.
- [x] Budgets are set by the same rule as Task 2.
- [x] The requests field reads "1,000,000", the playback position moves, and the outage
      appears and goes.
- [x] Each case prints its line and has no page errors.

**Measured (2026-11-07, three runs):**

| Case | Open | 1,000,000 requests (longest task) | Playback median / worst | Switch off, back |
|---|---|---|---|---|
| BeUWI demo | 299–358 ms | 95–123 ms (53–64 ms) | 17 ms / 17–18 ms | 128–135 ms, 71–90 ms |
| app 200, seed 1 | 786–826 ms | 548–618 ms (264–284 ms) | **33 ms** / 51–550 ms | 382–680 ms, 213–281 ms |

- **Near its budget:** `app` 200's playback median frame, 33 ms (30 fps) against 50 ms.
- **A one-off hitch:** one run had a 546 ms long task during playback.
- **Everything else** is at least 6× under its budget.
- **Bringing a node back** at the same paused moment removes its zero-length outage, so
  the outage list goes. The test clears anything left.
- Generated nodes share labels, so the test picks a node by its id.

**Verification:** `npx playwright test e2e/simulate-scale.spec.ts`

**Dependencies:** Task 1
**Files:** `e2e/simulate-scale.spec.ts`
**Scope:** S

## Checkpoint: after Tasks 2 and 3

- [x] You see the measured numbers for the canvas and `/simulate`.
- [x] Any case that needs real performance work is agreed as a pin, with its owner
      module added to the capability map.

## Task 4: Scenario 5, bad saved designs

**Description:** `e2e/saved-design.spec.ts` covers the seven cases in the spec's table.
Each writes `sessionStorage["sesim:load-sim"]` with an init script, or after a first load
of the origin, and then loads `/simulate`.

**Acceptance criteria:**
- [x] Each bad case shows its message within 2 s, with no page error.
- [x] Stacked 5 × 4 shows the route message, and the load model never runs: no long task
      over 200 ms.
- [x] Nothing saved shows the empty-page text.
- [x] A good design shows the same results after a reload.
- [x] Mutation check: making the handoff reader throw fails the test.

**Done (2026-11-07):** all seven cases pass on three runs. Messages appear in 295–430 ms,
the stacked design causes no long task, and the good design reloads in 137–169 ms. With the
handoff reader made to throw, six cases fail; the seventh, "nothing saved", never reaches
the reader.

**Verification:** `npx playwright test e2e/saved-design.spec.ts`

**Dependencies:** Task 1
**Files:** `e2e/saved-design.spec.ts`, maybe `e2e/support/designs.ts`
**Scope:** S

## Task 5: Scenario 4, the first click

**Description:** `e2e/first-click.spec.ts` does twenty fresh loads. Each loads the demo and
clicks Run simulation as soon as it's actionable, then expects results within 2 s.

**Acceptance criteria:**
- [ ] ~~**Not reproduced:**~~ (not applicable: it reproduced) twenty out of twenty pass on three runs, and the result is
      recorded here and in the spec.
- [x] **Reproduced:**
  - the cause is confirmed;
  - a failing test is written first;
  - the fix makes it twenty out of twenty on three runs;
  - if the fix goes past a few files or changes how something looks, I ask first.

**Results (2026-11-07):**
- **Production loads:** 60 of 60 clicks registered (normal, CPU slowed 6×, after the demo).
  React always had the button before Playwright could click.
- **Cause confirmed:** with the JavaScript held back 1.5 s, 0 of 20 early clicks registered.
- **Fix chosen by you:** "keep the early click". Built: `src/lib/early-click.ts` (inline
  script + `takeEarlyClick`), the script in `src/app/page.tsx`, and the panel's
  `data-early-click="run"` and mount effect. Unit tests pass (16), `tsc` and lint pass.
- **After the fix:** with the scripts 1.5 s late, all 20 clicks landed before React took
  over the button and all 20 registered (0 of 20 before). The other three variants are
  still 20 of 20.
- **Dev server (browser pane):**
  - the inline script runs and the app takes over its recording;
  - no run happens on its own after a reload;
  - one click on Run gives one result;
  - no console errors.
- **`npm test`:** 1,840 passed, the 1,833 before plus the 7 new tests (6 for
  `early-click`, 1 for the panel's marker).
- **Three runs in a row:** done in Task 7, 20 of 20 on every variant each time.

**Verification:**
- [x] `npx playwright test e2e/first-click.spec.ts`
- [x] Any unit test of the fix

**Dependencies:** Task 1
**Files:** `e2e/first-click.spec.ts`, and the fix's files if any (likely
`src/components/simulator/verification-panel.tsx` and its test)
**Scope:** S, or M with a fix

## Task 6: Scenario 3, memory

**Description:** `e2e/memory.spec.ts` runs ten cycles of:
- import `app200`;
- Run simulation;
- Simulate load;
- back to the editor.

It measures the heap after a forced garbage collection, after cycle 1 and after cycle 10.

**Acceptance criteria:**
- [x] First, the heap reading visibly rises when `app200` is loaded, which shows it's real.
- [x] Three runs without the budget are recorded, then the budget goes in by the same
      rule as Task 2 (10 MB, tightened from 50; see below).
- [x] The tenth cycle still works, and there are no page errors.

**Measured (2026-11-07, three runs):**
- **The reading is real:** 6.8–7.7 MB with an empty editor, 30.2 MB with `app` 200 loaded.
- **After each cycle:** 27.4 → 29.9 → 32.2 → … → 46.9 MB, a steady ~2.2 MB a cycle.
  Growth from cycle 1 to 10 was 19.5–20.3 MB against the 50 MB budget: within it, but only
  2.5× under it, short of the 3× rule.
- **Which steps (throwaway runs, ten repeats each):**

  | Repeated | Growth |
  |---|---|
  | Import only | 0.9 MB |
  | Run only | 0.3 MB |
  | Simulate and back only | 1.4 MB |
  | Import + Run | 1.1 MB |
  | Run + simulate | 1.5 MB |
  | **Import + simulate** | **20.3 MB** |

- **What grows (heap snapshots after cycles 2 and 6):** detached page elements, roughly
  one canvas a cycle. Over those four cycles:
  - 4,732 SVG paths, 4,928 `<div>`s and 2,332 `<svg>` elements;
  - their style data, about 14 MB.
- **Not the dot animator:** it stops its loop and lets go of each edge on unmount.
- **Found: the test, not the app.**
  - **Retainer chain:** the shortest strong path from the heap's root to a detached SVG
    path ran through a "DevTools console" global handle. That handle was Playwright's
    reference to the file input it had used for `setInputFiles`.
  - **Why it grew:** the input sits inside the old editor page, so its whole canvas stayed
    alive, one copy each time the editor remounted.
  - **The fix:** `importDesign` now hands the file to the input from inside the page (a
    `DataTransfer` and a `change` event, as a picked file would arrive).
- **After that fix, three runs:** 25.3–25.6 MB after cycle 1, 27.1–27.2 MB after cycle 10;
  growth 1.5–1.8 MB, levelling off. The app doesn't leak.
- **Budget tightened to 10 MB** (from the spec's first estimate of 50). It's still 5.5×
  over what was measured, and a canvas kept per cycle (about 20 MB) would get through
  50 MB.
- **Mutation check:** a planted leak (the editor canvas pushing `.react-flow` onto a
  window array every render) grew 19.8 MB and failed the test. A first attempt, in the
  verification panel, kept nothing, because its effect runs before the canvas exists.
- **Whole browser suite after the helper change:** 20 passed in 3.7 min, with the two
  `[canvas-render-scale]` pins failing as expected and memory at 2.0 MB.

**Verification:** `npx playwright test e2e/memory.spec.ts`

**Dependencies:** Task 1
**Files:** `e2e/memory.spec.ts`
**Scope:** S

## Task 7: Finish

**Description:** stability, mutation checks, probes, docs and the commit.

**Acceptance criteria:**
- [x] `npm run test:browser` passes three times in a row, with pins as agreed.
- [x] Each scenario has failed once under a mutation and passed again after the undo.
- [x] Both probes are byte-identical to Task 0's, and `npm test` is 1,833 passed (1,840
      with the first-click fix's seven tests).
- [x] `npx tsc --noEmit`, `npm run lint` and `npm run build` pass.
- [x] The spec gets a Results section.
- [x] The capability map shows `browser-stress` built, and the stale `engine-path-scale`
      line is corrected.
- [x] `HANDOVER.md`'s note on the first-click flake is updated. It's untracked, so it
      stays local.
- [x] Committed on `test/browser-stress`, without a Co-Authored-By line.
- [ ] Review with you before merging into `main`.

**Dependencies:** Tasks 2–6
**Files:**
- `SPEC-browser-stress.md`, `CAPABILITY-MAP-stress.md`;
- `tasks/browser-stress/todo.md`.

**Scope:** S

**Results (2026-11-07):**
- **Three runs in a row:** 20 passed each, in 3.3–3.4 min; only the two pins failed, as
  expected.
- **Mutations this task:**
  - canvas: Run simulation waits 3 s, giving "run: 3,294 ms against a budget of 2,000 ms";
  - `/simulate`: a new scenario waits 6 s, giving "1,000,000 requests: 6,094 ms against a
    budget of 5,000 ms";
  - first click: the panel never takes the early click, giving 0 of 20 with late scripts.

  Each was undone from a backup, and the first-click spec passed 4 of 4 after. Smoke, saved
  design and memory were checked in Tasks 1, 4 and 6.
- **Probes:** both are byte-identical; `npm test` gives 1,840 passed and 32 skipped; tsc and
  lint are clean; the build ran with each suite run.
