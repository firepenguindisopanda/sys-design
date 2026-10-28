# Writing a design challenge

A challenge is a folder under `challenges/` holding one brief and a set of fixtures:

```
challenges/<id>/
  brief.yaml            the scenario: requirements, targets, rules, questions
  fixtures/
    good.yaml           a design that should pass
    bad-<flaw>.yaml     designs that should fail, one flaw each (at least three)
```

`npm test` loads every challenge, validates it, and runs every fixture through the
simulator's verification engine (`runVerification`) plus the brief's own rules. A typo in
a kind, protocol, id or field fails the run with the file and field, for example:

```
challenges/chat-app/brief.yaml: rules[2].to: unknown kind "databse"
```

The four existing briefs are working examples. `link-shortener` is the simplest to copy.

## brief.yaml

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Lowercase kebab-case; must match the folder name |
| `title` | yes | Short name shown to students |
| `tagline` | yes | One line describing the system |
| `source` | yes | Where the scenario came from. Always fill this in |
| `summary` | yes | The scenario: who uses it, the journeys, and "the hard part" |
| `outOfScope` | no | List of things the student should not design |
| `functionalRequirements` | yes | At least one; see below |
| `nfr` | yes | Targets the design is checked against; see below |
| `rules` | no | Scenario-specific checks; see below |
| `reflection` | no | Questions for the student. Shown, never graded |

### functionalRequirements

Each requirement becomes one feature block the student places on compute.

```yaml
functionalRequirements:
  - id: redirect                 # kebab-case, unique in the brief
    text: Anyone opening a short link is redirected to its long URL.
    feature:
      name: Redirect
      description: Look up the code and answer with an HTTP redirect.   # optional
      resources: { memoryGb: 1, vcpus: 1, storageGb: 1 }  # what the feature needs on its node;
                                 # storageGb > 0 also means "keeps data" (see topo-data-store),
                                 # so set it to 0 for a stateless feature
      targetRpm: 1200            # peak requests per minute
      computeMsPerRequest: 10    # CPU time per request; drives the throughput estimate
```

### nfr

```yaml
nfr:
  maxLatencyMs: 120         # critical-path latency estimate must be at most this
  minThroughputRpm: 1300    # capacity must reach max(this, sum of targetRpm)
  minAvailabilityPct: 99.9  # 0 to 100
  maxMonthlyCostUsd: 275    # optional; leave out for no budget
```

Use **course-scale** numbers. The engine is a teaching heuristic: a database is worth
about 400 req/min per shard, so real-world figures (100k req/s) fail every design.
Calibrate against your good design (see "Calibrating" below).

### rules

Rules check things the generic engine can't know about the scenario. Each rule has an
`id` (kebab-case, unique, and not starting with `placement-`, `topo-` or `nfr-`, which
belong to the engine), a `title` (a short phrase in sentence case, at most about 40
characters, shown to students as the name of the verification row), a `severity`
(`fail` or `warn`) and a `why` sentence the student sees when the rule isn't met.

**Component rule:** at least `min` nodes of a kind, each meeting `minConfig`.

```yaml
- id: db-replicas
  title: Replicated database
  type: component
  kind: database          # a kind or a group
  min: 1                  # optional, default 1
  minConfig: { replicas: 2 }   # optional; numeric config fields, compared with >=
  severity: fail
  why: One database copy is a single point of failure.
```

**Edge rule:** a connection that must exist (`required`) or must not (`forbidden`).

```yaml
- id: realtime-websocket
  title: Clients connect over WebSocket
  type: edge
  mode: required          # required | forbidden
  from: client            # a kind, a group, or a list of them
  to: [compute, load_balancer]
  protocols: [websocket]  # optional; any protocol if left out
  severity: fail
  why: Messages must be pushed to clients as they arrive.
```

- Rules look at **single edges**, not paths. If the real path runs through a load
  balancer, list it as an allowed endpoint, as above.
- `websocket` and `webrtc` are two-way, so they match in either direction. Every other
  protocol matches only in the direction it was drawn.
- `minConfig` can only check numbers. String settings such as a queue's `mode` can't be
  checked; check the connections that setting implies instead.

**Kinds:** `mobile`, `desktop`, `iot`, `vm`, `paas`, `functions`, `edge`, `database`,
`cache`, `object_storage`, `message_queue`, `task_worker`, `load_balancer`,
`static_hosting`, `cdn`, `external_api`.

**Groups:** `client` (mobile, desktop, iot) and `compute` (vm, paas, functions, edge).

**Protocols:** `http`, `websocket`, `sse`, `web_push`, `db`, `webrtc`.

## Fixtures

A fixture is a design written in a few lines, plus what should happen to it.

```yaml
description: >-
  Good design without the cache. Every redirect hits the database.
design:
  nodes:
    - { id: phone, kind: mobile, label: Student phone }     # label optional
    - { id: lb, kind: load_balancer }
    - { id: api-1, kind: paas }
    - { id: db, kind: database, config: { replicas: 2 } }   # config optional
  edges:
    - phone -> lb : http
    - lb -> api-1 : http
    - api-1 -> db : db
  placements:                 # requirement id → compute node id
    create-link: api-1
    redirect: api-1
expect:
  fails: [cache-on-read-path, nfr-throughput]
  warns: [topo-cache]
knownGap: null                # or a sentence; see below
```

- **Nodes.** `config` is merged over the component's defaults from the catalog. Only
  fields the kind already has are allowed, with the same type; nested fields merge too,
  so `config: { capacity: { vcpus: 8 } }` keeps the default memory and storage.
  Enum-like fields are checked: database `engine` (relational, document, graph,
  vector), cache `engine` (redis, memcached) and queue `mode` (queue, pubsub).
- **`purpose` and `at`** (both optional) are what the canvas shows and where: a short
  phrase replacing the catalog's purpose, and the position as `at: [x, y]` in pixels.
  Without `at` nodes are laid out on a grid of four per row. Hand-written fixtures can
  leave both out; designs exported from the canvas include them.
- **Edges.** `source -> target : protocol`, written unquoted as above. Each edge gets the
  id `source->target`, so one pair of nodes can have only one edge.
- **Placements.** Features can only be placed on compute nodes. A requirement left out
  of `placements` is unplaced, which the engine reports as a failure.

### expect

- `pass: true` means no engine check and no rule may have status `fail`. Warnings are
  allowed.
- `fails` and `warns` list engine check ids or rule ids that must have exactly that
  status. Ids you don't list aren't checked, so a bad fixture names only the checks its
  one flaw should trip.

### Engine check ids

These are the ids `runVerification` reports. Ids ending in `<node>` or `<edge>` use the
fixture's own node ids or `source->target` edge ids, e.g. `placement-overflow-api-1` or
`topo-sse-dir-phone->worker`.

| Id | Status when triggered | Meaning |
|---|---|---|
| `placement-empty` | fail | No feature blocks at all |
| `placement-unplaced` | fail | Some feature isn't placed on compute |
| `placement-overflow-<node>` | fail | Features on that node exceed its capacity |
| `placement-ok` | pass | Every feature fits |
| `topo-empty` | fail | The canvas is empty |
| `topo-present` | pass | Reports the component and connection counts |
| `topo-reachable` | pass/warn/fail | **fail** if a compute node hosting features isn't on any request path; **warn**, naming them, if other components aren't |
| `topo-db-no-compute` | warn | A database but no compute at all |
| `topo-data-store` | pass/fail | **fail** if a placed feature has `storageGb > 0` and no database or object storage is on a request path; only reported when a feature is placed |
| `topo-intermediate-<node>` | warn | A non-compute node has edges both in and out (exempt: load balancers, CDNs, queues, caches, task workers, and client devices) |
| `topo-lb` | warn | Two or more compute nodes and no connected load balancer |
| `topo-cdn` | warn | Static hosting without a connected CDN |
| `topo-cache` | warn | A database without a connected cache (`topo-cache-ok` passes otherwise) |
| `topo-queue` | pass/warn | **pass** if a queue is on a request path and has a consumer; **warn** if queues exist but none is wired up |
| `topo-api-keys-<edge>` | warn | A client-like node talks to an external API |
| `topo-client-data-<edge>` | warn | A client-side node (mobile, desktop, IoT, static hosting, CDN) is wired straight to a database or cache, either direction |
| `topo-sse-dir-<edge>` | warn | An SSE or Web Push edge isn't drawn server → client |
| `nfr-latency` | pass/fail | Estimated critical-path latency against `maxLatencyMs` |
| `nfr-throughput` | pass/fail | Estimated capacity against the throughput target |
| `nfr-availability` | pass/fail | Estimated availability against `minAvailabilityPct` |
| `nfr-cost` | pass/fail | Estimated monthly cost against `maxMonthlyCostUsd` (only if set) |

### Only connected components count

The engine gives credit (capacity, latency and availability bonuses, and passing
topology checks) only to components on a **request path**: reachable by following edges
from a client node, or, in a design with no clients, from the nodes with no incoming
edges. Edges are followed in the direction drawn; `websocket` and `webrtc` are followed
both ways. On top of that, a load balancer must forward to a compute node, and a queue
must have a consumer (an edge out of it, or a two-way edge).

So in a bad fixture, an unconnected component is a real flaw the engine scores, not a
loophole. See `src/lib/reachability.ts` and `SPEC-reachability.md`.

### knownGap

When a bad design *should* fail a check but the engine gets it wrong, write the
expectation you want anyway and set `knownGap` to one sentence saying what the engine
misses. The test then runs as an expected failure (`it.fails`): the suite stays green
and the gap is listed in the output. When the engine is fixed, that test turns red,
which tells you to delete the `knownGap` line.

Never use `knownGap` for a mistake in the fixture itself, and never leave it empty.

## Adding a brief, step by step

1. Create `challenges/<id>/brief.yaml`. Copy an existing brief and rewrite it.
2. Write `fixtures/good.yaml`, a design you would accept from a strong student.
3. Calibrate: run the probe and read the good design's estimates.

   ```bash
   PROBE=1 npx vitest run tests/probe.test.ts --reporter=verbose
   ```

   Set the NFRs so the good design passes with some headroom (around 15 to 30 percent
   on throughput and cost). Change the good design or the targets, never the engine.
   Note that a 99.9 % availability target needs a load balancer, two compute nodes and
   a replicated database, and leaves no headroom.
4. Write at least three `bad-<flaw>.yaml` fixtures. Start each one as a copy of
   `good.yaml` and make **one** change, so it can't fail for an unrelated reason.
   Say what the flaw is in `description`.
5. Run the brief's tests: `npx vitest run -t <id>`. Fix the fixture or the rule until
   each bad fixture fails the ids it lists, or mark it `knownGap` if the engine is at fault.
6. Run `npm test`, `npx tsc --noEmit` and `npm run lint` before committing.

## Where the code is

| File | What it does |
|---|---|
| `src/lib/challenges/types.ts` | Types for briefs, rules, fixtures and rule results |
| `src/lib/challenges/validate.ts` | Validates parsed YAML and produces typed objects |
| `src/lib/challenges/load.ts` | Reads `challenges/` from disk (Node only) |
| `src/lib/challenges/design.ts` | Turns a fixture into the nodes, edges and features the engine takes |
| `src/lib/challenges/rules.ts` | Evaluates a brief's rules |
| `src/lib/challenges/run.ts` | Runs one fixture and compares the outcome with `expect` |
| `tests/challenges.test.ts` | One test per fixture, plus one structure test per brief |
| `tests/probe.test.ts` | Calibration aid; skipped unless `PROBE=1` |
