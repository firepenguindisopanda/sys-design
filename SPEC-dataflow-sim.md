# Spec: load simulation page, slice 1 (saturation end to end)

Status: **approved** (2026-11-05):
- open question 1: option 1, realistic capacities with a per-feature database cost. Where a
  flaw only costs speed, the page shows a busier, slower design, not a failing one;
- open questions 2–7: as proposed.

Plan: [tasks/dataflow-sim/plan.md](tasks/dataflow-sim/plan.md). The modules and later slices are in
[CAPABILITY-MAP-dataflow-sim.md](CAPABILITY-MAP-dataflow-sim.md). This spec covers the first slice, three
module ids in one section each: `loadsim-model`, `brief-load` (for two pilot briefs) and
`loadsim-page`. Branch: `feat/dataflow-sim`, from `main` (`728839e`).

## Objective

Once a student has drawn and connected a design, the Run simulation results say whether it
meets the brief's targets. They don't show *how* the design behaves, though: where requests
go, how a load balancer splits them, and what happens when one component can't keep up.
Students should **see** the difference between a good design and a bad one:
- a single database saturating because there's no cache;
- requests split three ways across three instances;
- a client that can't reach the instance running its feature.

The page sends a large load (by default **100,000 requests**) through the design using
**its own load model with realistic capacities**. It plays the run back as an animation in
about 30 seconds, then summarises what happened. **It gives no pass/fail**, and the Run
simulation checks stay the only verdict.

Users: students in a challenge or the sandbox, after they've connected a design. TAs can use
it to demonstrate fixtures in class.

This slice covers **saturation only**. Queues and workers, slow work and cascades, failure
injection, autoscaling and file delivery come in later modules. The page lists what it
doesn't simulate yet for the design on screen.

## Change

### A. `loadsim-model`: the load model (pure, in `src/lib/loadsim/`)

**Scenario.** `{ requests, windowSeconds, shape }`, where `shape` is one of three:
- `steady`: an even rate;
- `ramp`: a linear rise from zero to a peak;
- `spike`: half the requests in the first quarter of the window, then an even rate. This is
  the "everyone arrives at 8:00" case.

Requests are split:
- **across features** in proportion to each feature's `targetRpm`;
- **evenly across client nodes**;
- **into reads and writes** by each feature's write share (B).

**Flow graph.** Built from the design (nodes, edges, placements):
- **Pools.** Compute nodes that share a load balancer form one pool of identical copies.
  Every instance serves every feature placed anywhere in the pool, and the balancer splits
  requests evenly among them. A compute node with no balancer in front is a pool of one.
- **Routes.** A request for feature F from client C goes to the pool that hosts F and that
  C can reach (directly or through a load balancer). If C can reach several such pools,
  the requests are split evenly. If C can reach none, the request fails as **no route**,
  naming the feature and the client.
  - Example: in `link-shortener/bad-no-load-balancer`, the phone reaches only Link API 1,
    which doesn't run Redirect, so the phone's redirects fail.
- **Data stages.** These apply only to features that store data (`storageGb > 0`):
  - **Reads:** if the pool has an edge to a cache, they go there first. Hits end at the
    cache, and misses go on to a database the pool is connected to. Without a cache, every
    read goes to the database.
  - **Writes:** they go to a database the pool is connected to.
  - **Several databases:** traffic is split evenly between them.
  - **No database:** the request ends at compute, with a note.
- **Ignored in this slice:** edges into or out of queues, workers, CDNs, static hosting,
  object storage and external APIs, plus push edges (SSE, Web Push). A client edge
  straight to a database or cache carries no requests either. Each one ignored for the
  current design is named in `notSimulated`.

**Capacities: a new, realistic table** (`capacities.ts`). These are starting figures for
small cloud instances. The calibration task (Tests, below) may tune them within the ranges
shown, and the final values are documented in the file.

| Component | Capacity (requests/s) | Time per request | Notes |
|---|---|---|---|
| Load balancer | 20,000 | 1 ms | |
| VM, PaaS | vCPUs × 1000 / compute ms × 0.7 | the feature's `computeMsPerRequest` | 0.7 is a utilisation ceiling (0.6–0.8). Fixed size in this slice |
| Functions, Edge | same formula, fixed size | same | Autoscaling comes in `loadsim-delivery` and is noted on the page |
| Cache (Redis) | 25,000 ops (10k–50k) | 1 ms | Hit ratio 0.9 (0.8–0.95) |
| Database, per shard | 2 vCPUs (assumed size) × 1000 / database ms × 0.7, per copy | the feature's database ms (B) | Writes go to the primary; reads spread over the primary and its replicas; requests spread evenly over shards |
| Network | 20 ms (desktop), 40 ms (mobile), 50 ms (IoT) from the client; 1 ms inside the system | | |

**Stepping.** The window is split into 600 equal steps. At each component, each step does
the following:
- adds what arrives;
- serves up to its capacity;
- carries the rest over as a backlog.

A request **times out** when it would wait more than **5 s** at one component (the client
gives up). So a component can hold at most `capacity × 5 s` waiting requests, and anything
beyond that fails there.

**Chained stages.** A request served at compute goes on to its data stage. A request that
fails anywhere counts as failed, against the component where it failed. In this slice,
stages don't push back on each other; that comes in `loadsim-cascades`.

**Latency.** A served request's latency is the sum of three parts:
- its network hops;
- the time per request at each stage;
- the wait at each stage, made of two parts:
  - **queueing,** which grows gradually with how busy the stage is, well before it
    saturates. With one server it's busy ÷ (1 − busy) × the time per request, so 1× at
    50%, 4× at 80% and 9× at 90%. More servers (vCPUs) wait less at the same utilisation
    (Sakasegawa's approximation; two vCPUs at 80% wait 1.8×). The formula stops growing at
    95% busy;
  - **the backlog,** once the stage is saturated (backlog divided by capacity).

  The queueing part was added after calibration on 2026-11-05, as option 1 of the latency
  discussion. It changes latency only: what's served, what fails and when a stage
  saturates don't change.

The model keeps a latency histogram weighted by volume, for p50 and p95.

**Output.** `simulateLoad(design, scenario)` returns a `LoadRun` in two parts:
- **`frames`** (600 of them): for each node, its arrival rate, served, failed, backlog and
  utilisation; for each edge, its rate.
- **`summary`**:
  - total, served and failed, with failures by component and reason (timed out, or no
    route);
  - p50 and p95 latency, and peak backlog per node;
  - the first component to saturate (utilisation ≥ 100%) and when;
  - `notSimulated` and `notes`.

The model is deterministic and takes up to 1,000,000 requests. Its cost depends on the
number of steps and nodes, not on the number of requests.

### B. `brief-load`: a default scenario in the brief

**A new optional `load` block in `brief.yaml`:**

```yaml
load:
  requests: 100000
  windowSeconds: 1200
  shape: spike
  features:            # by requirement id; each field optional
    browse-sections: { writeShare: 0, dbMs: 25 }
    enrol: { writeShare: 1, dbMs: 8 }
```

- `dbMs` is the database time one request costs. This is how a brief says that a query is
  heavy (a join over sections and enrolments) or light (a key lookup).
- **`dbMs` is always a realistic cost for that query.** It is never raised just to make a
  flaw show. So a key lookup stays at a few milliseconds, even if the brief's missing
  cache then shows only as a busier, slower database (decision on open question 1).
- **Defaults when a field is missing:**
  - `writeShare` is `writeRpm / targetRpm` if `writeRpm` is set, otherwise 0.2 for a
    feature that stores data, otherwise 0;
  - `dbMs` is 3 ms for reads and 8 ms for writes;
  - with no `load` block (the other 14 briefs, and the sandbox): 100,000 requests over
    1,200 s, `spike`.
- **Validator:** a `load` block naming an unknown requirement id, a share outside 0–1, or a
  non-positive number fails `npm run build` with the file and field, like every other
  brief field.
- **Pilots:** in this slice, only `link-shortener` and `course-registration` get a `load`
  block, calibrated as described under Tests.
- **Students can change** requests, window and shape on the page, not the per-feature
  figures.

### C. `loadsim-page`: the page

**Getting there:**
- **The button.** A "Simulate load" button sits in the editor's canvas toolbar, next to
  Export and Import. It writes the design to session storage, then moves to `/simulate`
  with a client-side transition.
  - The design is written in the design-file format: `exportDesignFile` writes it and
    `importDesignFile` reads it back.
  - Reusing the format means the hand-off is validated, and node positions travel with it.
- **Errors.** If the design can't be written (for example, two connections between the
  same pair of nodes), the button shows the same message Export would, and stays on the
  editor.
- **Reloading `/simulate`** rebuilds the design from session storage. `src/app/simulate/page.tsx`
  loads the briefs at build time like `page.tsx`, so a challenge design finds its brief. If
  there's nothing in storage, the page says so, with a link back.
- **"Back to design"** is a link to `/`. The editor's store lives for the whole tab, so the
  design is still there.

**Before a run, the page checks the design.** If no client is connected or no feature is
placed, it shows what's missing and a link back, instead of the canvas.

**Layout at 1024 px and wider:**
- a header with the brief title (or "Sandbox"), the page title and Back to design;
- the canvas, taking most of the width;
- a side panel with the scenario, playback and summary;
- the per-component table below the canvas.

Below 1024 px, the page shows a notice that it's best on a laptop.

**The canvas:**
- It's React Flow with the design's positions. Connecting, selecting and deleting are off.
- **Nodes can be dragged** to tidy the layout (the user's request on 2026-11-05: fixtures
  without saved positions load as one long row, with nodes over other nodes' edges).
  - The moves stay on this page: they're never sent back to the editor or the hand-off,
    and a reload of `/simulate` starts from the design's own positions.
  - Dragging is mouse-only. Nodes still aren't focusable, so screen readers get no
    move or delete hints.
- **Nodes** use the editor's kind colours and icons (`KIND_STYLES` is exported from
  `design-node.tsx`, with no other change there). Each one carries a gauge:
  - a utilisation bar, with the colour bands green < 70%, amber 70–99% and red when
    saturated;
  - the same state in words, for example "92% busy" or "Saturated · 1,204 failed", so
    colour is never the only signal.
- **Edges** use a new animated edge on the same smooth-step path as the editor:
  - dots move along the edge at a density proportional to its current rate, and the edge
    is thicker when busier;
  - a legend says how many requests one dot stands for (for example "• ≈ 200 requests"),
    chosen so the busiest edge shows at most about 12 dots;
  - failed requests show as red dots that stop at the node where they failed;
  - a load balancer's out-edges visibly carry equal streams.

**Scenario controls:**
- requests (1,000 to 1,000,000), window (60 s to 3,600 s) and shape;
- the brief's defaults are shown, with "Reset to brief default".
- A change re-runs the model at once (it takes well under 100 ms) and restarts playback.

**Playback:**
- Play/Pause, Restart, and speed (1×, 2× or 4×; 1× plays the whole window in 30 s).
- A scrubber with the simulated clock, for example "4:12 / 20:00". It's a range input with
  `aria-valuetext`.

**Summary**, always for the whole run:
- served, failed (with reasons) and p50/p95 latency;
- the first component to saturate, with a plain note. For example: "Registration DB
  saturated at 0:42: every section-list read reaches it. A cache in front would take most
  of them."
- if nothing saturates, the busiest component and its peak utilisation instead;
- a cache estimate for each database with no cache in front whose load is mostly reads,
  whatever the busiest component is. It comes from the same run and gives what the
  database would carry with the 0.9 hit ratio. For example: "Links DB peaked at 30% busy,
  mostly with Redirect reads. A cache in front would bring it to about 11%." This is how a
  flaw that costs speed and capacity, rather than causing failures, still shows.
  - In the link shortener, compute is busier than the database, so the estimate can't
    depend on the database being the busiest component (found while writing the Task 1
    tests).
- **Not simulated yet**, listing the parts of this design that this slice ignores. For
  example: "Seat claims (queue) and Seat allocator (worker): enrolments are sent straight
  to the database in this version."

**Per-component table:** peak utilisation, peak backlog, served, failed and the time it
first saturated. It's also the accessible alternative to the animation.

**Accessibility:**
- every control is named;
- under `prefers-reduced-motion` the dots don't move, and edges show their rate as text;
- a polite live region announces the first saturation and the end of playback;
- Lighthouse accessibility is 100 on `/simulate`.

**State:** the page's state (scenario, run, playback clock) lives in a store or hook local to
the page, never in the editor's store.

## Code

- **New `src/lib/loadsim/`:**
  - `types.ts` (Scenario, LoadRun, Frame, Summary);
  - `scenario.ts` (defaults from a brief or features, and the arrival curve);
  - `capacities.ts` (the table);
  - `graph.ts` (pools, routes, stages, `notSimulated`);
  - `model.ts` (`simulateLoad`);
  - `summary.ts` (the first saturation and the plain-language notes);
  - `handoff.ts` (`saveHandoff(state, storage)` and `loadHandoff(storage, briefs)`, built
    on `exportDesignFile` and `importDesignFile`, with storage passed in for tests).
- **Briefs:**
  - `src/lib/challenges/types.ts`: `Brief.load?: BriefLoad`;
  - `src/lib/challenges/validate.ts`: validate `load`;
  - `docs/challenges/brief-format.md`: document `load`;
  - the `link-shortener` and `course-registration` briefs: the `load` block.
- **New route:** `src/app/simulate/page.tsx` (Server Component: loads the briefs, renders the
  client app).
- **New `src/components/loadsim/`:**
  - `load-sim-app.tsx`, `sim-canvas.tsx`, `load-node.tsx` and `flow-edge.tsx`;
  - `scenario-controls.tsx`, `playback-bar.tsx`, `run-summary.tsx` and `node-stats-table.tsx`.
- **Editor:**
  - `design-canvas.tsx` gets the Simulate load button;
  - `design-node.tsx` exports `KIND_STYLES`.

  That's all in the editor.
- **Next.js:** before writing the route, read `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`
  and `04-linking-and-navigating.md`. `cacheComponents` is off, so pages unmount on
  navigation, and the editor's Zustand store (a module singleton) survives a client-side
  transition but not a reload. The hand-off covers the reload.
- **Animation:** one `requestAnimationFrame` clock for the page. Dots are SVG circles placed
  with `getPointAtLength` on each edge's path, and the total stays under about 300 on
  screen. No new dependencies.

## Tests (written first)

- **`scenario.test.ts`:**
  - each shape's arrivals add up to `requests`, and `spike` puts half of them in the
    first quarter;
  - the feature mix follows `targetRpm`, and clients share the traffic equally;
  - the default rules for `writeShare` and `dbMs`, and a brief's `load` overriding them.
- **`graph.test.ts`:**
  - `link-shortener/good` has one pool, {api-1, api-2}, serving both features;
  - three instances behind one balancer each get a third;
  - `bad-no-load-balancer` gives the phone's Redirect "no route";
  - reads go through the cache when the pool has a cache edge, writes skip it;
  - an unplaced feature is "no route";
  - each ignored part of a design (queue, worker, push edge, client to database) appears
    in `notSimulated`.
- **`model.test.ts`:**
  - served plus failed equals requests (within rounding) for every fixture of every
    brief;
  - two runs give identical output;
  - under capacity, nothing fails and latency equals the sum of the base times;
  - one component at twice its capacity has a backlog that grows, its first failures come
    once the wait passes 5 s, and it's named as first to saturate;
  - 1,000,000 requests take no longer than 1,000 (the cost depends on steps, not requests).
- **`tests/loadsim-pilots.test.ts`:** calibration, under each pilot brief's default
  scenario:
  - `link-shortener/good` and `course-registration/good` serve at least 99%, and their
    first saturation is none;
  - `course-registration/bad-no-cache` has its database as the first component to
    saturate, and at least 5% of requests fail;
  - `link-shortener/bad-no-cache` fails nothing (a key lookup is cheap, decision on open
    question 1). But its database's peak utilisation is at least 2× the good design's,
    its p50 is higher, and the summary gives the cache estimate.
    - **2× rather than 5×:** the draft said 5×. Link creations write to the primary
      either way, so with realistic costs the ratio comes to about 4×.
    - **p50 rather than p95:** the draft said p95. A cache miss pays for the cache and the
      database, so with realistic costs a cache speeds up typical answers (p50 54 against
      56 ms) but not the slowest (p95 58 against 56 ms). This was found in Task 4;
  - `link-shortener/bad-no-load-balancer` fails the phone's redirects as "no route";
  - other pilot fixtures need only conservation for now (their flaws belong to later
    modules: `bad-single-db-replica` to failures, `bad-direct-enrol` to queues).
- **Probe:** `LOADSIM_PROBE=1 npx vitest run tests/loadsim-probe.test.ts` prints every
  fixture's served, failed, p95 and first saturation, like the engine probe.
- **`handoff.test.ts`:**
  - each pilot fixture, and both demos, survive save then load with the same nodes,
    edges, positions and placements;
  - a challenge design comes back in its challenge;
  - empty or corrupt storage returns a message, not an exception.
- **`validate.test.ts`:** each bad `load` case fails with its path; a brief without `load`
  is unchanged.
- **Components** (static render, as the existing panel tests do):
  - the summary text, the "Not simulated yet" list and the per-component table;
  - every control has an accessible name;
  - with reduced motion, no moving dots are rendered.
- **Existing suites** stay green unchanged: the engine, fixtures, demos, calibration and
  probe numbers.

**Calibration comes first.** Task 1 of the plan is the model plus the probe on the two pilot
briefs. I'll stop and bring the numbers back before building the page if either of these
holds:
- no realistic `dbMs` for the section list (15–30 ms) and default scenario make
  `course-registration/good` serve at least 99% while its `bad-no-cache` saturates the
  database;
- the link shortener's two designs don't differ as described above.

## Browser check (Chrome DevTools, 1440×900 and 1280×800)

- **Link shortener:**
  - Import `good.yaml`, then Simulate load. Dots leave both clients and split evenly at
    the load balancer, and nothing turns red.
  - Then `bad-no-cache`: the Links DB carries every redirect read, so its gauge runs much
    higher than in the good design. Nothing fails. The summary gives its cache estimate,
    and the table agrees.
- **Course registration:** `bad-no-cache` saturates the Registration DB during the spike:
  its gauge turns red, and failed dots stop there. The "Not simulated yet" list names the
  queue and the worker.
- **Moving between pages:**
  - reloading `/simulate` keeps the design;
  - Back to design shows the editor with the design and results as they were, with no
    "Leave site?" prompt.
- **Controls:**
  - changing the scenario re-runs and restarts playback;
  - the scrubber and the speeds work.
- **Reduced motion** (emulated): no moving dots, and rates appear as text.
- **Lighthouse** accessibility is 100 on `/simulate`, and the editor stays at 100 in both
  modes.
- **Performance trace:** playback of the course-registration design stays near 60 fps, with
  no long tasks over 50 ms.
- The console has no new errors.

## Docs

- `docs/challenges/brief-format.md`: the `load` block.
- `README.md`: a short "Load simulation" section.
- `HANDOVER.md` (untracked).

## Boundaries

- **Always:**
  - the engine (`simulation.ts`, `reachability.ts`), its numbers, the fixtures, the
    demos, the editor store and the verification panel stay unchanged;
  - `src/lib/challenges/rules.ts` isn't touched (`staged-hints` is being specified on
    another branch);
  - tests, `tsc`, lint and build stay green;
  - Lighthouse stays at 100;
  - the editor's own bundle grows only by the button and the hand-off.
- **Ask first:**
  - changing the capacity ranges above;
  - adding fields to fixtures, or a `load` block to briefs other than the two pilots;
  - any editor change beyond the button (and restoring after a reload, if open question 3
    is approved);
  - a new dependency.
- **Never:**
  - a pass/fail verdict on the page;
  - randomness in the model;
  - changing a design from the simulation page.

## Success criteria

1. From a connected design, Simulate load opens `/simulate` with the same layout, and a
   reload keeps it.
2. 100,000 requests (or the brief's default) play back in about 30 s at 1×. Requests
   visibly split evenly across a load balancer's instances.
3. In both pilot briefs, the good design serves at least 99% with nothing saturated.
   Without a cache:
   - registration's database visibly saturates and requests fail;
   - the link shortener's database is visibly much busier, and the summary says what a
     cache would save.
4. A client with no route to its feature's instance shows those requests failing, with the
   reason.
5. The page lists what it doesn't simulate yet for the design on screen.
6. Every behaviour has a non-animated equivalent (text, the table, reduced motion).
   Lighthouse is 100.
7. All tests, `tsc`, lint and build pass; the engine and fixture results are unchanged.

## Open questions

1. ~~**Realistic capacities against campus-scale briefs.**~~ **Decided (2026-11-05):
   option 1.** Briefs mark realistically heavy queries with `dbMs`. Where a flaw is
   realistically fatal (registration's section list without a cache), the page shows
   failures. Where it only costs speed and capacity (the link shortener's key lookups),
   the page shows a busier, slower database and what a cache would save.
   - **Rejected:** bending figures until every brief's story plays out (unrealistic
     costs), and dropping the per-feature cost (missing caches would almost never show).
   - **Known consequence:** the page and the Run simulation checks can tell different
     stories (the checks fail `link-shortener/bad-no-cache` on throughput; the page shows
     it surviving). A reflection question about that gap could be added to a brief later,
     but only after asking first.
2. **The `load` block in slice 1.** Proposed for the two pilots only, with defaults
   elsewhere, and the other 14 briefs in `brief-load-rollout`. The alternative is derived
   defaults only in slice 1, but then question 1's lever isn't available.
3. **Restoring the editor after a reload.** If the student reloads `/simulate`, then goes
   back, the editor's store is fresh, and the design is gone from the editor (though not
   from the hand-off).
   - **Proposal:** when the editor would otherwise show its fresh starting state and this
     tab has a hand-off, it loads the hand-off design.
   - It's one more editor change, so it's your call.
4. **Default scenario.** 100,000 requests over 20 minutes with a spike, final values set by
   calibration. Or would you rather the default window always be shorter (for example
   10 minutes), with each brief's `dbMs` tuned to it?
5. **Autoscaling waits for `loadsim-delivery`.** Until then, PaaS, Functions and Edge run at
   their drawn size, and the page says autoscaling isn't simulated. That understates
   Functions in particular. Acceptable for slice 1?
6. **Clients share traffic equally.** Simple, but a brief may have one client doing most of
   the traffic. A per-client share could go in the `load` block later. Equal for now?
7. **Plan format.** The capability map plus this one spec for slice 1, then one combined plan
   and task list in `tasks/dataflow-sim/`, as before?
