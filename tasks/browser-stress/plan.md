# Implementation Plan: `browser-stress`

Spec: [SPEC-browser-stress.md](../../SPEC-browser-stress.md) (approved 2026-11-07).
Capability map: [CAPABILITY-MAP-stress.md](../../CAPABILITY-MAP-stress.md). Task
checklist: [todo.md](todo.md). Branch: `test/browser-stress`, from `main` (`136ff73`).

## Overview

- **The runner first:** `@playwright/test`, its config and the two helper files, proven by
  one smoke test against a production build before any scenario is written.
- **Then one scenario per task,** each measured once without budgets, then gated.
  The two most likely to find problems (the canvas, `/simulate`) come first.
- **The first-click flake** gets its own task, since it may need an app fix.
- **Last:** three clean runs in a row, mutation checks, both probes, docs and the commit.

## Dependency graph

```
T0 baseline: branch, both probes saved, npm test count
        │
        ▼
T1 runner: @playwright/test, config, helpers, smoke test
        │
        ├──────────────┬──────────────┬──────────────┬──────────────┐
        ▼              ▼              ▼              ▼              ▼
T2 canvas         T3 /simulate   T4 saved design  T5 first click  T6 memory
        │              │              │              │              │
        └──────────────┴──────┬───────┴──────────────┴──────────────┘
                              ▼
            T7 three clean runs, mutation checks, probes, docs, commit
```

T2–T6 depend only on T1 and could go in any order. They run in the order above:
- T2 and T3 are the likeliest to find performance problems, and finding out early decides
  whether a new module is needed.
- T5 is the only one likely to change app code.

## Architecture decisions

### The runner

- **`@playwright/test` `1.63.0`, exact** (`npm install -D -E`). It must match the installed
  `playwright` `1.63.0`, so both use one `playwright-core` and the Chromium already
  downloaded. T1 checks `npx playwright --version` and that no browser download happens.
- **`playwright.config.ts`:**
  - `testDir: "e2e"`, `fullyParallel: false`, `workers: 1`, `retries: 0`;
  - one project, Chromium, viewport 1440 × 900;
  - `use.baseURL: "http://127.0.0.1:43128"`;
  - reporter `list`;
  - a per-test timeout of 60 s. The memory test sets its own 3 minutes.
- **`webServer`:**
  - `command: "npm run build && npx next start -H 127.0.0.1 -p 43128"`;
  - `url: "http://127.0.0.1:43128"`, `reuseExistingServer: false`, `timeout: 300_000`.
  - `npm run start` isn't used because it's fixed to port 43127.
- **Where vitest and Playwright meet:** spec files end in `.spec.ts` under `e2e/`, which
  vitest's `include` (`src/**/*.test.*`, `tests/**/*.test.ts`) never matches. T1 checks the
  vitest count is unchanged.

### `e2e/support/designs.ts`

- It imports `generateDesign` from `src/test/gen-designs.ts` and `exportDesignFile` from
  `src/lib/challenges/design-file.ts`. Playwright's TypeScript loader reads `tsconfig`
  `paths`, so `@/` imports should resolve; T1 proves it.
- Each design is written once to a file under the test's output folder and its path
  returned:
  - `random200` and `app200` (seed 1);
  - `stacked5x4`;
  - a `replicasInf` text and a `selfLoop` text, made by editing an exported file, as
    `tests/stress-import.test.ts` does.
- The BeUWI demo is loaded with its own button, not a file.

### `e2e/support/measure.ts`

| Helper | What it does |
|---|---|
| `collectErrors(page)` | Collects `pageerror` and console `error` messages into an array the test checks last |
| `installFrameRecorder(page)` | An init script that pushes every `requestAnimationFrame` timestamp to `window.__frames` |
| `frameStats(page, from, to)` | Median gap, worst gap and frames per second between two `performance.now()` marks |
| `installLongTasks(page)` | A buffered `PerformanceObserver` for `longtask` into `window.__longTasks` |
| `longTaskStats(page)` | Count, total and longest |
| `heapAfterGc(page)` | A CDP session: `HeapProfiler.collectGarbage`, then `JSHeapUsedSize` from `Performance.getMetrics` |
| `timed(fn)` | Milliseconds an async step took |
| `line(name, parts)` | Prints the scenario's one line of numbers |

**Editor helpers,** in the same file or a small `e2e/support/editor.ts`:
- `importDesign(page, path)` uses `setInputFiles` on the "Design file to import" input,
  and confirms "Replace your design?" if it appears;
- `clickRun(page)`;
- `simulateLoad(page)`.

### Measuring before gating

- Each scenario task first runs with its budgets off and prints the numbers. I run it
  three times and record them in `todo.md`.
- **Gating:** the spec's budget goes in only if the slowest of the three is at least 3×
  under it.
- **If not,** I stop and bring you the numbers. Either the budget changes with your OK,
  or the case is pinned as a problem.

### Pins

- A problem that needs real performance work is marked `test.fail()`, titled
  `[owner-module] …`, with a comment giving the numbers.
- I add the owner module as a new row in the capability map.
- This mirrors the vitest pins (`it.fails`) from the earlier modules.

### The first-click flake

- The test clicks Run simulation as soon as Playwright finds it actionable. A
  server-rendered button is actionable before React hydrates, so this is the likeliest
  way to reproduce the flake.
- **If it reproduces:**
  - confirm the cause by checking whether the click lands before hydration;
  - write a failing test first;
  - fix it. A likely fix is a button that doesn't act until hydrated, or one that keeps
    a click made before hydration.
- If the fix touches more than a few files, or changes how something looks, I ask first.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Playwright's loader can't resolve `@/` in `src/test/gen-designs.ts` | Medium: no generated designs | T1 proves it first. Fallback: a tiny vitest-run script, only when an env var is set, that writes the YAML files to a git-ignored `e2e/.designs/` before the run. |
| `@playwright/test` pulls a different `playwright-core`, or downloads browsers | Low | Exact version; T1 checks `npm ls playwright-core` shows one copy, and that no download happens. |
| The build takes minutes on each run | Low: slow, not wrong | One `webServer` per run; single specs with `npx playwright test <file>` while working. |
| Timings are noisy on this busy machine | Medium: flaky gates | Budgets need 3× headroom over the slowest of three runs; the finish needs three clean runs in a row. |
| `requestAnimationFrame` gaps in headless Chromium aren't real frame rates | Medium | Headless shell paces frames; T2 also runs once headed (`--headed`) and compares. If they differ a lot, the frame budgets apply headed only, and I tell you. |
| A port clash on 43128 | Low | `reuseExistingServer: false` makes Playwright fail loudly rather than test the wrong server. |
| `HeapProfiler`/`Performance` CDP calls behave differently in the headless shell | Low | T6 checks the numbers move when a big design is loaded, before trusting them. |

## Open questions

None.
