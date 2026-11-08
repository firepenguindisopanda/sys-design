# Spec: smooth frames on large designs (`canvas-render-scale`)

The last module of [CAPABILITY-MAP-stress.md](CAPABILITY-MAP-stress.md), added by
`browser-stress` for the two frame rates it pinned. Branch `perf/canvas-render-scale`, from
`main` (`a35fe11`). Status: **built** (2026-11-08); see [Results](#results), which also
records where the build departed from this spec. Plan:
[tasks/canvas-render-scale/plan.md](tasks/canvas-render-scale/plan.md).

## Objective

Two cases in `npm run test:browser` are pinned with `test.fail()` because they aren't
smooth:

| Pinned test | Target | Measured (2026-11-07, three runs) |
|---|---|---|
| `[canvas-render-scale] canvas: random 200 nodes, seed 1, smooth frames` | 35 fps on drag, pan and zoom | 20–22, 21–24, 23–25 |
| `[canvas-render-scale] simulate: app 200 nodes, seed 1, smooth playback` | 50 fps at the fastest speed | 35–42 |

**Done means:**
- both cases reach their targets;
- their tests become ordinary checks, so the suite has no expected failures;
- designs a student actually builds look the same as today.

## What the profiles found (2026-11-08)

All measured on a production build in Chrome, headless, as in the suite. The tools were a
timeline trace, and a CPU profile mapped through a throwaway source-map build. The script
and its output are kept in the scratchpad; none of it is committed.

### The editor canvas (random 200)

**The moving dashes cap the page at 21 fps, even when nothing moves.** React Flow animates
every realtime connection (websocket, SSE, web push; `src/lib/edges.ts:95`) with a CSS dash
animation (`dashdraw`), which repaints each of those paths every frame. Random 200 has 197
of them; app 200 has none, and its edges are a third as long in total (365,000 px against
1.1 million). Real designs have at most 4 (the chat app's and club auction's fixtures).

Changing only the CSS on random 200 (two runs each):

| random 200 | drag | pan | zoom | idle |
|---|---|---|---|---|
| As now | 16–17 | 17–18 | 20 | 21 |
| Dashes kept, animation stopped | 28–29 | 31–34 | 57 | 60 |
| …and the edges on their own compositing layer | 30–31 | 53–54 | 60 | 60 |
| …and the whole viewport on its own layer instead | 26 | 53 | 60 | 60 |

- **Pan, once the animation is stopped,** still repaints every long path on each frame.
  An edges-only layer (`will-change: transform` on `.react-flow__edges`) lets the browser
  move them without repainting. A layer for the whole viewport makes drag worse.
- **Drag** still runs at about 30 fps: React and React Flow re-render every edge on every
  move. `design-canvas.tsx` builds a fresh `styledEdges` array, a new object per edge with
  `edgeAriaLabel(e, nodes)`, on each render. That defeats React Flow's per-edge memo.
  React, React Flow and their stores take about 30% of a drag's time.
- **Hit-testing edges** isn't a cost worth chasing: turning it off changed nothing.

### `/simulate` playback (app 200)

At the fastest speed (4×, 80 steps a second) the step changes on every animation frame.
Each change re-renders all 344 `FlowEdge`s and 200 `LoadNode`s (`usePlayback((s) => s.step)`
in each). Of a playback CPU profile:

| Share | What |
|---|---|
| 37% | React rendering and committing those components |
| 31% | The browser's own work (style, layout, paint) |
| 5% | `matchMedia`: `useReducedMotion` calls `window.matchMedia` in every edge on every render |
| 3% each | lucide's icon code (the Power icon in every node); React Flow's edge paths |
| 1% | The dot animator itself (only 4–19 dots on screen) |

## Decisions (2026-11-08)

| Question | Decision |
|---|---|
| The moving dashes | **Stop past 20.** A design with up to 20 realtime connections animates exactly as now. Past 20, the dashes stay but stop moving. |
| Reduced motion | **Yes, stop them.** With `prefers-reduced-motion: reduce`, the dashes stay but don't move, beside the existing rule for handles in `globals.css`. |
| Random 200's drag (added during the build) | **Target 20 fps.** It reaches 35–38 on a quiet machine but 25–30 on a busy one. Pan, zoom and app 200 keep 35. |

## The fixes, in order

Each fix is measured on its own, in order, and the module stops adding fixes once a case
reaches its target. If the measurement says a fix doesn't pay, it's dropped and noted
here.

**Editor, random 200 to 35 fps:**
1. **Dash animation stops past 20 realtime connections, and under reduced motion.**
   Measured above: drag about 29, pan about 33, zoom 57, idle 60.
2. **The edges get their own layer.** `.react-flow__edges { will-change: transform; }`.
   Measured with fix 1: pan about 53. **Risk:** content on its own layer can look blurry
   after a zoom. A screenshot test at the maximum zoom, after zooming in, checks that edges
   and arrowheads stay sharp. If they blur, the fix is dropped and pan is brought to you.
3. **A drag re-renders only what changed.** Each styled edge keeps its object while its
   inputs don't change. The accessible labels look nodes up in a map instead of scanning
   the list for every edge. Measured before this fix: drag about 30 fps.

**Playback, app 200 to 50 fps:**
4. **`useReducedMotion` uses one cached `MediaQueryList`** instead of calling `matchMedia`
   on every render.
5. **Edges and nodes re-render only when what they show changes:**
   - each component selects its own frame's values, not the whole step;
   - the node's `onToggle` and other props stay stable, so `LoadNodeBody` can skip
     rendering.
6. **Only if 4 and 5 fall short:** the dot animator sets each edge's width and colour
   outside React, as it already does for the dots. It's bigger, so I'll bring it to you
   with the numbers before building it.

## Not changing

- **The engine, the load model and their numbers:** both probes stay byte-identical.
- **How a design with up to 20 realtime connections looks,** with motion allowed. The
  chat-app and club-auction fixtures keep their moving dashes.
- **What `/simulate` shows at each step:** widths, colours, the dots, the numbers on the
  nodes.
- **Every budget in `e2e/`:** none is loosened. The pins' targets (35 and 50 fps) stay,
  except random 200's drag, set to 20 fps with your OK during the build (see Results).

## Commands

```bash
npm run test:browser
```
```bash
npx playwright test e2e/canvas-scale.spec.ts
```
```bash
npx playwright test e2e/simulate-scale.spec.ts
```
```bash
npm test
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

Probes, compared with saved baselines as in the earlier modules:

```bash
PROBE=1 npx vitest run tests/probe.test.ts --reporter=verbose
```
```bash
LOADSIM_PROBE=1 npx vitest run tests/loadsim-probe.test.ts --reporter=verbose
```

## Project structure

| File | Change |
|---|---|
| `src/lib/edges.ts` (or a small new helper beside it) | Whether a design's realtime connections animate: 20 or fewer |
| `src/components/simulator/design-canvas.tsx` | Uses that helper; keeps each styled edge's object; labels from a node map |
| `src/app/globals.css` | Reduced motion stops the dashes; the edges layer |
| `src/components/loadsim/sim-context.ts` | `useReducedMotion` with a cached query |
| `src/components/loadsim/flow-edge.tsx`, `load-node.tsx` | Select only their own frame values; stable props |
| `e2e/canvas-scale.spec.ts`, `e2e/simulate-scale.spec.ts` | The two pins become ordinary checks; `random` 200's median frames gate again |
| `e2e/motion.spec.ts` (new) | Dash motion: up to 20 animate, past 20 and reduced motion don't, and edges stay sharp after a zoom |
| `CAPABILITY-MAP-stress.md` | `canvas-render-scale` built; `browser-stress`'s commit corrected to `a35fe11` |

## Code style

```ts
/** Realtime connections stop moving past this many; their dashes stay (SPEC-canvas-render-scale.md). */
export const MAX_ANIMATED_EDGES = 20;

export function animateRealtime(edges: readonly Edge[]): boolean {
  return edges.filter((e) => e.animated).length <= MAX_ANIMATED_EDGES;
}
```

- **Follow the files around the change:** comments say why, with the spec named where a
  rule comes from.
- **No new dependencies.**

## Testing strategy

- **Unit (vitest):**
  - the threshold helper: 20 animate, 21 don't, none is fine;
  - `useReducedMotion` still follows changes to the media query;
  - a styled edge keeps its object when nothing it shows changed;
  - `FlowEdge` and `LoadNode` still show each frame's values, using the existing tests.
- **Browser (`e2e/motion.spec.ts`):**
  - the chat-app `good` fixture runs 4 `dashdraw` animations;
  - the same fixture with reduced motion runs none, and its realtime paths are still dashed;
  - random 200 runs none, with 197 dashed paths;
  - with fix 2, a screenshot at the maximum zoom after zooming in matches one taken before
    the layer was added, with the edges region compared.
- **The two former pins** are run three times without budgets after each fix, and the
  numbers are recorded in `tasks/canvas-render-scale/todo.md`.
- **Mutation checks:**
  - the threshold set to infinity makes the canvas check fail;
  - re-rendering every edge and node per step again makes the playback check fail.
- **Stability:** the whole suite passes three times in a row, with no expected failures.

## Boundaries

- **Always:**
  - measure each fix on a production build before keeping it;
  - keep the look of designs with up to 20 realtime connections;
  - print every number.
- **Ask first:**
  - fix 6 (moving edge styling out of React);
  - any change to how a design looks beyond the two decisions above;
  - lowering a target or loosening a budget;
  - any new dependency.
- **Never:**
  - change the engine's or load model's numbers;
  - commit the profiling script or `productionBrowserSourceMaps`;
  - add retries.

## Success criteria

1. `random` 200 drags, pans and zooms at 35 fps or more, and `app` 200 plays back at 50 fps
   or more, on three suite runs in a row. The two `[canvas-render-scale]` tests are
   ordinary checks, and the suite has no expected failures. (Built: random 200's drag is
   held to 20 fps, agreed 2026-11-08; the rest as written.)
2. Designs with up to 20 realtime connections animate as before. Past 20, and with reduced
   motion, the dashes stay and don't move. `e2e/motion.spec.ts` checks both.
3. If the edges layer is kept, edges stay sharp after zooming in.
4. `npm test` passes, with the new tests added to the 1,840; both probes are byte-identical
   to `main`; `npx tsc --noEmit`, `npm run lint` and `npm run build` pass.
5. The capability map shows every module built, with `browser-stress`'s commit corrected.

## Results

Measured 2026-11-08 on a production build in Chrome, headless at 1440 × 900. The last three
full suite runs in a row each gave **22 passed** in 3.1–3.7 minutes, with no expected
failures. Two of them ran on a busy machine (imports 1.1 s against the usual 0.7).

| Case | Before | After, quiet machine | After, busy machine | Target |
|---|---|---|---|---|
| random 200, drag | 20–22 fps | 35–38 | 26–30 | **20** (agreed) |
| random 200, pan | 21–24 | 55–57 | 40–52 | 35 |
| random 200, zoom | 23–25 | 52–55 | 52 | 35 |
| random 200, idle | 21 | 60 | — | — |
| app 200, drag / pan / zoom | 38–45 / 52–54 / 60 | 40–49 / 48–54 / 60 | 41–43 / 38–40 / 60 | 35 |
| app 200 playback, 4× | 35–42 | 60 | 59–60 | 50 |

Setting `/simulate` to 1,000,000 requests on app 200 also got quicker, from 0.38–0.46 s
to 0.27–0.30 s.

**What each fix did:**
1. **Dashes stop past 20 realtime connections, and under reduced motion.** On random 200 this
   took idle from 21 to 60 fps and zoom from 20 to 57. The chat-app fixture and the BeUWI
   demo still animate, as `e2e/motion.spec.ts` and the browser pane showed.
2. **The edges layer, only while the view moves.** This took pan from about 32 to 55. It
   departs from the spec: a layer that's always on made Chrome draw the text and fine lines
   around it differently. That cost about 5% of a sharpness measure, for edges and for
   nodes alike, though the screenshots look identical; a 1 px blur costs 31%. So
   `design-canvas.tsx` sets `data-moving` on the canvas from `onMoveStart` to `onMoveEnd`,
   and only then do the edges get `will-change: transform`. At rest the canvas draws
   exactly as before. `/simulate` doesn't get it, since playback reached 60 without it.
3. **A drag re-renders only what changed.** `canvas-elements.ts` keeps each node's and
   edge's object, and the edge list itself, while their inputs are unchanged. Drag went
   from about 30 to 35–38 fps.
4. **One reduced-motion query,** instead of `matchMedia` in every edge on every render.
5. **Edges and nodes re-render only when what they show changes.** At most 6 edges and 6
   nodes change from one step to the next, out of 544. Playback went to 60 fps. A browser
   check found every playback position shows the same values whatever order it's reached
   in.
6. **Not needed:** moving edge styling out of React.

**Random 200's drag target.** The browser's own hit-testing and layer bookkeeping take about
11 ms of a drag frame, and React and React Flow about 10. That leaves little margin over
35 fps: two of three suite runs on a busy machine failed at 25–27. You chose a target of 20
over reworking how drags flow through the store. 20 still catches the moving dashes coming
back, which hold drag at 16–20 and pan at about 25.

**Measured and ruled out:**
- the design fingerprint behind "results are stale" (15 ms over a whole drag);
- hit-testing on edges (no change with `pointer-events: none`);
- a layer for the whole viewport (pan as good, drag worse).

**Mutation checks.** Each failed once with a planted fault and passed again after the undo:

| Fault | Failure |
|---|---|
| The realtime limit set to infinity | canvas: random 200's drag 20 fps (just under 20 unrounded), pan 25 against 35; motion: animations running |
| The original `FlowEdge` and `LoadNode`, re-rendering on every step | "playback: 29 fps against 50" |

**The rest:**
- **Probes:** both are byte-identical to `main`.
- **Unit tests:** `npm test` gives 1,861 passed: the 1,840 plus 21 new.
- **Checks:** `npx tsc --noEmit`, `npm run lint` and `npm run build` pass.
- **Untouched:** `src/lib/loadsim/`, `src/lib/simulation.ts`, `challenges/` and
  `tests/demos.test.ts`.
- **How it was built:** four subagents (two Haiku, two Sonnet) built Tasks 0–5 in parallel,
  each on its own files. All browser runs and measurements were done one at a time
  afterwards, and every change was reviewed. The review changed the edges layer (fix 2),
  added keeping the edge list (fix 3) and rewrote the sharpness test.

## Open questions

None. The dashes and reduced motion are your answers of 2026-11-08. Fix 6 comes back to you
only if fixes 4 and 5 don't reach 50 fps.
