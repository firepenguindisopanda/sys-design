# Implementation Plan: `stale-results`

Spec: [SPEC-stale-results.md](../../SPEC-stale-results.md) (approved). Task checklist:
[todo.md](todo.md). Branch: `feat/stale-results`, from `main` (`80735c5`).

## Overview

When a run finishes, the store keeps a fingerprint of the design. The panel compares it
with the design now and marks the results as old when they differ. A small pure module
sorts and counts the result rows. The panel shows failures first, a count summary, and
two toggles: one collapses the passes, one hides the panel. Seven check messages stop
citing a PDF. Engine statuses and numbers don't change.

## Dependency graph

```
T1 renderWithStore helper (move from a11y.test.tsx), a11y tests still green
        │
        ▼
T2 tests: fingerprint option, store staleness, results module, panel, no "PDF" (failing)
        │
        ├──────────────────────┬──────────────────────┐
        ▼                      ▼                      ▼
T3 fingerprint option    T4 results.ts          T6 seven messages
   + store record           (order, count,
   + resultsAreStale         summary)
        │                      │
        └──────────┬───────────┘
                   ▼
T5 verification-panel.tsx: order, counts, toggles, stale notice, live regions
                   │
                   ▼
T7 docs, full checks, browser checks, Lighthouse
```

## Architecture decisions

- **Reuse the fingerprint, with a `forResults` option.**
  - `fingerprint(s, { forResults: true })` leaves out each node's `at` and `purpose`.
    Everything else the engine and rules read is already in it: kind, label, config,
    edges with protocols, placements, requirements, feature numbers and NFRs.
  - Unsaved-work detection keeps calling it without the option, so its tests don't move.
  - Both strings (`canvas` and `rest`) are compared. Unlike unsaved work, there's no
    "empty canvas" exception: emptying the canvas after a run is a change.
- **The record lives in the store; staleness is derived.**
  - `verifiedFingerprint` is set in `runVerification`, and set to `null` in the seeds and
    wherever `verification: null` is set.
  - `resultsAreStale()` is a method, like `hasUnsavedWork()`. The panel subscribes with
    `useSimulatorStore((s) => s.verification !== null && s.resultsAreStale())`.
  - That selector runs on every store change, drag frames included, and builds one
    fingerprint each time. With the demo's 11 nodes that's a few small `JSON.stringify`
    calls. If the browser check shows lag while dragging, memoise on
    `nodes`/`edges`/`features`/`nfr` identity; not before.
- **`src/lib/results.ts` has no React.** It turns `VerificationResult.checks` and
  `RuleResult[]` into one `ResultRow[]`:
  - `orderResults` sorts with a stable sort (Array.prototype.sort is stable in every
    supported engine) by fail, then warn, then pass;
  - `countResults` and `summarizeCounts` give the counts and the text, with the wording
    "3 failed · 1 warning · 8 passed" (singular "warning" for 1).
- **Panel state is local.** `showPassed` and `hidden` are `useState` in the panel. The
  content part is keyed on the `verification` object, so a new run remounts it and both
  reset. The hide toggle sits in the header, outside the keyed part. A `useEffect` on
  `verification` sets `hidden` back to false, because a new run should show the panel
  again.
- **Two live regions**, both `aria-live="polite"` and visually hidden (`sr-only`) except
  the stale notice, which is also visible:
  - after a run: "Run finished: 3 failed, 1 warning, 8 passed.";
  - when the results go old: "Design changed since this run."

  They're rendered empty from the start, so screen readers notice the text when it
  arrives.
- **`renderWithStore` moves to `src/test/render-with-store.tsx`.** It copies the live
  state into `getInitialState()` before `renderToStaticMarkup` and restores the original
  in a `finally`. That's the same trick `a11y.test.tsx` uses inline now, and the comment
  explaining why moves with it. Vitest only collects `*.test.*`, so the helper isn't run
  as a test.
- **Message rewrite (T6)** changes string literals only. The new test that no `detail`
  contains "PDF" runs every fixture and both demos, so it reaches all seven messages.

## Task list

- [x] Task 1: Move the store-render helper
- [x] Task 2: Tests first
- [x] Task 3: Fingerprint option and stale record in the store
- [x] Task 4: Results module
- [x] Task 5: Results panel
- [x] Task 6: Messages without "PDF"
- [x] Task 7: Docs, full checks, browser checks

### Checkpoint
- [x] All five spec success criteria met; ready for review (nothing committed until
  asked)

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Building a fingerprint on every store change makes dragging lag | Med | Measured in the browser check by dragging in the demo; memoise only if needed |
| React Flow's measuring (`dimensions` changes) marks results stale on load | Med | Measured sizes aren't in the fingerprint; the store test runs `onNodesChange` with a dimensions change and expects "not stale" |
| Something that does change results isn't in the fingerprint | Med | The store test lists every editing action; the fingerprint already drives unsaved work, which has the same coverage |
| The stale notice wraps the header awkwardly at narrow widths | Low | Checked at 1280 and 390 px; the counts hide below `sm`, as the metrics already do |
| Sorting moves a row students expected in a fixed place | Low | Order within each status group is kept; the title is unchanged |
| A rewritten message breaks a test that pins its text | Low | Grep found no test pinning the seven messages; the full suite runs in T6 |
