# Capability Map: Phase 3, challenge mode in the UI

Status: **approved** (2026-10-27) with the three proposals below. The first slice
(`challenge-content`, `challenge-session`, minimal `challenge-picker`) is specified
together in [SPEC-challenge-slice1.md](SPEC-challenge-slice1.md), with one section per
module id; later modules get their own `SPEC-<module id>.md`.

## Goal

Students open a challenge, read the brief, draw a design on the canvas, and run
verification against the brief's **fixed** requirements and targets, seeing the engine
checks and the brief's own rules together. The free-form sandbox (today's app, with its
two demos) stays available.

## Modules

| Module id | Responsibility | Depends on |
|---|---|---|
| `challenge-content` | `page.tsx` (a Server Component) reads `challenges/` with the existing `loadChallenges` and passes the briefs to the client as serializable props. Invalid content fails the build with the file and field. | — |
| `challenge-session` | Store state for the active challenge: start a challenge (blank canvas, the brief's requirements and NFRs loaded and **locked**), leave it (back to sandbox), and run verification that returns engine checks **plus** rule results. | `challenge-content` |
| `challenge-picker` | UI to choose a challenge or the sandbox, replacing the demo buttons' spot in the toolbar (demos stay in sandbox mode). | `challenge-session` |
| `challenge-panels` | Brief panel (summary, out of scope, reflection questions); requirements panel read-only in a challenge; verification panel shows rule results next to engine checks. | `challenge-session` |
| `design-io` | Export the canvas to the fixture YAML format and import one back, using the existing validator. Works in sandbox and challenge mode. | `challenge-content` (validator and builder only) |

Build order:

```
challenge-content → challenge-session → challenge-picker, challenge-panels
challenge-content → design-io        (can run in parallel with the session work)
```

## Boundaries between modules

- `challenge-session` is the only module that writes challenge state; the picker and
  panels only read it and call its actions.
- Rule evaluation stays in `src/lib/challenges/rules.ts`; the session calls it, and the
  verification panel only displays results.
- `design-io` needs one new function, the inverse of `buildDesign` (canvas → compact
  design); it lives next to `design.ts` and is tested by round-tripping every fixture.

## Out of scope for phase 3

- Saving progress or attempts (the practice site plan keeps progress in the browser;
  that's a later module).
- Grading the reflection questions.
- Moodle / LTI integration.
- New briefs (phase 4).

## Questions to settle before the module specs

1. **Example designs.** Should students be able to load a brief's good or bad designs
   onto the canvas? The good one is effectively the answer. Proposal: not in the student
   picker; available only in sandbox mode via `design-io` import (or a TA-only
   `?examples=1` switch, decided in the `challenge-picker` spec).
2. **Locking.** In a challenge, requirements and NFRs are read-only, but feature
   **placement** stays editable, since placing features on compute is part of the
   design. Proposal: yes.
3. **First slice.** Proposal: `challenge-content` + `challenge-session` + a minimal
   picker together as the first shippable slice, so a challenge can be started and
   verified end to end before the panels are polished.
