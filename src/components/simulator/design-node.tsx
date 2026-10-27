"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import type { DesignNodeData } from "@/lib/types";
import {
  Boxes,
  Cloud,
  Cpu,
  Database,
  Globe,
  HardDrive,
  Layers,
  ListTodo,
  Monitor,
  Network,
  Plug,
  Server,
  Smartphone,
  Zap,
} from "lucide-react";

const KIND_STYLES: Record<
  string,
  { icon: typeof Server; accent: string; chip: string }
> = {
  vm: { icon: Server, accent: "#0f766e", chip: "#f0fdfa" },
  paas: { icon: Cloud, accent: "#0284c7", chip: "#f0f9ff" },
  functions: { icon: Zap, accent: "#d97706", chip: "#fffbeb" },
  edge: { icon: Layers, accent: "#0e7490", chip: "#ecfeff" },
  database: { icon: Database, accent: "#059669", chip: "#ecfdf5" },
  cache: { icon: HardDrive, accent: "#b45309", chip: "#fffbeb" },
  object_storage: { icon: Boxes, accent: "#7c3aed", chip: "#f5f3ff" },
  message_queue: { icon: ListTodo, accent: "#c2410c", chip: "#fff7ed" },
  task_worker: { icon: ListTodo, accent: "#a16207", chip: "#fefce8" },
  load_balancer: { icon: Network, accent: "#475569", chip: "#f8fafc" },
  static_hosting: { icon: Globe, accent: "#0891b2", chip: "#ecfeff" },
  cdn: { icon: Globe, accent: "#4f46e5", chip: "#eef2ff" },
  external_api: { icon: Plug, accent: "#be123c", chip: "#fff1f2" },
  mobile: { icon: Smartphone, accent: "#0369a1", chip: "#e0f2fe" },
  desktop: { icon: Monitor, accent: "#334155", chip: "#f1f5f9" },
  iot: { icon: Cpu, accent: "#0f766e", chip: "#ccfbf1" },
};

const handleBase: React.CSSProperties = {
  width: 8,
  height: 8,
  background: "#fff",
  border: "1px solid #94a3b8",
};

/**
 * Many connectable handles around the node so fan-in / fan-out
 * (e.g. 5 compute replicas → one database) attach cleanly.
 * No connection limit on handles.
 */
function MultiHandles() {
  const leftTargets = ["18%", "34%", "50%", "66%", "82%"];
  const rightSources = ["18%", "34%", "50%", "66%", "82%"];

  return (
    <>
      {leftTargets.map((top, i) => (
        <Handle
          key={`t-l-${i}`}
          type="target"
          id={`t-left-${i}`}
          position={Position.Left}
          style={{ ...handleBase, top }}
        />
      ))}
      {rightSources.map((top, i) => (
        <Handle
          key={`s-r-${i}`}
          type="source"
          id={`s-right-${i}`}
          position={Position.Right}
          style={{ ...handleBase, top }}
        />
      ))}
      {/* Extra routing surfaces for vertical / reverse layouts */}
      <Handle type="target" id="t-top-0" position={Position.Top} style={{ ...handleBase, left: "30%" }} />
      <Handle type="target" id="t-top-1" position={Position.Top} style={{ ...handleBase, left: "70%" }} />
      <Handle type="source" id="s-top-0" position={Position.Top} style={{ ...handleBase, left: "50%" }} />
      <Handle type="target" id="t-bottom-0" position={Position.Bottom} style={{ ...handleBase, left: "30%" }} />
      <Handle type="target" id="t-bottom-1" position={Position.Bottom} style={{ ...handleBase, left: "70%" }} />
      <Handle type="source" id="s-bottom-0" position={Position.Bottom} style={{ ...handleBase, left: "50%" }} />
      <Handle type="source" id="s-left-0" position={Position.Left} style={{ ...handleBase, top: "10%" }} />
      <Handle type="target" id="t-right-0" position={Position.Right} style={{ ...handleBase, top: "10%" }} />
    </>
  );
}

function DesignNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as DesignNodeData;
  const style = KIND_STYLES[nodeData.componentKind] ?? KIND_STYLES.vm!;
  const Icon = style.icon;
  const cfg = nodeData.config;

  let meta = nodeData.purpose;
  if (
    cfg &&
    (cfg.kind === "vm" ||
      cfg.kind === "paas" ||
      cfg.kind === "functions" ||
      cfg.kind === "edge")
  ) {
    meta = `${cfg.capacity.vcpus} vCPU · ${cfg.capacity.memoryGb} GB · ${cfg.appType}`;
  } else if (cfg && cfg.kind === "database") {
    meta = `${cfg.engine} · ${cfg.replicas}× replica · ${cfg.shards} shard`;
  } else if (cfg && cfg.kind === "cache") {
    meta = `${cfg.engine} · ${cfg.memoryGb} GB`;
  } else if (cfg && cfg.kind === "object_storage") {
    meta = `${cfg.storageGb} GB objects`;
  } else if (cfg && cfg.kind === "message_queue") {
    meta = cfg.mode === "pubsub" ? "Pub/Sub" : "Queue";
  } else if (cfg && cfg.kind === "task_worker") {
    meta = `${cfg.concurrency} workers`;
  } else if (cfg && cfg.kind === "external_api") {
    meta = cfg.provider;
  } else if (cfg && (cfg.kind === "mobile" || cfg.kind === "desktop" || cfg.kind === "iot")) {
    meta = cfg.platform;
  }

  // Per-side borders: mixing the `border` shorthand with `borderLeft` makes
  // React warn when `selected` toggles.
  const sideBorder = selected ? "2px solid #0f766e" : "1px solid #e2e8f0";

  return (
    <div
      style={{
        minWidth: 180,
        maxWidth: 220,
        borderRadius: 6,
        borderTop: sideBorder,
        borderRight: sideBorder,
        borderBottom: sideBorder,
        borderLeft: `4px solid ${style.accent}`,
        background: "#fff",
        boxShadow: selected
          ? "0 4px 12px rgb(15 118 110 / 0.18)"
          : "0 1px 2px rgb(0 0 0 / 0.06)",
        fontSize: 12,
        position: "relative",
      }}
    >
      <MultiHandles />
      <div style={{ display: "flex", gap: 8, padding: "10px 12px", alignItems: "flex-start" }}>
        <div
          style={{
            marginTop: 2,
            borderRadius: 4,
            padding: 4,
            background: style.chip,
            color: style.accent,
          }}
        >
          <Icon size={14} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              color: "#0f172a",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {nodeData.label}
          </div>
          <div
            style={{
              marginTop: 2,
              color: "#64748b",
              fontSize: 11,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {meta}
          </div>
        </div>
      </div>
    </div>
  );
}

export const DesignNode = memo(DesignNodeComponent);
