# Implementation Plan: `loadsim-cascades`

Spec: [SPEC-loadsim-cascades.md](../../SPEC-loadsim-cascades.md) (approved and amended
2026-11-05). Capability map: [CAPABILITY-MAP-dataflow-sim.md](../../CAPABILITY-MAP-dataflow-sim.md).
Task checklist: [todo.md](todo.md). Branch: `feat/loadsim-cascades`, from `main` (`a844a4d`).

## Overview

- **Brief:**
  - `slowWork: cpu | wait` and `apiMs` per feature in the `load` block;
  - `lab-autograder` marks Submit solution as `cpu`.
- **Graph:** a compute step learns its inline slow work (a feature with `backgroundWorkMs`
  whose request didn't go to a queue) and its external call (`apiMs`, when the instance
  has an external API edge).
- **Model:**
  - compute stations admit requests under three budgets, CPU, slots and connections,
    and record which one binds;
  - holding times are smoothed;
  - answers over 5 s fail as `too-slow` at the instance holding them.
- **Summary:** the `too-slow` failure group, failures per feature at each instance, and a
  note per cascade.
- **Page:** the gauge's one format, the failure text, and the shorter "Not simulated yet"
  list.

## Dependency graph

```
T1 tests: brief fields, graph marks, model (slots, connections, cascade, inline, calls,
   too slow, steady holds), pilots, page (failing). Save the probe baseline first.
        │
        ├──────────────────────┐
        ▼                      ▼
T2 brief fields:          T3 graph: inline slow work and apiMs on compute steps,
   types, validator,         "Not simulated yet" updated
   featureLoads, docs,         │
   autograder block            │
        └──────────┬───────────┘
                   ▼
T4 model: CPU, slot and connection budgets, smoothed holds, binding limit, too-slow
                   │
                   ▼
T5 summary and probe gate: too-slow failures, per-feature failures, cascade notes;
   the probe diff, with every moved design given one of the spec's reasons
   ── stop and report on any unexplained move
                   │
                   ▼
T6 page: gauge format, failure text, Not simulated yet
                   │
                   ▼
T7 docs, full checks, browser (autograder bad-sync-grading for CPU, notifications
   bad-sync-delivery for slots), Lighthouse, timing
```

## Architecture decisions

### Graph (`graph.ts`, `types.ts`)

- **`PathStep` gains, on compute steps:**
  - `inlineSlowMs`: the feature's `backgroundWorkMs` when this request doesn't go to a
    queue;
  - `callsApi`: true when the instance has an edge to an external API.
- **What the model does with them:** whether the slow work costs CPU, and how long the
  call takes, come from the feature's load (`slowWork`, `apiMs`). A call happens only
  when both `callsApi` and `apiMs` are set.
- **"Not simulated yet":**
  - slow work is no longer listed: queued slow work is the queues module's, and inline
    slow work is this one's;
  - an external API stays listed unless some feature with `apiMs` calls it;
  - polling and files stay listed.

### Model (`model.ts`, `capacities.ts`)

- **`CAPACITY.instance`:** `{ slots: 80, connections: 10 }`, with the sources in comments
  (`holdSmoothingSteps` dropped in Task 4).
- **Costs at a compute hop:**
  - CPU stays `computeMsPerRequest`, plus `inlineSlowMs` when the feature's `slowWork`
    is `cpu`;
  - the base time adds `inlineSlowMs` (either kind) and `apiMs` (when called).
- **Three budgets per compute station each step:**
  - CPU: `vcpus × 1000 × 0.7 × dt`, as today;
  - slots: `80 × 1000 × dt` slot-ms. A request costs its **hold**: its time from
    arriving at the instance to its answer leaving;
  - connections: `10 × 1000 × dt` connection-ms. A database request costs its
    **database hold**: database time plus the wait there.

  The station serves `min(1, cpu budget ÷ CPU offered, slot budget ÷ slot offered,
  connection budget ÷ connection offered)` of what's offered (amended in Task 4: the
  connection limit applies only to database requests, as the spec says). That's Little's law in
  fluid form: at most slots ÷ hold requests a second. The smallest ratio is the binding
  limit, recorded as `frame.nodes[id].limit` (`"cpu" | "slots" | "connections"`), and
  set only while one binds.
- **Holds** (amended in Task 4; the smoothing below swung, see todo.md):
  - ~~Each step, after the latency pass, each compute hop's hold is worked out from its
    subtree, smoothed as the mean of the last 5 steps' values; step 0 uses the base time.~~
  - **Solved each step.** Each step runs the stations in front of compute first
    (balancers, CDNs), then solves admission, then runs the rest.
  - A compute hop's hold is its own time plus, for every hop below it on the request's
    path, path share × (base + wait). Its database hold counts only database hops.
  - The waits come from predicting each station below, using the station's own
    arithmetic: carried backlog, plus what the candidate admission sends it, plus last
    step's job arrivals there.
  - Each instance has two unknowns: a slot level for every request, and a connection
    level for database requests only. Each is found by a bracketed root search
    (Illinois), swept over the instances until none moves by more than 1e-9.
  - With nothing binding, one check confirms it and the arithmetic is unchanged.
  - Database requests that wait for a connection get that wait in their answer time.
    Their drop at the timeout only touches database requests.
- **Too slow:** in the latency pass, an answer whose cumulative time is over
  `timeoutSeconds × 1000` isn't served.
  - It fails as `too-slow`, against the hop's nearest compute ancestor, worked out in
    advance per hop.
  - Requests answered at a queue (jobs) are checked the same way: the client's wait
    ends at the queue.
  - Job completions never are.
- **Failures per feature per node:** timeouts and `too-slow` are also counted by feature
  at compute nodes, for the cascade notes.
- **Unchanged otherwise:** with no inline slow work, no `apiMs`, no slot or connection
  limit binding and no answer over 5 s, the arithmetic is exactly today's. The probe
  diff checks this.

### Summary (`summary.ts`)

- **`too-slow` group:** "Gave up on {instance}: answers took over 5 s."
- **Cascade notes**, one per instance whose `limit` was `slots` or `connections` for at
  least one step:
  - **slots:** "{instance} ran out of request slots at {m:ss}: {feature}'s {slow work or
    call} held them. Requests for {other features} timed out there too." The holder is
    the feature with the most slot time, and the closing sentence appears only when
    other features failed there;
  - **connections:** "{instance}'s database connections were all busy from {m:ss}, because
    {database} was saturated. {n} requests timed out there, not at the database." (Wording changed in Task 5: "at the API" was wrong for instances not called an API.) The
    database is the busiest database child, and the "because" clause appears only if it
    saturated.

### Page

- **`nodeStatus`** takes `limit`:
  - `"slots"` gives "Saturated · 80 of 80 slots";
  - `"connections"` gives "Waiting for a database connection";
  - `"cpu"` or none keep today's text;
  - failures are added as " · N failed" in every case.
- **The failure list** shows the `too-slow` group's text. Nothing else changes.

## Risks

| Risk | Mitigation |
|---|---|
| Hold feedback oscillates | 5-step smoothing, plus the steady-holds test (within 10% once settled). If it still swings, stop and report rather than tune numbers |
| The subtree hold is costly each step | Worked out once per step over hops in reverse depth order: one pass, the same cost as the latency pass |
| Limits bind in designs that were fine | The probe gate in T5: every move must match a reason in the spec. Any other move stops the work |
| "Too slow" changes 32 designs and some existing tests | Expected. Tests that pin those numbers (for example the 92.6% in `run-summary.test.tsx`) are updated with a comment pointing at this spec |
| Outages and baselines | The baseline run gets the same rules. The outages tests rerun unchanged, and the conservation tests cover both |
