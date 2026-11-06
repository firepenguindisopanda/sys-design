# Spec: calibrated load blocks for the other twelve briefs (`brief-load-rollout`)

Status: **approved** (2026-11-06). Open questions 1–4 are all as recommended:
1. the default load's average is the brief's total `targetRpm`, in the shape its story
   describes;
2. a new optional per-feature `slowMs` in the `load` block gives the slow work's
   realistic time on the load page, defaulting to `backgroundWorkMs`;
3. the course assistant's `apiMs` is the time to the first streamed words, about 1,000 ms;
4. all twelve briefs are calibrated now, and the flaws that need `loadsim-delivery` are
   checked there.

The next module in [CAPABILITY-MAP-dataflow-sim.md](CAPABILITY-MAP-dataflow-sim.md), after
slow work and cascades ([SPEC-loadsim-cascades.md](SPEC-loadsim-cascades.md)). The map
describes it as "a calibrated `load` block for the other 14 briefs, one commit per brief";
two of those 14 (`lab-autograder`, `lab-monitor`) got theirs in `loadsim-queues`, so twelve
are left. Branch: `feat/brief-load-rollout`, from `main` (`c7f8aca`).

## Objective

Twelve of the sixteen briefs have no `load` block, so the load page sends their designs
the generic default: 100,000 requests over 20 minutes in a spike. That's about 83 a second
on average and 167 in the spike, while these briefs describe 4 to 28 requests a second.
Their reference designs therefore look broken:

| Reference design | Served today | The brief's own rate |
|---|---|---|
| `textbook-price-watch/good` | 48.2% | 6 req/s |
| `file-storage/good` | 54.6% | 17 req/s |
| `chat-app/good` | 84.1% | 20 req/s |
| `course-assistant/good` | 89.8% | 11.7 req/s |
| `lecture-video-library/good` | 95.2% | 21.8 req/s |
| `campus-food-guide/good` | 99.6%, slowest 5% at 4,978 ms | 21.5 req/s |

A student who draws the right answer and sees half its requests fail stops trusting the
page. After this module:
- **Every reference design looks healthy** under its brief's default load: everything
  served, quick answers, and any queue empty again before playback ends.
- **Each brief's numbers tell its own story**, in a comment: who sends what, how often,
  at its busiest, and why each query costs what it does.
- **Each flawed design shows its flaw where the load page can show it.** Where it can't
  yet, the spec records why: the behaviour isn't simulated until `loadsim-delivery`, it
  only shows when something is switched off, or it isn't a load problem at all (the
  brief's rules catch it).

The page still gives no verdict, and the engine, rules and verification panel are
untouched: only the load simulation reads `load`.

## What we found while drafting

Measured on `main` (`c7f8aca`), running each brief's fixtures at its own rate: the sum of
its features' `targetRpm`, over 20 minutes, in a spike (so the first quarter runs at
twice that):
- **All twelve reference designs serve 100%,** with the slowest 5% of answers under 260 ms.
- **But most flawed designs give exactly the same numbers as the good one.** For example,
  all six chat designs do, and all five food guide designs. Their flaws are about files,
  polling, push, ordering or security, which the load page doesn't simulate or can't
  show.
- **Three reference designs' workers can't keep up** and leave jobs waiting at the end:
  - `course-link-checker/good`: 654 of 1,400 jobs;
  - `lecture-video-library/good`: 1,090 of 5,400;
  - `notification-system/good`: 25,716 of 30,600. Fan out alert sends 1,500 pushes a
    minute, and its `backgroundWorkMs` makes each one take 2 s. That needs about 50
    worker slots, and the design has 4.

  Part of this is the generic default `writeShare` of 0.2: it turns a fifth of every
  read feature's requests into worker jobs. A calibrated block sets reads to 0. The
  rest is open question 2.

## Change

### A. The scenario: the brief's busiest 20 minutes

Each block's `requests`, `windowSeconds` and `shape` describe **the busiest stretch of the
brief's story**, for example the lunch rush for the food guide, or an alert going out to
the whole campus for notifications:
- **The rate:** the average equals the brief's total `targetRpm` (what the engine sizes
  designs for), unless the story describes a rush beyond it. A rush beyond it is written
  in the comment, as `link-shortener` and `course-registration` already do. Open
  question 1.
- **The shape:** `spike` for a rush, `steady` for constant traffic (readings, location
  updates), `ramp` for a deadline.
- **The window:** 20 minutes unless the story says otherwise.

### B. The per-feature figures

Each figure is realistic for that query or job, as `brief-format.md` already requires
(`dbMs` is never raised to make a flaw show):
- **`writeShare`:** 0 for features that only read, 1 for features that only write, and
  the real mix for the rest.
- **`dbMs`:** a key lookup costs a few ms; a list or a join costs tens. Each value gets a
  comment saying which.
- **`batch`:** only where grouping writes is realistic (readings, logs), never for bids,
  payments or seat claims.
- **`slowWork`:** `cpu` for thumbnails and transcoding; `wait` for crawling, pushes and
  price checks.
- **`apiMs`:** the provider's realistic time, for the four briefs whose compute calls an
  external API in the request: `printing-credits`, `course-assistant`,
  `course-link-checker` and `textbook-price-watch`. It's left out where the brief's
  `backgroundWorkMs` already stands for that call, so nothing is counted twice. Open
  question 3.

### C. Per brief, what the load page can show

| Brief | Flaws it can show now | With an outage | Need `loadsim-delivery` | Not a load problem |
|---|---|---|---|---|
| `campus-food-guide` | `bad-no-cache` (a busier database, if the vendor list is a heavy query) | | `bad-no-cdn`, `bad-pages-from-api` (files) | `bad-client-to-db` |
| `chat-app` | | | `bad-http-polling` (polling); `bad-no-pubsub`, `bad-no-subscribers`, `bad-gap-bus-unconnected` (push) | `bad-client-to-db` |
| `club-auction` | | `bad-single-db-replica` | `bad-polling` | `bad-direct-bids` (ordering), `bad-client-to-db` |
| `club-photo-wall` | `bad-sync-thumbnails` (CPU) | | `bad-no-cdn`, `bad-upload-through-api` (files) | `bad-client-to-db` |
| `course-assistant` | | | | `bad-client-calls-llm`, `bad-no-history`, `bad-no-streaming` (streaming isn't simulated), `bad-client-to-db` |
| `course-link-checker` | `bad-sync-crawl` (slots, too slow) | | | `bad-single-stage` (stages inside a job), `bad-results-not-stored`, `bad-client-to-db` |
| `file-storage` | `bad-capacity-overflow` (saturates) | | `bad-files-in-db` (files) | `bad-no-metadata-db`, `bad-client-to-db` |
| `lecture-video-library` | `bad-sync-transcode` (too slow) | | `bad-no-cdn`, `bad-video-in-db` (files) | `bad-client-to-db` |
| `notification-system` | `bad-sync-delivery` (slots), `bad-no-worker` (nobody reads the queue) | | `bad-push-wrong-direction` (push) | `bad-client-to-db` |
| `printing-credits` | | `bad-single-db-replica` | | `bad-client-calls-provider`, `bad-no-webhook`, `bad-client-to-db` |
| `shuttle-tracker` | `bad-no-cache` (a busier database) | | `bad-polling`; `bad-sse-wrong-direction` (push) | `bad-client-to-db` |
| `textbook-price-watch` | `bad-inline-check` (slots, slower) | | `bad-always-on-vms` (autoscaling) | `bad-client-calls-store`, `bad-client-to-db` |

This table is the draft. Calibration may move a flaw between columns, for example if a
realistic `dbMs` makes a missing cache visible. Each move is recorded in the task notes.

### D. Docs

- **`brief-format.md`:** the scenario rule (section A), and an example of `apiMs`.
- **The capability map:** this module's status. `loadsim-delivery` gets a note listing
  the flaws in column 4 that it should make visible.
- **The README:** no change, unless calibration changes what a student sees.

## Pilot expectations (calibrated in the build, checked by tests)

For each of the twelve briefs, under its default load:
- **The reference design:** at least 99.9% served, the slowest 5% of answers under
  1,000 ms, no compute instance or database saturated, and every queue empty before the
  end.
  - **The course assistant's slowest 5%:** under 1,000 ms plus its model call (`apiMs`),
    so 2,000 ms. 43% of its requests ask a question, so its slowest 5% all wait for the
    model's first words, and the call's figure stays honest (open question 3). Decided in
    Task 4.
- **Each flawed design in the "can show now" column** shows its flaw, with the number
  pinned in a test (for example "Alerts API 1 runs out of slots from 0:00").
- **Each flawed design in the other columns:** the test checks nothing about it. The
  table above records why.

## Commands

```bash
npm test
```
```bash
npx tsc --noEmit
```
```bash
npm run lint
```
```bash
npm run build
```
```bash
LOADSIM_PROBE=1 LOADSIM_BRIEFS=<id> npx vitest run tests/loadsim-probe.test.ts --reporter=verbose
```
```bash
PROBE=1 npx vitest run tests/probe.test.ts --reporter=verbose
```

The last command checks that the engine's results haven't moved; they shouldn't, since
the engine never reads `load`.

## Project structure

- `challenges/<id>/brief.yaml`: each brief's new `load` block, with its comment. This is
  the only place figures go.
- `tests/loadsim-briefs.test.ts` (new): the pilot expectations for these twelve, one
  `describe` per brief. `tests/loadsim-pilots.test.ts` keeps the existing pilots.
- `docs/challenges/brief-format.md`, `CAPABILITY-MAP-dataflow-sim.md`: section D.
- `tasks/brief-load-rollout/`: the plan and task notes, with each brief's probe before and
  after.
- No change to `src/` expected. If calibration needs one, stop and report (Boundaries).

## Code style

A block reads like the existing ones: the story first, then each figure with its reason.
An illustration of the format (not calibrated):

```yaml
load:
  # Lunch rush, 11:45 to 12:05: students check what's open and read reviews, a few post
  # one. About the brief's 1,290 requests a minute, in a spike.
  requests: 25800
  windowSeconds: 1200
  shape: spike
  features:
    browse-vendors: { writeShare: 0, dbMs: 15 }   # vendors joined with today's hours
    view-vendor: { writeShare: 0, dbMs: 5 }       # one vendor and its latest reviews
    post-review: { writeShare: 1, dbMs: 8 }
```

## Testing strategy

- **Tests first, per brief:** the brief's pilot expectations are written and fail (or are
  checked against the generic default and fail), then the block is added.
- **Only that brief moves:** each brief's commit diffs the load probe against the one
  before it. Only that brief's fixtures may change.
- **Unchanged:** the engine probe, the demos, `tests/calibration.test.ts` and the
  existing load pilots.
- **The build validates every block** (`npm run build` fails with the file and field on a
  bad one).

## Boundaries

- **Always:**
  - realistic figures, each with a comment;
  - one commit per brief;
  - the probe diff before each commit;
  - tests written first.
- **Ask first:**
  - any change under `src/` (a new block field, a model change);
  - changing a brief's feature fields (`targetRpm`, `backgroundWorkMs` and so on) or a
    fixture, since the engine reads those and its results would move;
  - a scenario above the brief's own rate.
- **Never:**
  - raising a figure only to make a flaw show;
  - weakening a fixture's expectations;
  - touching the engine, the rules or the four calibrated briefs.

## Success criteria

- All twelve briefs have a calibrated `load` block, each with its story in a comment.
- Every reference design meets its pilot expectations.
- Each flawed design in the "can show now" column shows its flaw in a test.
- The engine probe, the demos and the four existing load pilots are unchanged.
- All tests, `tsc`, lint and `next build` pass.
- In the browser, three reference designs look healthy: `textbook-price-watch/good`,
  `file-storage/good` and `notification-system/good`.

## Open questions

1. **How busy is the default load?**
   - **Recommended:** the average equals the brief's total `targetRpm`, in the shape its
     story describes. At that rate all twelve reference designs serve 100% today.
   - The alternative is a rush several times that, as `link-shortener` and
     `course-registration` have (about 8× their `targetRpm`). More flaws would show, but
     some reference designs would fail, and the rush would need a reason in each story.
2. **What happens where the reference design's workers can't keep up?** After `writeShare`
   is calibrated, notifications at least will still fall behind for good: 2 s per push
   at 1,500 pushes a minute.
   - **Recommended:** a new optional per-feature `slowMs` in the `load` block: the slow
     work's realistic time for the load page (a push takes about 200 ms). It defaults to
     `backgroundWorkMs`, which the engine keeps using. It's one field in the validator,
     scenario and model, with tests: a small `src/` change, so it's asked here.
   - **Alternative:** more workers in the reference fixtures. This is realistic, but the
     engine's numbers for those designs move, and their briefs would need recalibrating.
   - **Alternative:** accept it. The page would then say the reference design's queue
     never empties, which is the problem this module is meant to fix.
   - **Decided in Task 6:** `slowMs` alone wasn't enough. At their realistic times (60 s
     for a course's crawl, several minutes for a conversion), the link checker's and the
     video library's queues still didn't drain with 4 workers. Their reference designs,
     and the flawed copies of them, now have more workers, within budget:
     - the link checker: 8 per stage, $296 a month of $340;
     - the video library: 24 converters, $417 of $440.

     The engine's numbers for those fixtures change only in cost, and every fixture's
     expectations still hold. Notifications drain with `slowMs: 200` and 4 workers.
3. **`apiMs` for the course assistant.** An AI answer can take 10 s or more in full, and
   anything over 5 s fails as too slow. The reference design streams the answer, but the
   load page doesn't simulate streaming.
   - **Recommended:** use the time to the first streamed words, about 1,000 ms, and say so
     in the comment. `bad-no-streaming` then looks like the good design, and its rule
     still catches it.
   - The alternative is the full answer time, which makes every course assistant design
     fail.
4. **The flaws that need `loadsim-delivery`.**
   - **Recommended:** calibrate all twelve now, so the reference designs are right. Record
     the flaws each brief will show once delivery lands, then add those checks in
     `loadsim-delivery`.
   - The alternative is to wait for `loadsim-delivery` before the seven briefs that need
     it. Their reference designs would stay broken on the page until then.
