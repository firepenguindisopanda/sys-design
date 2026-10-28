"use client";

import { useId } from "react";
import { useSimulatorStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { NodeInspector } from "./node-inspector";
import { EdgeInspector } from "./edge-inspector";
import { SECTION_LABEL } from "./styles";

/**
 * The selected node's or connection's inspector, docked on the canvas. Renders nothing
 * when the selection doesn't match anything, e.g. a node just deleted with the keyboard.
 * Opening it never moves focus; closing it calls `onClose` so the canvas can take focus.
 */
export function InspectorCard({ onClose }: { onClose: () => void }) {
  const selectedNodeId = useSimulatorStore((s) => s.selectedNodeId);
  const selectedEdgeId = useSimulatorStore((s) => s.selectedEdgeId);
  const nodes = useSimulatorStore((s) => s.nodes);
  const edges = useSimulatorStore((s) => s.edges);
  const selectNode = useSimulatorStore((s) => s.selectNode);
  const selectEdge = useSimulatorStore((s) => s.selectEdge);
  const headingId = useId();

  const node = nodes.find((n) => n.id === selectedNodeId);
  const edge = node ? undefined : edges.find((e) => e.id === selectedEdgeId);
  if (!node && !edge) return null;

  const label = (id: string) => nodes.find((n) => n.id === id)?.data.label ?? id;
  const name = node ? node.data.label : `${label(edge!.source)} → ${label(edge!.target)}`;

  const close = () => {
    selectNode(null);
    selectEdge(null);
    onClose();
  };

  return (
    <section
      aria-labelledby={headingId}
      // Select popups render in a portal, so an Escape that closes one never gets here.
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
      className="pointer-events-auto max-h-full w-72 max-w-full shrink-0 overflow-y-auto rounded-md border border-slate-200 bg-white p-3 shadow-sm"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={headingId} className={SECTION_LABEL}>
            {node ? "Selected node" : "Selected connection"}
          </h2>
          <div className="mt-0.5 text-sm font-semibold break-words text-slate-900">{name}</div>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Close inspector"
          className="h-6 w-6 shrink-0 text-slate-500"
          onClick={close}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {node ? <NodeInspector onDeleted={onClose} /> : <EdgeInspector onDeleted={onClose} />}
    </section>
  );
}
