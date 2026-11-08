# Implementation Plan: `canvas-render-scale`

Spec: [SPEC-canvas-render-scale.md](../../SPEC-canvas-render-scale.md) (approved 2026-11-08).
Capability map: [CAPABILITY-MAP-stress.md](../../CAPABILITY-MAP-stress.md). Task
checklist: [todo.md](todo.md). Branch: `perf/canvas-render-scale`, from `main` (`a35fe11`).

## Overview

- **Two independent tracks.** The editor (fixes 1–3) and `/simulate` (fixes 4–5) share no
  files, so either could go first. The editor goes first: its cause is measured, and the
  first fix alone is most of the gain.
- **One fix per task, measured.** After each fix, the case it serves runs three times with
  `BUDGETS=off`, and the numbers go into `todo.md`. A fix that doesn't pay is undone and
  noted.
- **A pin becomes an ordinary check** in the task that brings its case to target, not
  before.
- **Last:** three clean suite runs, mutation checks, probes, docs and the commit.

## Dependency graph

```
T0 baseline: probes, npm test count, how many edges and nodes change per playback step
        │
        ├──────────────────────────────┐
        ▼                              ▼
T1 dash motion (fix 1)          T4 cached reduced-motion query (fix 4)
        │                              │
        ▼                              ▼
T2 edges layer (fix 2)          T5 selective re-render (fix 5)
        │                              │
        ▼                              │   (fix 6 only with your OK)
T3 drag re-renders (fix 3)             │
        │                              │
        ▼                              │
Checkpoint: canvas at 35 fps           │
        │                              │
        └──────────────┬───────────────┘
                       ▼
     T6 three clean runs, mutation checks, probes, docs, commit
```

## Architecture decisions

### Fix 1: dash motion

- **The rule in one pure function,** beside `styleEdgeForProtocol` in `src/lib/edges.ts`:
  ```ts
  export const MAX_ANIMATED_EDGES = 20;
  export function animateRealtime(edges: readonly Edge[]): boolean
  ```
  It counts edges with `animated: true`.
- **The store keeps `animated` as it is,** and so do saved and exported designs. Only the
  canvas decides whether to show it: `design-canvas.tsx` sets
  `animated: e.animated && animate`. Import, export and the engine never see a change.
- **"Dashes stay, motion stops."** React Flow's CSS draws a dashed stroke and the
  `dashdraw` animation on `.react-flow__edge.animated path`. Dropping `animated` would
  drop the dashes too. So instead:
  - every realtime edge keeps `animated`;
  - the canvas adds a `still` class to each edge when the design is past 20;
  - `globals.css` stops the animation for `.react-flow__edge.animated.still path`;
  - the same `animation: none` goes under `prefers-reduced-motion: reduce`, beside the
    existing handle rule.

  The exact selectors are checked against `@xyflow/react/dist/style.css` before writing.

### Fix 2: the edges layer

- **One rule:** `.react-flow__edges { will-change: transform; }` in `globals.css`, scoped to
  the editor canvas if `/simulate` doesn't gain from it. That's measured in T2 too, since
  `/simulate` pans the same way.
- **Sharpness check in `e2e/motion.spec.ts`:**
  - zoom to the maximum on the BeUWI demo, after zooming in from the fitted view;
  - screenshot the edges region with the layer, then again with the layer cancelled by an
    injected `will-change: auto !important`;
  - compare the two in the page: draw both into a canvas and count the pixels that differ
    by more than a small tolerance.

  The check passes under 1% different pixels. No new dependency.

### Fix 3: drag re-renders only what changed

- **A pure helper,** `src/components/simulator/canvas-elements.ts`, that turns store nodes
  and edges into what React Flow gets. It holds a small cache:
  - **a node** keeps its previous output object when the store's node object and its
    selection are unchanged;
  - **an edge** keeps its previous output when the store's edge object, its two node
    labels, its selection and the `still` flag are unchanged;
  - **labels** come from a `Map` of node ids to labels, built once per call, instead of
    `nodes.find` for every edge.
- **`design-canvas.tsx` uses it through `useMemo` and a `useRef` cache.** A drag changes only
  the moved node's object in the store (`applyNodeChanges`). So every edge, and every other
  node, reaches React Flow as the same object, and React Flow's per-element memo holds.
- **Tested in node** (vitest runs in the node environment): same input, same objects;
  one node moved, only that node's object is new; a node renamed, only its edges' objects
  are new.

### Fix 4: one reduced-motion query

- `sim-context.ts` keeps one `MediaQueryList`, created on first use in the browser.
  `useReducedMotion`'s snapshot reads `.matches` from it instead of calling `matchMedia`
  again. Its subscribe function uses the same object. The server snapshot stays `false`.

### Fix 5: selective re-render

- **Each `FlowEdge` subscribes to the two numbers it draws:** this edge's volume and failed
  share at the current step. `usePlayback` gets a selector per number, so React skips the
  edge when neither changed.
- **Each `LoadNode` subscribes to what it shows:** utilisation, off, and its status at the
  step. `nodeStatusAt` is computed inside the selector, which returns a primitive or a small
  string key.
- **`onToggle`** is made stable per node (`useCallback` on `toggle` and `id`), so the
  memoised `LoadNodeBody` skips too.
- **What T0 finds decides how much this can win.** It counts how many edges and nodes
  actually change their shown values from one step to the next in `app` 200's run. If
  nearly all change on every step, fix 5 alone can't reach 50 fps. Then T5 brings fix 6
  (styling edges outside React) to you with the numbers.

### The pins

- When a case reaches its target, its `[canvas-render-scale]` test drops `test.fail()` and
  the owner prefix, and keeps `test.skip(!BUDGETS_ON)`.
- The case's `owner` field goes, so `random` 200's median frames gate again under
  `BUDGET.medianFrameMs` (50 ms).
- The comments with the old numbers are rewritten with the new ones.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Most edges' values change on every playback step | High: fix 5 can't reach 50 | T0 measures it before T5 is built; fix 6 is ready to bring to you. |
| The edges layer blurs after zooming | Medium | The sharpness check; drop the layer and bring pan back to you. |
| React Flow mutates or replaces the objects it's given, so the cache never hits | Medium | T3's unit tests cover the helper; T3 checks in the browser that a drag re-renders only the moved node's edges (React Flow's `data-id`s and a render counter, kept out of the commit). |
| Frame rates are noisy on this machine | Medium | Three runs per measurement; the finish needs three clean suite runs in a row. |
| Selecting per number changes when a component re-renders, and a frame shows stale values | Medium | The existing `flow-edge` and `load-node` tests; a browser check that served counts and edge widths still change during playback. |
| The `still` class misses the animated selector, so dashes still move | Low | `e2e/motion.spec.ts` counts running animations through `document.getAnimations()`. |

## Open questions

None. Fix 6 comes back to you only if T5's numbers say so.
