"use client";

import { memo, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Power } from "lucide-react";
import { isClientKind } from "@/lib/catalog";
import { KIND_STYLES } from "@/components/simulator/design-node";
import { CAPACITY } from "@/lib/loadsim/capacities";
import { canSwitchOff } from "@/lib/loadsim/outages";
import type { Limit, LoadRun } from "@/lib/loadsim/types";
import { usePlayback } from "./playback";
import { formatClock } from "./playback-bar";
import { useSim } from "./sim-context";

export type GaugeBand = "ok" | "busy" | "saturated" | "off";

const BAND_COLOURS: Record<GaugeBand, string> = { ok: "#059669", busy: "#d97706", saturated: "#dc2626", off: "#94a3b8" };

export function gaugeBand(utilisation: number): GaugeBand {
  return utilisation >= 1 ? "saturated" : utilisation >= 0.7 ? "busy" : "ok";
}

/** The node's state in words, so colour is never the only signal. */
export function nodeStatus({
  kind,
  utilisation,
  failedSoFar,
  ratePerSecond,
  notSimulated,
  waiting = 0,
  unread = false,
  concurrency = 1,
  off,
  offSince = 0,
  limit,
}: {
  kind: string;
  utilisation: number;
  failedSoFar: number;
  ratePerSecond: number;
  notSimulated: boolean;
  /** A queue's jobs waiting now (SPEC-loadsim-queues.md) */
  waiting?: number;
  /** A queue no worker reads */
  unread?: boolean;
  /** A worker's slots */
  concurrency?: number;
  /** Switched off (SPEC-loadsim-failures.md): still sent requests, or noticed */
  off?: "routed" | "noticed";
  /** When it went off, in seconds */
  offSince?: number;
  /** The instance limit holding it back this step (SPEC-loadsim-cascades.md) */
  limit?: Limit;
}): string {
  if (isClientKind(kind)) return `Sending ${Math.round(ratePerSecond).toLocaleString("en")} req/s`;
  if (off === "routed") return "Off · still getting requests";
  if (off === "noticed") return `Off since ${formatClock(offSince)}`;
  if (notSimulated) return "Not simulated yet";
  if (kind === "message_queue") {
    if (waiting < 0.5) return "Empty";
    const text = `${Math.round(waiting).toLocaleString("en")} waiting`;
    return unread ? `${text} · nobody reads it` : text;
  }
  if (kind === "task_worker" && utilisation > 0) {
    // A worker behind a queue runs flat out by design: "100% busy", never "Saturated".
    const slots = Math.min(concurrency, Math.max(1, Math.ceil(utilisation * concurrency - 1e-9)));
    const busy = utilisation >= 1 ? 100 : Math.min(99, Math.max(1, Math.round(utilisation * 100)));
    return `${busy}% busy · ${slots} of ${concurrency} slots`;
  }
  const failed = failedSoFar >= 0.5 ? ` · ${Math.round(failedSoFar).toLocaleString("en")} failed` : "";
  const { slots } = CAPACITY.instance;
  if (limit === "slots") return `Saturated · ${slots} of ${slots} slots${failed}`;
  if (limit === "connections") return `Waiting for a database connection${failed}`;
  if (utilisation <= 0) return `No traffic${failed}`;
  if (utilisation >= 1) return `Saturated${failed}`;
  return `${Math.min(99, Math.max(1, Math.round(utilisation * 100)))}% busy${failed}`;
}

/** The gauge text for one node at one step of a run. */
export function nodeStatusAt(
  run: LoadRun,
  id: string,
  kind: string,
  step: number,
  failedSoFar: number,
  notSimulated: boolean,
): string {
  const frame = run.frames[step]?.nodes[id];
  const t = step * run.dtSeconds;
  const outage = run.summary.outages.find((o) => o.nodeId === id && o.offAt <= t + 1e-9 && (o.onAt === null || t < o.onAt));
  return nodeStatus({
    kind,
    utilisation: frame?.utilisation ?? 0,
    failedSoFar,
    ratePerSecond: (frame?.arrivals ?? 0) / run.dtSeconds,
    notSimulated,
    waiting: frame?.backlog ?? 0,
    unread: (run.summary.jobs?.perQueue[id]?.neverDone ?? 0) >= 0.5,
    concurrency: run.workerSlots[id] ?? 1,
    off: frame?.off,
    offSince: outage?.offAt ?? 0,
    limit: frame?.limit,
  });
}

export const LoadNodeBody = memo(function LoadNodeBody({
  label,
  kind,
  utilisation,
  status,
  off = false,
  onToggle,
}: {
  label: string;
  kind: string;
  utilisation: number;
  status: string;
  /** Switched off now (SPEC-loadsim-failures.md) */
  off?: boolean;
  /** Switch it off, or bring it back; only components that can be switched off get the button */
  onToggle?: () => void;
}) {
  const style = KIND_STYLES[kind] ?? KIND_STYLES.vm!;
  const Icon = style.icon;
  // A worker running flat out behind a queue is doing its job: busy, not saturated.
  const band: GaugeBand = off ? "off" : kind === "task_worker" && utilisation >= 1 ? "busy" : gaugeBand(utilisation);
  const power = onToggle && canSwitchOff(kind);
  return (
    <div
      role="group"
      aria-label={`${label}: ${status}`}
      style={{
        minWidth: 180,
        maxWidth: 220,
        borderRadius: 6,
        borderTop: "1px solid #e2e8f0",
        borderRight: "1px solid #e2e8f0",
        borderBottom: "1px solid #e2e8f0",
        borderLeft: `4px solid ${style.accent}`,
        background: "#fff",
        boxShadow: band === "saturated" ? "0 0 0 2px rgb(220 38 38 / 0.35)" : "0 1px 2px rgb(0 0 0 / 0.06)",
        fontSize: 12,
      }}
    >
      <div style={{ display: "flex", gap: 8, padding: "10px 12px 8px", alignItems: "flex-start" }}>
        <div style={{ marginTop: 2, borderRadius: 4, padding: 4, background: style.chip, color: style.accent }}>
          <Icon size={14} aria-hidden />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {label}
          </div>
          <div style={{ marginTop: 2, color: "#475569", fontSize: 11 }}>{status}</div>
        </div>
        {power ? (
          <button
            type="button"
            // nodrag/nopan: pressing the button mustn't drag the node or pan the canvas.
            className={`nodrag nopan shrink-0 rounded-md p-1 focus-visible:outline-2 focus-visible:outline-teal-700 ${
              off ? "bg-slate-200 text-slate-700 hover:bg-slate-300" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            }`}
            aria-label={`${off ? "Bring back" : "Switch off"} ${label}`}
            title={off ? "Bring back" : "Switch off"}
            onClick={onToggle}
          >
            <Power aria-hidden size={14} />
          </button>
        ) : null}
      </div>
      {isClientKind(kind) ? null : (
        <div style={{ padding: "0 12px 10px" }}>
          <div data-band={band} style={{ height: 6, borderRadius: 3, background: "#e2e8f0", overflow: "hidden" }}>
            <div
              style={{
                width: off ? "100%" : `${Math.round(Math.min(Math.max(utilisation, 0), 1) * 100)}%`,
                height: "100%",
                background: BAND_COLOURS[band],
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
});

/** The two frame values a node shows besides its status text: gauge level, and switched off. */
export function nodeGaugeAtStep(run: LoadRun, step: number, id: string): { utilisation: number; off: boolean } {
  const frame = run.frames[step]?.nodes[id];
  return { utilisation: frame?.utilisation ?? 0, off: frame?.off !== undefined };
}

const hidden = { opacity: 0, pointerEvents: "none" as const };

type LoadNodeData = { label: string; kind: string };

/** A design node on the simulation canvas, showing the current frame's load. */
function LoadNodeComponent({ id, data }: NodeProps) {
  const { label, kind } = data as LoadNodeData;
  const { run, failedSoFar, notSimulated, toggle } = useSim();
  // Select only what the node shows (SPEC-canvas-render-scale.md, fix 5): primitives, so the
  // node re-renders when its gauge, off state or status text changes, not on every step.
  const utilisation = usePlayback((s) => nodeGaugeAtStep(run, s.step, id).utilisation);
  const off = usePlayback((s) => nodeGaugeAtStep(run, s.step, id).off);
  const status = usePlayback((s) =>
    nodeStatusAt(run, id, kind, s.step, failedSoFar[id]?.[s.step] ?? 0, notSimulated.has(id)),
  );
  // Stable per node, so the memoised body can skip when only the step moved.
  const onToggle = useCallback(() => toggle?.(id), [toggle, id]);
  return (
    <>
      <Handle type="target" position={Position.Left} style={hidden} isConnectable={false} />
      <LoadNodeBody
        label={label}
        kind={kind}
        utilisation={utilisation}
        status={status}
        off={off}
        onToggle={toggle ? onToggle : undefined}
      />
      <Handle type="source" position={Position.Right} style={hidden} isConnectable={false} />
    </>
  );
}

export const LoadNode = memo(LoadNodeComponent);
