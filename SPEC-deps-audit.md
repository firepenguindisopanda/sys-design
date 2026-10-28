# Spec: clear the `npm audit` findings

Status: **approved** (2026-10-27) with **option B**: keep `shadcn`, upgrade it and run
`npm audit fix`, accepting the one low `deepmerge` finding that has no fix.
Small maintenance step from HANDOVER's "smaller items". Branch: `chore/deps-audit`, from
`main` (`0097bfe`).

## Objective

`npm audit` reports **9 findings** (1 low, 3 moderate, 5 high). HANDOVER said 8: a new low
one, `deepmerge`, has appeared since. Clear every finding that has a fix (all but
`deepmerge`) without changing how the app looks or behaves, keeping the `shadcn` package.

## What's there today

Every finding comes in through one package, the `shadcn` CLI (`shadcn@4.21.4`, listed
under `dependencies`):

| Package | Severity | Path |
|---|---|---|
| `body-parser` 2.3.0 | high | shadcn → `@modelcontextprotocol/sdk` → express |
| `undici` 7.30.0 | high | shadcn (direct, and via `@shadcn/registry`, `@dotenvx/dotenvx`) |
| `zod` 3.25.76 | high | shadcn (direct, and via the MCP SDK and `@shadcn/registry`) |
| `@shadcn/registry`, `shadcn` | high | flagged for depending on `zod` and `deepmerge` |
| `fast-uri` 3.1.8 | moderate | shadcn → ajv |
| `ip-address` 10.7.3 | moderate | shadcn → `socks`, MCP SDK |
| `qs` 6.16.0 | moderate | shadcn → MCP SDK → express |
| `deepmerge` 4.3.1 | low | shadcn, `@shadcn/registry`; **no fixed version exists** |

The CLI is a tool for adding components (`npx shadcn add select`). The app itself only
uses one thing from the package: `src/app/globals.css` has
`@import "shadcn/tailwind.css";`, a 16 KB stylesheet of Tailwind variants and utilities.
Of that file, `src/` uses six custom variants and nothing else:

| Variant | Uses in `src/` |
|---|---|
| `data-open:` / `data-closed:` | 11 each (sheet, select, tooltip, dialog) |
| `data-active:` | 11 |
| `data-horizontal:` / `data-vertical:` | 11 / 14 (tabs, separator, scroll area) |
| `data-disabled:` | 3 |

Unused: `data-checked`, `data-unchecked`, `data-selected`, the accordion keyframes, and
three utility families (hiding scrollbars, fading scroll edges, a text shine effect).
Their class names are left out of this file on purpose: Tailwind scans every file in the
repo, docs included, and a class name written in a Markdown file is enough to put that
class in the built CSS. Found while checking this change; see Verification.

### Options considered

| Option | Findings left | Notes |
|---|---|---|
| A. Remove `shadcn`; copy its variant block into `globals.css` | 0 | Not chosen. The CLI is still available on demand as `npx shadcn@latest add …`, which is how shadcn documents it |
| **B. Upgrade to `shadcn@4.23.0`, then `npm audit fix`** | **1** (`deepmerge`, low) | **Chosen.** The latest release moves to zod 4, but still uses `deepmerge`, which has no fix. A CLI with an MCP server and an HTTP stack stays in the app's dependencies, so new advisories will keep appearing |
| C. Move `shadcn` to `devDependencies` (HANDOVER's idea) | 9 | Plain `npm audit` counts dev dependencies too; only `npm audit --omit=dev` would read 0. It would still be worth doing on its own, but it doesn't meet the objective |
| `npm audit fix --force` | — | Would install `shadcn@1.0.0`, a breaking downgrade. No |

## Design (option B)

1. `npm install shadcn@^4.23.0`. 4.23.0 depends on `zod` ^4.2.0, which clears the `zod`
   finding (fixed in 4.6.6); the MCP SDK it now uses
   (`@modelcontextprotocol/server`) replaces the Express-based one.
2. `npm audit fix` (never `--force`) to move the remaining transitive packages to
   patched versions within their allowed ranges. This changes only
   `package-lock.json`.
3. Whatever `npm audit` still reports is checked: the expected remainder is `deepmerge`
   (low, no fixed version) and the `shadcn` / `@shadcn/registry` entries flagged only for
   depending on it.
4. `shadcn` stays in `dependencies` and `@import "shadcn/tailwind.css"` stays in
   `globals.css`. Moving it to `devDependencies` (option C) is left out: it doesn't
   change the audit count, and the app imports its CSS.
5. HANDOVER's "smaller items" entry is updated with what's left and why.

No source changes; only `package.json`, `package-lock.json` and docs.

## Verification

The risk is a styling change from the newer `shadcn/tailwind.css`, so the main check is
the **built CSS**:

1. Before changing anything: `npm run build`, and save the compiled CSS from
   `.next/static/` (normalised: the file name has a content hash).
2. After: build again and diff. **Expected:** identical. Any difference is traced to its
   source (the newer shadcn stylesheet, or a Tailwind patch release pulled in by
   `npm audit fix`) and checked in the browser before going on.
3. `npm audit` reports only `deepmerge` and the entries that depend on it.

**Result (2026-10-27):** `shadcn` 4.21.4 → 4.23.0 (zod 3.25.76 → 4.6.7); `npm audit fix`
had nothing further to change. `npm audit` now lists 3 low entries, all the `deepmerge`
advisory (`deepmerge`, `@shadcn/registry`, `shadcn`); 592 packages audited, down from
757. Both compiled stylesheets are byte-identical to `main`'s, with the same hashed
names. The first comparison wasn't: this spec named three unused utility classes, and
Tailwind's file scanning picked them up from the Markdown and emitted them. Rewording
the spec removed them. Client JS for the page is the same size as on `main`
(1,144,656 B raw over 7 chunks; `shadcn` is never bundled), so the browser check in step 5
was skipped: with identical CSS and unchanged JS there's nothing it could show. Tests
(239 passed, 1 skipped), `tsc`, lint and build pass.
4. `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` pass, with no test
   changes.
5. Browser (Chrome DevTools, 1440 and 375): challenge picker and protocol selects open
   and close with their animation; Brief/Requirements tabs switch with the active-tab
   style; Library and Brief sheets open and close at 375; tooltips show. No console
   errors.

## Boundaries

- **Always:** explain every difference in the compiled CSS; keep `components.json`.
- **Ask first:** upgrading any other package; touching `eslint-config-next` (it's 15.2.4
  while `next` is 16.4.3; that's unrelated to the audit and is a separate change).
- **Never:** `npm audit fix --force`; add `overrides` that force libraries onto major
  versions they weren't built for.

## Success criteria

1. `npm audit` reports only the unfixable `deepmerge` finding (and the packages flagged
   for depending on it).
2. The compiled CSS is unchanged, or every difference is explained and checked.
3. Tests, types, lint and build pass; the browser checks show no visual or behavioural
   change.

## Decisions

1. **Option B** (user's choice): keep `shadcn` as a dependency, upgrade it, accept the low
   `deepmerge` finding until upstream fixes it.
2. **Paperwork:** this spec only; the steps above are the task list.
