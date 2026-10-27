# Implementation Plan: Phase 3, slice 1: start and verify a challenge

Spec: [SPEC-challenge-slice1.md](../../SPEC-challenge-slice1.md) (approved). Map:
[CAPABILITY-MAP-phase3.md](../../CAPABILITY-MAP-phase3.md). Task checklist: [todo.md](todo.md).
Branch: `feat/challenge-slice1`. Earlier steps: [phase1/](../phase1/plan.md),
[reachability/](../reachability/plan.md), [data-checks/](../data-checks/plan.md).

## Overview

Load the briefs on the server and hand them to the client; add a challenge session to
the Zustand store (start, leave, locks, verification with rules); then a toolbar picker
and the small panel changes that make locks and rule results visible. Along the way, fix
features staying "placed" on removed nodes.

## Dependency graph

```
T1 challenge-content (page loads briefs; server-only)      T2 unplace on node removal
          │                                                        │
          └───────────────► T3 challenge-session (store) ◄─────────┘
                                     │
                     ┌───────────────┴───────────────┐
              T4 picker in toolbar          T5 panels: locks + rule rows
                     └───────────────┬───────────────┘
                               T6 browser + build check, README
```

## Architecture decisions

- **Briefs travel as props.** `page.tsx` (Server Component) → `SimulatorApp` →
  `DesignCanvas`. Only the picker needs the list; prop drilling two levels is simpler
  than a context or putting a static list in the store.
- **The store owns the session and the locks.** UI disabling is cosmetic on top; the
  store tests are the source of truth for "students can't change a brief".
- **Rules run inside the store's `runVerification`**, reusing
  `src/lib/challenges/rules.ts` (no `node:fs`, so it's safe in the browser). The overall
  status combines both, so every panel that reads `verification.overall` gets the right
  answer for free.
- **`load.ts` gets `import "server-only"`** so any accidental import from client code is a
  build error. vitest runs in a plain node environment, where `server-only` would throw
  on import; the test config aliases it to an empty module (documented in the config).
- **The end-to-end test drives the store with the fixture designs**, built by the
  existing `buildDesign`, so the UI path and the fixture harness can't drift apart.

## Task list

### Phase A: Foundations (independent)
- [x] Task 1: Load briefs on the server and pass them to the client
- [x] Task 2: Unplace features when their node is removed

### Checkpoint A
- [x] Tests, types, lint and `npm run build` green; app unchanged in the browser

### Phase B: Session
- [x] Task 3: Challenge session in the store (start, leave, locks, verification with rules)

### Checkpoint B
- [x] Store tests and the end-to-end test pass; demos test unchanged

Notes from Phases A and B:
- **`server-only`:** Next 16 says installing it is optional; installed anyway as
  approved. Verified a client import fails the build. vitest aliases it to `empty.js`.
- **Demo buttons leave the challenge too** (`loadDemo` / `loadFanInDemo` clear
  `challenge`), so a demo can never mix with a locked brief.
- **The end-to-end test** puts fixture nodes and edges into the store with `setState`
  (exact ids can't be rebuilt through `addComponent` / `onConnect`), then uses the real
  `startChallenge`, `placeFeature` and `runVerification`.
- **Browser click-through of node deletion** was deferred to Task 6: the pane was in the
  background and clicks didn't land. The same `onNodesChange` path is unit-tested.
- **Next.js security notice:** `next build` reports `next@16.4.0` is affected by known
  advisories (confirmed with `npm audit`: fixed in 16.4.3). Not part of this slice;
  raised with the user.

**Pending: rebase onto the new `main` once this slice is committed** (agreed with the
user). `main` moved to `896c8f9` (Next.js 16.4.3 security upgrade) after this branch
was cut from `01f8912`. Expect a conflict in `package.json` / `package-lock.json`
(this branch adds `server-only`; `main` bumps `next`): keep both, then run
`npm install` to regenerate the lockfile, and re-run tests, lint and build. Until the
rebase, this checkout (and the dev server on 43127) still runs `next@16.4.0`.

### Phase C: UI
- [x] Task 4: Challenge picker in the toolbar
- [x] Task 5: Locked requirements panel and rule rows in the verification panel

Notes from Phase C:
- The picker uses Base UI's `items` map so the trigger shows titles, not ids.
- Browser walkthrough (1440px): picked the link shortener; 12/12 number inputs
  disabled, no add form or remove buttons; added a PaaS, placed both features, ran
  verification → Fail with three "Brief rule" rows; deleted the node by keyboard → both
  features back to "Needs placement"; Sandbox restored the 11-node demo. No console errors.
- **Existing layout gap (not fixed):** between 1024 and 1279px the requirements panel is
  unreachable: the desktop panel is `hidden xl:block`, the header drawer buttons are
  `lg:hidden`.
- **Existing (not fixed):** the placement select shows the raw node id (e.g. `paas-16`)
  rather than the label; same fix as the picker (`items`), for `challenge-panels`.

### Checkpoint C (complete)
- [x] Task 6: Browser walkthrough of all five user stories, build, README note
- [x] All five spec success criteria met; ready for review (nothing committed until asked)

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `server-only` throws under vitest (no React server condition) | Med | Alias it to an empty module in `vitest.config.mts`; `npm run build` still enforces it |
| Turbopack dev doesn't pick up YAML edits (page cached) | Low | Dev re-renders the page per request; if not, note it in the README; the build is the source of truth |
| Node deletion goes through `onNodesChange` with React Flow change objects | Med | Unplace on `remove` changes specifically; test with a real `applyNodeChanges` remove |
| shadcn `Select` from `@base-ui/react` behaves differently from Radix | Low | Copy the pattern already used for the protocol picker in the toolbar |
| Starting a challenge wipes a sandbox design without warning | Low | Accepted in the spec (assumption 3); confirm dialog is a later polish item |

## Parallelization

Tasks 1 and 2 are independent, as are 4 and 5, but each pair is small and the second of
each touches files near the first, so they run in sequence.

## Open questions

None. The spec's three questions were answered with the proposals.
