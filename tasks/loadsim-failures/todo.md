# Tasks: `loadsim-failures`

Spec: [SPEC-loadsim-failures.md](../../SPEC-loadsim-failures.md). Plan: [plan.md](plan.md).

Standing verification: `npm test`, `npx tsc --noEmit` and `npm run lint` pass. The engine,
its numbers, the fixtures, the demos, `rules.ts`, the verification panel and the editor are
unchanged. A run without outages is unchanged: before Task 1, save the probe output to the
scratchpad as the baseline.

---

## Task 1: Tests first

**Description:**
- **New `src/lib/loadsim/outages.test.ts`:**
  - **`validateOutages`:** accepts a valid list. Rejects:
    - an unknown node;
    - a load balancer, queue, CDN, static hosting or external API (not switchable);
    - `onAt ≤ offAt`;
    - a negative `offAt`;
    - two outages on one node that overlap.
  - **`nodeState`, by hand:**
    - an instance off at 100 s: `routable` until 110 s, then not; back at 200 s, and
      routable again from 210 s;
    - a 2-copy database off at 100 s: `writesFail` from 100 to 130 s, then
      `primaryCopy` 1, which stays 1 after it comes back;
    - a 1-copy database: `writesFail` for the whole outage;
    - a cache off from 100 to 200 s: `hitRatio` 0.9 before, 0 during, 0.45 at 215 s, and
      0.9 from 230 s.
  - **`toggleOutage`:**
    - off then on gives one closed outage;
    - toggling inside an outage closes it there and drops that node's later ones;
    - toggling between two outages opens one that ends where the next begins.
- **New `src/lib/loadsim/outages-model.test.ts`** (hand-built designs, steady load):
  - **health check:** a 2-instance pool, 10 req/s, `p1` off at 60 s for the rest:
    - about 5 req/s × 10 s fail at `p1` as `switched-off`;
    - from 70 s, `p2` serves all 10 req/s;
    - `frame.nodes.p1.off` is `"routed"` at 64 s and `"noticed"` at 72 s.
  - **no balancer:** a lone instance off from 60 to 120 s fails every request in that
    minute, and none outside it.
  - **database:**
    - with 2 copies off from 60 to 180 s, reads carry on, and writes fail from 60 to
      90 s and then succeed;
    - with 1 copy, everything that needs the database fails from 60 to 180 s;
    - job writes at a down database wait and aren't lost.
  - **cache:** off from 60 s, every read reaches the database. Back at 120 s, the
    database's reads fall over the next 30 s, not at once.
  - **worker:** off from 30 to 90 s, the queue's backlog grows while it's off and drains
    after. Jobs conservation holds, and none fail.
  - **backlog:** requests waiting at an instance when it goes off fail there.
  - **determinism:** frames before the first outage are deep-equal to a run without
    outages.
  - **no outages:** `outages: []` and no `outages` field both give exactly today's run.
  - **conservation:** requests and jobs, for several outage mixes.
  - **invalid list:** `simulateLoad` throws.
  - **summary:** `outages[i]` has `failedHere`, `takeover` and the note templates (pool,
    database with and without replica, cache, worker). `perNode.failedWhileOff` matches
    the `switched-off` failures.
- **`tests/loadsim-pilots.test.ts`:** the spec's pilot table.
- **Page tests:**
  - **`load-node.test.tsx`:** the "Off since 4:12" and "Off · still getting requests"
    text; the power button's name ("Switch off Lab API 1", "Bring back Lab API 1"); no
    button for a load balancer;
  - **`playback.test.ts`:** `resize` keeps the position and play state, and clamps;
  - **new `outage-list.test.tsx`:** the items, remove and Clear all;
  - **`run-summary.test.tsx`:** the outage note first; the "Failed while off" column;
  - **`load-sim-view.test.tsx`** (or a new page test): a scenario change clears the
    outages; a toggle sets the announcement.

**Acceptance criteria:**
- [x] The new tests fail for the right reasons.
- [x] Every existing test still passes.

**Verification:**
- [x] `npx vitest run src/lib/loadsim tests/loadsim-pilots.test.ts src/components/loadsim`,
  with the failures listed.

**Notes (2026-11-05):**
- **Probe baseline** saved before any change, as `failures-probe-baseline.txt` in the session scratchpad (335 lines).
- **Full suite:** 31 failed, 1,240 passed and 2 skipped. All 31 failures are new tests:

  | File | Failing | Why |
  |---|---|---|
  | `outages.test.ts` | the file | no `outages.ts` module yet |
  | `outage-list.test.tsx` | the file | no `outage-list.tsx` yet |
  | `outages-model.test.ts` | 18 | outages are ignored, and there's no `off`, `failedWhileOff` or `summary.outages` |
  | `loadsim-pilots.test.ts` | 6 | the spec's pilot table |
  | `load-node.test.tsx` | 3 | no off text, power button or `off` frame |
  | `playback.test.ts` | 2 | no `resize` |
  | `run-summary.test.tsx` | 2 | no outage note or Failed while off column |

- **Passing already, as guards:** these hold today because outages are ignored, and must still hold once they aren't:
  - no `outages` field and `outages: []` give identical runs;
  - frames before an outage match a run without it;
  - conservation in all five outage mixes;
  - a database outage loses no workers' writes;
  - a worker outage loses no jobs;
  - no power button on managed services;
  - every pilot unchanged without outages.
- **No DOM in the tests** (vitest runs in node, rendering to static markup). So the interactive parts are pure pieces with their own tests: `nodeStatus`'s off text, `LoadNodeBody`'s `off` and `onToggle` props, `OutageList`, `outageAnnouncement` and playback's `resize`. That a scenario change clears the outages is checked in the browser in Task 7, rather than with a new test library.
- **Test-driven decisions:**
  - `toggleOutage` keeps the list sorted by node, then time;
  - a worker's note says "were off" for a plural label ("Graders were off");
  - an outage still running at the end has `onAt: null`, and its note says "was off from 1:00." with no end.

**Dependencies:** none

**Files:** the test files above

**Estimated scope:** M

---

## Task 2: Outages module

**Description:**
- **New `src/lib/loadsim/outages.ts`:** `Outage`, `SWITCHABLE`, `validateOutages`,
  `nodeState` and `toggleOutage`.
- **`capacities.ts`:** `FAILOVER`.
- **`types.ts`:** `LoadInput.outages?`.

**Acceptance criteria:**
- [x] The `outages.test.ts` tests pass.

**Verification:**
- [x] `npx vitest run src/lib/loadsim/outages.test.ts`: 19 passed.

**Notes (2026-11-05):** `nodeState` also returns `downCopy`, the database copy that's off, which the model needs for its stations. Each outage that outlasts the 30 s failover moves the writes to the next copy for good. `validateOutages` names managed services in its message ("… can't be switched off: it's a load balancer, a managed service.").

**Dependencies:** Task 1

**Files:** `src/lib/loadsim/outages.ts`, `capacities.ts`, `types.ts`

**Estimated scope:** S

---

## Task 3: Model

**Description:**
- **States:** per node per step, worked out before the loop.
- **Down stations:**
  - request arrivals and waiting requests fail as `switched-off`;
  - jobs wait.
- **Dynamic splits:**
  - balancer → pool children, over routable members;
  - database copies: write entries for every copy, the primary by state, and reads over
    copies that are up;
  - caches: hit ratio by time.
- **Frames:** `off` on each node frame.
- **Failures:** the `switched-off` reason, and `failedWhileOff` per node.

**Acceptance criteria:**
- [x] The model tests in `outages-model.test.ts` pass, apart from the summary ones.
- [x] No-outage runs are unchanged: every existing model test passes, and the probe
  matches the baseline.

**Verification:**
- [x] `npx vitest run src/lib/loadsim`: 22 of the 27 outage model tests pass; the other 5 are Task 4's summary.
- [x] Diff the probe against the baseline: identical apart from the timing lines.

**Notes (2026-11-05):**
- **Built as planned:**
  - `applyOutages` works out each node's state per step;
  - balancer hops re-split over routable instances;
  - database hops set each copy's share (write hops get an entry for every copy only for a database with outages);
  - cache hops follow the hit ratio;
  - down stations serve nothing (a cache passes everything on);
  - requests at a down station, and those waiting when it goes down, fail as `switched-off`. Jobs wait.
  - With no outages, `applyOutages` returns at once, and the shares are exactly the paths' own.
- **"Routed" only behind a balancer.** `frame.off` is `"routed"` during the health check only for an instance behind a balancer; a lone instance is `"noticed"` at once, because no health check is involved.
- **Lint clean.** Full suite: 13 failed — Task 4 (5), Task 6 (7, one a whole file) and one pilot, below.
- **Finding (the Task 5 gate, reached early): `link-shortener/good` with `api-1` off at 2:00 serves 93.2%, not the spec's 99%.** During the 5-minute spike each API instance runs at 65%, so one alone needs 130%: `api-2` saturates and 5,964 requests time out, besides 833 lost in the health check. Off at 6:40, after the spike, only the health check's 278 are lost (99.7% served). The model is right; the spec assumed spare capacity the reference design doesn't have. It's the N+1 lesson: two instances at 65% can't survive losing one at the peak. Waiting on your decision.

**Files:** `src/lib/loadsim/model.ts`, `types.ts`

**Estimated scope:** L

---

## Task 4: Summary

**Description:**
- **`Summary.outages`:** the baseline run inside `simulateLoad` when outages exist,
  `failedHere`, `failedElsewhere` and `takeover`.
- **Notes:** the five templates, placed first in the notes.

**Acceptance criteria:**
- [x] The summary tests in `outages-model.test.ts` pass.

**Verification:**
- [x] `npx vitest run src/lib/loadsim`: all pass (with the pilots, 353).

**Notes (2026-11-05):**
- **Built as planned:**
  - the model keeps switched-off failures per node per step, and with outages it runs itself once without them for `failedElsewhere`;
  - `takeover` is the rest of the pool, a cache's databases, the database itself, or a worker's queue;
  - `summary.ts` writes the note per kind, and the outage notes come first.
- **Two templates beyond the spec's five:**
  - a lone instance: "… Nothing could take its requests, so N failed.";
  - the pool note adds ", and N requests timed out" when the instance left behind saturates.
- **"was" or "were"** follows the label: a plural name ending in a single "s" ("Sandbox workers") gets "were".
- **Sample notes on the pilots:**
  - "Link API 1 was off from 2:00. 833 requests failed before the load balancer noticed; then Link API 2 took its share and peaked at 130% busy, and 5,964 requests timed out."
  - "Section cache was off from 2:00 to 4:00. Every read went to Registration DB, which peaked at 129% busy; 2,605 requests timed out there."
  - "Links DB was off from 2:00 to 3:00. It had no replica, so 1,429 requests failed."
  - "Sandbox workers were off from 40:00 to 50:00. Grading jobs grew to 800 waiting; no job was lost."
- **Timing in node, baseline included:** 35 to 104 ms per pilot. The autograder's 60-minute window is the slowest. Task 7 measures it in the browser. If it's over 100 ms there, the page can pass the run it already has as the baseline instead of running it again.
- **Checks:** the probe is identical to the baseline and lint is clean. The full suite's only failures are Task 6's page tests (6 tests, plus the `outage-list` file).

**Files:** `src/lib/loadsim/summary.ts`, `model.ts`, `types.ts`

**Estimated scope:** M

---

## Task 5: Pilot gate

**Description:**
- Run the spec's pilot table under each pilot's default load, with no change to any
  brief.
- Record the key numbers here.
- If an expectation fails, find out why. If it fails only because the model is
  realistic, **stop and report** rather than adjust a figure.

**Acceptance criteria:**
- [x] Every pilot test passes.

**Verification:**
- [x] `npx vitest run tests/loadsim-pilots.test.ts`

**Notes (2026-11-05):** The gate was reached during Task 3. `link-shortener/good` with `api-1` off at 2:00 served 93.2%, not the 99% the spec expected: in the spike each instance runs at 65%, so one alone needs 130%. You chose to test both moments. Off at 2:00, `api-2` saturates and requests time out there (the N+1 lesson). Off at 6:40, after the spike, only the health check's requests are lost, and at least 99% are served. The spec's pilot table now says so. Every other row held as written, and no brief or figure changed.

**Dependencies:** Task 4

**Files:** none expected

**Estimated scope:** S

---

## Task 6: Page

**Description:**
- **Playback:** `resize` in `playback.ts`.
- **`ReadyPage`:**
  - the outages state;
  - scenario changes clear it;
  - `reset` or `resize` depending on what changed;
  - announcements on a toggle.
- **`SimContext`:** `outages` and `toggle`.
- **`LoadNode`:** the power button (`nodrag`, labelled) and grey gauge.
- **`nodeStatusAt`:** the off text.
- **New `OutageList`** in the side panel.
- **`NodeStatsTable`:** the "Failed while off" column.

**Acceptance criteria:**
- [x] The page tests pass.

**Verification:**
- [x] `npx vitest run src/components/loadsim`. Full suite: 1,295 passed and 2 skipped. `tsc`, lint and `npm run build` are clean.

**Notes (2026-11-05):**
- **Playback:** `resize` keeps the position (clamped) and the play state. `ReadyPage` records in a ref whether the scenario or the outages changed last, and calls `reset` or `resize`.
- **Announcements:** the playback subscription treats a resize after an outage change as carrying on. Otherwise a saturation already passed would be announced again over the toggle's own "Lab API 1 switched off at 4:12."
- **Power button:** `LoadNodeBody` takes `off` and `onToggle`, and shows a lucide `Power` button only when `canSwitchOff(kind)`. The button has the `nodrag nopan` classes, an `aria-label` ("Switch off …" or "Bring back …") and a visible focus ring. While a node is off, its gauge is a full grey bar (band `"off"`).
- **Status text:** `nodeStatusAt` reads `frame.off`, and takes "Off since" from the outage covering the step in `summary.outages`.
- **Side panel:** `OutageList` sits under the playback bar. Remove and Clear all count as outage changes, so playback keeps its place.
- **Clearing outages on a scenario change** has no unit test, because there's no DOM. It's checked in the browser in Task 7.

**Dependencies:** Task 5

**Files:** `src/components/loadsim/playback.ts`, `load-sim-app.tsx`, `sim-context.ts`,
`load-node.tsx`, `sim-canvas.tsx`, `node-stats-table.tsx`, `run-summary.tsx`, new
`outage-list.tsx`

**Estimated scope:** M

---

## Task 7: Docs, full checks, browser checks

**Description:**
- **Docs:**
  - README: switching components off;
  - capability map status;
  - the spec's Results section.
- **Full checks**, and the probe diff: identical without outages.
- **Browser** (Chrome DevTools, production build, 1440×900, tab in front):
  - `link-shortener/good`: switch off `api-1` mid-run. Red dots appear for a moment, then
    every dot goes to `api-2`. Bring it back.
  - `course-registration/good`: switch off the cache, and the database saturates.
  - the keyboard path to the power button, and the announcement.
- **Lighthouse** on `/simulate` with an outage in place.
- **Timing:** a re-run with an outage, for each pilot.

**Acceptance criteria:**
- [x] The spec's success criteria all hold.

**Verification:**
- [x] `npm test` (1,296 passed, 2 skipped), `npx tsc --noEmit`, `npm run lint` and `npm run build` are all clean.
- [x] Probe diff: unchanged without outages (identical apart from the timing lines).
- [x] Browser notes, the Lighthouse score and the timings recorded here.

**Notes (2026-11-05):**
- **Docs:** the README's Load simulation section covers switching things off. The capability map status and the spec's Results section are written.
- **Browser** (Chrome DevTools, production build, 1440×900, tab in front):
  - **`link-shortener/good`:**
    - power buttons on Link API 1 and 2, the cache and the database, none on the load balancer;
    - switched off at 2:00, playback stays at 2:00 and "Link API 1 switched off at 2:00." is announced;
    - Link API 1 reads "Off · still getting requests" at 2:04 and 2:08, then "Off since 2:00" (grey bar) from 2:12;
    - Link API 2 is at 65% until the balancer notices, then "Saturated", and by 3:20 "Saturated · 2,157 failed";
    - the Outages list, the N+1 note and the table's "Failed while off" (833) all appear;
    - brought back at 3:20: "Link API 1: off 2:00, back 3:20", announced, and playback stays at 3:20.
  - **Scenario change** (the Shape select): the outages clear and playback restarts from 0. This is the check the unit tests couldn't make.
  - **Keyboard:** two Tabs from the page reach "Switch off Link API 1", with a visible teal focus ring. Enter switches it off; focus stays on the button, now "Bring back Link API 1", and the switch-off is announced.
  - **`course-registration/good`, cache off at 2:00:** the cache reads "Off since 2:00", and Registration DB "Saturated · 262 failed" by 2:30. The note: "Section cache was off from 2:00. Every read went to Registration DB, which peaked at 129% busy; 4,217 requests timed out there."
  - **`lab-autograder/good`, workers off 40:00–50:00:** "Grading jobs grew to 800 waiting; no job was lost." A second outage on the same node appears as its own item in the list.
  - **Console:** no errors or warnings.
- **Lighthouse:** 100 for accessibility, best practices, SEO and agentic browsing, both as a snapshot with the cache outage in place (39 audits) and on a fresh navigation (58). None failed.
- **Timing, and a fix:** the first measurement of a switch-off in the autograder's 60-minute run was 107 ms, over the 100 ms target. As the plan allowed, `LoadInput` now takes `baseline` (the same run without outages). The page keeps that run in its own memo and passes it in, so a switch-off runs the model once. A test checks that passing it gives exactly the result of working it out. After the change: 90 ms (first, cold), then 55 and 61 ms. Link shortener 55 ms and registration 79 ms were measured before the change.
- **Playback** with an outage at 1×: 60 fps, p95 frame 17.0 ms.
- **For later (not acted on):** with the cache off, the headline still says "Registration DB saturated at 2:00. Add shards for writes, or replicas for reads." The outage note right below gives the real cause. The headline could point at the outage instead.

**Dependencies:** Task 6

**Files:** `README.md`, `CAPABILITY-MAP-dataflow-sim.md`, `SPEC-loadsim-failures.md`, this file

**Estimated scope:** M
