"use client";

import { memo, useEffect, useRef } from "react";
import { getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import type { EdgeFrame, LoadRun } from "@/lib/loadsim/types";
import { usePlayback } from "./playback";
import { useReducedMotion, useSim } from "./sim-context";

const MIN_WIDTH = 1.5;
const MAX_WIDTH = 6;

/** Busier edges are drawn thicker. */
export function edgeWidth(rate: number, maxRate: number): number {
  if (maxRate <= 0 || rate <= 0) return MIN_WIDTH;
  return MIN_WIDTH + (MAX_WIDTH - MIN_WIDTH) * Math.min(1, rate / maxRate);
}

export function formatRate(rate: number): string {
  if (rate <= 0) return "0 req/s";
  if (rate < 10) return `${Number(rate.toFixed(1))} req/s`;
  return `${Math.round(rate).toLocaleString("en")} req/s`;
}

export function FlowEdgeBody({
  id,
  path,
  labelX,
  labelY,
  ratePerSecond,
  failedShare,
  maxRate,
  reducedMotion,
  active = true,
  markerEnd,
  pathRef,
  dotsRef,
}: {
  id: string;
  path: string;
  labelX: number;
  labelY: number;
  ratePerSecond: number;
  failedShare: number;
  maxRate: number;
  reducedMotion: boolean;
  /** False for an edge that carries nothing at any point in the run */
  active?: boolean;
  markerEnd?: string;
  pathRef?: React.Ref<SVGPathElement>;
  dotsRef?: React.Ref<SVGGElement>;
}) {
  const failed = failedShare > 0.005 ? ` · ${Math.round(failedShare * 100)}% fail` : "";
  // With reduced motion the rate is written on the edge instead of drawn as moving dots.
  const rateLabel = active ? (
    <text
      x={labelX}
      y={labelY}
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize={11}
      fill="#334155"
      stroke="#fff"
      strokeWidth={3}
      paintOrder="stroke"
    >
      {formatRate(ratePerSecond)}
      {failed}
    </text>
  ) : null;
  return (
    <g>
      <path
        ref={pathRef}
        d={path}
        fill="none"
        stroke={failedShare > 0.005 ? "#f87171" : "#94a3b8"}
        strokeWidth={edgeWidth(ratePerSecond, maxRate)}
        markerEnd={markerEnd}
        className="react-flow__edge-path"
      />
      {reducedMotion ? rateLabel : <g ref={dotsRef} data-dots={id} />}
    </g>
  );
}

/** What an edge draws at one step: its volume and failed share, zero outside the run. */
export function edgeAtStep(run: LoadRun, step: number, id: string): EdgeFrame {
  return run.frames[step]?.edges[id] ?? { volume: 0, failedShare: 0 };
}

/** A connection on the simulation canvas: thickness and dots follow the current frame. */
function FlowEdgeComponent(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd } = props;
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const { run, maxRate, animator, activeEdges } = useSim();
  const reducedMotion = useReducedMotion();
  // One primitive per number drawn (SPEC-canvas-render-scale.md, fix 5): the step moves every
  // frame, but an edge re-renders only when its own volume or failed share does.
  const volume = usePlayback((s) => edgeAtStep(run, s.step, id).volume);
  const failedShare = usePlayback((s) => edgeAtStep(run, s.step, id).failedShare);
  const pathRef = useRef<SVGPathElement>(null);
  const dotsRef = useRef<SVGGElement>(null);

  useEffect(() => {
    if (!animator || reducedMotion || !pathRef.current || !dotsRef.current) return;
    return animator.register(id, pathRef.current, dotsRef.current);
  }, [animator, id, reducedMotion]);

  return (
    <FlowEdgeBody
      id={id}
      path={path}
      labelX={labelX}
      labelY={labelY}
      ratePerSecond={volume / run.dtSeconds}
      failedShare={failedShare}
      maxRate={maxRate}
      reducedMotion={reducedMotion}
      active={activeEdges.has(id)}
      markerEnd={markerEnd}
      pathRef={pathRef}
      dotsRef={dotsRef}
    />
  );
}

export const FlowEdge = memo(FlowEdgeComponent);
