import { MarkerType, type Edge, type EdgeMarker } from "@xyflow/react";
import type { EdgeData, EdgeDirection, EdgeProtocol } from "./types";

export type ProtocolMeta = {
  protocol: EdgeProtocol;
  label: string;
  shortLabel: string;
  direction: EdgeDirection;
  /** Human guidance shown in the edge inspector */
  hint: string;
};

export const PROTOCOL_META: Record<EdgeProtocol, ProtocolMeta> = {
  http: {
    protocol: "http",
    label: "HTTP request",
    shortLabel: "HTTP",
    direction: "directed",
    hint: "Unidirectional — initiator → target (default after load).",
  },
  websocket: {
    protocol: "websocket",
    label: "WebSocket / WebTransport",
    shortLabel: "WS",
    direction: "bidirectional",
    hint: "Bidirectional real-time channel — arrows on both ends.",
  },
  sse: {
    protocol: "sse",
    label: "HTTP SSE",
    shortLabel: "SSE",
    direction: "directed",
    hint: "Server → client keep-alive stream. Draw from server to client.",
  },
  web_push: {
    protocol: "web_push",
    label: "HTTP Web Push",
    shortLabel: "Push",
    direction: "directed",
    hint: "Server delivers push notifications to clients. Draw server → client.",
  },
  db: {
    protocol: "db",
    label: "Database protocol",
    shortLabel: "DB",
    direction: "directed",
    hint: "Compute initiates to the database (e.g. postgresql://, mysqli://).",
  },
  webrtc: {
    protocol: "webrtc",
    label: "WebRTC",
    shortLabel: "RTC",
    direction: "bidirectional",
    hint: "Peer-to-peer bidirectional media/data (e.g. video calling).",
  },
};

export const PROTOCOL_OPTIONS = Object.values(PROTOCOL_META);

const arrowMarker = (color = "#64748b"): EdgeMarker => ({
  type: MarkerType.ArrowClosed,
  width: 16,
  height: 16,
  color,
});

export function getEdgeData(edge: Edge): EdgeData {
  const data = (edge.data ?? {}) as Partial<EdgeData>;
  const protocol = (data.protocol ?? "http") as EdgeProtocol;
  return {
    protocol: PROTOCOL_META[protocol] ? protocol : "http",
    label: typeof data.label === "string" ? data.label : undefined,
  };
}

export function protocolLabel(protocol: EdgeProtocol, custom?: string): string {
  if (custom?.trim()) return custom.trim();
  return PROTOCOL_META[protocol].shortLabel;
}

/** Apply visual markers / animation from protocol direction semantics. */
export function styleEdgeForProtocol(
  edge: Edge,
  protocol: EdgeProtocol,
  customLabel?: string,
): Edge {
  const meta = PROTOCOL_META[protocol];
  const label = protocolLabel(protocol, customLabel);
  const marker = arrowMarker(protocol === "websocket" || protocol === "webrtc" ? "#0f766e" : "#64748b");

  return {
    ...edge,
    label,
    animated: protocol === "websocket" || protocol === "sse" || protocol === "web_push",
    markerEnd: marker,
    markerStart: meta.direction === "bidirectional" ? marker : undefined,
    data: {
      ...(edge.data as object),
      protocol,
      label: customLabel?.trim() || undefined,
    } satisfies EdgeData,
  };
}

export function createStyledEdge(
  partial: Omit<Edge, "id"> & { id?: string },
  protocol: EdgeProtocol = "http",
  customLabel?: string,
): Edge {
  const id =
    partial.id ??
    `e-${partial.source}-${partial.target}-${protocol}-${Math.random().toString(36).slice(2, 7)}`;
  return styleEdgeForProtocol({ ...partial, id }, protocol, customLabel);
}
