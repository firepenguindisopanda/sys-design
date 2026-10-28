# Spec: charge for inline slow work and for polling (findings 10 and 7)

Status: **implemented** (2026-10-28); approved as proposed: latency only, task workers only, the six field values as listed, and one combined plan and task list. Plan: [tasks/sync-and-polling/plan.md](tasks/sync-and-polling/plan.md).
Engine change from findings 10 and 7 in `docs/challenges/phase1-findings.md`. Module id
`sync-and-polling`. Branch: `fix/sync-and-polling`, from `main` (`a735869`).

## Objective

Since the finding 12 fix, a good design that queues its slow work or pushes updates
**ties** with the shortcut that skips it. Doing the work inline or making clients poll
costs nothing extra, so only brief rules catch those designs:

| Shortcut | Latency | Throughput | Its good design |
|---|---|---|---|
| `lab-autograder/bad-sync-grading` | 25 ms | 1260 | 25 ms, 1449 |
| `notification-system/bad-sync-delivery` | 31 ms | 1660 | 31 ms, 1908 |
| `lecture-video-library/bad-sync-transcode` | 49 ms | 1460 | 49 ms, 1678 |
| `chat-app/bad-http-polling` | 31 ms | 1660 | 30 ms, 1660 |
| `shuttle-tracker/bad-polling` | 33 ms | 1660 | 33 ms, 1660 |

After this change, both shortcuts should cost what they cost in real life:

- **Slow work done inline (finding 10):** the student's request waits for it.
- **Polling instead of push (finding 7):** clients keep asking, so the servers handle many
  more requests.

Users: students reading the Latency and Throughput figures; you, writing briefs.

## Cause

The engine has no idea how long a feature's work takes outside its CPU time
(`computeMsPerRequest`), or how often clients ask when nothing pushes to them. A queue
plus worker only adds 15 % capacity, and protocols only change hop latency.

## Change

The brief says which features have slow work or live updates. The engine then checks
whether the design handles them properly.

**Two optional feature fields** in `brief.yaml`, both numbers ≥ 1:

```yaml
feature:
  name: Grade submission
  ...
  computeMsPerRequest: 40
  backgroundWorkMs: 3000   # slow work this request starts; the request waits for it
                           # unless it's handed to a background worker
  pollingRpm: 2400         # requests per minute if clients poll for updates instead
                           # of being pushed to (use instead of targetRpm)
```

**Engine (`src/lib/simulation.ts`):**

1. **Handing off.** A feature with `backgroundWorkMs` counts as handed off when the
   compute node it's placed on has an edge to a message queue, and that queue has an edge
   to a task worker. Otherwise the work is **inline**: the latency estimate gains the
   largest inline `backgroundWorkMs` on top of the request path. Only task workers count
   as consumers: a queue read by another API server leaves the work on the API servers.
2. **Pushing.** A feature with `pollingRpm` counts as pushed when the compute node it's
   placed on has:
   - an SSE or Web Push edge **to** a client, or
   - a WebSocket edge with a client, directly or through a load balancer that has a
     WebSocket edge with a client.

   Otherwise clients are **polling**, and the throughput target uses the feature's
   `pollingRpm` instead of its `targetRpm`. The target stays
   max(`minThroughputRpm`, the sum over features).
3. **Messages.** When a feature is inline or polled, the relevant check's detail names it
   (pass or fail):
   - Latency: "Submit solution waits for 3000 ms of slow work. Put it on a queue that a
     task worker consumes."
   - Throughput: "Live map isn't pushed to clients, so they poll: 3600 req/min instead of
     900. Push updates over SSE or a WebSocket."

   The latency text also stops saying "background work isn't included", because inline
   work now is.
4. Check ids don't change; nothing new for brief rules or fixtures to reference.

**Feature plumbing:**

- The fields are optional on `FeatureBlock` (`src/lib/types.ts`) and `BriefFeature`.
- The validator reads them and rejects anything that isn't a number ≥ 1.
- `design.ts` copies them into fixtures' features, and `store.ts` already spreads the
  brief's feature.
- Sandbox export and import (`design-file.ts`) keep them, so a round trip doesn't drop
  them.
- The requirements panel doesn't show or edit them (a later polish item).

**Briefs that get the fields:**

| Brief | Feature | Field | Reason |
|---|---|---|---|
| lab-autograder | `submit-solution` | `backgroundWorkMs: 3000` | "Running the tests takes seconds" |
| notification-system | `fan-out` | `backgroundWorkMs: 2000` | Sending to thousands of phones in batches |
| lecture-video-library | `upload-recording` | `backgroundWorkMs: 60000` | Transcoding takes minutes; one minute is the floor |
| course-link-checker | `start-check` | `backgroundWorkMs: 60000` | Crawling a course takes minutes |
| chat-app | `send-message` | `pollingRpm: 2400` | About 400 open chats asking every 10 s (target 900) |
| shuttle-tracker | `live-map` | `pollingRpm: 3600` | About 300 phones asking every 5 s (target 900) |

No brief's targets change.

## Prototype results

The prototype was built against `a735869` and then reverted. It also charged inline work
to the API's CPU, which moved **no** throughput figure, because the database tier already
caps throughput in all of these designs. The proposal above leaves that part out, so the
results below are what the proposal would give:

| Fixture | Before | After | New engine fail |
|---|---|---|---|
| `lab-autograder/bad-sync-grading` | 25 ms | 3025 ms | `nfr-latency` (≤ 50) |
| `lab-autograder/bad-no-worker` | 25 ms | 3025 ms | `nfr-latency` |
| `notification-system/bad-sync-delivery` | 31 ms | 2031 ms | `nfr-latency` (≤ 70) |
| `notification-system/bad-no-worker` | 31 ms | 2031 ms | `nfr-latency` |
| `lecture-video-library/bad-sync-transcode` | 49 ms | 60049 ms | `nfr-latency` (≤ 100) |
| `course-link-checker/bad-sync-crawl` | 60 ms | 60060 ms | already failed latency |
| `chat-app/bad-http-polling` | target 1300 | target 2700 | `nfr-throughput` (1660) |
| `shuttle-tracker/bad-polling` | target 1400 | target 4020 | `nfr-throughput` (1660) |
| `shuttle-tracker/bad-sse-wrong-direction` | target 1400 | target 4020 | `nfr-throughput` (1660) |

- **Unchanged:** every other fixture, every good design and both demos. All 483 existing
  tests passed with the prototype.
- **Engine count across the twelve briefs:** from 37 to **42 of 53**. Five designs move
  from rule-only to engine-caught: `bad-sync-grading`, `bad-sync-delivery`,
  `bad-sync-transcode`, `bad-http-polling` and `shuttle-tracker/bad-polling`.
- **Still caught only by brief rules (11):**
  - not about slow work or polling, so out of scope here:
    - `course-registration/bad-direct-enrol`: the queue exists for ordering, not speed
    - `chat-app/bad-no-pubsub`
    - `course-assistant/bad-no-streaming`: the answer arrives late, but nothing polls
  - `course-link-checker/bad-single-stage`: stages inside the background work aren't
    modelled
  - findings 5, 6, 14 and 15
  - the two "results not stored" designs

## Tests (written first)

- **`src/lib/simulation.test.ts`** gets a new `describe("inline work and polling")`:
  - **Inline work:**
    - hosting node → queue → task worker: no added latency;
    - queue with no consumer: added;
    - queue consumed only by compute: added;
    - the queue edge comes from a different compute node than the hosting one: added;
    - a feature without `backgroundWorkMs`: no change;
    - two inline features: only the largest is added.
  - **Polling:**
    - SSE from the hosting node to a client: pushed;
    - WebSocket client → load balancer → hosting node: pushed;
    - SSE drawn client → server: polled;
    - Web Push from a worker, not the hosting node: polled;
    - when polled, the throughput target uses `pollingRpm`;
    - a feature without `pollingRpm`: no change.
  - **Messages:** the detail names the feature in both the pass and the fail case.
- **`validate.test.ts`:**
  - both fields are accepted;
  - 0, a negative number or a string is rejected, with the file and field in the error.
- **`design-file.test.ts`:** a sandbox design with both fields survives export then import.
- **Fixtures (strengthened only):**
  - add `nfr-latency` to `fails` in the five newly slow fixtures above;
  - add `nfr-throughput` to `fails` in the three polling fixtures.
- **`tests/latency.test.ts`:** a second list requires the good design to be **strictly
  faster** for `bad-sync-grading`, `bad-sync-delivery` and `bad-sync-transcode`. The
  existing "no slower" pairs stay.

## Docs

- **`docs/challenges/brief-format.md`:** the two fields, when to use them, and how to
  pick a value.
- **`docs/challenges/phase1-findings.md`:** a new "Update: findings 10 and 7" section
  with the table above and the new count (42 of 53); mark 7 and 10 as addressed in the
  original list.
- **`HANDOVER.md`** (untracked).

## Boundaries

- **Always:**
  - every good design's numbers and both demos stay unchanged;
  - fixture expectations only get stronger;
  - tests, types, lint and build stay green.
- **Ask first:**
  - charging inline work to compute (throughput);
  - modelling stages, ordering queues or streaming;
  - changing any brief's targets or hop costs;
  - showing the fields in the requirements panel.
- **Never:**
  - weaken a fixture's expectations;
  - make the fields required (old briefs and saved designs must keep working).

## Success criteria

1. The five shortcuts above fail an engine NFR check, and their good designs pass, with
   the same numbers as today.
2. All twelve briefs' fixtures, both demos and the calibration test pass.
3. A student who fails sees which feature caused it and what to change.
4. A browser check shows the new messages on `lab-autograder/bad-sync-grading` and
   `shuttle-tracker/bad-polling`.

## Open questions

1. **Field values.** Are the six numbers above right? The large ones show in the results
   as "60049 ms vs ≤ 100 ms", which is accurate but blunt.
2. **Latency only.** Should inline work stay out of the throughput estimate, as proposed?
   Including it changes no current result, and it would mean a second rule to explain.
3. **Consumers.** Should only task workers count as taking the work off the API, as
   proposed? The other choice is any consumer except compute.
4. **Plan format.** One combined plan and task list, as for finding 12?
