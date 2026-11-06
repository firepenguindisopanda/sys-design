# Capability Map: load simulation page

Status: **approved** (2026-11-05). Built so far:
- **Slice 1** (`5252cee`): `loadsim-model`, `loadsim-page` and `brief-load` for two pilot
  briefs, specified together in [SPEC-dataflow-sim.md](SPEC-dataflow-sim.md), with the
  plan and task notes in [tasks/dataflow-sim/](tasks/dataflow-sim/). The routing fix
  (`9aad70c`, [SPEC-loadsim-routing.md](SPEC-loadsim-routing.md)) followed.
- **`loadsim-queues`** (`93669c9`): [SPEC-loadsim-queues.md](SPEC-loadsim-queues.md) and
  [tasks/loadsim-queues/](tasks/loadsim-queues/). It added two more pilot briefs,
  `lab-autograder` and `lab-monitor`.
- **`loadsim-failures`** (`a844a4d`):
  [SPEC-loadsim-failures.md](SPEC-loadsim-failures.md) and
  [tasks/loadsim-failures/](tasks/loadsim-failures/).
- **`loadsim-cascades`** (`c7f8aca`):
  [SPEC-loadsim-cascades.md](SPEC-loadsim-cascades.md) and
  [tasks/loadsim-cascades/](tasks/loadsim-cascades/). Request slots, database
  connections, slow work and external calls inside the request, and answers over 5 s.
- **`brief-load-rollout`** (branch `feat/brief-load-rollout`), taken before
  `loadsim-delivery` so the reference designs look right now:
  [SPEC-brief-load-rollout.md](SPEC-brief-load-rollout.md) and
  [tasks/brief-load-rollout/](tasks/brief-load-rollout/). All sixteen briefs now have a
  calibrated `load` block. It added the per-feature `slowMs`, and the link checker's and
  video library's reference designs got more workers.

Each later module gets its own `SPEC-<module id>.md`. Next in the build order:
`loadsim-delivery`. Once it lands, these flawed designs should look different from their
reference designs under their brief's own load. Today they give the same numbers:
- **Files** through a CDN, static hosting and object storage:
  - `campus-food-guide`: `bad-no-cdn`, `bad-pages-from-api`;
  - `club-photo-wall`: `bad-no-cdn`, `bad-upload-through-api`;
  - `file-storage`: `bad-files-in-db`;
  - `lecture-video-library`: `bad-no-cdn`, `bad-video-in-db`.
- **Polling against push:**
  - `chat-app`: `bad-http-polling`;
  - `club-auction`: `bad-polling`;
  - `shuttle-tracker`: `bad-polling`.
- **Push going nowhere or the wrong way:**
  - `chat-app`: `bad-no-pubsub`, `bad-no-subscribers`, `bad-gap-bus-unconnected`;
  - `notification-system`: `bad-push-wrong-direction`;
  - `shuttle-tracker`: `bad-sse-wrong-direction`.
- **Autoscaling:** `textbook-price-watch`: `bad-always-on-vms`.

Each then gets a test in `tests/loadsim-briefs.test.ts`, as the rollout's flaws did.

## Goal

A student who has drawn and connected a design opens a **separate page** that sends a
large load through it, by default 100,000 requests, and plays the result back as an
animation. Requests leave the clients, pass through load balancers (split across the
instances behind them), compute, caches and databases. Good and bad designs behave
visibly differently: a component past its capacity backs up and drops requests, a queue
absorbs a spike, a killed node takes its traffic down or hands it to a replica, and slow
work backs up the tier in front of it.

The page uses **its own load model with realistic capacities**, separate from the static
engine behind Run simulation. It **shows what happened and gives no pass/fail**, so the two
never compete for the verdict.

## Decisions from the interview (2026-10-28)

| Question | Decision |
|---|---|
| Where it lives | A separate page (`/simulate`), not on the design canvas |
| Teaching goal | A separate load model, not an explanation of the engine's verdict |
| "100,000 requests" | A compressed replay: requests arrive over a simulated period, computed in one go, then played back in about 30 s |
| Capacities | New realistic figures, not the engine's campus heuristics |
| Realism against brief stories (2026-11-05) | Briefs mark realistically heavy queries with a per-feature database cost (`dbMs`), never raised to force a failure. A flaw that only costs speed shows as a busier, slower design, not a failing one |
| Who sets the load | The brief gives a default scenario, and the student can change it; in the sandbox it's derived from the features |
| Behaviours | Bottleneck saturation, a queue absorbing a spike, failure injection, slow work and cascades |
| Routing | Compute behind one load balancer is a pool of identical copies; the balancer splits requests evenly |
| Getting the design there | A "Simulate load" button in the editor opens the page in the same tab; a reload keeps the design |
| Moving nodes (2026-11-05) | Nodes can be dragged on the simulation page to tidy the layout. The moves stay on that page and never change the design |
| Verdict | None. The page reports what happened and names the first component to saturate |
| First slice | Saturation end to end |

## Modules

| Module id | Responsibility | Depends on |
|---|---|---|
| `loadsim-model` | Pure TypeScript in `src/lib/loadsim/`. It builds a flow graph from a design, made up of pools, routes per feature and the stages each request passes through. It generates arrivals from a scenario and steps a deterministic fluid model through time. The output is frames for playback and a summary. It holds no React code and makes no engine calls. | — |
| `brief-load` | An optional `load` block in `brief.yaml` with the default scenario and per-feature workload (write share, database time per request). It covers the validator, types and `brief-format.md`. | — |
| `loadsim-page` | The `/simulate` route and the hand-off from the editor through session storage, using the design-file format. It also has the canvas (nodes can be moved, nothing else edited) with animated edges and node gauges, scenario controls, playback controls, the summary and a per-component table. | `loadsim-model`, `brief-load` |
| `loadsim-queues` | Message queues and task workers: a queue's backlog grows during a spike and workers drain it later; writes handed to a worker reach the database at the workers' pace. | `loadsim-model`, `loadsim-page` |
| `loadsim-cascades` | Limits on concurrent requests (worker threads, database connections). Slow work done inside the request (`backgroundWorkMs`) and slow or rate-limited external APIs hold those slots, so the tier upstream backs up too. | `loadsim-queues` |
| `loadsim-failures` | The student kills a node, or brings it back, during playback. Traffic moves to the rest of a pool or to a replica; without one, the requests fail. Re-runs the model from that moment. | `loadsim-model`, `loadsim-page` |
| `loadsim-delivery` | Autoscaling for PaaS, Functions and Edge, with scale-up lag and cold starts. Files through CDN, static hosting and object storage (`fileRpm`), and polling against push (`pollingRpm`). | `loadsim-model` |
| `brief-load-rollout` | A calibrated `load` block for the other 14 briefs, one commit per brief, like the phase brief steps. Two were done in `loadsim-queues`; the other twelve were done before `loadsim-delivery`, with the flaws that need it recorded for later. | each behaviour module its briefs need |

Build order:

```
loadsim-model + brief-load (2 pilots) + loadsim-page   ← slice 1 (one spec)
  → loadsim-queues → loadsim-cascades
  → loadsim-failures            (can run alongside queues once slice 1 lands)
  → brief-load-rollout          (all twelve, before delivery: SPEC-brief-load-rollout.md)
  → loadsim-delivery            (then tests for the flaws it makes visible)
```

## Boundaries between modules

- `loadsim-model` is the only module that computes load numbers. The page only displays
  frames and the summary. Nothing in `src/lib/loadsim/` imports `simulation.ts`, and
  nothing in the engine imports `loadsim/`.
- The editor's only changes are the "Simulate load" button and, if approved, restoring a
  design from the hand-off after a reload. The editor store, the engine,
  `src/lib/challenges/rules.ts` and the verification panel stay as they are.
- Each behaviour module adds stages to the model and states, per pilot fixture, what
  becomes visible. Earlier pilot expectations stay as they are or get stronger.
- Briefs gain only the optional `load` block. Fixtures don't change, with one approved
  exception: in `brief-load-rollout`, the link checker's and video library's reference
  designs, and the flawed copies of them, got more workers so their queues drain at the
  work's realistic time. Their engine numbers changed only in cost, and every fixture's
  expectations still hold.

## Out of scope for all of it

- A pass/fail verdict or grading on the simulation page.
- Editing the design on the simulation page. Dragging nodes there only tidies that page's
  layout and is never saved to the design.
- Randomness. The model is deterministic, so the same design and scenario always give
  the same run.
- Saving runs, comparing two runs side by side, or exporting a video. These are candidates
  after the first slices.
