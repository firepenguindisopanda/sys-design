"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react";
import { cumulativeFailed, maxEdgeRate } from "@/lib/loadsim/series";
import type { LoadRun } from "@/lib/loadsim/types";
import { DotAnimator } from "./dot-animator";
import { ratePerDot } from "./dots";
import { FlowEdge } from "./flow-edge";
import { LoadNode } from "./load-node";
import type { SimDesign } from "./load-sim-view";
import { PlaybackContext, type PlaybackState } from "./playback";
import { SimContext, useReducedMotion, type SimContextValue } from "./sim-context";
import { simEdges, simNodes } from "./sim-elements";
import type { StoreApi } from "zustand";

const nodeTypes = { load: LoadNode } as NodeTypes;
const edgeTypes = { flow: FlowEdge } as EdgeTypes;

/** The design as drawn, with each node's load and each edge's flow; nodes can be moved, nothing else changes. */
export function SimCanvas({ design, run }: { design: SimDesign; run: LoadRun }) {
  const playback = useContext(PlaybackContext) as StoreApi<PlaybackState>;
  const reducedMotion = useReducedMotion();
  const maxRate = useMemo(() => maxEdgeRate(run), [run]);
  const perDot = ratePerDot(maxRate);

  // The animator reads the latest run and step on every frame, outside React.
  const latest = useRef({ run, perDot });
  useEffect(() => {
    latest.current = { run, perDot };
  }, [run, perDot]);
  const animator = useMemo(
    () =>
      new DotAnimator(() => {
        const { run: current, perDot: scale } = latest.current;
        return {
          frame: current.frames[playback.getState().step] ?? null,
          dtSeconds: current.dtSeconds,
          perDot: scale,
        };
      }),
    [playback],
  );
  useEffect(() => {
    if (reducedMotion) return;
    animator.start();
    return () => animator.stop();
  }, [animator, reducedMotion]);

  const context = useMemo<SimContextValue>(
    () => ({
      run,
      failedSoFar: cumulativeFailed(run),
      maxRate,
      notSimulated: new Set(run.graph.notSimulated.map((n) => n.id)),
      activeEdges: new Set(
        run.frames.flatMap((f) => Object.entries(f.edges).filter(([, e]) => e.volume > 0).map(([id]) => id)),
      ),
      animator,
    }),
    [run, maxRate, animator],
  );

  // Students can drag nodes to tidy the layout; the moves stay on this page.
  const [nodes, setNodes] = useState<Node[]>(() => simNodes(design.nodes));
  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((current) => applyNodeChanges(changes.filter((c) => c.type === "position" || c.type === "dimensions"), current)),
    [],
  );
  const edges = useMemo(() => simEdges(design.edges, design.nodes), [design.edges, design.nodes]);

  return (
    <SimContext.Provider value={context}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable
          nodesConnectable={false}
          // Dragging is a mouse-only tidy-up: nothing to focus or select, so screen readers
          // get no keyboard hints about moving or deleting nodes.
          nodesFocusable={false}
          elementsSelectable={false}
          edgesFocusable={false}
          deleteKeyCode={null}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          className="bg-transparent"
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#94a3b8" className="opacity-40" />
          <Controls showInteractive={false} className="!shadow-sm !border-slate-200" />
        </ReactFlow>
      </ReactFlowProvider>
      {reducedMotion ? null : (
        <p className="pointer-events-none absolute top-3 left-3 z-10 rounded-md border border-slate-200 bg-white/90 px-2 py-1 text-xs text-slate-600 shadow-sm">
          <span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full bg-teal-700 align-middle" />
          One dot ≈ {perDot.toLocaleString("en")} req/s
          <span aria-hidden className="mr-1 ml-3 inline-block h-2 w-2 rounded-full bg-red-600 align-middle" />
          failed
        </p>
      )}
    </SimContext.Provider>
  );
}
