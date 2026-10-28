# Implementation Plan: Phase 3, `design-io`

Spec: [SPEC-design-io.md](../../SPEC-design-io.md) (approved). Map:
[CAPABILITY-MAP-phase3.md](../../CAPABILITY-MAP-phase3.md). Task checklist: [todo.md](todo.md).
Branch: `feat/design-io`, from `main`. Earlier steps: [phase1/](../phase1/plan.md),
[reachability/](../reachability/plan.md), [data-checks/](../data-checks/plan.md),
[challenge-slice1/](../challenge-slice1/plan.md), [challenge-panels/](../challenge-panels/plan.md).

## Overview

Export the canvas to the fixture YAML format and import it back, in the sandbox and in a
challenge. The library work comes first and is fully testable without the UI: two
optional node fields (`at`, `purpose`), the inverse of `buildDesign`, a top-level file
reader that decides sandbox or challenge, and the text export/import with round trips
over every fixture and both demos. Then one store action, the toolbar buttons, and the
browser walkthrough. No engine, rule or lock changes.

## Dependency graph

```
T1 at + purpose: types, validator, buildDesign, docs
          │
          ├──────────────────────────┐
          ▼                          ▼
T2 compactDesign (canvas → compact)  T3 validateDesignFile (top level, mode)
          │                          │
          └────────────┬─────────────┘
                       ▼
T4 design-file.ts: export/import text, round trips (every fixture, both demos)
                       │
                       ▼
T5 store: loadDesign, ids never reused
                       │
                       ▼
T6 DesignIo toolbar buttons + error message
                       │
                       ▼
T7 browser walkthrough, build, bundle size
```

## Architecture decisions

- **One format, three kinds of file.** Fixtures, challenge exports and sandbox exports
  are the same `design:` block; the top level says which brief applies (`challenge`,
  sandbox `functionalRequirements` + `nfr`, or neither = current challenge). Sandbox
  requirements and NFRs reuse the brief readers, so there's no second schema to keep in
  sync.
- **Validate on the way out too.** `exportDesignFile` parses and validates its own
  output before returning it. This catches any canvas state the format can't express
  (empty requirement text, a zero `computeMsPerRequest`) as a message at Export time,
  not a broken file found at Import time.
- **Compare by behaviour, not by text.** Round-trip tests compare the built designs
  (ids, kinds, labels, purposes, configs, positions, edge protocols, placements) and the
  `runVerification` + `evaluateRules` results. Exact text equality is only asserted for
  export → import → export, where it must hold.
- **Ids stay stable.** `compactDesign` keeps any id that is already a unique slug and
  only rewrites `_` to `-` (with `-2`, `-3` on clashes), so fixture ids survive export
  unchanged and a second export renames nothing.
- **The store gets one action.** `loadDesign` takes an already-validated, already-built
  result and sets everything in one `set`. In a challenge it starts from the same seed as
  `startChallenge`, so the locks are the existing ones. Parsing and validation stay in
  `src/lib/challenges/`, out of the store and the component.
- **Fresh ids skip what's in use.** After an import the canvas can hold `paas-3` or
  `feat-4` that the store counter will reach later. A small `freshId(prefix, taken)` is
  used by `addComponent` and `addFunctionalRequirement`; demo seeds keep `uid` and their
  `seq = 1` reset, so `demoSeed` and the demo results don't change.

## Task list

### Phase A: Library (no UI)
- [x] Task 1: Optional `at` and `purpose` on fixture nodes
- [x] Task 2: `compactDesign`, the inverse of `buildDesign`
- [x] Task 3: `validateDesignFile`: top level and sandbox/challenge resolution
- [x] Task 4: `design-file.ts`: export and import text, round trips

### Checkpoint A
- [x] Every fixture and both demos round-trip with identical results; all existing
  tests unchanged; tests, types, lint and build green

Notes from Phase A:
- `npm test`: 235 passed, 1 skipped (was 130 + 1). The fixture round trips run three
  ways per fixture (`compactDesign` alone, export → import, and the fixture file's raw
  text).
- `buildDesign` now delegates to `buildCompactDesign(requirements, nfr, design)`, so a
  sandbox file (no brief) builds the same way. `readDesign` takes requirement ids
  instead of a brief for the same reason.
- Edges are written as one-key mappings (`- phone -> lb: http`), which the validator
  already reads like the fixture shorthand; `yaml` would otherwise quote the
  `a -> b : http` string. Flow collections come out padded (`at: [ 0, 0 ]`), yaml's
  default; kept, since the fixtures' braces are padded too.
- Exported files start with a one-line comment saying how to open them.
- Sandbox round trip of the BeUWI demo renames `static_hosting-5`, `load_balancer-6`,
  `object_storage-10`, `message_queue-11` to kebab-case; the verification result is
  identical apart from those ids in check ids, and a second round trip is
  byte-identical.
- `exportDesignFile` validates its own output: a sandbox requirement with empty text
  gives `sandbox-design.yaml: functionalRequirements[0].text: expected a non-empty
  string` instead of a file. (Whether the requirements panel can produce that state is
  for Task 6's browser check.)

### Phase B: Store and UI
- [x] Task 5: `loadDesign` store action; ids never reused
- [x] Task 6: Export and Import buttons with the error message

### Checkpoint B
- [x] Export and import work by hand in the sandbox and a challenge

Notes from Phase B:
- `loadDesign` sets the challenge (or `null`), requirements, features, NFRs, nodes and
  edges in one `set` rather than spreading `challengeSeed`: the locks only check
  `challenge !== null`, and the loaded design already carries the brief's requirements
  as `challengeSeed` builds them (`freq-<id>`), which the store tests confirm.
- `freshId` is used by `addComponent` and `addFunctionalRequirement`; `createNode` takes
  an optional id, so demo seeds still use `uid` and `tests/demos.test.ts` is unchanged.
  The test loads `paas-1`…`paas-60` and `feat-1`…`feat-60` so the counter has to step
  past ids in use.
- Browser (Chrome DevTools, 1440 wide; downloads captured by wrapping
  `HTMLAnchorElement.click`):
  - **Sandbox:** BeUWI demo → Run (Warn, 96 ms, 860 RPM, 99.8%, $190) → Export gave
    `sandbox-design.yaml`, byte-identical (SHA-256) to the Node-side export → Clear →
    Import → same 11 nodes and edges (kebab-case ids), both features placed on
    Programme API, Run gives the same numbers.
  - **Plan risk 2 cleared:** edges without saved handles draw normally (from each
    node's first handle), no console errors.
  - **Fixture in the sandbox:** `link-shortener/fixtures/good.yaml` refused with
    "good.yaml: This design has no requirements. Pick its challenge first, then import
    it."; canvas unchanged.
  - **Fixture in its challenge:** picked Campus link shortener, imported the same file
    → Pass (31 ms, 1660 RPM, 99.9%, $224); the earlier error cleared.
  - **Challenge file from the sandbox:** exported `link-shortener-design.yaml`,
    switched to Sandbox, imported → back in Campus link shortener (Brief and
    Requirements tabs), 7 nodes / 8 edges, Pass with the same numbers and all three
    rule rows.
  - Console: only React Flow's existing attribution warning.
- **375 wide (mobile):** Export and Import sit on their own row under the demo buttons;
  a broken file shows `broken-design.yaml: design.edges[0]: unknown node "cach"` under
  the toolbar and leaves the demo on the canvas; Dismiss closes it.
- **Found and fixed:** the toolbar row runs to the canvas edge, so the error box had no
  right gutter at 375px. It now has `mr-3`, matching the 12px left inset. No horizontal
  scroll before or after.
- `npm test` 239 passed, 1 skipped; `tsc`, lint and `npm run build` pass.
- Not covered yet (Task 7): Export refusing duplicate edges in the browser (drawing two
  connections between one pair needs a manual drag), and the bundle-size comparison.

### Phase C: Verification
- [x] Task 7: Browser walkthrough of the spec's checklist; build; bundle size

### Checkpoint C
- [x] All five spec success criteria met; ready for review (nothing committed until asked)

Notes from Task 7:
- **Duplicate connections (browser):** drew a second Mobile app → CDN connection on the
  BeUWI demo (a synthetic drag between the two nodes' handles). Export showed "Two
  connections go from Mobile app to CDN; delete one, then export." and downloaded
  nothing. One drag attempt released off-target and React Flow snapped it to the Load
  Balancer instead; that was the test's pointer position, not app behaviour.
- **Bundle size:** `main` (`a3fbf84`) built in a temporary worktree against this branch,
  both with Turbopack, summing the JS chunks the home page loads (7 on each):

  | Build | Raw | Gzipped |
  |---|---|---|
  | `main` | 1,029,784 B | 322,230 B |
  | `feat/design-io` | 1,144,656 B | 358,382 B |
  | Difference | +114,872 B (+11%) | +36,152 B (+11%) |

  Within the spec's 30–40 KB estimate. It covers `yaml`, the validator, the design-file
  code and the buttons. Not worth a dynamic import at this size; it's the fallback in
  the risks table if the page ever needs to be lighter.
- The rest of the spec's browser checklist was done in Phase B (see its notes):
  sandbox and challenge round trips, fixture refused in the sandbox and passing in its
  challenge, broken file, 375px. At 375 I checked the buttons and the error message,
  not the full round trips, which don't depend on width.
- Console throughout: only React Flow's existing attribution warning.
- Final: `npm test` 239 passed, 1 skipped; `tsc`, lint and `npm run build` pass;
  `tests/demos.test.ts` and `tests/challenges.test.ts` unchanged.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `yaml.stringify` won't write nodes as one-line flow maps or edges unquoted | Low | Build a `yaml` `Document` and set `flow = true` on node maps; edges as plain strings may come out quoted, which the validator already accepts. Test asserts the text parses back, not its exact style |
| Imported edges have no `sourceHandle`/`targetHandle`; React Flow may draw them from the wrong side or warn | Med | Fixtures built by `buildDesign` already lack handles and run in tests, but have never been drawn. Check in the browser at the start of Task 6 before building the buttons; if React Flow errors, set the default handle ids in `buildDesign` |
| Making `validate.ts` and `yaml` client-side pulls in something Node-only | Low | `validate.ts` imports only `catalog`, `edges` and types; `load.ts` keeps `server-only`. `npm run build` would fail on a Node import in a Client Component |
| Bundle grows more than expected | Low | Compare `.next/static` chunk sizes before and after in Task 7; report the number. If it's large, import `yaml` dynamically on first Export/Import click |
| Duplicate edges (A→B twice) in existing canvas states | Low | `compactDesign` reports them by node label; tested in Task 2 |
| `freshId` changes the demos' ids | Med | Demos keep `uid` with the `seq = 1` reset; `tests/demos.test.ts` pins their results |
| Config diff misses a nested change or emits `kind` | Med | Unit tests on capacity (nested), enum fields and unchanged nodes; the every-fixture round trip compares full configs |

## Parallelization

T2 and T3 are independent after T1 and touch different files (`design.ts` vs
`validate.ts`), but each is S–M and T4 needs both; doing them in sequence in this
session is cheaper than coordinating two sessions.

## Open questions

None. The spec's three questions were answered with the proposals.
