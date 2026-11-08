# Spec: stress checks in a real browser (`browser-stress`)

The last module of [CAPABILITY-MAP-stress.md](CAPABILITY-MAP-stress.md). Branch
`test/browser-stress`, from `main` (`136ff73`). Status: **built** (2026-11-07); see
[Results](#results), which also records where the build departed from this spec.

## Objective

The four earlier modules check the engine, the load model and import in Node. None of them
checks what a student actually feels: whether the canvas stays smooth with a big design,
whether `/simulate` copes with its largest scenario, whether memory keeps growing, and
whether the page handles a bad saved design. This module drives Chromium against a
**production build** and measures those things.

**Done means:**
- one command runs every scenario below against `next build` + `next start`, prints its
  numbers, and fails on a hang, a page error, wrong content or a blown budget;
- the first-click-on-Run flake is either reproduced and fixed, or ruled out with evidence;
- every problem found is fixed here if it's small, or pinned with the module that will fix
  it.

## Decisions (2026-11-07)

| Question | Decision |
|---|---|
| Runner | **`@playwright/test`**, pinned to `1.63.0` to match the installed `playwright` (same `playwright-core`, so the Chromium already downloaded, `chromium-1228`, is reused). Its own config and an `e2e/` folder. |
| Timings | **Gate generously.** Hangs, page errors and wrong content always fail. Timings fail only past the budgets below, and every number is printed. |
| Problems found | **Fix small, pin big.** Contained bugs (such as the first-click flake) are fixed here, test first. Anything needing real performance work is pinned with `test.fail()` and a title starting `[owner-module]`, and becomes its own module. |

## Scenarios

Every scenario runs at 1440 × 900. Each also fails on any `pageerror` or console error.

### 1. A 200-node design on the canvas

Designs: `random` 200 nodes seed 1 (the one that needed the latency estimate) and `app`
200 nodes seed 1, written to YAML with the harness's `generateDesign` and the app's own
`exportDesignFile`.

| Step | Checks | Budget |
|---|---|---|
| Import the file through the editor's file input | All 200 nodes are on the canvas | within 5 s; no long task over 2 s |
| Run simulation | The results appear; for `random` seed 1, the latency row ends with "…so this is an estimate." | within 2 s (measured 136–245 ms on 2026-11-06) |
| Drag a node 300 px in 30 steps | The node moves; frame times recorded | median frame ≤ 50 ms; worst ≤ 500 ms |
| Pan and zoom the canvas | Frame times recorded | median frame ≤ 50 ms |

### 2. `/simulate` at 1,000,000 requests

Designs: the BeUWI demo, and `app` 200 nodes seed 1.

| Step | Checks | Budget |
|---|---|---|
| Simulate load from the editor | `/simulate` shows the design and results | within 5 s |
| Set requests to 1,000,000 and leave the field | The results update; the field reads "1,000,000" | within 5 s; no long task over 2 s |
| Play at the fastest speed for 5 s | The playback position moves | median frame ≤ 50 ms |
| Switch a node off, then back on | The outage appears in the results, then goes | each within 5 s |

### 3. Memory over repeated use

Ten cycles of: import `app` 200 seed 1 → Run simulation → Simulate load → back to the
editor. Heap measured after a forced garbage collection (Chrome DevTools Protocol
`HeapProfiler.collectGarbage`, then `Performance.getMetrics`), after cycle 1 and after
cycle 10.

| Checks | Budget |
|---|---|
| The tenth cycle still works | — |
| Heap growth from cycle 1 to cycle 10 | ≤ 50 MB first estimate; built at **10 MB** (see Results) |

### 4. The first click on Run simulation

Seen once in the `workload-fields` browser check, never investigated. **Likely cause, to
confirm:** the server-rendered button is clicked before React has hydrated, so the click is
lost.

- Twenty fresh page loads. On each, load the BeUWI demo and click Run simulation the moment
  Playwright finds it clickable, which can be before hydration.
- **Pass:** the results appear within 2 s on all twenty.
- **If it reproduces:** find the cause, write a failing test, fix it (small fix, so it's in
  scope), and show twenty out of twenty after.
- **If it doesn't:** the spec's results record "not reproduced in 20 tries under
  automation", and the test stays as a guard.

### 5. Reloading `/simulate` with a bad saved design

Each case writes `sessionStorage["sesim:load-sim"]` and then loads `/simulate`.

| Saved value | Expected | Budget |
|---|---|---|
| Not JSON | "The saved design couldn't be read. Go back to the editor and try again." | within 2 s |
| JSON without `text` | The same message | within 2 s |
| A design with `replicas: .inf` | The import error naming that field (`config-bounds`) | within 2 s |
| A design with a self-loop | "an edge can't connect … to itself" | within 2 s |
| Stacked 5 × 4 load balancers | "This design has more than 2,000 ways for a request to travel…" (`loadsim-route-scale`) | within 2 s |
| Nothing saved | "Open the editor, draw and connect a design, then choose Simulate load." | within 2 s |
| A good design (the BeUWI demo), then reload | The same results after the reload as before | within 5 s |

### The budgets

- They're first estimates, set before measuring. Each scenario's task measures them before the
  scenario gates on them.
- If a measurement comes within 3× of its budget, that's a finding to discuss, not a
  reason to loosen the budget. Loosening a budget needs your OK.
- A blown budget that needs real performance work is pinned, not loosened.

## Measuring

Small helpers in `e2e/support/measure.ts`:
- **Frames:** an init script records each `requestAnimationFrame` timestamp; a scenario
  reads the gaps between two marks (median, worst, frames per second).
- **Long tasks:** a buffered `PerformanceObserver` for `longtask` (count, total, longest).
- **Heap:** a CDP session: `HeapProfiler.collectGarbage`, then `JSHeapUsedSize` from
  `Performance.getMetrics`.
- **Errors:** every `pageerror` and console error, collected per test and checked at the
  end.

Each scenario prints one line of numbers, in the style of the size ladder:

```
canvas random 200 seed 1: import 1,840 ms (budget 5,000), run 210 ms (budget 2,000), drag median 16 ms / worst 120 ms, longest task 640 ms
```

## Not changing

- **The engine, the load model and their numbers.** The engine probe and the load-model
  probe stay byte-identical.
- **`npm test`.** The vitest suite doesn't pick up `e2e/`, and its count stays at 1,833
  passed.
- **The app,** apart from small fixes this module finds (the first-click flake, if it's
  real), each test first.

## Commands

```bash
npm run test:browser
```

This is `playwright test`. Its `webServer` runs `npm run build` and then
`next start -H 127.0.0.1 -p 43128`, a port of its own, so a dev server on 43127 doesn't
interfere. It takes a few minutes, so it isn't part of `npm test`.

```bash
npx playwright test e2e/saved-design.spec.ts
```
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

## Project structure

| File | Change |
|---|---|
| `package.json`, `package-lock.json` | `@playwright/test` `1.63.0` as a dev dependency; the `test:browser` script |
| `playwright.config.ts` | `testDir: "e2e"`, Chromium only, one worker, no retries, the `webServer` above, list reporter |
| `e2e/support/designs.ts` | Writes the generated and demo designs to YAML files in a temp folder |
| `e2e/support/measure.ts` | Frames, long tasks, heap, errors |
| `e2e/canvas-scale.spec.ts` | Scenario 1 |
| `e2e/simulate-scale.spec.ts` | Scenario 2 |
| `e2e/memory.spec.ts` | Scenario 3 |
| `e2e/first-click.spec.ts` | Scenario 4 |
| `e2e/saved-design.spec.ts` | Scenario 5 |
| `.gitignore` | `test-results/`, `playwright-report/` |
| `CAPABILITY-MAP-stress.md` | `browser-stress` status, and the stale "not merged yet" line for `engine-path-scale` |

## Code style

```ts
test("canvas: random 200 nodes, seed 1", async ({ page }) => {
  const errors = collectErrors(page);
  await importDesign(page, designs.random200);
  const run = await timed(() => clickRun(page));
  console.log(`canvas random 200 seed 1: run ${ms(run)} (budget 2,000)`);
  expect(run).toBeLessThanOrEqual(2_000);
  expect(errors).toEqual([]);
});
```

- Locators by role and accessible name (`getByRole("button", { name: "Run simulation" })`),
  as the capture scripts do; no CSS selectors where a role works.
- No fixed `waitForTimeout`; wait for the content that proves the step happened.
- Budgets as named constants at the top of each file, with the date they were set.

## Testing strategy

- **Each scenario first runs three times without budgets,** to record its numbers.
  Then the budgets go in.
- **Mutation check for each scenario:** break the thing it guards for a moment (for
  example, don't render the results, or throw in the handoff reader) and see the scenario
  fail. Undo with backups in the scratchpad, as before.
- **A fix found here** gets its own failing test first: a vitest unit test where possible,
  and the e2e scenario as the end-to-end proof.
- **Stability:** the whole run passes three times in a row before it's done.

## Boundaries

- **Always:**
  - run against a production build, never the dev server;
  - wait for content, not time;
  - print every measured number.
- **Ask first:**
  - loosening a budget;
  - any dependency besides `@playwright/test`;
  - a fix that touches more than a few files, or changes how something looks.
- **Never:**
  - change the engine's or load model's numbers;
  - use port 43127;
  - add retries to hide a flake.

## Success criteria

1. `npm run test:browser` runs all five scenarios against a production build, prints
   their numbers, and passes three times in a row; every failure is either fixed or
   pinned with an owner module.
2. The first-click flake is reproduced and fixed, with twenty out of twenty after, or
   recorded as not reproduced in twenty tries.
3. `npm test` still gives 1,833 passed (1,840 with the seven tests of the first-click fix),
   and both probes are byte-identical to `main`.
4. `npx tsc --noEmit`, `npm run lint` and `npm run build` pass.
5. The capability map shows all five modules built, with the stale `engine-path-scale`
   line corrected.

## Results

Measured 2026-11-07 on a production build in installed Google Chrome, headless at 1440 × 900.
The ranges come from the three final runs in a row, which each gave **20 passed** in about
3.3 minutes; the two pins counted as expected failures.

| Scenario | Measured | Budget | Result |
|---|---|---|---|
| 1. Canvas, `app` 200 | import 0.70–0.72 s, run 0.12 s; drag 39–40 fps, pan 53–55, zoom 60 | 5 s, 2 s, median frame ≤ 50 ms | Pass |
| 1. Canvas, `random` 200 | import 0.70–0.87 s, run 0.27–0.41 s, estimate sentence shown; drag 20–22 fps, pan 21–24, zoom 23–25 | the same | Import and run pass; frames pinned |
| 2. `/simulate`, BeUWI demo | open 0.21–0.24 s, 1,000,000 requests 0.08–0.10 s, playback 60 fps, switch off and back ≤ 0.12 s | 5 s, 5 s, median frame ≤ 50 ms, 5 s | Pass |
| 2. `/simulate`, `app` 200 | open 0.70–0.78 s, 1,000,000 requests 0.38–0.46 s (longest task 0.25 s), playback 35–42 fps, switch off 0.31–0.36 s, back 0.15–0.40 s | the same | Pass; smooth playback pinned |
| 3. Memory, ten cycles | 1.7–1.8 MB growth from cycle 1 to 10, levelling off | 10 MB | Pass |
| 4. First click | 20 of 20 on every variant | all twenty | Fixed (below) |
| 5. Bad saved design | each message in 0.3–0.43 s; the stacked design's longest task under 0.2 s; the good design gives the same results after a reload | 2 s; 5 s | Pass |

**The first click was real, and is fixed.** A click on Run simulation before React hydrates
did nothing. Playwright never managed to click that early while the scripts loaded quickly,
even with the CPU slowed 6×. With only the JavaScript chunks held back 1.5 s (CSS left alone,
so the page paints), **0 of 20** clicks registered. The fix is `src/lib/early-click.ts`:
- an inline script in `src/app/page.tsx` (the pattern in Next's
  `preventing-flash-before-hydration` guide) remembers clicks on elements marked
  `data-early-click`;
- once hydrated, the verification panel takes the click and runs the simulation once.

After the fix it's **20 of 20**, every one clicked before hydration. There are six unit tests
for the script and one for the marked button.

**The memory "leak" was the test, not the app.** The first runs grew 2.2 MB a cycle, without
levelling off. A heap snapshot traced the leftover editor canvases to a DevTools handle that
Playwright keeps for each `setInputFiles` call: it held the old file input and the whole
editor page around it. The import helper now hands the file to the input from inside the
page. Memory then grows under 2 MB in total. The budget went from 50 MB to **10 MB**,
because a canvas kept per cycle grows about 20 MB, which 50 MB would let through.

**Pinned to `canvas-render-scale`** (added to the capability map, not yet specced). Both pins
are `test.fail()` and are skipped with `BUDGETS=off`:
- `[canvas-render-scale] canvas: random 200 nodes, seed 1, smooth frames` needs 35 fps on
  drag, pan and zoom; it gets 20–25;
- `[canvas-render-scale] simulate: app 200 nodes, seed 1, smooth playback` needs 50 fps; it
  gets 35–42.

A pin checks a frame-rate target instead of the 3× headroom rule, because no frame can be
3× under 50 ms at 60 fps.

**Where the build departed from this spec:**
- **Browser:** Playwright 1.63.0 wants Chromium build 1243, and only 1228 is on disk. The
  suite uses installed Google Chrome (`channel: "chrome"`), so nothing is downloaded.
- **Port:** 43128, so a dev server on 43127 can stay up.
- **`next build` type-checks `e2e/`:** a type error there stops the suite's server from
  starting.
- **`BUDGETS=off`:** prints the numbers without failing on them, which is how each budget was
  measured before it gated.
- **Outages:** the "switch off and back" step ends by clearing the outage list, because
  bringing a node back removes a zero-length outage on its own.

**Mutation checks.** Each scenario failed once under a planted fault and passed again after
the undo:

| Scenario | Fault | Failure |
|---|---|---|
| Smoke | Run simulation's click does nothing | the results never appear |
| 1. Canvas | Run simulation waits 3 s | "run: 3,294 ms against a budget of 2,000 ms" |
| 2. `/simulate` | a new scenario waits 6 s | "1,000,000 requests: 6,094 ms against a budget of 5,000 ms" |
| 3. Memory | each editor canvas is kept | 19.8 MB against 10 MB |
| 4. First click | the panel never takes the early click | 0 of 20 with late scripts |
| 5. Saved design | the saved-design reader throws | six of seven cases fail; "nothing saved" never reaches the reader |

**The rest:**
- **Probes:** both are byte-identical to the Task 0 baselines.
- **Unit tests:** `npm test` gives 1,840 passed, 32 skipped.
- **Checks:** `npx tsc --noEmit`, `npm run lint` and `npm run build` pass.

## Open questions

None. Runner, timings and the fix policy are your answers of 2026-11-07. The budgets are
first estimates that each scenario's task measures before anything gates on them.
