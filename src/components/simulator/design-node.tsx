"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import type { DesignNodeData } from "@/lib/types";
import {
  Cloud,
  Database,
  Globe,
  Network,
  Server,
  Zap,
} from "lucide-react";

const KIND_STYLES: Record<
  string,
  { icon: typeof Server; accent: string; chip: string }
> = {
  vm: {
    icon: Server,
    accent: "#0f766e",
    chip: "#f0fdfa",
  },
  paas: {
    icon: Cloud,
    accent: "#0284c7",
    chip: "#f0f9ff",
  },
  functions: {
    icon: Zap,
    accent: "#d97706",
    chip: "#fffbeb",
  },
  database: {
    icon: Database,
    accent: "#059669",
    chip: "#ecfdf5",
  },
  load_balancer: {
    icon: Network,
    accent: "#475569",
    chip: "#f8fafc",
  },
  static_hosting: {
    icon: Globe,
    accent: "#0891b2",
    chip: "#ecfeff",
  },
  cdn: {
    icon: Globe,
    accent: "#4f46e5",
    chip: "#eef2ff",
  },
};

function DesignNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as DesignNodeData;
  const style = KIND_STYLES[nodeData.componentKind] ?? KIND_STYLES.vm!;
  const Icon = style.icon;
  const cfg = nodeData.config;

  let meta = nodeData.purpose;
  if (cfg && (cfg.kind === "vm" || cfg.kind === "paas" || cfg.kind === "functions")) {
    meta = `${cfg.capacity.vcpus} vCPU · ${cfg.capacity.memoryGb} GB · ${cfg.appType}`;
  } else if (cfg && cfg.kind === "database") {
    meta = `${cfg.engine} · ${cfg.replicas}× replica · ${cfg.shards} shard`;
  }

  return (
    <div
      style={{
        minWidth: 180,
        maxWidth: 220,
        borderRadius: 6,
        border: selected ? "2px solid #0f766e" : "1px solid #e2e8f0",
        borderLeft: `4px solid ${style.accent}`,
        background: "#fff",
        boxShadow: selected
          ? "0 4px 12px rgb(15 118 110 / 0.18)"
          : "0 1px 2px rgb(0 0 0 / 0.06)",
        fontSize: 12,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ width: 8, height: 8, background: "#fff", border: "1px solid #cbd5e1" }}
      />
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
      <Handle
        type="source"
        position={Position.Right}
        style={{ width: 8, height: 8, background: "#fff", border: "1px solid #cbd5e1" }}
      />
    </div>
  );
}

export const DesignNode = memo(DesignNodeComponent);
