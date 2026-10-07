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

1. **Component library** — VM, PaaS, Functions, Database (replicas/shards), Load balancer, Static hosting, CDN  
2. **Canvas** — place nodes, connect directed edges  
3. **Requirements** — functional → feature blocks (memory / vCPU / storage + target RPM); place onto compute; set NFRs  
4. **Verification** — simulate usage and see pass / warn / fail with reasons  

Use **Load BeUWI demo** for a starter topology inspired by the PDF case study.
