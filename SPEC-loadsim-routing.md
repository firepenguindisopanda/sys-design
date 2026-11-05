# Spec: load simulation routing (`loadsim-routing`)

A fix to slice 1 of the load simulation page (`SPEC-dataflow-sim.md`), from the feature
audit of Nov 5, 2026. Branch `fix/loadsim-routing`.

## Problem

The load model reports requests as failed when the design is fine. It does this in three cases:

1. **Push-only clients send requests.** Every client sends an equal share of every
   feature. In `lab-monitor`, the technician's phone only receives Web Push from the
   workers, yet it is given a third of all traffic, which fails as "can't reach". Every
   `lab-monitor` design, the reference one included, loses 33.3%.
2. **Requests stop at a CDN or static hosting.** Only a load balancer is passed through on
   the way to compute. The BeUWI demo reaches its API through CDN → Static Hosting → Load
   Balancer, so 100% fail, while Run simulation gives it 1 warning and 10 passes.
3. **Clients that only talk to unsimulated parts send requests.** In the BeUWI demo, Campus
   IoT only sends to a queue (Upload events). Queues aren't simulated yet, so its share
   fails as "can't reach".

## Changes

1. **Who sends requests.** A client is a *receiver* when it has at least one edge and every
   edge it has is a server push into it (SSE or Web Push). A client is *off the model*
   when every edge it starts goes only to parts this slice doesn't simulate: a queue, a
   worker, object storage or an external API. Every other client is a *sender*, including
   one with no edges or one wired straight to a database. Those are design flaws, and they
   still fail.
   - Each feature's share is split over the senders only. Before, it was split over every
     client.
   - The run's notes name each receiver and each off-the-model client, for example: "Technician
     phone only receives pushes, so it sends no requests here." and "Campus IoT only talks
     to Upload events (queue), which isn't simulated yet, so it sends no requests here."
   - If clients exist but none is a sender, the page isn't ready, and says: "Connect a
     client to compute or a load balancer. Your clients only receive pushes or talk to
     parts not simulated yet."
2. **Passing through a CDN or static hosting.** On the way to compute, requests pass through
   CDN and static hosting nodes the same way they pass through a load balancer: split
   evenly over the routes on, at the load balancer's cost and capacity. Neither forms a
   pool. A CDN or static hosting node that carries requests shows a busy gauge, not "Not
   simulated yet". Its file-traffic note stays in the "Not simulated yet" list.
3. **Kept as it is:** every sender still requests every feature. This keeps
   `link-shortener/bad-no-load-balancer` failing the phone's redirects. If a client only
   requested the features it can reach, that flaw would disappear.

## Not changing

- The engine, the brief rules, the verification panel and the fixtures. Run simulation's
  numbers don't change.
- The capacities, the timeout, and the `load` blocks of the two pilot briefs.
- The default load for briefs without a `load` block. Six reference designs still saturate
  their API under 100,000 requests. Fixing that means calibrating each brief, which is a
  separate step.

## Tests (written first)

- `graph.test.ts`: a push-only client is a receiver with no classes. A queue-only client is
  off the model. A client with no edges, or wired only to a database, is still a sender
  and fails as no-route. A route passes through CDN → static hosting → load balancer →
  compute.
- `model.test.ts`: feature shares are split over senders only, so nothing is lost to
  receivers. A CDN on the path gets a station and a busy figure.
- `readiness.test.ts`: the new message when no client is a sender.
- `loadsim-pilots.test.ts`: both pilots keep their current results, and the
  no-load-balancer failure still shows.
- A new guard: the `lab-monitor` reference design and the BeUWI demo serve at least 99%
  under a light load. The light load keeps the default-load calibration gap out of this
  check.

## Acceptance

- Run the probe before and after. Only designs that have a push-only client, a
  queue-only client, or a CDN or static hosting node on the request path change.
- All tests, `tsc`, lint and the build pass.
- In the browser, the BeUWI demo on `/simulate` serves its requests, with dots through the
  CDN and static hosting.

## Results (Nov 5, 2026)

- **Found while building: station order.** Each step processed stations in a fixed order
  by kind: load balancer, compute, cache, database, then everything else. A CDN ran after
  the VM behind it, so its requests reached the VM after the VM's turn and were served
  without using any capacity. An overloaded one-vCPU VM served 100% behind a CDN, against
  21% without one. Stations now run upstream first, with the old order as the tie-break
  (`upstreamFirst` in `model.ts`). Results for designs without a CDN or static hosting on
  the path are unchanged. Guard: "nodes requests pass through" in `model.test.ts`.
- **Probe, before and after:** only `lab-monitor` and `file-storage/bad-files-in-db`
  changed. Every `lab-monitor` design now serves 100%, up from 66.7%. Its flaws are about
  queues and writes, which this slice doesn't simulate, so none of them fails here yet.
  `bad-files-in-db` is 2 ms slower at p95, because its TA machine now passes through the CDN.
- **BeUWI demo in the browser:** requests pass through the CDN (1% busy), static hosting
  and the load balancer, and Campus IoT is named as sending nothing. Under the default
  100,000-request spike, its single 2-vCPU API saturates and 61% fail. That is the
  default-load gap, left out of this spec. At 20,000 requests, 99.6% are served.
- **Checks:** 1,093 tests pass, 2 skipped. `tsc`, lint and `next build` are clean, with
  no console errors on `/simulate`.
