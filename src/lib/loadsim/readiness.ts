import type { Edge } from "@xyflow/react";
import { isClientKind } from "@/lib/catalog";
import type { FeatureBlock } from "@/lib/types";
import { ROUTE_BUDGET } from "./capacities";
import { buildFlowGraph, clientRoles, TooManyRoutesError } from "./graph";
import type { SimNode } from "./types";

/** What a design needs before a load run means anything, in words; empty when it's ready. */
export function missingForLoad(nodes: SimNode[], edges: Edge[], features: FeatureBlock[]): string[] {
  const missing: string[] = [];
  const clients = nodes.filter((n) => isClientKind(n.data.componentKind));
  if (clients.length === 0) {
    missing.push("Add a client (mobile, desktop or IoT) and connect it to your design.");
  } else if (!clients.some((c) => edges.some((e) => e.source === c.id || e.target === c.id))) {
    missing.push("Connect a client to your design.");
  } else if (![...clientRoles(nodes, edges).values()].some((r) => r.role === "sender")) {
    missing.push(
      "Connect a client to compute or a load balancer. Your clients only receive pushes or talk to parts not simulated yet.",
    );
  }
  const ids = new Set(nodes.map((n) => n.id));
  if (!features.some((f) => f.placedOnNodeId && ids.has(f.placedOnNodeId))) {
    missing.push("Place at least one feature on compute.");
  }
  // Only once nothing else is missing, so the student meets one problem at a time.
  if (missing.length === 0 && hasTooManyRoutes(nodes, edges, features)) {
    missing.push(
      `This design has more than ${ROUTE_BUDGET.toLocaleString("en-US")} ways for a request to travel through it, too many to simulate. ` +
        "That usually means load balancers stacked in layers: one load balancer in front of each group of servers is enough.",
    );
  }
  return missing;
}

/** Whether building the routes passes the budget (SPEC-loadsim-route-scale.md); any other error is rethrown. */
function hasTooManyRoutes(nodes: SimNode[], edges: Edge[], features: FeatureBlock[]): boolean {
  try {
    buildFlowGraph(nodes, edges, features);
    return false;
  } catch (e) {
    if (e instanceof TooManyRoutesError) return true;
    throw e;
  }
}
