# Implementation Plan: `config-bounds`

Spec: [SPEC-config-bounds.md](../../SPEC-config-bounds.md) (approved 2026-11-06).
Capability map: [CAPABILITY-MAP-stress.md](../../CAPABILITY-MAP-stress.md). Task
checklist: [todo.md](todo.md). Branch: `fix/config-bounds`, from `main` (`07f00a1`).

## Overview

One pure module of limits, used in three places:

| Where | What it does with the limits |
|---|---|
| The validator (import, saved `/simulate` designs, fixtures at build time) | Refuses an out-of-range value |
| The store | Clamps whatever it's given |
| The inspector | Saves only in-range values while typing, and snaps to the nearest limit when you leave the field |

The validator also refuses self-loops. The harness's 16 `[config-bounds]` pins become
ordinary tests. Nothing in the engine or the load model changes, and no fixture or demo
value moves.

## Dependency graph

```
T0 baseline: probe outputs saved, branch created
        │
        ▼
T1 config-limits.ts + tests (pure; catalog, fixtures, demos and generator ranges fit)
        │
        ├──────────────────────┬──────────────────────┐
        ▼                      ▼                      ▼
T2 validator: range check,  T3 store: clamp in     T4 inspector: number field
   self-loop; pins flip        updateNodeConfig       with commit on leaving
        │                      │                      │
        └──────────────────────┴──────────────────────┘
                               ▼
T5 browser checks, probes identical, full checks, docs, commit
```

T2, T3 and T4 each need only T1. They're done in order on one branch, since each is small
and T4's browser check is easier with T3's clamp in place.

## Architecture decisions

### `src/lib/config-limits.ts`

```ts
export type Limit = { min: number; max: number; whole?: boolean };
export const CONFIG_LIMITS: Partial<Record<ComponentKind, Record<string, Limit>>>;
export function limitFor(kind: ComponentKind, path: string): Limit | null;
export function configProblem(kind: ComponentKind, path: string, value: unknown): string | null;
export function clampConfigValue(kind: ComponentKind, path: string, value: number): number | null;
export function parseConfigInput(kind: ComponentKind, path: string, text: string): number | null;
/** Every numeric field of a config, as [path, value] (nested ones as `capacity.vcpus`). */
export function numericConfigFields(config: Record<string, unknown>): [string, unknown][];
```

- **Paths** use the same dotted form as the generator's `CONFIG_RANGES`, e.g.
  `capacity.vcpus`.
- **The four compute kinds** share one entry, built by a helper, as `computeRanges` does in
  the generator.
- **`configProblem`** returns:
  - `expected a number from 0.5 to 64`;
  - for whole-number fields, `expected a whole number from 1 to 8`;
  - null for a field with no limit, so non-numeric fields pass through.

  A non-finite value gets the same message.
- **`clampConfigValue`** returns null for a non-finite value. For whole-number fields it
  rounds before clamping, so 2.6 replicas becomes 3.
- **`parseConfigInput`** returns null for empty or whitespace text and for `Number(text)`
  that isn't finite. Otherwise it clamps the value.

### Validator

- **Range check:** in `readDesign`, after `checkConfigShape` and the enum check, each
  `[path, value]` from `numericConfigFields(no.config)` is checked with `configProblem`.
  A problem calls `r.fail` at the field's path, built with `r.at` from `cp` and each
  segment of `path`, giving the error path `design.nodes[6].config.capacity.vcpus`.
- **Self-loops:** after the unknown-node checks, `source === target` fails at `p` with
  `an edge can't connect "${source}" to itself`.
- **Coverage:** `readDesign` is shared by `validateFixture` and `validateDesignFile`, so
  fixtures (build) and imports (including the handoff) are covered at once.

### Store

`updateNodeConfig(id, patch)` runs the patch through `clampPatch(kind, patch)`, a small
helper in `config-limits.ts`.
- **Numbers:** each numeric field with a limit is clamped, and a non-finite value is
  dropped, so the field keeps its value.
- **Nested objects:** a nested object (`capacity`) is handled field by field.
- **Everything else** passes through unchanged.

### Inspector

A small `ConfigNumberField` component, in `node-inspector.tsx` itself since it's used only
there. It takes `{ id, label, kind, path, value, onCommit }`.
- **Local state:** it keeps the input's text, starting from `value`, and resyncs when
  `value` changes and the field isn't focused.
- **On change:** if `parseConfigInput` gives a number equal to `Number(text)`, meaning the
  text is in range, it calls `onCommit(n)`. Otherwise it saves nothing yet.
- **On blur:** a number from `parseConfigInput` is committed and shown, so the field snaps
  to the nearest limit. Otherwise (empty or non-numeric) the saved value is shown again.
- **Attributes:** `min` and `max` from `limitFor`. The steps stay as they are.

The six number inputs move to it: the three capacity fields, replicas, shards, cache
memory, object storage and worker concurrency. The capacity fields still commit
`{ capacity: { ...cfg.capacity, [key]: n } }`.

Interactions can't be rendered in the static-markup tests. So they're covered by
`parseConfigInput`'s unit tests, plus a static check that `min` and `max` render, plus the
browser.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A fixture or brief value falls outside a limit and the build breaks | Med | T1's test checks every fixture node, both demos and every catalog default before the validator uses the limits. Changing a fixture or a limit is ask-first. |
| An engine or load-model number moves | High: breaks the "unchanged" rule | No input value changes. T5 compares the probe and load-model probe output with `main` byte for byte, saved in T0. |
| The inspector's text state drifts from the store after an import or undo-like replace | Med: the field shows a stale number | Resync from `value` whenever it changes and the field isn't focused. The browser check imports a design while a node is selected. |
| Clamping on blur surprises a student who typed a value out of range on purpose | Low | It's the agreed behaviour. The `min` and `max` attributes give the browser's own hint. |
| The harness tests that assert "today accepted" are deleted along with their pins | Low | The spec says to remove them. Every pin becomes a positive refusal test with its path, so nothing is lost. |

## Open questions

None.
