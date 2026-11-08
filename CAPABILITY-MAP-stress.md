# Capability Map: stress and edge-case testing

Status: **all six modules built** (2026-11-08); `canvas-render-scale` is on its branch,
awaiting your review before it merges. The built ones:

| Module | Commit | What it does |
|---|---|---|
| `stress-harness` | `07f00a1` | A seeded design generator, an invariant checker and the stress suites: every fixture, both demos and generated designs keep every invariant (2,588 designs with `STRESS_SEEDS=2000`). Known bugs were pinned to the three fix modules. [Spec](SPEC-stress-harness.md), [tasks](tasks/stress-harness/). |
| `config-bounds` | `ed03bcf` | One table of limits for node config, shared by import, the store and the inspector. Import refuses out-of-range values and self-loops, and the saved `/simulate` design no longer crashes the page on reload. [Spec](SPEC-config-bounds.md), [tasks](tasks/config-bounds/). |
| `loadsim-route-scale` | `e396546` | The load model refuses designs past 2,000 route steps, or 40,000 ways tried, and `/simulate` shows a message instead of freezing. This was chosen over merging routes, which would have touched 79 of 88 fixtures (open question 1), and it no longer needs to land before `loadsim-delivery` (open question 2). [Spec](SPEC-loadsim-route-scale.md), [tasks](tasks/loadsim-route-scale/). |
| `engine-path-scale` | `136ff73` | The engine keeps its exact latency walk, but past 100,000 steps it uses a linear estimate and the latency check says so. This was chosen over the linear version alone, which differs on 32% of generated designs with cycles (open question 4). [Spec](SPEC-engine-path-scale.md), [tasks](tasks/engine-path-scale/). |
| `browser-stress` | `a35fe11` | Playwright on a production build in installed Chrome, `npm run test:browser`: 200-node designs on the canvas, `/simulate` at 1,000,000 requests, memory over ten cycles, the first click on Run, and bad saved designs. It found and fixed a real bug: a click on Run before React hydrated was lost (0 of 20 with late scripts, 20 of 20 after). Two frame-rate checks are pinned to `canvas-render-scale`. [Spec](SPEC-browser-stress.md), [tasks](tasks/browser-stress/). |
| `canvas-render-scale` | `perf/canvas-render-scale`, not yet merged | Smooth frames on large designs. Realtime dashes stop moving past 20 connections and under reduced motion, the edges get their own layer only while the view moves, a drag re-renders only what changed, and playback re-renders only edges and nodes whose values change. Random 200: idle 21 to 60 fps, pan and zoom about 20 to 52–57, drag 20–22 to 35–38 (its target agreed at 20, for busy machines). App 200 playback 35–42 to 60. Both pins are ordinary checks. [Spec](SPEC-canvas-render-scale.md), [tasks](tasks/canvas-render-scale/). |

**Where things stand:**
- **Pins:** the default suite and the `STRESS=1` size ladder have no expected failures
  left. The ladder gives 29 passed in 44 s.
- **Numbers:** every module kept the engine and load-model probes byte-identical to `main`.
- **Browser:** `npm run test:browser` gives 22 passed in 3.1–3.7 minutes, three runs in a
  row, with no expected failures left.
- **Next:** nothing on this map. Every module is built.

`engine-path-scale` was added on 2026-11-06, after the map was first approved. It came out
of specifying the harness, and you approved it with the harness spec.

## Goal

Find out how the simulator behaves with designs that are large, unusual or malformed, and
fix what breaks. The app has no backend, so "stress" here means the browser's own work: the
engine behind Run simulation, the load model behind `/simulate`, the design-file import, and
the canvas. Every check runs in vitest and works the same on each run (seeded generators, no
randomness between runs), except the last module, which runs in a real browser.

## What the probes found (2026-11-06)

Throwaway vitest probes against `main` at `c2b2baf`, deleted afterwards:

| Input | Engine (Run simulation) | Load model (`/simulate`) |
|---|---|---|
| Imported `replicas: 0` or `-1` on the link shortener's database | Imports; fails availability only | Imports; serves all 100,000 requests through a database with no copies |
| `replicas: 1.5` | Imports | Serves **103,175 of 100,000** requests |
| `replicas: .nan` | Imports; every NFR check fails with its generic message | Runs normally |
| `replicas: .inf` | Imports; passes availability | **Crashes the worker out of memory** |
| `replicas: 200` | 3 ms | 375 ms (about 5× the 2-replica design) |
| Stacked load balancers, fully connected layer to layer (4 per layer) | 3 → 10 ms at any depth | 3 layers 0.1 s, 4: 0.9 s, 5: 5.9 s, 6 (27 nodes): **36 s**, 7: over 75 s |
| A YAML "alias bomb" | Refused in 4 ms by the `yaml` library's alias limit | — |
| Random designs (any kinds, about 2 edges per node, 3 features) | 25–100 nodes: 1–50 ms. **200 nodes: never returned** (killed after 180 s) | 25–100 nodes: 20–95 ms; not reached at 200 |
| All 86 fixtures and 300 random 2–13 node designs, every invariant below | All hold | All hold, with outages too |

- **Why config breaks.** `checkConfigShape` (`src/lib/challenges/validate.ts:113`) checks
  only `typeof`, while the node inspector limits replicas to 1–8. An empty number field in
  the inspector also gives 0 (`Number("")`, `node-inspector.tsx:143`).
- **Why the load model slows down.** `routeFrom` (`src/lib/loadsim/graph.ts:240`) follows
  every path through load balancers, CDNs and static hosting, so the time grows with the
  number of paths, not the number of nodes.
- **Why the engine hangs (found while specifying the harness).** `estimatePathLatency`
  (`src/lib/simulation.ts:183`) finds the longest chain of hops by walking every simple
  path from each client. WebSocket and WebRTC edges add a reverse hop, so a dense design
  has a huge number of paths. Run simulation would freeze the editor tab the same way.
- **The bad design sticks.** It is saved in the tab's session storage on the way to
  `/simulate`, so reloading the page would hit the `.inf` crash again. This hasn't been
  checked in a browser yet.
- **Counts aren't whole numbers.** Served counts come back as fractions, e.g.
  `100000.0000000067`, so the invariants need a small tolerance.

## Decisions (2026-11-06)

| Question | Decision |
|---|---|
| Test or fix the bugs found | Both. The harness comes first, with each known bug pinned as an expected failure that names the module that fixes it. Each fix then turns its expected failures into passes. |
| Browser stress runs | A later module, specced only after the vitest modules land |
| Where tests live | `tests/stress-*.test.ts`; generators in `src/test/`, beside `loadsim-designs.ts` |

## Modules

| Module id | Responsibility | Depends on |
|---|---|---|
| `stress-harness` | A seeded generator of designs (any size, random kinds, cycles, self-loops, two-way pairs, unconnected parts, out-of-range config). Invariants checked on every generated design and every fixture, for both the engine and the load model: no throw, every number finite, served + failed = sent, utilisation ≥ 0, same input gives the same output, and export → import gives the same results. A size ladder with a time budget per size. Hand-written import edge cases. Known bugs are pinned with `it.fails`. Tests only: no product code changes. | — |
| `config-bounds` | One set of limits for each numeric node config field (whole number or not, minimum, maximum), shared by the design-file validator, the store and the inspector. An out-of-range imported file is refused with the file-and-path message. An empty or invalid inspector field leaves the value unchanged. Turns the harness's config `it.fails` into passes. | `stress-harness` |
| `loadsim-route-scale` | The load model's time grows with nodes and edges, not paths, so a design of 50 or more nodes simulates within the harness's budget. Every current load-model number stays the same: `tests/loadsim-unchanged-baseline.json`, the graph snapshots, and every brief's calibration. The spec chooses how (open question 1). | `stress-harness` |
| `engine-path-scale` | The engine's latency estimate takes time that grows with nodes and edges, not paths, so Run simulation on a 200-node design answers within the harness's budget. Both demos, every fixture's expectations and every good design's probe numbers stay the same. | `stress-harness` |
| `browser-stress` | Playwright on a production build: a 200-node design imported, dragged and checked; `/simulate` at 1,000,000 requests; frame rate, long tasks and memory measured; the first-click-on-Run flake reproduced or ruled out; reloading `/simulate` with a bad saved design. | `config-bounds`, `loadsim-route-scale`, `engine-path-scale` |
| `canvas-render-scale` | Smooth frames on large designs. The dense `random` 200-node design drags, pans and zooms at 22–25 fps, against 40–60 fps for the app-shaped one, despite a similar number of edges (395 against 344). `/simulate` playback of the app-shaped design runs at 31–41 fps, against the demo's 60. Find what each frame costs and bring both up to their pins' targets (35 fps on the canvas, 50 in playback), which turns the two `[canvas-render-scale]` pins in `e2e/` into ordinary checks. Not yet specced. | `browser-stress` |

**Build order:** `stress-harness` → `config-bounds`, `loadsim-route-scale`,
`engine-path-scale` (independent of each other, any order) → `browser-stress` →
`canvas-render-scale`.

`canvas-render-scale` was added on 2026-11-07, from what `browser-stress` measured; you
chose to pin both cases rather than loosen their budgets.

Each module gets its own `SPEC-<module id>.md` and `tasks/<module id>/`, and runs on its own
branch, as before.

## Open questions

1. **How `loadsim-route-scale` fixes the slowdown.** Either merge flows where paths meet
   (keeps every number, but changes how the model holds routes), or put a cap on routes with
   a clear message ("too many routes to simulate"). A cap is cheaper but leaves a limit
   students can hit. To be settled in that module's spec, after reading `model.ts`'s use of
   the route tree.
2. **Order against `loadsim-delivery`.** That module, next in the load page's map, also
   changes `graph.ts` and `model.ts`. Should `loadsim-route-scale` land before it, to avoid
   building delivery on the slow routing?
3. **Files exported before `config-bounds`.** An exported file with out-of-range values
   would now be refused on import. No such files are known (the inspector never allowed
   them), so the proposal is to refuse them with the usual message and add no migration.
4. **How `engine-path-scale` fixes the hang.** The longest simple path in a graph with
   cycles has no fast exact answer. One option is to collapse each cycle into one step and
   take the longest path over what's left. That is fast, and it gives the same answer
   whenever the request paths have no cycles; how many fixtures have cycles hasn't been
   checked. The other option is to cap the search and say so. This would be settled in that
   module's spec, with the probe run before and after.
