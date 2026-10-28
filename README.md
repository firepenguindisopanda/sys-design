# Sesim — System Design Simulator

Interactive UI for designing distributed systems: place components on a canvas, map functional requirements to feature blocks with resource needs, assign those features onto compute, and run a verification simulation against non-functional requirements (latency, throughput, availability, cost).

Aligned with the System Design teaching material (compute types, DB replicas/sharding, CDN/static hosting pattern, diagramming guidelines) and the Sesim product brief.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- React Flow (`@xyflow/react`) for the canvas
- Zustand for client state

No auth or database — everything runs in the browser.

## Run locally

```bash
npm install
npm run dev -- -H 0.0.0.0 -p 43127
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

## What you can do

1. **Component library** — Clients (Mobile, Desktop, IoT); VM, PaaS, Functions, Edge; Database, Cache, Object storage; Message queue / Pub-Sub, Task worker; Load balancer; Static hosting, CDN; External API  
2. **Canvas** — place nodes; many edges per node (fan-in/out); protocol picker (HTTP, WebSocket ↔, SSE, Web Push, DB, WebRTC); click edges to edit protocol, label, endpoints, reverse, or delete  
3. **Requirements** — functional → feature blocks (memory / vCPU / storage + target RPM); place onto compute; set NFRs  
4. **Verification** — simulate usage and see pass / warn / fail with reasons  

Use **Load BeUWI demo** (clients + backend) or **Fan-in DB demo** (five compute replicas → one database).

## Challenges

Pick a challenge from the **Challenge** menu in the canvas toolbar (or **Sandbox** for free-form design with the demos). A challenge clears the canvas and loads the brief's requirements and targets, which can't be edited; your job is to draw a design and place each feature on compute. **Run simulation** checks the design against the engine and the brief's own rules, and the overall result is the worse of the two.

**Export** saves the canvas as a YAML file (`<challenge>-design.yaml` or `sandbox-design.yaml`) and **Import** opens one again, replacing the canvas. A challenge file reopens in its challenge; a sandbox file brings its own requirements and targets. The format is the fixture format, so a fixture can be imported into its challenge, and an exported design can become a fixture by adding `description` and `expect`.

Briefs live in `challenges/<id>/brief.yaml`, with good and bad reference designs in `fixtures/` (used by the tests, never sent to the browser). See [docs/challenges/brief-format.md](docs/challenges/brief-format.md) to write one. Briefs are read when the site is built, so `npm run build` fails with the file and field if one is invalid.

```bash
npm test
```
