# Spec: Design challenge briefs, phase 1

Status: **implemented** (2026-10-27). Scope is phase 1 only (see "Later phases" at the end).
Results: `docs/challenges/phase1-findings.md`. Authoring guide: `docs/challenges/brief-format.md`.

Changes made during implementation:
- vitest 4 instead of 5 (vitest 5 needs `@types/node` ≥ 22); no jsdom needed.
- `npm run lint` changed from the removed `next lint` to `eslint .` (approved).
- Edge rule `from` / `to` accept a list of kinds or groups as well as a single one.
- Unquoted YAML edges (`- a -> b : http`) parse as one-key mappings; both that form and
  quoted strings are accepted.
- Brief rule ids may not start with `placement-`, `topo-` or `nfr-`; enum config
  values are validated.
- Final NFRs differ from the table below where calibration needed it (see the findings).

## Objective

Sesim is meant to become the design-challenge tool of the DCIT practice site. A challenge
gives a student a scenario with fixed requirements and checks the design they draw. Before
building any challenge UI we need to know whether the current verification engine
(`runVerification` in `src/lib/simulation.ts`) can tell good designs from bad ones.

Phase 1 answers that question with data instead of opinion:

1. Four **challenge briefs** written as YAML files, at course scale.
2. For each brief, one **good** design and three to five **bad** designs, each bad one
   built around a single flaw, written as fixtures.
3. A small **rule evaluator** for scenario-specific requirements the generic engine
   cannot know about (e.g. "chat needs a WebSocket between client and compute").
4. A **vitest harness** that runs every fixture through `runVerification` plus the
   brief's rules and checks the outcome against what the fixture expects.
5. A **findings note** listing every bad design the engine fails to catch. That list is
   the input to phase 2 (engine fixes).

Users of this phase are the TA and future contributors writing briefs, not students.
Nothing in phase 1 is visible in the app.

### User stories

- As a brief author, I can write a challenge in one YAML file and have it validated, so
  typos in kinds, protocols or ids fail loudly with a file and field name.
- As a brief author, I can describe a design in a few lines of YAML (nodes, edges,
  placements) instead of raw React Flow JSON.
- As the TA, I can run `npm test` and see which bad designs the engine catches, which it
  misses (marked as known gaps), and whether every good design passes.

## Assumptions

1. **No engine changes.** `src/lib/simulation.ts`, `catalog.ts`, `edges.ts`, `types.ts`
   and `store.ts` are read-only in this phase. New code lives in new files.
2. **Course-scale numbers.** Real-world targets (e.g. 100k redirects/s) fail every design
   under the current capacity model, so briefs use campus-sized numbers. The numbers below
   are provisional and get calibrated so that each good design passes with some headroom.
3. **Rule results are separate from engine checks.** The evaluator returns its own
   `RuleResult` type; it does not add a category to `VerificationCheck`. Phase 3 decides
   how both are shown together.
4. **Reflection questions are data only.** Briefs carry them; nothing grades them.
5. **Sources and attribution.** Scenario ideas are adapted from your own
   `nvidia_genai/architect-it/src/shared/starters.ts` and the srs-doc-genai answer keys,
   rewritten in new words with generic titles. Each brief records its source in a
   `source` field. Nothing is taken from `agentic_srs/system_design_concepts/` or the
   book PDFs in `architecture_practice/`.

## Tech stack

- Existing: Next.js 16, TypeScript 5 (strict), `@xyflow/react` 12 types.
- New dev dependencies (approved): `vitest`, `yaml`.
- No `zod` or other validation library: a hand-written validator is enough for this
  schema size.

## Commands

```bash
npm install            # node_modules is not installed in this clone yet
npm test               # vitest run (new script)
npm run test:watch     # vitest (new script)
npx tsc --noEmit       # type check, including tests and challenge loader
npm run lint
```

## Project structure

```
challenges/                         → challenge content (data, not code)
  link-shortener/
    brief.yaml
    fixtures/
      good.yaml
      bad-no-cache.yaml
      ...
  chat-app/ ...
  file-storage/ ...
  notification-system/ ...
src/lib/challenges/
  types.ts        → Brief, Rule, Fixture, CompactDesign, RuleResult types
  validate.ts     → parse + validate brief and fixture objects; throws with path info
  design.ts       → CompactDesign → { nodes, edges, features, nfr } for runVerification
  rules.ts        → evaluateRules(brief, nodes, edges) → RuleResult[]
  load.ts         → read challenges/ from disk (Node fs; used by tests now, server code later)
  *.test.ts       → unit tests for validate, design, rules
tests/
  challenges.test.ts  → generated suite: one test per fixture
docs/challenges/
  brief-format.md       → how to write a brief and a fixture
  phase1-findings.md    → what the engine catches and misses (written from test results)
vitest.config.ts       → node environment, "@/" alias to src/
```

## Brief format

```yaml
# challenges/link-shortener/brief.yaml
id: link-shortener
title: Campus link shortener
tagline: Short links for course pages, read-heavy
source: Adapted from architect-it starter "bitly" (own work, rewritten)
summary: >-
  Staff turn long URLs into short links for course pages and announcements.
  Students click them from phones and lab machines. Redirects outnumber
  creations about 20 to 1 and must feel instant.
outOfScope: [analytics dashboards, custom domains, QR codes]

functionalRequirements:
  - id: create-link
    text: A staff member creates a short link, optionally with a custom alias.
    feature:
      name: Create link
      resources: { memoryGb: 0.5, vcpus: 0.5, storageGb: 1 }
      targetRpm: 60
      computeMsPerRequest: 30
  - id: redirect
    text: Anyone opening a short link is redirected to the long URL.
    feature:
      name: Redirect
      resources: { memoryGb: 1, vcpus: 1, storageGb: 1 }
      targetRpm: 1200
      computeMsPerRequest: 10

nfr:
  maxLatencyMs: 120
  minThroughputRpm: 1300
  minAvailabilityPct: 99.9
  maxMonthlyCostUsd: 250

rules:
  - id: cache-on-read-path
    type: edge                      # edge | component
    mode: required                  # required | forbidden
    from: compute                   # a ComponentKind, or a group: client | compute
    to: cache
    severity: fail                  # fail | warn
    why: Redirects are read-heavy; hot links should be served from a cache.
  - id: db-replicas
    type: component
    kind: database
    min: 1
    minConfig: { replicas: 2 }      # numeric fields, compared with >=
    severity: fail
    why: Losing the only database copy takes every link down.
  - id: no-client-to-db
    type: edge
    mode: forbidden
    from: client
    to: database
    severity: fail
    why: Clients reach data through compute, never directly.

reflection:
  - How do you generate unique short codes without one central counter?
  - What happens to redirects if the cache is cold after a restart?
```

Rule semantics:

- `component`: passes if at least `min` (default 1) nodes match `kind`, and each counted
  node's config meets every `minConfig` field (`>=`).
- `edge` `required`: passes if at least one edge goes from a node in `from` to a node in
  `to`, and, when `protocols` is given, uses one of them. Bidirectional protocols
  (`websocket`, `webrtc`) match in either direction.
- `edge` `forbidden`: passes if no such edge exists.
- Groups: `client` = mobile, desktop, iot. `compute` = vm, paas, functions, edge.
- A failed rule reports its `severity` as its status.

## Fixture format

```yaml
# challenges/link-shortener/fixtures/bad-no-cache.yaml
description: Correct except there is no cache on the read path.
design:
  nodes:
    - { id: phone, kind: mobile }
    - { id: lb, kind: load_balancer }
    - { id: api-1, kind: paas }
    - { id: api-2, kind: paas }
    - { id: db, kind: database, config: { replicas: 2 } }
  edges:
    - phone -> lb : http
    - lb -> api-1 : http
    - lb -> api-2 : http
    - api-1 -> db : db
    - api-2 -> db : db
  placements:                  # functional requirement id → node id
    create-link: api-1
    redirect: api-2
expect:
  fails: [cache-on-read-path, topo-cache, nfr-throughput]   # engine check ids and rule ids
knownGap: null                 # or a sentence explaining what the engine misses
```

- Node `config` is merged over the catalog's `defaultConfig` for that kind.
- Edge shorthand is `source -> target : protocol`.
- `expect` for a good fixture is `pass: true`: no engine check and no rule has status
  `fail`. Warnings are allowed.
- `expect.fails` / `expect.warns` list ids that must have exactly that status. Ids not
  listed are not asserted, so one flaw per fixture stays readable.
- Per-node engine check ids (e.g. `placement-overflow-<nodeId>`) use the fixture's own
  node ids, so they are stable.

## Pilot briefs (provisional numbers)

| Brief | Course-scale story | Key FRs (target RPM) | NFR targets | Main rules |
|---|---|---|---|---|
| `link-shortener` | Short links for course pages | create 60, redirect 1200 | ≤120 ms, ≥1300 rpm, 99.9%, ≤$250 | cache on read path, DB replicas ≥2, no client→DB |
| `chat-app` | Course group chat | send 900, load history 300 | ≤150 ms, ≥1200 rpm, 99.9%, ≤$300 | WebSocket client↔compute, pub/sub queue from compute, no client→DB |
| `file-storage` | Assignment submission store | upload 120, download 600, list 300 | ≤250 ms, ≥1000 rpm, 99.9%, ≤$300 | object storage reached from compute, metadata DB, CDN for downloads (warn) |
| `notification-system` | Campus alerts | publish 30, deliver 1500, preferences 120 | ≤200 ms, ≥1650 rpm, 99.9%, ≤$250 | queue + task worker, compute→queue→worker, Web Push to clients |

Bad fixtures, one flaw each (at least three per brief), drawn from:

- missing required component (no cache, no object storage, no queue)
- single database replica
- client wired directly to the database
- wrong protocol (HTTP polling instead of WebSocket for chat; Web Push drawn client→server)
- multiple compute nodes without a load balancer
- capacity overflow (features placed on an undersized node)
- suspected engine gaps: cache placed but not connected, load balancer placed but not
  connected, design with no edges, design with no database scoring higher throughput

## Code style

Match `src/lib/simulation.ts`: plain exported functions, `type` aliases (not interfaces),
small private helpers, double quotes, two-space indent, trailing commas, no classes.

```ts
export function evaluateRules(
  brief: Brief,
  nodes: SimNode[],
  edges: Edge[],
): RuleResult[] {
  return brief.rules.map((rule) =>
    rule.type === "component"
      ? checkComponentRule(rule, nodes)
      : checkEdgeRule(rule, nodes, edges),
  );
}
```

Validation errors name the file and field, e.g.
`challenges/chat-app/brief.yaml: rules[2].to: unknown kind "databse"`.

## Testing strategy

- **Framework:** vitest, `environment: "node"`, `@/` alias to `src/`.
- **Unit tests** (colocated `src/lib/challenges/*.test.ts`):
  - `validate`: accepts the example brief; rejects unknown kinds, protocols, groups, a
    placement naming an unknown FR or node, and a duplicate id.
  - `design`: catalog defaults are applied and overrides merge; edge shorthand parses;
    features get `placedOnNodeId` from placements.
  - `rules`: required and forbidden edges, groups, protocol filter, bidirectional
    matching, `minConfig`.
- **Fixture suite** (`tests/challenges.test.ts`): discovers every
  `challenges/*/fixtures/*.yaml` and creates one test per fixture, named
  `<brief>/<fixture>`.
  - No `knownGap`: plain `it`, must pass.
  - With `knownGap`: `it.fails`, with the reason in the test name. If the engine starts
    catching the flaw, the test turns red and the mark must be removed.
  - Every brief must have exactly one `good.yaml` and at least three `bad-*.yaml`.
- **Coverage:** no percentage target. Every rule type and every validation error path
  has at least one unit test.

## Boundaries

- **Always:** keep `npm test` and `npx tsc --noEmit` green; give each bad fixture one
  flaw; record `source` on every brief; read `node_modules/next/dist/docs/` before any
  Next.js-facing code (none is expected in this phase).
- **Ask first:** any change to existing `src/lib/*.ts` or components; any dependency
  beyond vitest and yaml; changing a brief's NFR numbers by more than calibration
  needs (i.e. to make a bad fixture fail); adding a fifth brief.
- **Never:** tune engine constants to make fixtures pass; mark a gap as `knownGap`
  without a sentence explaining it; copy text from the Hello Interview material or the
  book PDFs; commit without being asked.

## Success criteria

1. `npm test` passes, and `npx tsc --noEmit` passes.
2. Four briefs exist and validate; each has one good fixture and at least three bad ones.
3. Every good fixture passes all engine checks and rules (warnings allowed).
4. Every bad fixture either fails the checks it lists in `expect`, or is marked
   `knownGap` with a reason.
5. A malformed brief or fixture fails validation with the file path and field.
6. `docs/challenges/phase1-findings.md` lists each known gap, which engine function
   causes it, and a suggested phase 2 fix.
7. `docs/challenges/brief-format.md` is enough for someone else to write a fifth brief.
8. No existing file under `src/` is modified (the `package.json` scripts and dev
   dependencies are the only change to existing files).

## Open questions

1. Are the course-scale stories right for DCIT (campus link shortener, course chat,
   assignment submissions, campus alerts), or would you rather use other settings?
2. Should good fixtures be allowed engine warnings (current proposal), or must they be
   warning-free? Some warnings, such as "Cache Aside opportunity", may be unavoidable for
   a brief that doesn't need a cache.
3. Risk: `edges.ts` imports `MarkerType` from `@xyflow/react` at runtime. If that fails
   to load under vitest's node environment, the fallback is `environment: "jsdom"`,
   which adds a third dev dependency. Ok to add it if needed?

## Later phases (not in this spec)

- Phase 2: engine fixes for the gaps found here.
- Phase 3: challenge mode in the UI (picker, locked requirements, rule results,
  reflection prompts, design export and import in the compact format).
- Phase 4: more briefs.
