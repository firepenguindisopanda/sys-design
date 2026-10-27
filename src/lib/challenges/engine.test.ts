import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_CAPACITIES } from "@/lib/catalog";
import { createStyledEdge } from "@/lib/edges";
import { runVerification } from "@/lib/simulation";
import type { DesignNodeData } from "@/lib/types";

// Smoke test: the existing engine (and @xyflow/react, which edges.ts loads at
// runtime) must work under vitest before any challenge code builds on it.
describe("runVerification under vitest", () => {
  it("verifies a minimal client → compute → database design", () => {
    const nodes: Node<DesignNodeData>[] = [
      {
        id: "phone",
        position: { x: 0, y: 0 },
        data: {
          label: "Phone",
          componentKind: "mobile",
          purpose: "",
          config: { kind: "mobile", platform: "iOS" },
        },
      },
      {
        id: "api",
        position: { x: 0, y: 0 },
        data: {
          label: "API",
          componentKind: "paas",
          purpose: "",
          config: {
            kind: "paas",
            capacity: { ...DEFAULT_CAPACITIES.paas },
            appType: "",
            hosting: "",
          },
        },
      },
      {
        id: "db",
        position: { x: 0, y: 0 },
        data: {
          label: "DB",
          componentKind: "database",
          purpose: "",
          config: {
            kind: "database",
            engine: "relational",
            replicas: 2,
            shards: 1,
            storageGb: 50,
          },
        },
      },
    ];
    const edges: Edge[] = [
      createStyledEdge({ id: "phone->api", source: "phone", target: "api" }, "http"),
      createStyledEdge({ id: "api->db", source: "api", target: "db" }, "db"),
    ];

    const result = runVerification(
      nodes,
      edges,
      [
        {
          id: "f1",
          name: "Read",
          description: "",
          resources: { memoryGb: 1, vcpus: 1, storageGb: 1 },
          targetRpm: 100,
          computeMsPerRequest: 20,
          placedOnNodeId: "api",
        },
      ],
      {
        maxLatencyMs: 500,
        minThroughputRpm: 100,
        minAvailabilityPct: 99,
        maxMonthlyCostUsd: null,
      },
    );

    expect(result.checks.find((c) => c.id === "placement-ok")?.status).toBe("pass");
    expect(result.estimatedLatencyMs).toBeGreaterThan(0);
    expect(result.estimatedThroughputRpm).toBeGreaterThan(0);
  });
});
