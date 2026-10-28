# Spec: measure latency along request paths (finding 12)

Status: **implemented** (2026-10-28); approved with all three proposals: latency targets unchanged, no
second figure for now, and a combined plan and task list. Plan: [tasks/request-latency/plan.md](tasks/request-latency/plan.md).
Engine change from finding 12 in `docs/challenges/phase1-findings.md`. Module id
`request-latency`. Branch: `fix/request-latency`, from `main` (`d7dbb15`).

## Objective

The latency a student sees should be the time their request takes: from the client,
through the servers that answer it, to the data those servers read and write. Today it
is the **longest chain of connections anywhere in the design**, so background work and
server push are added to it. A correct design that uses a queue, a worker or SSE scores
slower than the shortcut it replaces, which teaches the opposite of what the briefs
want:

| Design | Latency today | Its good design today |
|---|---|---|
| `lab-autograder/bad-sync-grading` | 25 ms | 45 ms |
| `course-registration/bad-direct-enrol` | 31 ms | 51 ms |
| `shuttle-tracker/bad-polling` | 33 ms | 63 ms |
| `course-assistant/bad-no-streaming` | 60 ms | 72 ms |
| `chat-app/bad-no-pubsub` | 30 ms | 50 ms |
| `notification-system/bad-sync-delivery` | 55 ms | 75 ms |

Users: students reading the Latency figure; you, setting latency targets.

## Cause

`estimatePathLatency` in `src/lib/simulation.ts`:

1. starts from every node with no incoming edge, so a client that *receives* an SSE or
   Web Push edge stops being a starting point, and a shuttle's GPS unit or a staff
   machine is one instead;
2. follows **every** edge, including a queue handing work to a worker, a worker
   writing results, and a server pushing to a client;
3. reports the longest chain found.

## Change

In `estimatePathLatency` only (about ten lines):

- **Start where requests start:** the client nodes, using `requestRoots()` from
  `src/lib/reachability.ts`. Designs without clients keep today's fallback (nodes with
  no incoming edge).
- **Leave out work that happens after the response:**
  - edges leaving a **message queue** (consumers pick work up later),
  - edges leaving a **task worker** (it runs in the background),
  - **SSE and Web Push** edges (the server pushing to a client, not a request).
- Everything else is unchanged: hop costs, WebSocket and WebRTC counted both ways,
  the CDN/static-hosting adjustment, the cache-aside bonus, the 20 ms floor, and the
  fixed estimate for designs with no edges.

Putting a job **on** a queue still counts (the API waits for the enqueue, 10 ms), and so
does every synchronous call the server makes: cache, database, object storage, an
external API.

The reachability rules that decide which components earn credit are **not** changed:
there, a queue still needs a consumer to count, because crediting asks "is this
component used", not "does the student wait for it".

## Prototype results

I ran the change behind a temporary flag against every fixture and both demos (the
engine file was then restored from git):

| Brief | Good design: today → after | Shortcut designs after |
|---|---|---|
| link-shortener | 31 → 31 | (no async parts; unchanged) |
| file-storage | 43 → 43 | unchanged |
| chat-app | 50 → 30 | `bad-no-pubsub` 30, `bad-http-polling` 31 |
| notification-system | 75 → 31 | `bad-sync-delivery` 31, `bad-no-worker` 31 |
| lab-autograder | 45 → 25 | `bad-sync-grading` 25, `bad-results-not-stored` 25 |
| course-registration | 51 → 31 | `bad-direct-enrol` 31 |
| shuttle-tracker | 63 → 33 | `bad-polling` 33 |
| course-assistant | 72 → 60 | `bad-no-streaming` 60; `bad-client-calls-llm` 30 |

- **Every async or push design now ties with its shortcut instead of losing to it.** It
  doesn't win either: the engine still doesn't model what synchronous work costs
  (finding 10) or what polling costs (finding 7), so the brief rules keep catching those
  designs.
- **`bad-client-calls-llm` stays faster (30 ms against 60), correctly:** the browser
  really does skip a hop. Its flaw is the exposed API key, which `no-client-to-llm` and
  `topo-api-keys` catch.
- **Both demos keep their exact results** (`tests/demos.test.ts` passes unchanged).
- **All 360 tests pass unchanged.** No fixture asserts `nfr-latency`, and latencies only
  go down, so no target is newly missed.

## What "latency" will mean

The figure under "Verification run" and the `nfr-latency` check become "time for a
student's request to be answered". Work finished later (grading, delivering an alert to
other phones, relaying a chat message to other servers) isn't in it. The detail text of
`nfr-latency` says so, so a student doesn't read a 25 ms autograder as "grading takes
25 ms".

## Tests

Test first, in `src/lib/simulation.test.ts`, with small hand-built designs:

- a queue consumer chain (API → queue → worker → database) adds only the enqueue hop;
- an SSE or Web Push edge from a server to a client adds nothing, and the client still
  counts as a starting point;
- a client-initiated path (client → load balancer → API → database) is unchanged;
- a design with no clients still uses the no-incoming-edge fallback;
- WebSocket edges still count both ways.

And a guard for the finding itself, `tests/latency.test.ts`: for each pair in the
"Objective" table, the good design's latency is **no higher** than the shortcut's. If a
later engine change makes async designs slower again, this fails.

Regression: all existing tests, including `tests/demos.test.ts`, unchanged.

## Docs

- `docs/challenges/phase1-findings.md`: finding 12 marked fixed, with the before/after
  table; finding 7 updated (SSE no longer costs extra; polling still costs nothing).
- `docs/challenges/brief-format.md`: the `nfr-latency` row says "time for a client's
  request to be answered; queue consumers, workers and server push aren't included".
- `HANDOVER.md`: finding 12 out of the "later" list; new latency numbers.

## Boundaries

- **Always:** demos and every fixture's expectations unchanged; tests, types, lint,
  build green.
- **Ask first:** changing hop costs; adding a second "time to result" figure; changing
  any brief's targets (open question 1); touching reachability or crediting.
- **Never:** weaken a fixture's expectations to make a test pass.

## Success criteria

1. For every pair in the Objective table, the good design's latency is no higher than
   the shortcut's, in a test.
2. Both demos and all existing fixtures give the same results as before, apart from the
   latency figures listed above.
3. Tests, `tsc`, lint and build pass.

## Open questions

1. **Latency targets.** Good designs get 12–44 ms faster, so every brief's latency
   target becomes looser than intended (e.g. the alerts brief: 200 ms target, 31 ms
   design). Proposal: **leave the targets alone** in this change. Latency hasn't been
   what separates good and bad designs in any brief, and changing eight briefs' numbers
   is a separate decision. Alternative: tighten each to about twice the new good
   latency, as part of this change.
2. **A second figure for background work?** Grading turnaround, alert delivery and chat
   relay times are real and now invisible. Proposal: not now; note it as a possible
   "time to result" figure for later. Adding one means deciding what each brief should
   promise, which is content work.
3. **Paperwork.** It's one function plus tests and docs. Proposal: this spec plus a
   short combined plan and task list, approved together, as for `confirm-replace`.
