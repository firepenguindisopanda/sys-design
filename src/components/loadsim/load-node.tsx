"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { isClientKind } from "@/lib/catalog";
import { KIND_STYLES } from "@/components/simulator/design-node";
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
}: {
  kind: string;
  utilisation: number;
  failedSoFar: number;
  ratePerSecond: number;
  notSimulated: boolean;
}): string {
  if (isClientKind(kind)) return `Sending ${Math.round(ratePerSecond).toLocaleString("en")} req/s`;
  if (notSimulated) return "Not simulated yet";
  const failed = failedSoFar >= 0.5 ? ` · ${Math.round(failedSoFar).toLocaleString("en")} failed` : "";
  if (utilisation <= 0) return `No traffic${failed}`;
  if (utilisation >= 1) return `Saturated${failed}`;
  return `${Math.min(99, Math.max(1, Math.round(utilisation * 100)))}% busy${failed}`;
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
  const band = gaugeBand(utilisation);
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
  const status = nodeStatus({
    kind,
    utilisation: frame?.utilisation ?? 0,
    failedSoFar: failedSoFar[id]?.[step] ?? 0,
    ratePerSecond: (frame?.arrivals ?? 0) / run.dtSeconds,
    notSimulated: notSimulated.has(id),
  });
  return (
    <>
      <Handle type="target" position={Position.Left} style={hidden} isConnectable={false} />
      <LoadNodeBody label={label} kind={kind} utilisation={frame?.utilisation ?? 0} status={status} />
      <Handle type="source" position={Position.Right} style={hidden} isConnectable={false} />
    </>
  );
}

export const LoadNode = memo(LoadNodeComponent);
