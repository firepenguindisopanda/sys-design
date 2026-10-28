"use client";

import { useId } from "react";
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

/** The selected connection's fields. `InspectorCard` owns the frame and the title. */
export function EdgeInspector({ onDeleted }: { onDeleted?: () => void }) {
  const selectedEdgeId = useSimulatorStore((s) => s.selectedEdgeId);
  const edges = useSimulatorStore((s) => s.edges);
  const nodes = useSimulatorStore((s) => s.nodes);
  const updateEdge = useSimulatorStore((s) => s.updateEdge);
  const reverseEdge = useSimulatorStore((s) => s.reverseEdge);
  const deleteEdge = useSimulatorStore((s) => s.deleteEdge);
  const id = useId();

  const edge = edges.find((e) => e.id === selectedEdgeId);
  if (!edge) return null;

  const data = getEdgeData(edge);
  const meta = PROTOCOL_META[data.protocol];

  return (
    <div className="space-y-3">
      <p className="text-[10px] leading-snug text-slate-500">
        {meta.direction === "bidirectional"
          ? "Rendered with arrows on both ends (two-way)."
          : "Directed arrow: initiator / server → target per protocol rules."}
      </p>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-protocol`} className="text-xs">Protocol</Label>
        <Select
          value={data.protocol}
          onValueChange={(v) => {
            if (!v) return;
            updateEdge(edge.id, { protocol: v as EdgeProtocol });
          }}
        >
          <SelectTrigger id={`${id}-protocol`} className="h-8 w-full text-xs">
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
        <Label htmlFor={`${id}-label`} className="text-xs">Label override</Label>
        <Input
          id={`${id}-label`}
          value={data.label ?? ""}
          placeholder={meta.shortLabel}
          onChange={(e) => updateEdge(edge.id, { label: e.target.value })}
          className="h-8 text-xs"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* The card is narrow: each select fills its column and truncates long names. */}
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`${id}-from`} className="text-[10px]">From</Label>
          <Select
            value={edge.source}
            onValueChange={(v) => {
              if (!v || v === edge.target) return;
              updateEdge(edge.id, { source: v });
            }}
          >
            <SelectTrigger id={`${id}-from`} className="h-8 w-full min-w-0 text-xs">
              <SelectValue className="block! min-w-0 truncate" />
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
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`${id}-to`} className="text-[10px]">To</Label>
          <Select
            value={edge.target}
            onValueChange={(v) => {
              if (!v || v === edge.source) return;
              updateEdge(edge.id, { target: v });
            }}
          >
            <SelectTrigger id={`${id}-to`} className="h-8 w-full min-w-0 text-xs">
              <SelectValue className="block! min-w-0 truncate" />
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
          onClick={() => {
            deleteEdge(edge.id);
            onDeleted?.();
          }}
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
  // Lets <SelectValue> show "HTTP" instead of the raw value.
  const protocolItems = Object.fromEntries(PROTOCOL_OPTIONS.map((p) => [p.protocol, p.shortLabel]));

  return (
    <div className="pointer-events-auto flex items-center gap-1.5 rounded-md border border-slate-200 bg-white/95 px-2 py-1 shadow-sm backdrop-blur">
      <span className="text-[10px] font-medium text-slate-500">New link</span>
      <Select
        items={protocolItems}
        value={pendingProtocol}
        onValueChange={(v) => {
          if (v) setPendingProtocol(v as EdgeProtocol);
        }}
      >
        <SelectTrigger
          aria-label="Protocol for new connections"
          className="h-7 w-[9.5rem] border-0 bg-transparent text-[11px] shadow-none"
        >
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
      <span className="hidden max-w-[10rem] truncate text-[10px] text-slate-500 sm:inline">
        {meta.hint}
      </span>
    </div>
  );
}
