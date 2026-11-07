# Spec: one set of limits for node config (`config-bounds`)

A module of [CAPABILITY-MAP-stress.md](CAPABILITY-MAP-stress.md). Branch
`fix/config-bounds`. Status: **built** (2026-11-06); see Results at the end. Plan and
tasks: [tasks/config-bounds/](tasks/config-bounds/).

## Objective

A node's numeric config means the same thing wherever it's set: in the inspector, in the
store, or in an imported design file. Today only the inspector has limits, and only some of
them:
- **Import:** `checkConfigShape` (`src/lib/challenges/validate.ts`) checks only that a
  value is a number. A design file can set `replicas: .inf`, which crashes the load model
  out of memory. `replicas: 1.5` makes it serve more requests than were sent. `.nan`
  makes every NFR check fail with its generic message.
- **The saved `/simulate` design:** it's kept in the tab's session storage, so a bad design
  crashes `/simulate` again on every reload.
- **The inspector:** an emptied number field saves 0 (`Number("")`). Compute capacity
  allows 0 vCPUs. Typing 20 replicas saves 20, because the input's `max` only affects its
  spinner.
- **The store:** `updateNodeConfig` saves whatever it's given.

**Who this is for:**
- students, whose designs can no longer get into a state the simulator can't handle,
  whichever way they set a value;
- the TA, whose shared design files are checked the same way as the canvas.

**Done means:**
- the 16 `[config-bounds]` expected failures in `tests/stress-import.test.ts` are ordinary
  passing tests;
- an imported self-loop is refused, as the canvas refuses one;
- every fixture, both demos and every brief's numbers are unchanged.

## Decisions (2026-11-06)

| Question | Decision |
|---|---|
| Maximums where the inspector has none | Generous caps, the same everywhere, that no campus design needs. Every fixture value fits. |
| Inspector input out of range | It snaps to the nearest limit. An empty or non-numeric field keeps the saved value instead of saving 0. |
| Self-loops in an imported file | Refused, with the usual file-and-path message, as the canvas refuses them |
| Files exported before this change with out-of-range values | Refused on import, with no migration (map, open question 3). The inspector never allowed most of them. |

## The limits

There's one table, `CONFIG_LIMITS` in a new `src/lib/config-limits.ts`, keyed by kind and
field path:

| Kind | Field | Min | Max | Whole number |
|---|---|---|---|---|
| `vm`, `paas`, `functions`, `edge` | `capacity.vcpus` | 0.5 | 64 | no |
| | `capacity.memoryGb` | 0.5 | 512 | no |
| | `capacity.storageGb` | 0.25 | 10,000 | no |
| `database` | `replicas` | 1 | 8 | yes |
| | `shards` | 1 | 16 | yes |
| | `storageGb` | 1 | 100,000 | no |
| `cache` | `memoryGb` | 0.5 | 256 | no |
| `object_storage` | `storageGb` | 1 | 100,000 | no |
| `task_worker` | `concurrency` | 1 | 64 | yes |

- **Where the limits come from:**
  - Replicas, shards and concurrency keep the inspector's current limits, as do the cache
    and object storage minimums.
  - The compute minimums are the smallest catalog defaults: an edge function's 0.5 vCPU,
    0.5 GB of memory and 0.25 GB of storage. The inspector's 0 vCPUs goes away.
  - The maximums where the inspector had none are the generous caps from the decision.
- **What fits today:**
  - **Fixtures:** the largest values in use are object storage of 2,000 GB, cache memory
    of 8 GB, concurrency of 24, replicas of 2 and shards of 4.
  - **Demos:** at most replicas of 3, and default capacities.
  - **Catalog defaults:** all within the limits.
- **No step check:** a value doesn't have to fall on the inspector's step. For example,
  1.25 vCPUs imports. Steps only help the spinner.
- **Values must be finite:** `NaN` and `Infinity` are never in range.

## Changes

1. **`src/lib/config-limits.ts` (new):**
   - `CONFIG_LIMITS`, as above;
   - `limitFor(kind, path)`;
   - `configProblem(kind, path, value)`, which returns null or a reason, e.g. `expected a
     whole number from 1 to 8`;
   - `clampConfigValue(kind, path, value)`, which returns a number or null for a
     non-finite value;
   - `parseConfigInput(kind, path, text)`, for the inspector. It returns the clamped number,
     or null for empty or non-numeric text.

   It's pure, with no React, and is imported by the validator, the store and the inspector.
2. **Validator** (`validate.ts`):
   - **Config values:** after the shape check, each numeric config value present on a node
     is checked with `configProblem`. A problem fails at the field's path, e.g.
     `test.yaml: design.nodes[6].config.replicas: expected a whole number from 1 to 8`.
     This covers imports, the saved `/simulate` design (it goes through import), and
     fixtures at build time.
   - **Self-loops:** an edge whose source and target are the same fails at its path:
     `design.edges[3]: an edge can't connect "api-1" to itself`.
3. **Store** (`updateNodeConfig`): each numeric field in a patch is clamped to its limit.
   A non-finite value is dropped, so the field keeps its value. This is the check of record,
   in line with "locks are enforced in the store, not just the UI".
4. **Inspector** (`node-inspector.tsx`):
   - **While typing:** each number field keeps the student's text. A value is saved only
     when it parses and is within the limits.
   - **On leaving the field:** an out-of-range number snaps to the nearest limit (20
     replicas becomes 8), and an empty or non-numeric field shows the saved value again.
   - **Attributes:** `min` and `max` come from `CONFIG_LIMITS`.
   - **Why not clamp on every keystroke:** it would fight typing. For example, clearing a
     cache's memory to type 0.75 would snap to 0.5 at the first "0".
5. **Harness:**
   - **The 16 pins:** each `[config-bounds]` pin in `tests/stress-import.test.ts` becomes an
     ordinary test.
   - **The guards:** the "today, … is accepted" guards are removed, since they only existed
     to keep the pins honest.
   - **The self-loop test:** the recorded-first test becomes "refused".
   - **The generator:** a new test checks that every range in `CONFIG_RANGES`
     (`src/test/gen-designs.ts`) lies within `CONFIG_LIMITS`. The ranges themselves stay
     as they are, so the generated designs, and every stress result, are unchanged.

## Not changing

- The engine, the load model, the rules, the briefs and the fixtures. No fixture or demo
  value moves, so every engine and load-model number stays the same. Proof: the probe, the
  demo pins and the load-model baseline pass unchanged.
- **Feature resources and workload fields** (`resources`, `targetRpm`, …). They have their
  own validation in briefs and sandbox files and aren't node config.
- **The `/simulate` page's error display.** A refused saved design already shows its
  message.

## Commands

```bash
npm test
```
```bash
npx vitest run src/lib/config-limits.test.ts tests/stress-import.test.ts
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

The build proves every fixture passes the new limits.

```bash
STRESS=1 npx vitest run tests/stress-scale.test.ts
```

The ladder should be unchanged.

## Project structure

| File | Change |
|---|---|
| `src/lib/config-limits.ts`, `src/lib/config-limits.test.ts` | New |
| `src/lib/challenges/validate.ts`, `validate.test.ts` | Range check and self-loop refusal |
| `src/lib/store.ts`, `store.test.ts` | Clamp in `updateNodeConfig` |
| `src/components/simulator/node-inspector.tsx` | Text state, commit on leaving the field, limits as attributes |
| `tests/stress-import.test.ts` | Pins become tests; guards removed; self-loop refused |
| `src/test/gen-designs.test.ts` | The generator's ranges lie within the limits |

## Code style

```ts
// src/lib/config-limits.ts
export const CONFIG_LIMITS: Partial<Record<ComponentKind, Record<string, Limit>>> = {
  database: {
    replicas: { min: 1, max: 8, whole: true },
    shards: { min: 1, max: 16, whole: true },
    storageGb: { min: 1, max: 100_000 },
  },
  // …
};

/** Why a config value is out of range, or null when it's fine. */
export function configProblem(kind: ComponentKind, path: string, value: number): string | null;
```

Messages follow the validator's style: lower case, saying what was expected.

## Testing strategy (tests first)

- **`config-limits.test.ts`:**
  - every catalog default, every fixture node and both demos are within the limits;
  - `configProblem` accepts each limit's min and max;
  - it refuses just below the min, just above the max, 1.5 for a whole-number field, `NaN`
    and `Infinity`;
  - `clampConfigValue` and `parseConfigInput` handle empty text, `" "`, `abc`, `-1`, `20`,
    `1e9` and `0.75`.
- **`validate.test.ts`:** one out-of-range value and one self-loop, each refused with the
  expected path and wording.
- **`store.test.ts`:** `updateNodeConfig` clamps replicas of 20 to 8 and capacity vCPUs of 0
  to 0.5. It keeps the old value for `NaN`, and leaves non-numeric fields (engine, mode)
  alone.
- **`tests/stress-import.test.ts`:** the 16 flipped pins and the self-loop refusal.
- **`gen-designs.test.ts`:** the generator's ranges lie within the limits.
- **Browser** (in-app or Chrome DevTools pane):
  - in the inspector, type 20 replicas and leave the field: it shows 8;
  - clear Memory GB and leave the field: it shows the old value;
  - check that Run simulation still runs;
  - import a file with `replicas: .inf`: the error names the field;
  - on `/simulate`, put a saved design with `.inf` in session storage and reload: the page
    shows the message instead of crashing.
- **Unchanged numbers:** the probe (`PROBE=1 … tests/probe.test.ts`) and the load-model
  probe give the same output as on `main`. Save both to the scratchpad before Task 1.

## Boundaries

- **Always:**
  - write the tests first;
  - leave every fixture, demo and brief value as it is;
  - make the messages name the file and the path;
  - run `npm test`, `tsc`, lint and the build before committing.
- **Ask first:**
  - changing any limit in the table;
  - adding a step check;
  - changing a fixture.
- **Never:**
  - change the engine or the load model;
  - loosen a pin to make it pass;
  - accept `NaN` or `Infinity` anywhere.

## Success criteria

1. The 16 `[config-bounds]` pins pass as ordinary tests, and the import self-loop is
   refused.
2. The default suite has 1 expected failure (the `loadsim-route-scale` growth pin), down
   from 17.
3. `npm run build` passes, so every fixture fits the limits. The probe output and the
   load-model probe are byte-identical to `main`.
4. In the browser: 20 replicas snaps to 8 on leaving the field, an emptied field keeps its
   value, and `/simulate` with a saved `.inf` design shows an error instead of crashing.
5. `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build` pass.

## Open questions

None. The decisions above cover the map's open question 3 and your four answers of
2026-11-06.

## Results (2026-11-06)

Built on `fix/config-bounds`. The task notes are in
[tasks/config-bounds/todo.md](tasks/config-bounds/todo.md).

### Success criteria

1. **Met: pins and self-loops.** The 16 `[config-bounds]` pins are ordinary tests:
   - 15 out-of-range imports, each refused at its path, e.g.
     `design.nodes[6].config.replicas: expected a whole number from 1 to 8`;
   - the saved `/simulate` design with `replicas: .inf`, which now gives that error instead
     of a design.

   An imported self-loop is refused: `design.edges[3]: an edge can't connect "api-1" to
   itself`.
2. **Met: 1 expected failure.** The default suite has 1 expected failure (the
   `loadsim-route-scale` growth pin), down from 17: 1,813 passed and 32 skipped.
3. **Met: nothing moved.**
   - `npm run build` passes, so every fixture fits the limits.
   - The engine probe (264 lines) and the load-model probe (292 lines) are byte-identical
     to `main`, both after Task 2 and at the end.
4. **Met in the browser** (Chrome DevTools, dev server, 1440 × 900):
   - **Replicas:** typing 20 shows "20" while focused, and the node keeps 2 replicas,
     because the in-range "2" was saved and "20" wasn't. On Tab the field snaps to 8 and
     the node shows "8× replica".
   - **Cache memory:** cleared, the field is empty and the node keeps 2 GB. On Tab it shows
     2 again. Backspace in the field didn't delete the node.
   - **Typing "0.75"** works key by key, saving 0.75 GB once complete. The intermediate
     "0" and "0." didn't fight the input.
   - **Run simulation** runs; the design fails on cost, as expected with 8 replicas.
   - **Importing the `.inf` file** shows `link-shortener-inf.yaml:
     design.nodes[6].config.replicas: expected a whole number from 1 to 8`, and the canvas
     is unchanged.
   - **Importing a valid file** while a node is selected replaces the design, and the
     inspector closes, so no field can go stale. Selecting the new cache shows its 6 GB.
   - **`/simulate` with a saved `.inf` design** shows "The design couldn't be loaded" with
     the field named, including after a reload. The console has no errors.
5. **Met: all checks pass.** `npm test`, `npx tsc --noEmit`, `npm run lint` and
   `npm run build` pass. The `STRESS=1` ladder is unchanged: 23 passed and 6 expected
   failures, in 250 s.

### Notes

- **The store merges nested config field by field.** Without this, dropping a non-finite
  `capacity.vcpus` from a patch would have replaced the whole `capacity` object and lost
  memory and storage. Since the store merges, the inspector's capacity fields send only the
  field that changed.
- **The number field shows the saved value when it isn't focused,** and only keeps the
  student's text while it is focused. So an import, a demo or a reset shows up without any
  syncing code.
- **Static-markup tests can't type,** so the typing behaviour is covered by unit tests of
  `parseConfigInput` and by the browser checks above.
