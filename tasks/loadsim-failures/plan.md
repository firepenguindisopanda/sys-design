# Implementation Plan: `loadsim-failures`

Spec: [SPEC-loadsim-failures.md](../../SPEC-loadsim-failures.md) (approved 2026-11-05).
Capability map: [CAPABILITY-MAP-dataflow-sim.md](../../CAPABILITY-MAP-dataflow-sim.md). Task
checklist: [todo.md](todo.md). Branch: `feat/loadsim-failures`, from `main` (`93669c9`).

## Overview

- **Outages module** (new `src/lib/loadsim/outages.ts`), pure functions:
  - validates a list of outages;
  - says, for any node at any time, whether it's up, whether its balancer still sends it
    requests, which database copy is primary, and a cache's hit ratio;
  - toggles an outage at a time (switch off, or bring back).
- **Model:**
  - down stations;
  - even splits worked out again each step, behind load balancers and over database
    copies;
  - a cache's hit ratio by time;
  - a `switched-off` failure;
  - a frame flag for nodes that are off.
- **Summary:** one record and one note per outage, and `failedWhileOff` per node.
- **Page:**
  - a power button on each node that can be switched off;
  - the page's outages state, cleared when the scenario changes;
  - playback that keeps its place when outages change;
  - an Outages list, the "Off since" gauge text, an announcement, and a table column.

## Dependency graph

```
T1 tests: outages module, model, pilots, page (failing)
        │
        ▼
T2 outages.ts: types, validation, state at a time, toggle
        │
        ▼
T3 model: down stations, dynamic splits, cache hit ratio, switched-off failures, frame flags
        │
        ▼
T4 summary: outage records and notes, failedWhileOff
        │
        ▼
T5 pilot gate: the spec's table under each pilot's default load ── stop and report if one fails
        │
        ▼
T6 page: power button, outages state, playback keeps its place, Outages list, gauges,
   announcement, table column
        │
        ▼
T7 docs, full checks, probe (unchanged without outages), browser, Lighthouse, re-run timing
```

## Architecture decisions

### Outages module (`outages.ts`)

- **Types:** `Outage = { nodeId: string; offAt: number; onAt: number | null }`, in seconds
  into the run. `LoadInput.outages?: Outage[]`; left out, it means none.
- **`SWITCHABLE`:** compute kinds, `database`, `cache` and `task_worker` (decision 1).
- **`validateOutages(nodes, outages)`** returns an error message or null. It checks:
  - the node exists and can be switched off;
  - `offAt ≥ 0`;
  - `onAt` is null or later than `offAt`;
  - one node's outages don't overlap.

  `simulateLoad` throws on an invalid list. The page only builds valid ones.
- **`FAILOVER`** in `capacities.ts` (decision 2):
  `{ healthCheckSeconds: 10, databaseFailoverSeconds: 30, cacheWarmUpSeconds: 30 }`.
- **State at a time:** `nodeState(outages, node, t)` returns:
  - `down`: inside an outage;
  - `routable` (compute): whether a balancer sends it requests. True while up, except
    for the health check after it comes back. Still true for the first 10 s after it
    goes down, because the balancer hasn't noticed;
  - `primaryCopy` (database): which copy takes writes. Copy 0 until 30 s after the first
    outage starts, then copy 1, and it stays there (the old primary rejoins as a
    replica). With one copy there's no failover;
  - `writesFail` (database): the 30 s before a replica takes over, or the whole outage
    with one copy;
  - `hitRatio` (cache): 0.9 normally, 0 while off, then climbing to 0.9 over 30 s after it
    comes back.
- **`toggleOutage(outages, nodeId, t)`**: if the node is off at `t`, it comes back at `t`
  and any later outage of that node is dropped. Otherwise it goes off at `t`, until the
  node's next outage starts (or the end). The list stays valid and sorted.

### Model (`model.ts`)

- **One state per node per step,** worked out before the loop, from the outages and
  `t = step × dt`. Steps after the window use the same times, so the drain sees the
  outages too.
- **Down stations:**
  - Compute instances, database copies and workers are down while their node is.
  - A request arriving at a down station fails at once, as `switched-off`.
  - Requests waiting there when it goes down fail too.
  - Jobs are exempt, as before: at a down worker or database copy they wait, and are
    never lost.
- **Splits behind load balancers:** each step, a balancer hop's children that are compute
  hops share its requests evenly over the ones that are `routable`. A child that's down
  but still routable, during the health check, gets its share and fails it. With no
  routable child, the balancer's requests fail as `switched-off` at the pool. Splits
  elsewhere (a client with edges to two instances, CDN and static hosting) don't change:
  nothing notices for them.
- **Database copies:**
  - Write hops get an entry for every copy of each shard (today only the primary), with
    fraction 0 except the current `primaryCopy`.
  - While `writesFail`, write requests fail as `switched-off` at the database. Job writes
    wait instead.
  - Read entries share their fraction over the copies that are up. With none up, reads
    fail.
  - The fractions are recomputed each step, only for hops at a database with an outage.
- **Caches:** a cache hop's miss fraction (its database child's fraction) and its
  remainder (the hits) follow `hitRatio(t)`. While the cache is off, the hop costs
  nothing and passes everything on to the database.
- **No outages:** none of this runs, and the frames are identical to today. A test
  compares a run without outages with one where every outage is on a node that gets no
  traffic.
- **Frames:** `NodeFrame` gains `off?: "routed" | "noticed"`. It's absent while up;
  `"routed"` while the balancer still sends it requests; `"noticed"` once it doesn't.
  Database and worker outages are always `"noticed"`.
- **Failures:** a new `FailureReason`, `"switched-off"`, grouped per node: "Failed at Lab
  API 1 while it was off." `NodeSummary.failedWhileOff` counts them.

### Summary (`summary.ts`)

- **`Summary.outages`:** one record per outage, in order:
  ```
  {
    nodeId, offAt, onAt,
    failedHere,       // switched-off failures at the node
    failedElsewhere,  // timeouts at other nodes inside the outage, beyond the same steps without it
    takeover,         // [{ nodeId, peakUtilisation }]
    note,
  }
  ```
  - **`failedElsewhere`** needs a baseline. When outages exist, `simulateLoad` also runs
    itself once without them and compares failures at other nodes over the same steps.
    That keeps the summary self-contained and testable, and doubles the work only when
    there are outages.
  - **`takeover`:** for an instance, the rest of its pool; for a cache, its databases;
    for a database, its other copies (by node); for a worker, its queue's peak waiting.
- **Notes, one template per kind:**
  - "Lab API 1 was off from 4:12 to 6:00. 140 requests failed before the load balancer
    noticed; then Lab API 2 took its share and peaked at 92% busy."
  - "Links DB was off from 2:00 to 3:00. Reads carried on from its replica; 312 writes
    failed in the 30 s before the replica took over."
  - "Links DB was off from 2:00 to 3:00. It had no replica, so 4,210 requests failed."
  - "Section cache was off from 2:00. Every read went to Registration DB, which peaked at
    140% busy; 2,900 requests timed out there."
  - "Sandbox workers were off from 40:00 to 50:00. Grading jobs grew to 610 waiting; no
    job was lost."

### Page (`src/components/loadsim/`)

- **`ReadyPage`** holds `outages` in state. The run's memo depends on it. The scenario's
  `onChange` clears it (decision 4).
- **Playback keeps its place:** a new store action, `resize(frameCount)`, keeps the
  position (clamped) and whether it's playing. `ReadyPage` calls `resize` after an outage
  change and `reset` after a scenario change, using a ref that records which changed.
- **Power button:** `SimContext` gains `outages` and `toggle(nodeId)`. `LoadNode` shows
  the button for nodes in `SWITCHABLE`:
  - a lucide `Power` icon, with the `nodrag` class so pressing it doesn't drag the node;
  - labelled "Switch off {label}" or "Bring back {label}";
  - it calls `toggleOutage` at the current playback time.
- **Gauge text:** `nodeStatusAt` reads `frame.off`: "Off · still getting requests" or
  "Off since 4:12". The gauge is grey while the node is off.
- **`OutageList`** (new): "Lab API 1: off 4:12, back 6:00", with a remove button per item
  ("Remove Lab API 1's outage at 4:12") and "Clear all". It's hidden when the list is
  empty.
- **Announcements:** `ReadyPage` sets the live region directly on a toggle: "Lab API 1
  switched off at 4:12." or "Lab API 1 back at 6:00." Playback's own announcements stay
  as they are.
- **Table:** a "Failed while off" column. The outage notes go first in the summary's
  notes list.

## Risks

| Risk | Mitigation |
|---|---|
| Dynamic fractions change results without outages | The dynamic code runs only for hops touched by an outage. A test checks a no-outage run against the baseline, and the probe diff in T7 must show no change |
| The baseline run doubles the work | Only with outages. Timing is checked in T7: a re-run with outages must take under 100 ms for the pilots |
| The 10 s health check is shorter than a step (2 s at 20 min, 6 s at 60 min) | Times are compared in seconds per step, so a 10 s window covers whole steps. A test pins the failed count to the steps it covers |
| Changing the database write entries from 1 to all copies changes rounding without outages | Fractions are 0 except the primary, so the sums are unchanged. Guarded by the probe diff |
| A power button inside a draggable node | The `nodrag` class, plus a test that the button has a name and is reachable by keyboard |
