# Implementation Plan: `dataflow-sim`, slice 1

Spec: [SPEC-dataflow-sim.md](../../SPEC-dataflow-sim.md) (approved 2026-11-05). Capability map:
[CAPABILITY-MAP-dataflow-sim.md](../../CAPABILITY-MAP-dataflow-sim.md). Task checklist: [todo.md](todo.md).
Branch: `feat/dataflow-sim`, from `main` (`e63410f`; `staged-hints` and the README media
are already in, and neither touches the files below beyond what's noted).

## Overview

- **`loadsim-model`:** a pure, deterministic fluid model in `src/lib/loadsim/`. It turns a
  design and a scenario into 600 frames and a summary.
- **`brief-load`:** an optional `load` block in the brief schema and validator, filled in for
  `link-shortener` and `course-registration` only.
- **`loadsim-page`:**
  - a new `/simulate` route, fed by a session-storage hand-off in the design-file format;
  - a read-only React Flow canvas with gauges and animated dots;
  - scenario and playback controls, a summary and a per-component table.
- **Editor:**
  - a Simulate load button;
  - exporting `KIND_STYLES`;
  - restoring the hand-off when the editor starts fresh (open question 3, approved): a
    small `isFreshStart()` in the store and an effect in `simulator-app.tsx`.

## Dependency graph

```
T1 tests: scenario, graph, model, handoff, validate `load`, pilots (failing)
        │
        ├────────────────────┬──────────────────────────┐
        ▼                    ▼                          ▼
T2 brief `load`:       T3 model: capacities,      T5 hand-off + editor:
   types, validator,      scenario, graph,           handoff.ts, isFreshStart,
   brief-format.md        model, summary             Simulate load button, restore
        │                    │                          │
        └─────────┬──────────┘                          │
                  ▼                                     │
T4 calibration gate: probe, pilot `load` blocks,        │
   tune within the spec's ranges ── stop if it fails    │
                  │                                     │
                  └──────────────┬──────────────────────┘
                                 ▼
T6 /simulate route and page shell: loading, missing-design states, header, Back to design
                                 │
                                 ▼
T7 canvas: LoadNode gauges, FlowEdge, dot animator, playback store, reduced motion
                                 │
                                 ▼
T8 side panel: scenario controls, playback bar, summary, per-component table, live region
                                 │
                                 ▼
T9 docs, full checks, browser checks, Lighthouse, performance trace
```

T2, T3 and T5 can go in any order after T1. Nothing on the page is built until T4 passes.

## Architecture decisions

### The model (`src/lib/loadsim/`)

- **One work-based formula for every station.**
  - Each station has a work budget in milliseconds per second: `units × 1000 × ceiling`.
  - Each kind of request costs some milliseconds of work there.
  - Utilisation is the work demanded divided by the budget.
  - This handles mixed features exactly, so there's no averaged compute time.

  | Station | Budget | Cost per request |
  |---|---|---|
  | Load balancer | 1000 ms/s | 0.05 ms (= 20,000 req/s) |
  | Compute instance | vCPUs × 1000 × 0.7 | the feature's `computeMsPerRequest` |
  | Cache | 1000 ms/s | 0.04 ms (= 25,000 ops/s) |
  | Database copy (one per shard × replicas; `replicas` counts every copy, as in the engine) | 2 × 1000 × 0.7 | the feature's `dbMs` (read or write) |

  The figures sit in `capacities.ts`, each with its spec range in a comment, as one exported
  object so tests and the probe can read them.
- **Flow classes.**
  - A class is (client, feature, read or write). Its volume comes from the arrival curve × the
    client's share (equal) × the feature's share (by `targetRpm`) × the read/write split.
  - Each class has a **path**: a list of steps `{ edgeId, nodeId, splits? }`. An even split
    (load balancer → members, pool → several databases, reads → database copies) is a step
    with several branches, each with a fraction.
  - The path is built once, in `graph.ts`.
- **Routing (`graph.ts`):**
  - **Neighbours** follow the edges as drawn, plus the reverse of two-way ones, the same
    rule as `outgoingNeighbours` in `reachability.ts`. `graph.ts` keeps its own copy, because
    each step needs the edge id for the animation. The model doesn't import
    `simulation.ts`.
  - **Pools:** a union-find over compute nodes that are targets of the same load balancer.
  - **Entries:** walking from a client through load balancers only, every first compute
    node reached is an entry. A load balancer is one entry, splitting evenly over its
    members, and a direct edge to a compute node sends everything to that instance.
  - A feature's class goes to the entries whose pool hosts the feature, split evenly. If
    there are none, it gets the outcome `no-route`, with the client and feature named.
  - **Data steps,** for features with `storageGb > 0`, per member and from its own edges:
    - **reads:** to a cache if the member has an edge to one (0.9 ends there, 0.1 goes
      on), then to a database it's connected to. The miss travels along the compute
      node's own edge to the database (cache aside), so the animation shows misses on
      that edge;
    - **writes:** straight to a database;
    - **several caches or databases:** split evenly;
    - **no database:** the path ends, with a note.
  - **Inside a database:** reads split evenly over the copies of each shard (the primary
    and its replicas), and writes go to the primary. Shards are split evenly.
- **Stepping (`model.ts`).**
  - The window is 600 equal steps of `dt = windowSeconds / 600`.
  - Stations are processed in topological order of the flow graph (clients, then load
    balancers, compute, caches, databases). It's a DAG by construction, since paths never
    revisit a node; a path that would cycle stops with a note.
  - **Per station, per step:**
    - `available` is the backlog plus arrivals, kept per class;
    - `serve = min(1, budget·dt / work(available))`, the same fraction for every class
      (fluid FIFO);
    - the unserved part becomes the new backlog;
    - anything above `capacity × 5 s` worth of work fails there (`timed-out`), taken in
      proportion from each class;
    - served volume moves to each class's next step in the **same step**, so a request
      crosses the system within one step; the waits come from the backlogs.
- **Latency.** For each class, each step:
  - its network time: one client round trip (20, 40 or 50 ms), plus 1 ms per internal hop;
  - plus each stage's cost;
  - plus each stage's wait: the backlog's (backlog work ÷ budget) plus queueing,
    `queueingFactor(utilisation, servers) × the station's mean time per request`.
    `queueingFactor` is Sakasegawa's multi-server approximation,
    `ρ^(√(2(c+1)) − 1) / (c(1 − ρ))`, with ρ capped at 0.95; with one server it's
    `ρ / (1 − ρ)`. Servers are vCPUs for compute, 2 for a database copy, and 1 for a load
    balancer or a cache.

  It's recorded in a volume-weighted histogram keyed by latency rounded to 0.1 ms, for p50
  and p95. A cache hit and a miss are separate entries, so misses show up in p95. This is
  an approximation (the wait in the step the volume finishes), noted in the code.
- **Saturation.** A station is saturated in a step when the work it was offered (backlog +
  arrivals) is more than its budget for the step. The first saturation is the earliest
  (step, node), with ties broken by node id.
- **Frames.** For each step:
  - **per node:** `{ arrivals, served, failed, backlog, utilisation }`, as request counts
    for the step (the page divides by `dtSeconds` for rates).
    `utilisation` is the busiest station in the node (for example, a database's primary);
  - **per edge:** `{ volume, failedShare }` (requests crossing it in the step). `failedShare` is the part of that edge's traffic
    that failed at its target in this step. It drives the red dots.
- **Determinism:** no `Math.random`, no `Date`, and every map is iterated in sorted id
  order.
- **The summary (`summary.ts`)** is computed from the frames:
  - totals, and failures by (node, reason), where the reason is `timed-out` or `no-route`;
  - p50 and p95;
  - peak backlog and peak utilisation per node;
  - the first saturation and its note;
  - otherwise, the busiest node (a short note: "App VM peaked at 50% busy.");
  - in `notes`, a cache estimate for every database with no cache in front whose peak work
    is mostly reads, whichever node is busiest. The estimate is that node's peak work with
    read cost × 0.1, over its budget.
- **Notes** come from a small table of templates by node kind (database, compute, load
  balancer), plus the cache estimate. They're all plain strings, so they're tested as text.
- **`notSimulated`** lists `{ id, text }` entries for:
  - queues, workers, CDNs, static hosting, object storage and external APIs in the design;
  - SSE and Web Push edges, and client edges to a database or cache;
  - PaaS, Functions and Edge nodes (no autoscaling yet);
  - features with `backgroundWorkMs`, `pollingRpm` or `fileRpm`.

### Brief `load` (`brief-load`)

- `types.ts`:
  - `BriefLoad = { requests?, windowSeconds?, shape?, features?: Record<string, { writeShare?, dbMs? }> }`;
  - `Brief.load?: BriefLoad`.
- `validate.ts`:
  - `load` is added to `validateBrief`'s allowed keys and read by a new `readLoad`;
  - **the checks:** integers within the spec's ranges, a `shape` that is one of the three,
    feature keys that are existing requirement ids, `writeShare` within 0–1, and
    `dbMs > 0`;
  - error paths look like `load.features.enrol.writeShare`.
- **Resolving the defaults** lives in `src/lib/loadsim/scenario.ts`, not in the validator:
  - `defaultScenario(brief | null)` and `featureLoads(features, brief | null)`;
  - the validator only checks the block;
  - so `rules.ts`, the engine and the store never see `load`.

### Hand-off and the editor

- **`handoff.ts`:**
  - `saveHandoff(state, storage)` calls `exportDesignFile(state)` and stores
    `{ text, fileName, briefId }` as JSON under `sesim:load-sim`. It returns `{ ok: true }`,
    or `{ error }` with Export's own message.
  - `loadHandoff(storage, briefs)` returns `{ loaded }`, `{ empty: true }` or `{ error }`,
    by way of `importDesignFile(text, fileName, briefs, briefId)`.
  - The storage is passed in, so the tests use a `Map`-backed stub.
- **Simulate load button** (`design-canvas.tsx`, in the toolbar after `<DesignIo>`):
  - it calls `saveHandoff(useSimulatorStore.getState(), sessionStorage)`;
  - on success, it navigates with `router.push("/simulate")` (`useRouter` from
    `next/navigation`; the T6 docs check confirms the API in this Next version);
  - on error, it shows the message in an alert next to the button, the way Import does.
- **`isFreshStart()`** (`store.ts`) is true when all of these hold:
  - `layoutVersion === 0`;
  - the store is in the sandbox;
  - there's no result;
  - the design's fingerprint equals the one the store was created with (kept in a module
    constant).

  So it's true only on a fresh page load before any change.
- **Restoring** (`simulator-app.tsx`): a mount effect checks `isFreshStart()`. If it holds and
  `loadHandoff` returns a design, it calls `loadDesign` (which raises `layoutVersion`, so it
  runs once). A design the student has touched is never replaced.
- **`KIND_STYLES`** becomes `export const` in `design-node.tsx`. That's the only change in that
  file.

### The page

- **`src/app/simulate/page.tsx`:** a Server Component that loads briefs the way `page.tsx`
  does and renders `<LoadSimApp briefs={…} />`. Its metadata title is "Load simulation".
- **`load-sim-app.tsx`** (client):
  - the first render shows "Loading design…", so prerendering and hydration agree;
  - a mount effect calls `loadHandoff`;
  - the possible states are `loading`, `empty`, `error`, `not-ready` (no connected client,
    or no placed feature, each named) and `ready`;
  - in `ready`, the scenario is in `useState` (starting from `defaultScenario`), and
    `run = useMemo(() => simulateLoad(...))`;
  - a notice shows below 1024 px.
- **Playback** is a tiny Zustand store local to the page (`playback.ts`):
  - it holds `{ step, playing, speed }`;
  - one `requestAnimationFrame` loop advances `step` (600 steps in 30 s at 1×);
  - a new `run` resets it to step 0 and playing.

  Nodes subscribe to their own frame values, so the nodes array isn't rebuilt each step.
- **Dots** are drawn imperatively, not as React state:
  - `FlowEdge` renders its smooth-step path (`getSmoothStepPath`) and a `<g>` of circles,
    and registers the path and group with `dot-animator.ts`;
  - the animator's loop sets each circle's position from `getPointAtLength`, with a count
    proportional to the edge's current rate (one dot per `run`-wide requests-per-dot) and
    red for the `failedShare` part;
  - it keeps a cap of about 300 circles on screen;
  - under `prefers-reduced-motion`, the animator doesn't start, and `FlowEdge` shows its
    rate as a label instead.
- **`LoadNode`:**
  - the kind icon and colours from `KIND_STYLES`, the label, and a utilisation bar with
    the spec's three bands;
  - a text line ("92% busy", "Saturated · 1,204 failed");
  - its name for screen readers includes that text.
- **Side panel:**
  - `scenario-controls.tsx`: number inputs with labels, a shape select, and "Reset to brief
    default";
  - `playback-bar.tsx`: Play/Pause, Restart, a speed group, and a range input with
    `aria-valuetext` "4:12 of 20:00";
  - `run-summary.tsx`: totals, first saturation or busiest, notes, and "Not simulated yet";
  - `node-stats-table.tsx`: a real `<table>` with a caption.
- **Live region:** one polite region in `load-sim-app.tsx`, which announces the first
  saturation when playback reaches it, and the end of playback.

## Task list

- [x] Task 1: Tests first (model, scenario, graph, hand-off, `load` validation, pilots)
- [x] Task 2: Brief `load` block: types, validator, docs
- [x] Task 3: The load model
- [x] Task 4: Calibration gate on the two pilot briefs
- [x] Task 5: Hand-off and the editor's button and restore
- [x] Task 6: `/simulate` route and page shell
- [x] Task 7: Canvas: gauges, animated edges, playback
- [x] Task 8: Side panel: scenario, playback, summary, table
- [x] Task 9: Docs, full checks, browser checks

### Checkpoints
- [x] After Task 4: the probe numbers for both pilots are recorded in `todo.md`. If the gate
  fails, stop and bring them to you.
- [x] After Task 9: all seven spec success criteria are met; ready for review (nothing
  committed until asked).

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| No realistic `dbMs` for the section list (15–30 ms) makes registration's good design survive while `bad-no-cache` saturates | High | The gate in T4, before any page work; stop and bring the numbers |
| The fluid model's latency approximation gives odd p95s (for example, a spike's wait counted in the wrong step) | Med | The model tests pin a hand-checked case: one station at twice capacity, its backlog growth and its p95. Notes say "about" |
| The page's animation is slow on lab machines (hundreds of SVG circles plus React Flow) | Med | Imperative dots, a cap of about 300 circles, nodes subscribing per id; performance trace in T9; reduced motion as a fallback |
| The hand-off format refuses designs the editor allows (two connections between one pair) | Low | Same message as Export; covered by a hand-off test |
| Restoring after a reload brings back the design last *simulated*, not later edits made before the reload | Low | The reload already warned ("Leave site?") about those edits; documented in the README section |
| `router.push` behaves differently in this Next version | Low | T6 reads `node_modules/next/dist/docs` (linking and navigating, `useRouter`) before the button is wired; the browser check covers it |
| The editor's results, hints or fingerprints change | Low | No store field is added apart from `isFreshStart` (a method); existing store, fixture, demo and design-file tests run unchanged |
| Bundle growth on `/` | Low | The page code is route-split; T9 compares `npm run build` route sizes before and after |
