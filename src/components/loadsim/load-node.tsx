"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { isClientKind } from "@/lib/catalog";
import { KIND_STYLES } from "@/components/simulator/design-node";
import type { LoadRun } from "@/lib/loadsim/types";
import { usePlayback } from "./playback";
import { useSim } from "./sim-context";

export type GaugeBand = "ok" | "busy" | "saturated";

const BAND_COLOURS: Record<GaugeBand, string> = { ok: "#059669", busy: "#d97706", saturated: "#dc2626" };

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
}): string {
  if (isClientKind(kind)) return `Sending ${Math.round(ratePerSecond).toLocaleString("en")} req/s`;
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
  return nodeStatus({
    kind,
    utilisation: frame?.utilisation ?? 0,
    failedSoFar,
    ratePerSecond: (frame?.arrivals ?? 0) / run.dtSeconds,
    notSimulated,
    waiting: frame?.backlog ?? 0,
    unread: (run.summary.jobs?.perQueue[id]?.neverDone ?? 0) >= 0.5,
    concurrency: run.workerSlots[id] ?? 1,
  });
}

export function LoadNodeBody({
  label,
  kind,
  utilisation,
  status,
}: {
  label: string;
  kind: string;
  utilisation: number;
  status: string;
}) {
  const style = KIND_STYLES[kind] ?? KIND_STYLES.vm!;
  const Icon = style.icon;
  // A worker running flat out behind a queue is doing its job: busy, not saturated.
  const band = kind === "task_worker" && utilisation >= 1 ? "busy" : gaugeBand(utilisation);
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
      </div>
      {isClientKind(kind) ? null : (
        <div style={{ padding: "0 12px 10px" }}>
          <div data-band={band} style={{ height: 6, borderRadius: 3, background: "#e2e8f0", overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.round(Math.min(Math.max(utilisation, 0), 1) * 100)}%`,
                height: "100%",
                background: BAND_COLOURS[band],
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const hidden = { opacity: 0, pointerEvents: "none" as const };

type LoadNodeData = { label: string; kind: string };

/** A design node on the simulation canvas, showing the current frame's load. */
function LoadNodeComponent({ id, data }: NodeProps) {
  const { label, kind } = data as LoadNodeData;
  const { run, failedSoFar, notSimulated } = useSim();
  const step = usePlayback((s) => s.step);
  const frame = run.frames[step]?.nodes[id];
  const status = nodeStatusAt(run, id, kind, step, failedSoFar[id]?.[step] ?? 0, notSimulated.has(id));
  return (
    <>
      <Handle type="target" position={Position.Left} style={hidden} isConnectable={false} />
      <LoadNodeBody label={label} kind={kind} utilisation={frame?.utilisation ?? 0} status={status} />
      <Handle type="source" position={Position.Right} style={hidden} isConnectable={false} />
    </>
  );
}

export const LoadNode = memo(LoadNodeComponent);
