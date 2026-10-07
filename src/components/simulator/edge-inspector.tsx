"use client";

import { useSimulatorStore } from "@/lib/store";
import { PROTOCOL_META, PROTOCOL_OPTIONS, getEdgeData } from "@/lib/edges";
import type { EdgeProtocol } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeftRight, Trash2 } from "lucide-react";

export function EdgeInspector() {
  const selectedEdgeId = useSimulatorStore((s) => s.selectedEdgeId);
  const edges = useSimulatorStore((s) => s.edges);
  const nodes = useSimulatorStore((s) => s.nodes);
  const updateEdge = useSimulatorStore((s) => s.updateEdge);
  const reverseEdge = useSimulatorStore((s) => s.reverseEdge);
  const deleteEdge = useSimulatorStore((s) => s.deleteEdge);

  const edge = edges.find((e) => e.id === selectedEdgeId);
  if (!edge) {
    return (
      <div className="rounded-md border border-dashed border-slate-200 bg-slate-50/80 px-3 py-4 text-xs text-slate-500">
        Select a connection on the canvas to edit protocol, label, or endpoints.
      </div>
    );
  }

  const data = getEdgeData(edge);
  const meta = PROTOCOL_META[data.protocol];
  const sourceNode = nodes.find((n) => n.id === edge.source);
  const targetNode = nodes.find((n) => n.id === edge.target);

  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Selected connection
        </div>
        <div className="mt-0.5 text-sm font-semibold text-slate-900">
          {sourceNode?.data.label ?? edge.source} → {targetNode?.data.label ?? edge.target}
        </div>
        <p className="mt-1 text-[10px] leading-snug text-slate-500">
          {meta.direction === "bidirectional"
            ? "Rendered with arrows on both ends (two-way)."
            : "Directed arrow: initiator / server → target per protocol rules."}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Protocol</Label>
        <Select
          value={data.protocol}
          onValueChange={(v) => {
            if (!v) return;
            updateEdge(edge.id, { protocol: v as EdgeProtocol });
          }}
        >
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROTOCOL_OPTIONS.map((p) => (
              <SelectItem key={p.protocol} value={p.protocol}>
                {p.label} ({p.direction === "bidirectional" ? "↔" : "→"})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] leading-snug text-slate-500">{meta.hint}</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Label override</Label>
        <Input
          value={data.label ?? ""}
          placeholder={meta.shortLabel}
          onChange={(e) => updateEdge(edge.id, { label: e.target.value })}
          className="h-8 text-xs"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px]">From</Label>
          <Select
            value={edge.source}
            onValueChange={(v) => {
              if (!v || v === edge.target) return;
              updateEdge(edge.id, { source: v });
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {nodes.map((n) => (
                <SelectItem key={n.id} value={n.id} disabled={n.id === edge.target}>
                  {n.data.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">To</Label>
          <Select
            value={edge.target}
            onValueChange={(v) => {
              if (!v || v === edge.source) return;
              updateEdge(edge.id, { target: v });
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {nodes.map((n) => (
                <SelectItem key={n.id} value={n.id} disabled={n.id === edge.source}>
                  {n.data.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 flex-1 gap-1.5 text-xs"
          onClick={() => reverseEdge(edge.id)}
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
          Reverse
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs text-red-600 hover:text-red-700"
          onClick={() => deleteEdge(edge.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
      </div>
    </div>
  );
}

export function PendingProtocolPicker() {
  const pendingProtocol = useSimulatorStore((s) => s.pendingProtocol);
  const setPendingProtocol = useSimulatorStore((s) => s.setPendingProtocol);
  const meta = PROTOCOL_META[pendingProtocol];

  return (
    <div className="pointer-events-auto flex items-center gap-1.5 rounded-md border border-slate-200 bg-white/95 px-2 py-1 shadow-sm backdrop-blur">
      <span className="text-[10px] font-medium text-slate-500">New link</span>
      <Select
        value={pendingProtocol}
        onValueChange={(v) => {
          if (v) setPendingProtocol(v as EdgeProtocol);
        }}
      >
        <SelectTrigger className="h-7 w-[9.5rem] border-0 bg-transparent text-[11px] shadow-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROTOCOL_OPTIONS.map((p) => (
            <SelectItem key={p.protocol} value={p.protocol}>
              {p.shortLabel} {p.direction === "bidirectional" ? "↔" : "→"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="hidden max-w-[10rem] truncate text-[10px] text-slate-400 sm:inline">
        {meta.hint}
      </span>
    </div>
  );
}
