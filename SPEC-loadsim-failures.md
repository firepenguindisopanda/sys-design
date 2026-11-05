# Spec: load simulation, switching components off (`loadsim-failures`)

Status: **approved** (2026-11-05). Open questions 1–4 are all as recommended:
1. compute instances, databases, caches and workers can be switched off; managed services
   can't;
2. failover is realistic: a 10 s health check, a 30 s database failover, and an immediate
   cache fallback;
3. a cache comes back empty and warms up over 30 s;
4. changing the scenario clears the outages.

The next module in [CAPABILITY-MAP-dataflow-sim.md](CAPABILITY-MAP-dataflow-sim.md), after
slice 1 ([SPEC-dataflow-sim.md](SPEC-dataflow-sim.md)), the routing fix
([SPEC-loadsim-routing.md](SPEC-loadsim-routing.md)) and queues
([SPEC-loadsim-queues.md](SPEC-loadsim-queues.md)). Branch: `feat/loadsim-failures`, from
`main` (`93669c9`).

## Objective

Several flaws that briefs teach are about what happens when one machine fails, and the
load page can't show them yet: a design with them serves the load just as well as the
reference design. Today these give the same result as their reference designs on the
load page:

| Fixture | The flaw | Today on the load page |
|---|---|---|
| `link-shortener/bad-single-db-replica` | one database copy | 100% served, like `good` |
| `course-registration/bad-single-db-replica` | one database copy | 100% served, like `good` |
| `link-shortener/bad-no-load-balancer` | an instance with no balancer to fail over | fails half its traffic already, but nothing shows what a balancer would do when an instance dies |

With this module, a student can **switch a component off** during playback, and later
**bring it back**, and see what the design does:
- **An instance behind a load balancer goes down:** for a few seconds the balancer keeps
  sending it requests, which fail. Then the balancer notices, and the other instances take
  its share, busier, perhaps too busy.
- **The primary copy of a database goes down:** writes fail until a replica takes over;
  reads carry on from the other copies. With only one copy, everything that needs the
  database fails until it's back.
- **A cache goes down:** every read goes to the database, which may saturate. When the
  cache comes back it starts empty, so the database stays busy until it warms up.
- **A worker goes down:** jobs pile up on its queue and wait. Nothing is lost, and the
  queue drains when the worker is back.

The page still gives no verdict. The same design, load and switch-offs always give the
same run.

## Change

### A. The model (`src/lib/loadsim/`)

**Input.** `LoadInput` gains `outages: Outage[]`, where `Outage = { nodeId, offAt, onAt }`
in seconds into the run (`onAt` null: off until the end). Outages on one node don't
overlap. With no outages, every run is exactly as today.

**What can be switched off** (open question 1): compute instances, databases, caches and
task workers. Load balancers, CDNs, static hosting, queues and external APIs are managed
services that run on many machines, so the page doesn't offer to switch them off.

**What "off" means for each** (timings in open question 2):

| Component | While off | Failover |
|---|---|---|
| Compute instance in a pool (behind a load balancer) | Requests that reach it fail. | After **10 s** (the balancer's health check), the balancer sends its share to the rest of the pool, split evenly. |
| Compute instance on its own | Requests that reach it fail. | None, until it's back. |
| Database | Its primary copy of each shard is off. Reads spread over the other copies. Writes fail. | After **30 s**, a replica becomes the primary and takes the writes. With `replicas: 1` there's no replica, so everything that reaches the database fails until it's back. |
| Cache | Reads skip it and go to the database. | Immediate: a cache client falls back on a refused connection. |
| Task worker | It takes no jobs. Jobs wait on its queue, or go to the queue's other workers. | None needed: jobs wait and are never lost. |

**When it comes back:**
- an instance rejoins its pool after one health check (10 s);
- a database's old primary rejoins as a replica, so writes stay where failover put them;
- a cache comes back **empty**, and its hit ratio climbs from 0 to 0.9 over **30 s**
  (open question 3);
- a worker starts taking jobs at once.

**Failures.** A new `FailureReason`, `"switched-off"`. A request that fails because a
component is off is counted against that component, for example "Failed at Lab API 1
while it was off." Requests waiting at a component when it goes off fail too.

**How the model does it.**
- Each station gets an up or down state per step from the outages.
- A path's even splits (balancer → pool members, reads → database copies) are worked out
  again at each step over the members that are up and noticed. The paths themselves don't
  change.
- At a down cache, the request carries on to the database with no hit.
- Because a run with the same outages is the same run, adding an outage at 4:12 means
  running the model again with it. Every frame before 4:12 comes out identical. The page
  then carries on playing from 4:12.

**Summary.**
- **`Summary.outages`:** one record per outage, with:
  - the requests that failed at the component;
  - any that failed elsewhere while it was off (for example, a database saturated by a
    dead cache);
  - which components took over and how busy they got.
- **A note per outage**, for example:
  - "Lab API 1 was off from 4:12 to 6:00. 140 requests failed before the load balancer
    noticed; then Lab API 2 took its share and peaked at 92% busy."
  - "Links DB was off from 2:00. It had no replica, so 4,210 requests failed."

### B. The page

- **Switching off:**
  - Each node that can be switched off gets a small power button, with the label "Switch
    off Lab API 1" or "Bring back Lab API 1".
  - Pressing it adds the outage at the current playback time. The model runs again, and
    playback carries on from that moment, playing if it was playing.
  - It's keyboard reachable and announced: "Lab API 1 switched off at 4:12."
- **A node that's off** shows "Off since 4:12" with a grey gauge. During the balancer's
  10 s, it reads "Off · still getting requests".
- **An "Outages" list** in the side panel shows each outage ("Lab API 1: off 4:12, back
  6:00"), with a button to remove it and "Clear all".
- **Changing the scenario clears the outages** (open question 4), because their times
  belong to the old run.
- **The summary** shows each outage's note under "What happened". The per-component table
  gains a "Failed while off" count.
- **Playback while switching:** the bar stays where it is. Only the frames from the
  outage on change.

### C. Briefs

No change. Students try switching things off themselves. A brief suggesting an outage to
try is a later idea.

## Pilot expectations (checked by tests)

Under each pilot's own default scenario:

| Fixture and outage | Expected |
|---|---|
| `link-shortener/good`, `api-1` off at 2:00, during the spike, for the rest | Requests fail at `api-1` for the 10 s health check. Then `api-2` alone needs 130% and saturates, and requests time out there: two instances at 65% can't cover for each other at the peak (N+1). *Changed in Task 3; the draft expected 99% served* |
| `link-shortener/good`, `api-1` off at 6:40, after the spike, for the rest | Requests fail at `api-1` for the 10 s health check only. `api-2` copes, and at least 99% are served |
| `link-shortener/bad-no-load-balancer`, `api-2` off at 2:00 for the rest | Every request that needs `api-2` fails until the end. Far more fail than in `good` |
| `link-shortener/good` and `bad-single-db-replica`, `db` off at 2:00 for 60 s | `good`: only writes fail, and only for the 30 s failover; reads carry on. `bad-single-db-replica`: everything that needs the database fails for the whole 60 s |
| `course-registration/good`, `cache` off at 2:00 for the rest | The database is far busier than with the cache. With registration's heavy section list, it saturates |
| `course-registration/good`, `cache` off at 2:00 and back at 4:00 | The database calms down over the 30 s after 4:00, not at once |
| `lab-autograder/good`, `sandbox` off at 40:00 and back at 50:00 | The queue grows while it's off and drains after. No job is lost: every job is done or still waiting |
| Any fixture with no outages | Identical to today, frame for frame |

## Tests (written first)

- **Model (new `outages.test.ts`):**
  - **health check:** a 2-instance pool with one instance off. Its requests fail for 10 s,
    then the other instance gets them all;
  - **no balancer:** a lone instance off fails its requests until it's back;
  - **database failover:** with 2 copies, reads carry on, and writes fail for 30 s then
    resume. With 1 copy, everything fails;
  - **cache:** off sends every read to the database; back means a 30 s warm-up;
  - **worker:** jobs wait and are never lost;
  - **backlog:** requests waiting at a component when it goes off fail;
  - **determinism:** frames before the outage are identical to a run without it;
  - **conservation:** still holds for requests and jobs with outages;
  - **validation:** overlapping outages and unknown nodes are rejected.
- **Pilots:** the table above.
- **Page:**
  - the power button's label and keyboard use;
  - the "Off since" gauge text;
  - the Outages list (remove and clear);
  - scenario changes clear outages;
  - playback carries on from the outage time;
  - the announcement;
  - the summary note and the table column.

## Boundaries

- **Unchanged:** the engine, the rules, the verification panel, the fixtures, and the
  editor. Outages live only on the load page, like dragged node positions, and aren't
  saved to the design.
- **Not in this module:**
  - partial failures (slow, not dead);
  - a whole zone going down;
  - switching off managed services;
  - outages a brief suggests;
  - random failures. Every outage is one the student chose.

## Success criteria

- The pilot expectations hold, and every existing load test still passes. A run with no
  outages is unchanged to the millisecond.
- Re-running with a new outage takes well under 100 ms for the pilots, so playback doesn't
  stall.
- All tests, `tsc`, lint and `next build` pass. Lighthouse on `/simulate` stays at 100, and
  playback stays at 60 fps.
- In the browser:
  - switching off `link-shortener/good`'s `api-1` mid-run shows red dots into it for a
    moment, then all dots go to `api-2`;
  - switching off `course-registration/good`'s cache makes the database saturate.

## Open questions

1. **What can be switched off?**
   - **Recommended:** compute instances, databases, caches and workers. Balancers, CDNs,
     static hosting, queues and external APIs are managed services built from many
     machines, so switching them off teaches something unrealistic.
   - The alternative is to allow every component, so students can find single points of
     failure such as one load balancer.
2. **Failover timings.**
   - **Recommended:** a 10 s health check, a 30 s database failover, and an immediate
     cache fallback. These are typical of managed cloud services.
   - The alternative is instant failover everywhere. It's simpler, but it hides the
     requests lost while a failure is detected.
3. **A cache that comes back.**
   - **Recommended:** it comes back empty and warms up over 30 s. A cold cache is a real
     lesson, because the database stays busy for a while after the cache returns.
   - The alternative is that it comes back full.
4. **Changing the scenario.**
   - **Recommended:** it clears the outages, because their times may not fit the new
     window.
   - The alternative is to keep the outages that still fall inside the new window.

## Results (2026-11-05)

Built on `feat/loadsim-failures` in seven tasks. The plan and task notes are in
[tasks/loadsim-failures/](tasks/loadsim-failures/).

- **Pilots** (all pilot tests pass, under each brief's default load):

  | Outage | On the load page |
  |---|---|
  | `link-shortener/good`, `api-1` off at 2:00 | 833 fail in the health check. Then `api-2` peaks at 130% and 5,964 time out: 93.2% served (the N+1 lesson; see Task 5) |
  | `link-shortener/good`, `api-1` off at 6:40 | Only the health check's 278 fail: 99.7% served |
  | `link-shortener/bad-single-db-replica`, `db` off 2:00–3:00 | "It had no replica, so 1,429 requests failed." `good` loses only the writes in the 30 s failover |
  | `course-registration/good`, cache off at 2:00 | The database peaks at 129% and 4,217 time out. Back at 4:00, it calms over the 30 s warm-up |
  | `lab-autograder/good`, workers off 40:00–50:00 | The queue grows to 800 waiting, and no job is lost |

- **Changed from the draft:** the first link-shortener row expected 99% served. With each
  instance at 65% in the spike, the survivor saturates. You chose to test both moments.
- **Added along the way** (each in the task notes):
  - a note for an instance nothing can take over from;
  - "was" or "were" by the label;
  - a lone instance is never shown as "still getting requests";
  - `LoadInput.baseline`, so the page reuses the run without outages instead of running
    the model twice.
- **Unchanged:** every run without outages gives identical probe output. Run simulation,
  the rules, the fixtures and the editor are untouched.
- **Checks:**
  - 1,296 tests pass, 2 skipped;
  - `tsc`, lint and `next build` are clean;
  - Lighthouse on `/simulate` is 100 for accessibility, best practices and SEO, with an
    outage in place and on a fresh load;
  - playback holds 60 fps (p95 frame 17 ms);
  - a switch-off re-runs in 55–90 ms in a production build;
  - there are no console errors or warnings.
- **For later:** with the cache off, the headline says "Registration DB saturated at 2:00.
  Add shards for writes, or replicas for reads." The outage note right below gives the
  real cause. The headline could point at the outage instead.
