# Spec: Phase 3, slice 1: start and verify a challenge

Status: **implemented** (2026-10-27). Approved with all three proposals: unplacing fixed in both
modes, overall = worst of engine and rules, `server-only` package added. Modules `challenge-content`, `challenge-session` and a
minimal `challenge-picker` from the approved
[capability map](CAPABILITY-MAP-phase3.md). Branch: `feat/challenge-slice1`, from `main`. Plan: [tasks/challenge-slice1/plan.md](tasks/challenge-slice1/plan.md).

## Objective

A student opens the app, picks a challenge, sees its requirements and targets (which
they can't change), draws a design, places the features on compute, and runs
verification, getting the engine checks **and** the brief's rules with one overall
result. They can switch back to the sandbox, which behaves exactly as today.

Users: students practising, and you, trying a brief before giving it out.

Not in this slice (later modules): the brief text panel (summary, out of scope,
reflection questions), polished rule display, export/import, example designs.

### User stories and acceptance

1. **Pick a challenge.** The toolbar has a picker listing "Sandbox" and each brief by
   title. Choosing a brief clears the canvas and loads that brief's requirements and
   NFRs. The tagline is shown next to the picker.
2. **Locked brief.** In a challenge, the requirements panel shows the brief's
   requirements and targets, but adding or removing requirements, editing feature
   numbers (RPM, resources) and editing NFRs are disabled. Placing features on compute
   still works.
3. **Verify.** "Run simulation" returns the engine checks plus one row per brief rule.
   The overall result is the worst of both (a failed rule fails the run).
4. **Back to sandbox.** Choosing "Sandbox" returns to the app's starting state (the
   BeUWI demo), with nothing locked and the demo buttons back.
5. **Content errors are caught early.** An invalid brief fails `npm run build` (and
   shows Next's error overlay in dev) with the file and field, using the existing
   validator.

## Assumptions

1. **Only briefs reach the browser, never fixtures.** Fixtures include the good design,
   which is effectively the answer (approved proposal 1).
2. **Locking is enforced in the store**, not only by disabling inputs, so nothing else
   can change a locked brief by accident.
3. **Starting a challenge discards the current canvas without asking.** A confirm dialog
   is a polish item for later; the sandbox can always be restored with the demo buttons.
4. **No saved progress.** Reloading the page returns to the sandbox.
5. **Rule rows reuse the existing check row**, with the rule's `id` as the title for
   now; nicer rule titles belong to `challenge-panels`.

## Module: `challenge-content`

- `src/app/page.tsx` stays a Server Component. It calls
  `loadChallenges(path.join(process.cwd(), "challenges"))` and passes
  `briefs: Brief[]` (briefs only, no fixtures) to `SimulatorApp`.
- `Brief` objects are plain JSON-safe data, which the Next 16 docs require for props from
  Server to Client Components ("Passing data from Server to Client Components").
- The page is prerendered at build time, so no server is needed at runtime; in dev, the
  briefs are re-read on each request.
- `load.ts` uses `node:fs`, so it must never be imported by a Client Component. A
  `server-only` guard would need a new dependency; instead, a short comment in `load.ts`
  and the fact that only `page.tsx` imports it. (See open question 3.)

## Module: `challenge-session` (store)

New state and actions in `src/lib/store.ts`:

```ts
challenge: Brief | null;          // null = sandbox
ruleResults: RuleResult[] | null; // set by runVerification in a challenge
startChallenge: (brief: Brief) => void;
leaveChallenge: () => void;
```

- **`startChallenge(brief)`**: empty canvas; `functionalReqs` and `features` built from
  the brief's requirements (feature id = requirement id, unplaced); `nfr` = brief's NFRs;
  `verification` and `ruleResults` cleared; selection cleared.
- **`leaveChallenge()`**: `challenge` = null, then the same state the app starts with
  (`demoSeed()`).
- **Locks** (while `challenge` is set): `addFunctionalRequirement`,
  `removeFunctionalRequirement`, `updateFeature` and `setNfr` do nothing. `placeFeature`,
  canvas editing and `clearCanvas` still work.
- **`runVerification`**: unchanged in the sandbox. In a challenge, also runs
  `evaluateRules(challenge, nodes, edges)` into `ruleResults`, and sets the overall
  status to the worst of the engine result and the rules.
- **Unplacing on removal (fixes an existing bug in both modes):** today `clearCanvas`
  and deleting a node leave features "placed" on nodes that no longer exist. Both now
  unplace those features. In a challenge, this is the only way features would otherwise
  get stuck, since the student can't re-create them.

## Module: `challenge-picker` (minimal)

- In the canvas toolbar (`design-canvas.tsx`), a select: "Sandbox", then each brief's
  `title`. `briefs` are passed down `SimulatorApp` → `DesignCanvas` as a prop.
- Sandbox: today's toolbar (Load BeUWI demo, Fan-in DB demo, Clear).
- Challenge: the picker, the brief's `tagline`, and Clear. Demo buttons are hidden.
- Requirements panel: in a challenge, the add-requirement form and remove buttons are
  hidden, and feature and NFR inputs are `disabled`. Placement controls stay enabled.
- Verification panel: in a challenge, rule results follow the engine checks as rows with
  the same status icon and their `detail` text.

## Commands

```bash
npm run dev            # http://localhost:43127
npm test
npx tsc --noEmit
npm run lint
npm run build          # must pass: proves briefs load and validate at build time
```

## Project structure

```
src/app/page.tsx                                   loads briefs, passes them down
src/lib/challenges/load.ts                         comment: server-only
src/lib/store.ts                                   challenge, ruleResults, start/leave, locks, unplacing
src/lib/store.test.ts                              new: session and lock tests
src/components/simulator/simulator-app.tsx         accepts briefs prop
src/components/simulator/design-canvas.tsx         picker in toolbar
src/components/simulator/requirements-panel.tsx    locked state
src/components/simulator/verification-panel.tsx   rule rows
```

## Code style

Follow the store's existing pattern: actions as arrow functions using `get()` / `set()`;
locks as an early return.

```ts
setNfr: (patch) => {
  if (get().challenge) return; // brief targets are fixed in a challenge
  set({ nfr: { ...get().nfr, ...patch } });
},
```

UI follows the existing shadcn/ui components (`Select`, `Button`, `Input`) and Tailwind
classes already used in the toolbar and panels.

## Testing strategy

- **Store tests (`src/lib/store.test.ts`, node environment, test first):**
  start a challenge (requirements, features, NFRs match the brief; canvas empty); each
  lock is a no-op in a challenge and works in the sandbox; `placeFeature` works in a
  challenge; `runVerification` in a challenge returns rule results and the worst overall
  status (a failing rule makes `overall` fail); `leaveChallenge` restores the demo seed;
  `clearCanvas` and node deletion unplace features. Use the real `link-shortener` brief
  via `loadChallenges`.
- **End-to-end in a test:** start `link-shortener`, build its good fixture's canvas
  through store actions, verify → overall pass; same with `bad-no-cache` → fails
  `cache-on-read-path`. This proves the UI path matches the fixture harness.
- **Regression:** `tests/demos.test.ts` and all existing tests unchanged.
- **Browser:** pick each challenge, confirm locks, place features, run verification, go
  back to the sandbox; no console errors.
- **Build:** `npm run build` passes.

## Boundaries

- **Always:** read the relevant `node_modules/next/dist/docs/` guide before changing
  `page.tsx`; keep tests, types, lint and build green; check in the browser.
- **Ask first:** new dependencies (including `server-only`); showing fixtures or example
  designs in the UI; changing engine behaviour; persisting progress.
- **Never:** send fixtures to the browser; let students edit a brief's requirements or
  targets in a challenge; change `demoSeed` or the demo results.

## Success criteria

1. All five user stories work in the browser, with no console errors.
2. Store tests cover start, locks, placement, verification with rules, leave and
   unplacing; all pass.
3. The end-to-end test reproduces the fixture harness result for `good` and
   `bad-no-cache` through store actions.
4. `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build` pass.
5. The demos test is unchanged and passing.

## Open questions

1. **Unplacing on node removal** fixes an existing sandbox bug too (features stay
   "placed" on deleted nodes). Proposal: fix it in both modes, since the rule is the
   same and the challenge needs it.
2. **Overall status in a challenge**: worst of engine and rules. Proposal: yes; a brief
   rule at `fail` should fail the attempt, or the rules don't mean anything to students.
3. **`server-only` guard**: adding the `server-only` package would make importing
   `load.ts` from a Client Component a build error. Proposal: add it; it's tiny and the
   Next docs recommend it ("Preventing environment poisoning"). Needs your OK as a new
   dependency.
