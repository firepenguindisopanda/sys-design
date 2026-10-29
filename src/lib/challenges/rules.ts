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
  const fix = ok ? null : `Needs ${describeComponent(rule)}; found ${found}.`;
  return {
    id: rule.id,
    title: rule.title,
    status: ok ? "pass" : rule.severity,
    detail: fix === null ? `Has ${describeComponent(rule)}.` : `${rule.why} ${fix}`,
    kind: "required",
    why: rule.why,
    fix,
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
  let fix: string | null = null;
  let passText = "";
  if (rule.mode === "required") {
    if (ok) passText = `Has ${link} (${hits[0].id}).`;
    else fix = `Needs a ${link} connection.`;
  } else {
    if (ok) passText = `No ${link} connection.`;
    else fix = `Remove ${hits.map((e) => e.id).join(", ")}.`;
  }
  return {
    id: rule.id,
    title: rule.title,
    status: ok ? "pass" : rule.severity,
    detail: fix === null ? passText : `${rule.why} ${fix}`,
    kind: rule.mode,
    why: rule.why,
    fix,
  };
}

/** Check a design against the scenario-specific rules of a brief. */
export function evaluateRules(brief: Brief, nodes: SimNode[], edges: Edge[]): RuleResult[] {
  return brief.rules.map((rule) =>
    rule.type === "component"
      ? checkComponentRule(rule, nodes)
      : checkEdgeRule(rule, nodes, edges),
  );
}
