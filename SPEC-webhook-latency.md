# Spec: a webhook isn't part of the request (finding 14)

Status: **implemented** (2026-10-28); approved as proposed: 140 ms target, one combined plan and task list,
no browser check. Plan: [tasks/webhook-latency/plan.md](tasks/webhook-latency/plan.md).
Engine change from finding 14 in `docs/challenges/phase1-findings.md`. Module id
`webhook-latency`. Branch: `fix/webhook-latency`, from `main` (`5471f6a`).

## Objective

In `printing-credits`, the server calls the payment provider, and later the provider calls
the server back to confirm the payment (a webhook: `provider -> lb`). The latency estimate
walks that callback as if the student's request waited for it. So the provider's load
balancer, API and database hops are added to the student's time:

| Design | Latency today |
|---|---|
| `printing-credits/good` (has the webhook) | 111 ms |
| `printing-credits/bad-no-webhook` | 66 ms |

The design without the webhook scores faster than the correct one. That's the same kind
of mistake as finding 12: the walk follows a step that happens after the response. The
callback is a **separate request** that starts at the provider.

Users: students reading the Latency figure; you, setting the brief's target.

## Change

1. **Engine (`src/lib/simulation.ts`):** `isAfterResponse` also returns true for edges
   whose source is an `external_api`, alongside message queues, task workers, SSE and Web
   Push.
   - The call *to* the provider (`api -> provider`, 45 ms) still counts. Only the edge
     back is left out.
   - Like the other after-response edges, a two-way edge (WebSocket or WebRTC) drawn
     *from* an external API is left out in both directions. No fixture or demo has one;
     the brief-format doc says to draw such edges from your server.
   - Reachability and crediting don't change, so the provider still makes the load
     balancer reachable for credit, as it does today.
2. **Recalibrate `printing-credits`:** `maxLatencyMs` goes from 230 to **140**. That is 2×
   the good design's new 66 ms, rounded up to the next 10 ms, the same rule as
   `latency-targets`. Without this, `tests/calibration.test.ts` fails, because 230 is more
   than 3× 66.
3. **Guard:** add `["printing-credits", "bad-no-webhook"]` to the "no slower than the
   shortcut" pairs in `tests/latency.test.ts`.

## Prototype results

The prototype was built against `5471f6a` and then reverted. It made one change: adding
`external_api` to `isAfterResponse`.

| Fixture | Before | After |
|---|---|---|
| `printing-credits/good` | 111 ms | **66 ms** |
| `printing-credits/bad-no-webhook` | 66 ms | 66 ms (now ties the good design) |
| `printing-credits/bad-client-to-db` | 111 ms | 66 ms |
| `printing-credits/bad-single-db-replica` | 111 ms | 66 ms |
| `printing-credits/bad-client-calls-provider` | 93 ms | 31 ms |

- **Unchanged:** every other brief, both demos, and all throughput, availability and cost
  figures.
- **Test results:** 506 of the 507 tests passed. The one failure was the calibration
  test, which item 2 fixes.
- **New target of 140 ms:** no fixture's expected results change, because every
  printing-credits design is at 66 ms or less.
- **`bad-client-calls-provider`:** it's faster than the good design (31 against 66). That
  is correct, as with `course-assistant/bad-client-calls-llm`: the browser skips the
  server hop, and the design's flaw is the exposed key. The `topo-api-keys` warning and
  the brief's rules already catch it.
- **Engine count:** stays at 42 of 53. `bad-no-webhook` is still caught only by its brief
  rule (`webhook-to-server`), because a missing callback changes no timing or load. What
  this fix removes is the engine **rewarding** the shortcut.

## Tests (written first)

- **`src/lib/simulation.test.ts`**, in `describe("request latency")`:
  - an edge from an external API back to the load balancer adds nothing; the latency
    equals the same design without that edge;
  - the call from the API to the external API still adds its 45 ms.
- **`tests/latency.test.ts`:** the new pair. It fails today (111 > 66) and passes after
  the change.
- **`tests/calibration.test.ts`:** unchanged. It fails after the engine change until the
  target is 140, which shows the recalibration is needed.

## Docs

- **`docs/challenges/brief-format.md`:**
  - the `nfr-latency` row adds "edges out of external APIs (callbacks)" to what's left
    out;
  - one line on drawing a webhook as `external_api -> compute or load balancer`.
- **`docs/challenges/phase1-findings.md`:**
  - finding 14 is marked fixed, with the table above;
  - the "Calibration done" list gets printing-credits 230 → 140.
- **`HANDOVER.md`** (untracked).

## Boundaries

- **Always:**
  - every other brief, both demos and every fixture's expected results stay unchanged;
  - tests, types, lint and build stay green.
- **Ask first:**
  - changing hop costs;
  - changing crediting or reachability for external APIs;
  - any target other than printing-credits latency.
- **Never:** weaken a fixture's expectations.

## Success criteria

1. `printing-credits/good` is no slower than `bad-no-webhook`, and the guard test pins it.
2. All other probe numbers are unchanged, and all tests, `tsc`, lint and build pass.
3. The calibration test passes with the 140 ms target.

There's no browser check: the visible change is one number on one brief, which the
fixture test and the probe already cover. Say if you want one anyway.

## Open questions

1. **Target.** 140 ms (the 2× rule), as proposed?
2. **Plan format.** One combined plan and task list, as before?
