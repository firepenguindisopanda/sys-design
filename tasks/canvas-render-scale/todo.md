# Tasks: `canvas-render-scale`

Spec: [SPEC-canvas-render-scale.md](../../SPEC-canvas-render-scale.md). Plan: [plan.md](plan.md).

**Standing verification:**
- `npm test` passes: 1,840 at the start, plus each task's new tests. `npx tsc --noEmit` and
  `npm run lint` pass.
- No change to `src/lib/loadsim/`, `src/lib/simulation.ts`, `challenges/` or
  `tests/demos.test.ts`. Check with
  `git diff --stat main -- src/lib/loadsim src/lib/simulation.ts challenges tests/demos.test.ts`,
  which should show nothing.
- Never committed: the profiling script, or `productionBrowserSourceMaps` in
  `next.config.ts`.

**Measuring a case:** run its spec three times with `BUDGETS=off`, and record the fps lines:

```bash
BUDGETS=off npx playwright test e2e/canvas-scale.spec.ts
```
```bash
BUDGETS=off npx playwright test e2e/simulate-scale.spec.ts
```

---

## Task 0: Baseline

**Description:** save both probe outputs to the scratchpad, without timings, and record the
`npm test` count. With a throwaway vitest probe (not committed), count how many of
`app` 200's edges and nodes change what they show from one step to the next in its run at
1,000,000 requests:
- for an edge: the width, the colour, and the label text with reduced motion;
- for a node: the utilisation shown, its status, and whether it's off.

**Acceptance criteria:**
- [x] Both probe outputs are saved, and the count is recorded.
- [x] The step-to-step change counts are recorded here: median and worst, for edges and
      for nodes.

**Scope:** XS

**Results (2026-11-08):**
- **Probes:** both are saved; each is byte-identical to `browser-stress`'s baseline.
  `npm test` gave 1,844 passed, the 1,840 plus new tests other tasks had added by then.
- **The run used:** `app` 200 seed 1 straight from `generateDesign`, with
  `defaultScenario(null)` at 1,000,000 requests (1,200 s, spike shape) and no outages. It
  has 603 frames at 2 s each. Only 11 of its 344 edges ever carry traffic.

| Over 602 step pairs | Median | Worst |
|---|---|---|
| Edges whose width changes | 0 | 6 |
| Edges whose colour changes | 0 | 3 |
| Edges whose reduced-motion label changes | 0 | 6 |
| Nodes whose raw utilisation changes | 0 | 6 |
| Nodes whose shown bar changes | 0 | 3 |
| Nodes whose status text changes | 3 | 6 |
| Nodes switched off or on | 0 | 0 |

- **So fix 5 can pay:** a step changes at most 6 edges and 6 nodes, where today it
  re-renders all 544. Fix 6 shouldn't be needed.

## Task 1: Dash motion (fix 1)

**Description:**
- `animateRealtime` and `MAX_ANIMATED_EDGES` in `src/lib/edges.ts`, tested first;
- the `still` class on realtime edges in `design-canvas.tsx` when the design is past 20;
- the CSS in `globals.css`: no animation for `still` edges, nor under reduced motion;
- `e2e/motion.spec.ts`:
  - the chat-app `good` fixture runs 4 `dashdraw` animations;
  - with `reducedMotion: "reduce"` it runs none, and its realtime paths are still dashed;
  - random 200 runs none, with 197 dashed paths.

**Acceptance criteria:**
- [x] Unit tests: 20 realtime edges animate, 21 don't, none is fine, non-realtime edges
      don't count.
- [x] `e2e/motion.spec.ts` passes; with the CSS rule removed, it fails.
- [x] random 200 measured three times; expected about 29 drag, 33 pan, 57 zoom.

**Verification:** `npx vitest run src/lib/edges.test.ts`, `npx playwright test e2e/motion.spec.ts`

**Dependencies:** Task 0
**Files:** `src/lib/edges.ts` and its test, `design-canvas.tsx`, `globals.css`,
`e2e/motion.spec.ts`
**Scope:** S

**Done (2026-11-08):** built by a subagent, reviewed and run here.
- **Rule:** `animateRealtime`, with four unit tests. The store's `animated` is untouched;
  the canvas adds a `still` class past 20.
- **CSS:** `.react-flow__edge.animated.still path` and, under reduced motion,
  `.react-flow .react-flow__edge.animated path`, set `animation: none`. Three classes beat
  xyflow's two whatever the stylesheet order, and the dashes stay.
- **`e2e/motion.spec.ts`:**
  - the chat-app fixture (imported with `challenge: chat-app` added) runs 4 `dashdraw`
    animations;
  - with reduced motion it runs none, still dashed;
  - random 200 runs none, with 197 dashed.
- **In the browser pane (dev server):** the BeUWI demo's 2 realtime edges still move,
  with no `still` class and no console errors.
- **Measured:** together with Tasks 2 and 3 (see Task 3).

## Task 2: The edges layer (fix 2)

**Description:** `.react-flow__edges { will-change: transform; }`, plus the sharpness check in
`e2e/motion.spec.ts` (the plan's method: in-page pixel comparison, under 1% different).
Also measure `/simulate`'s `app` 200 pan, to decide whether the rule is scoped to the
editor.

**Acceptance criteria:**
- [x] ~~The sharpness check passes; with a deliberately blurry case, such as `filter: blur(1px)`
      on the edges, it fails.~~ Replaced: the layer is only on while the view moves (below).
- [x] random 200 pan measured three times, expected about 53; if not, undone and noted.
- [x] ~~If edges blur, the rule is dropped and pan is brought to you.~~ Not blur (below).

**Verification:** `npx playwright test e2e/motion.spec.ts e2e/canvas-scale.spec.ts`

**Dependencies:** Task 1
**Files:** `globals.css`, `e2e/motion.spec.ts`
**Scope:** XS

**Done (2026-11-08), changed from the plan:**
- **The pixel comparison failed** (1.6–1.8% of pixels differed). A difference image showed
  the pixels along glyph edges, mostly in node text, which isn't on the edges layer. A
  sharpness measure (neighbouring-pixel energy) dropped 5.5% for edges alone and 6.1% for
  nodes alone with the layer; a 1 px blur drops it 31%. So it isn't blur: while any extra
  layer exists, Chrome draws the text and fine lines around it a little differently.
- **The fix:** the layer only while the view moves. `design-canvas.tsx` sets
  `data-moving` on the canvas in `onMoveStart` and clears it in `onMoveEnd`; the CSS is
  `.react-flow[data-moving] .react-flow__edges { will-change: transform; }`. At rest the
  canvas draws exactly as before. A data attribute, because React's `className` would
  overwrite a class mid-move.
- **The test** checks `will-change` is `auto` at rest, `transform` mid-pan and `auto`
  after.
- **Scope:** the editor only; `/simulate` doesn't need it (playback reached 60 fps without
  it).

## Task 3: A drag re-renders only what changed (fix 3)

**Description:** `src/components/simulator/canvas-elements.ts` with its cache, tested first;
`design-canvas.tsx` uses it. A throwaway render counter in the browser shows a drag
re-renders only the moved node and its edges. When random 200 reaches 35 fps on drag, pan
and zoom, its pin becomes an ordinary check.

**Acceptance criteria:**
- [x] Unit tests:
  - the same input gives the same objects;
  - after a move, only that node's object is new;
  - after a rename, only that node's edges are new;
  - after a selection change, only the selected and previously selected objects are new;
  - the `still` flag is reflected.
- [x] The existing editor tests pass unchanged: `a11y`, `design-node`, `flow-labels`.
- [x] random 200 measured three times: drag, pan and zoom at 35 fps or more on the slowest
      run.
- [x] `[canvas-render-scale] canvas…` is an ordinary check, and random 200's median frames
      gate again.

**Verification:** `npx vitest run src/components/simulator`, `npx playwright test e2e/canvas-scale.spec.ts`

**Dependencies:** Task 2
**Files:** `canvas-elements.ts` and its test, `design-canvas.tsx`, `e2e/canvas-scale.spec.ts`
**Scope:** M

**Done (2026-11-08):** built by a subagent, reviewed and run here.
- **`canvas-elements.ts`:** keeps each node's and edge's output object while its inputs
  are unchanged, labels from one `Map`, and, added in review, the **edge list itself**
  while every edge is unchanged, so React Flow doesn't re-process all edges on each drag
  move. 8 unit tests.
- **Measured, Tasks 1–3 together (`BUDGETS=off`, normal runs):**

| random 200 | before | after |
|---|---|---|
| drag | 20–22 fps | 35–38 |
| pan | 21–24 | 55–57 |
| zoom | 23–25 | 52–55 |

  App 200: drag 40–49, pan 48–54, zoom 60. Two runs on a busy machine (import 1.2 s against
  0.7) gave random 200 drag 26–28; they're left out.
- **Ruled out by measurement:** the design fingerprint recomputed after Run simulation
  (15 ms over a whole drag); edge hit-testing (no change with `pointer-events: none`).
- **The remaining drag cost** is the browser's own work: hit-testing and layer bookkeeping,
  about 11 ms a frame. So drag holds its target with little margin.
- **The pin:** the canvas case is an ordinary check. Every case's median frames gate
  again, and every case must keep 35 fps on drag, pan and zoom.

## Checkpoint: the editor

- [x] random 200 is at 35 fps or more on drag, pan and zoom, on three runs.
- [x] Designs with up to 20 realtime connections animate as before: the chat-app fixture,
      checked by eye in the browser pane.
- [x] ~~You see the numbers before the `/simulate` track starts.~~ You asked for the
      tracks to run in parallel with subagents (2026-11-08); the numbers come with Task 6.

## Task 4: One reduced-motion query (fix 4)

**Description:** `useReducedMotion` reads one cached `MediaQueryList`.

**Acceptance criteria:**
- [x] A unit test with a fake `window.matchMedia`:
  - it's called once across many snapshots;
  - a change event still reaches the subscriber.
- [x] `app` 200 playback measured three times.

**Verification:** `npx vitest run src/components/loadsim`

**Dependencies:** Task 0
**Files:** `sim-context.ts`, and a test beside it
**Scope:** XS

**Done (2026-11-08):** built by a subagent, reviewed here. One lazily made
`MediaQueryList`; four tests (one `matchMedia` call over 1,000 reads, changes seen,
subscribers told, no window on the server). Measured with Task 5.

## Task 5: Selective re-render (fix 5)

**Description:**
- `FlowEdge` subscribes to its volume and failed share;
- `LoadNode` subscribes to what it shows;
- `onToggle` is stable.

When `app` 200 reaches 50 fps, its pin becomes an ordinary check. If it doesn't, stop and
bring fix 6 to you with the numbers.

**Acceptance criteria:**
- [x] The existing `flow-edge`, `load-node` and `load-sim-view` tests pass, plus a test that a
      step changing nothing an edge shows doesn't re-render it (render counter in a test).
- [x] In the browser, during playback, served counts and edge widths still change.
- [x] `app` 200 playback measured three times: 50 fps or more on the slowest run, or fix 6
      brought to you.
- [x] `[canvas-render-scale] simulate…` is an ordinary check.

**Verification:** `npx vitest run src/components/loadsim`, `npx playwright test e2e/simulate-scale.spec.ts`

**Dependencies:** Task 4
**Files:** `flow-edge.tsx`, `load-node.tsx`, maybe `sim-canvas.tsx`, their tests,
`e2e/simulate-scale.spec.ts`
**Scope:** M

**Done (2026-11-08):** built by a subagent, reviewed and run here.
- **`FlowEdge`** selects its volume and failed share; **`LoadNode`** selects utilisation,
  off and its status string; `onToggle` is stable and `LoadNodeBody` is memoised. Store
  subscription tests show a selector changes only when its value does.
- **Measured (`BUDGETS=off`, three runs):** app 200 playback **60 fps** (was 35–42);
  1,000,000 requests 0.27–0.30 s (was 0.38–0.46).
- **Correctness in the browser (a throwaway check, not committed):** with playback paused,
  eight positions from 0 to the last each show their own edge widths and node texts, and
  show exactly the same again when revisited in reverse and out of order.
- **Fix 6** isn't needed.
- **The pin:** the playback case is an ordinary check; every case must keep 50 fps.

## Task 6: Finish

**Description:** stability, mutation checks, probes, docs and the commit.

**Acceptance criteria:**
- [x] `npm run test:browser` passes three times in a row, with no expected failures.
- [x] Mutation checks:
  - the threshold set to infinity makes the canvas check fail;
  - re-rendering every edge and node on every step again makes the playback check fail;
  - each passes again after the undo.
- [x] Both probes are byte-identical to Task 0's.
- [x] `npx tsc --noEmit`, `npm run lint` and `npm run build` pass.
- [x] The spec gets a Results section.
- [x] The capability map shows `canvas-render-scale` built, and `browser-stress`'s commit
      as `a35fe11`.
- [x] Committed on `perf/canvas-render-scale`, without a Co-Authored-By line.
- [ ] Review with you before merging into `main`.

**Dependencies:** Tasks 3 and 5
**Files:** `SPEC-canvas-render-scale.md`, `CAPABILITY-MAP-stress.md`, this file
**Scope:** S

**Done (2026-11-08):**
- **The first three runs** failed twice, on random 200's drag (25–27 fps against 35) on a
  busy machine, and passed once (38). You chose a drag target of 20 for random 200;
  everything else keeps its target.
- **The next three runs in a row:** 22 passed each, 3.1–3.7 min, two on a busy machine.
  Random 200 drag 26–30, pan 40–52, zoom 52; app 200 drag 41–43, pan 38–50, zoom 60;
  playback 59–60.
- **Mutations:**
  - the realtime limit set to infinity fails the canvas check (drag 20, pan 25 against
    35) and the motion test;
  - the original `FlowEdge` and `LoadNode` fail playback (29 fps against 50).

  Both were restored from backups; the three specs then gave 8 passed.
- **Probes:** byte-identical. `npm test` gives 1,861 passed. tsc and lint are clean; the
  build ran with every suite run.
