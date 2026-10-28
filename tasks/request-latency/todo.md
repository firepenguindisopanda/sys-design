# Tasks: `request-latency`

Spec: [SPEC-request-latency.md](../../SPEC-request-latency.md). Plan: [plan.md](plan.md).

Standing verification: `npm test`, `npx tsc --noEmit`, `npm run lint` pass;
`tests/demos.test.ts` and every fixture's `expect` unchanged.

---

## Task 1: Tests first

**Description:** In `src/lib/simulation.test.ts` (using its `node`, `edge`, `feature`
helpers), a `describe("request latency")` block:

- API → queue → worker → database adds only the enqueue hop compared with the same
  design without the worker chain;
- server → client SSE and Web Push edges add nothing, and the receiving client still
  starts requests;
- client → load balancer → API → database gives the same number as today;
- a design with no clients uses the nodes with no incoming edge;
- a WebSocket edge drawn server → client still lets the client start a request.

New `tests/latency.test.ts`: load the briefs; for each pair from the spec's Objective
table, the good design's latency is ≤ the shortcut's.

**Acceptance criteria:**
- [x] New tests fail against today's engine for the reasons the spec gives (the chains
  and pushes are counted); the "unchanged" cases pass already

**Verification:**
- [x] `npx vitest run src/lib/simulation.test.ts tests/latency.test.ts` shows the
  expected failures

**Dependencies:** None

**Files:** `src/lib/simulation.test.ts`, `tests/latency.test.ts`

**Estimated scope:** S

---

## Task 2: The change

**Description:** In `estimatePathLatency`: roots from `requestRoots(nodes, edges)`;
skip edges whose source is a `message_queue` or `task_worker`, or whose protocol is
`sse` or `web_push`. Add to the `nfr-latency` detail that background work and server
push aren't included.

**Acceptance criteria:**
- [x] Task 1's tests pass
- [x] The probe gives the spec's "after" latency for every fixture (compare with the
  prototype output)
- [x] Demos and all existing tests unchanged

**Verification:**
- [x] `npm test`; probe compared with the prototype table; standing checks

**Dependencies:** Task 1

**Files:** `src/lib/simulation.ts`

**Estimated scope:** S

---

## Task 3: Docs, full checks, browser spot check

**Description:** Finding 12 marked fixed in `docs/challenges/phase1-findings.md` (with
the before/after table) and finding 7 updated; the `nfr-latency` row in
`docs/challenges/brief-format.md`; `HANDOVER.md`. In the browser, import
`shuttle-tracker/good.yaml` and `bad-polling.yaml`: both show 33 ms; the latency check's
detail reads as intended.

**Acceptance criteria:**
- [x] Docs updated
- [x] Browser shows the new figures and wording; no console errors
- [x] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` pass

**Dependencies:** Task 2

**Files:** `docs/challenges/phase1-findings.md`, `docs/challenges/brief-format.md`,
`HANDOVER.md`, `tasks/plan.md`

**Estimated scope:** S

### Checkpoint
- [x] All three spec success criteria met; ready for review (nothing committed until
  asked)
