# Spec: Phase 2, step 1: score what is connected

Status: **implemented** (2026-10-27). Approved with the proposed answers to all three
open questions. One change from the plan: credit is tracked per node
(`creditedNodeIds`) rather than per kind, so a connected and an unconnected cache in
the same design are scored separately.
Builds on phase 1 ([SPEC.md](SPEC.md), [findings](docs/challenges/phase1-findings.md)).
Branch: `feat/engine-reachability`, from `feat/challenge-briefs-phase1`.
Plan: [tasks/reachability/plan.md](tasks/reachability/plan.md). Phase 1 tasks moved to `tasks/phase1/`.

## Objective

Phase 1 found four bad designs the engine scores as good. All four share one cause: the
engine gives credit for a component that is **on the canvas**, whether or not anything
is connected to it.

| Known gap | What the engine does today |
|---|---|
| `link-shortener/bad-gap-cache-unconnected` | An unconnected cache adds read capacity and the cache-aside latency bonus |
| `link-shortener/bad-gap-lb-unconnected` | An unconnected load balancer adds availability and silences the `topo-lb` warning |
| `link-shortener/bad-gap-no-edges` | A design with no edges at all passes every NFR |
| `chat-app/bad-gap-bus-unconnected` | An unconnected queue passes `topo-queue` and adds availability |

This step adds one helper that works out which nodes are on a **request path**, and
changes the engine to give credit only to components on that path. Success means the
four gap fixtures become ordinary passing tests, and every other fixture and both demo
designs keep their current results, apart from the changes listed below.

Users: students drawing designs (they can no longer game the score by dropping in
unconnected parts) and brief authors (the gap list in the suite goes to zero).

## Assumptions

1. **Request paths start at clients.** Roots are the client nodes (mobile, desktop,
   IoT). If a design has no client nodes, roots are the nodes with no incoming edges,
   the same rule `estimatePathLatency` already uses. This keeps client-less designs,
   such as the fan-in demo, working.
2. **Edges are followed in the direction drawn.** `websocket` and `webrtc` are followed
   both ways, matching how the engine already treats them for latency.
3. **A new check, `topo-reachable`, reports disconnection.** `topo-present` keeps its
   current meaning (the canvas isn't empty). The `bad-gap-no-edges` fixture's
   expectation changes from `topo-present` to `topo-reachable`; that is the only fixture
   expectation that changes.
4. **Only the four gap components change.** Load balancer, cache, queue, task worker and
   CDN credit become connection-aware. Database credit, compute counts and the
   scoring constants stay as they are. Findings 5 to 11 are later steps.
5. **The demos are data, not tests.** Both demos are expected to keep their current
   results. If one changes, that is reported, and the demo itself is only edited with
   your approval.

## What changes

### New: `src/lib/reachability.ts`

```ts
/** Ids of the nodes a request can start from: clients, or nodes with no incoming edges. */
export function requestRoots(nodes: SimNode[], edges: Edge[]): string[];

/** Ids of every node reachable from a root, roots included. */
export function reachableNodeIds(nodes: SimNode[], edges: Edge[]): Set<string>;
```

Breadth-first search from the roots; directed edges are followed source → target,
bidirectional protocols both ways; cycles are handled.

### Changed: `src/lib/simulation.ts`

`runVerification` computes the reachable set once and passes it to the estimators and
topology checks. A component **earns credit** only when:

| Component | Earns credit when |
|---|---|
| Load balancer | reachable, and has an edge to at least one compute node |
| Cache | reachable |
| Message queue | reachable, and has a consumer: an edge drawn out of it, or a bidirectional edge to another node (same traversal as reachability) |
| Task worker | reachable |
| CDN | reachable |

Where credit is used today, the "exists" test becomes "earns credit":

| Function or check | Today | After |
|---|---|---|
| `estimatePathLatency` | cache-aside bonus if any cache and any DB; static-hosting penalty unless any CDN | needs a credited cache; penalty unless a credited CDN |
| `estimateThroughputRpm` | every cache adds capacity; queue + worker bonus if both exist | only credited caches; bonus needs a credited queue and worker |
| `estimateAvailability` | LB, CDN and queue bonuses if they exist | only if credited |
| `topo-lb` | warns if ≥2 compute and no LB | warns if ≥2 compute and no credited LB |
| `topo-cdn` | warns if static hosting and no CDN | no credited CDN |
| `topo-cache` / `topo-cache-ok` | any cache | credited cache |
| `topo-queue` | passes if any queue exists | passes if a credited queue exists; **warns** if queues exist but none is credited ("not connected to a producer path and a consumer") |

New check `topo-reachable` (category `topology`), emitted whenever the canvas isn't empty:

- **fail** if a compute node with placed features isn't reachable: "No request path
  reaches Link API 1. Connect it to a client, directly or through a load balancer."
- otherwise **warn** if any other non-root node isn't reachable: "Link cache isn't on
  any request path, so it earns no credit."
- otherwise **pass**.

Unchanged: `hopLatencyMs`, every constant, cost, placement checks, and database and
compute credit.

## Expected results

**Gap fixtures** (`knownGap` lines removed; they become plain tests):

| Fixture | Expectation | Expected engine result after |
|---|---|---|
| `bad-gap-cache-unconnected` | fails `cache-on-read-path`, `nfr-throughput` | throughput 460 rpm (cache no longer counted) |
| `bad-gap-lb-unconnected` | fails `nfr-availability`; warns `topo-lb` | availability 98.5 %, as in `bad-no-load-balancer` |
| `bad-gap-no-edges` | fails `cache-on-read-path`, `topo-reachable` | compute unreachable from the clients |
| `bad-gap-bus-unconnected` | fails `fanout-publish`, `fanout-subscribe`; warns `topo-queue` | queue not credited |

**Good fixtures:** identical estimates and no new warnings.

| Brief | Latency / throughput / availability / cost |
|---|---|
| link-shortener | 31 ms / 1660 rpm / 99.9 % / $224 |
| chat-app | 50 ms / 1660 rpm / 99.95 % / $239 |
| file-storage | 43 ms / 1260 rpm / 99.95 % / $252 |
| notification-system | 75 ms / 1908 rpm / 99.95 % / $263 (keeps its two `topo-intermediate` warnings; finding 9) |

**Other bad fixtures:** still pass. They may gain a `topo-reachable` warning, which they
don't assert.

**Demos** (recorded today by running `runVerification` on each demo seed):

| Demo | Today | Expected after |
|---|---|---|
| BeUWI (`loadDemo`) | warn; 96 ms, 860 rpm, 99.8 %, $190; warns `topo-intermediate-static_hosting-5` | unchanged. Every node is reachable, and its "Upload events" queue counts as consumed through the two-way WebSocket to the IoT device. |
| Fan-in DB (`loadFanInDemo`) | fail; 20 ms, 520 rpm, 97.8 %, $710; warns `topo-lb`, `topo-cache`; fails availability and cost | unchanged (no clients, so the five VMs are the roots) |

## Commands

```bash
npm test
npx vitest run -t link-shortener        # one brief
PROBE=1 npx vitest run tests/probe.test.ts --reporter=verbose   # fixture estimates
npx tsc --noEmit
npm run lint
```

## Project structure

```
src/lib/reachability.ts          new: requestRoots, reachableNodeIds
src/lib/reachability.test.ts     new: unit tests
src/lib/simulation.ts            changed: credit rules, topo-queue warn, topo-reachable
src/lib/simulation.test.ts       new: one test per credit rule and for topo-reachable
tests/demos.test.ts              new: pins both demos' overall status and non-pass check ids
challenges/*/fixtures/bad-gap-*  knownGap removed; no-edges expectation updated
docs/challenges/brief-format.md  engine id table: topo-reachable, topo-queue warn
docs/challenges/phase1-findings.md  gaps 1 to 4 marked fixed in phase 2
```

## Code style

Match `simulation.ts`: plain functions, `type` aliases, private helpers, existing
naming (`hasLb` becomes a credited test rather than a new style).

```ts
const reach = reachableNodeIds(nodes, edges);
const credited = creditedKinds(nodes, edges, reach); // Set<ComponentKind>
const hasLb = credited.has("load_balancer");
```

## Testing strategy

- **Test first.** The four gap tests are already written and run as `it.fails`; remove
  each `knownGap` before fixing its cause, watch it fail, then make it pass.
- **Unit:** `reachability.test.ts` covers client roots, fallback roots, directed edges
  not reversed, bidirectional edges reversed, cycles, and an empty design.
  `simulation.test.ts` covers, with small hand-built designs: an LB with no edge to
  compute earns nothing; a queue with no consumer warns; an unconnected cache adds no
  throughput; `topo-reachable` fails, warns and passes in the three cases.
- **Regression:** all good fixtures keep the estimates in the table above (the probe
  shows them); `tests/demos.test.ts` pins both demos.

## Boundaries

- **Always:** keep `npm test`, `npx tsc --noEmit` and `npm run lint` green after each
  task; check the four good-fixture estimates after every engine change.
- **Ask first:** editing demo data in `store.ts` (for example, giving BeUWI's queue a
  consumer); changing any scoring constant; changing any fixture expectation other than
  the documented `topo-present` → `topo-reachable`; widening scope to database or
  compute credit.
- **Never:** change brief NFRs to absorb an engine change; weaken a bad fixture's
  expectations to make it pass; start findings 5 to 11 in this step.

## Success criteria

1. The four `bad-gap-*` fixtures pass as plain tests; the suite reports **0 expected
   failures**.
2. The four good fixtures pass with the estimates in the table above and no new warnings.
3. Every other bad fixture still passes, with no change to its expectation.
4. `tests/demos.test.ts` passes with both demos unchanged.
5. `reachability.test.ts` and `simulation.test.ts` cover the cases listed above.
6. `npm test`, `npx tsc --noEmit` and `npm run lint` are green.
7. `brief-format.md` and `phase1-findings.md` are updated.

## Open questions

1. **Queue consumers over WebSocket:** a two-way edge counts as a consumer, so BeUWI's
   IoT ↔ queue WebSocket keeps that queue credited. The stricter alternative (only
   edges drawn out of the queue) would make BeUWI warn and drop to 99.7 %. Proposal:
   two-way counts, for consistency with how reachability treats WebSockets.
2. **Load balancer rule:** "has an edge to at least one compute node" lets a load
   balancer in front of a single server count. Require two? Proposal: one, because
   `topo-lb` already warns separately about two or more compute nodes without a load
   balancer.
3. **Branch:** continue on `feat/challenge-briefs-phase1`, or start
   `feat/engine-reachability` from it? Proposal: a new branch, so phase 1 stays a clean
   unit.
