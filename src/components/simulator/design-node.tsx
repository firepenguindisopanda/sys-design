"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { DesignNodeData } from "@/lib/types";
import {
  Cloud,
  Database,
  Globe,
  Network,
  Server,
  Zap,
} from "lucide-react";

type DesignFlowNode = Node<DesignNodeData, "design">;

const KIND_STYLES: Record<
  string,
  { icon: typeof Server; accent: string; chip: string }
> = {
  vm: {
    icon: Server,
    accent: "border-l-teal-600",
    chip: "bg-teal-50 text-teal-800",
  },
  paas: {
    icon: Cloud,
    accent: "border-l-sky-600",
    chip: "bg-sky-50 text-sky-800",
  },
  functions: {
    icon: Zap,
    accent: "border-l-amber-500",
    chip: "bg-amber-50 text-amber-900",
  },
  database: {
    icon: Database,
    accent: "border-l-emerald-600",
    chip: "bg-emerald-50 text-emerald-800",
  },
  load_balancer: {
    icon: Network,
    accent: "border-l-slate-600",
    chip: "bg-slate-100 text-slate-800",
  },
  static_hosting: {
    icon: Globe,
    accent: "border-l-cyan-600",
    chip: "bg-cyan-50 text-cyan-800",
  },
  cdn: {
    icon: Globe,
    accent: "border-l-indigo-500",
    chip: "bg-indigo-50 text-indigo-800",
  },
};

export function DesignNode({ data, selected }: NodeProps<DesignFlowNode>) {
  const style = KIND_STYLES[data.componentKind] ?? KIND_STYLES.vm!;
  const Icon = style.icon;
  const cfg = data.config;

  let meta = data.purpose;
  if (cfg.kind === "vm" || cfg.kind === "paas" || cfg.kind === "functions") {
    meta = `${cfg.capacity.vcpus} vCPU · ${cfg.capacity.memoryGb} GB · ${cfg.appType}`;
  } else if (cfg.kind === "database") {
    meta = `${cfg.engine} · ${cfg.replicas}× replica · ${cfg.shards} shard`;
  }

  return (
    <div
      className={cn(
        "min-w-[180px] max-w-[220px] rounded-md border border-slate-200 border-l-4 bg-white shadow-sm",
        style.accent,
        selected && "ring-2 ring-teal-500/60 shadow-md",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-slate-300 !bg-white"
      />
      <div className="flex items-start gap-2 px-3 py-2.5">
        <div className={cn("mt-0.5 rounded p-1", style.chip)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{data.label}</div>
          <div className="mt-0.5 truncate text-[11px] text-slate-500">{meta}</div>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-slate-300 !bg-white"
      />
    </div>
  );
}
