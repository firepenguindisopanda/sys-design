import type { Edge, Node } from "@xyflow/react";
import { isClientKind, isComputeKind } from "@/lib/catalog";
import { PROTOCOL_META, getEdgeData } from "@/lib/edges";
import type { DesignNodeData } from "@/lib/types";
import type { Brief, ComponentRule, EdgeRule, NodeMatcher, RuleResult } from "./types";

type SimNode = Node<DesignNodeData>;

function matches(node: SimNode, matcher: NodeMatcher): boolean {
  const kind = node.data.componentKind;
  if (matcher === "client") return isClientKind(kind);
  if (matcher === "compute") return isComputeKind(kind);
  return kind === matcher;
}

function matchesAny(node: SimNode, matchers: NodeMatcher[]): boolean {
  return matchers.some((m) => matches(node, m));
}

function describeComponent(rule: ComponentRule): string {
  const conditions = Object.entries(rule.minConfig).map(([k, v]) => `${k} ≥ ${v}`);
  return `${rule.min} × ${rule.kind}${conditions.length ? ` with ${conditions.join(", ")}` : ""}`;
}

function checkComponentRule(rule: ComponentRule, nodes: SimNode[]): RuleResult {
  const found = nodes.filter((n) => {
    if (!matches(n, rule.kind)) return false;
    const cfg = n.data.config as Record<string, unknown>;
    return Object.entries(rule.minConfig).every(
      ([key, min]) => typeof cfg[key] === "number" && (cfg[key] as number) >= min,
    );
  }).length;
  const ok = found >= rule.min;
  return {
    id: rule.id,
    status: ok ? "pass" : rule.severity,
    detail: ok
      ? `Has ${describeComponent(rule)}.`
      : `${rule.why} Needs ${describeComponent(rule)}; found ${found}.`,
  };
}

function checkEdgeRule(rule: EdgeRule, nodes: SimNode[], edges: Edge[]): RuleResult {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const hits = edges.filter((e) => {
    const { protocol } = getEdgeData(e);
    if (rule.protocols && !rule.protocols.includes(protocol)) return false;
    const src = byId.get(e.source);
    const tgt = byId.get(e.target);
    if (!src || !tgt) return false;
    if (matchesAny(src, rule.from) && matchesAny(tgt, rule.to)) return true;
    // Bidirectional channels connect both ways, whichever way they were drawn.
    return (
      PROTOCOL_META[protocol].direction === "bidirectional" &&
      matchesAny(tgt, rule.from) &&
      matchesAny(src, rule.to)
    );
  });

  const via = rule.protocols ? ` over ${rule.protocols.join(" or ")}` : "";
  const link = `${rule.from.join(" or ")} → ${rule.to.join(" or ")}${via}`;
  const ok = rule.mode === "required" ? hits.length > 0 : hits.length === 0;
  let detail: string;
  if (rule.mode === "required") {
    detail = ok ? `Has ${link} (${hits[0].id}).` : `${rule.why} Needs a ${link} connection.`;
  } else {
    detail = ok
      ? `No ${link} connection.`
      : `${rule.why} Remove ${hits.map((e) => e.id).join(", ")}.`;
  }
  return { id: rule.id, status: ok ? "pass" : rule.severity, detail };
}

/** Check a design against the scenario-specific rules of a brief. */
export function evaluateRules(brief: Brief, nodes: SimNode[], edges: Edge[]): RuleResult[] {
  return brief.rules.map((rule) =>
    rule.type === "component"
      ? checkComponentRule(rule, nodes)
      : checkEdgeRule(rule, nodes, edges),
  );
}
