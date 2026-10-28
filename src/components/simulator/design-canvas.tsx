"use client";

import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChallengePicker } from "./challenge-picker";
import { DesignIo } from "./design-io";
import { DesignNode } from "./design-node";
import { PendingProtocolPicker } from "./edge-inspector";
import { useSimulatorStore, type SimNode } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Eraser, Sparkles } from "lucide-react";
import type { Brief } from "@/lib/challenges/types";

const nodeTypes = {
  designNode: DesignNode,
} as NodeTypes;

function FitViewOnReady({ nodeCount }: { nodeCount: number }) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (nodeCount === 0) return;
    const id = requestAnimationFrame(() => {
      fitView({ padding: 0.2, duration: 200 });
    });
    return () => cancelAnimationFrame(id);
  }, [fitView, nodeCount]);

  return null;
}

function FlowCanvas() {
  const nodes = useSimulatorStore((s) => s.nodes);
  const edges = useSimulatorStore((s) => s.edges);
  const selectedEdgeId = useSimulatorStore((s) => s.selectedEdgeId);
  const onNodesChange = useSimulatorStore((s) => s.onNodesChange);
  const onEdgesChange = useSimulatorStore((s) => s.onEdgesChange);
  const onConnect = useSimulatorStore((s) => s.onConnect);
  const selectNode = useSimulatorStore((s) => s.selectNode);
  const selectEdge = useSimulatorStore((s) => s.selectEdge);

  const styledEdges: Edge[] = edges.map((e) => ({
    ...e,
    selected: e.id === selectedEdgeId,
    style: {
      stroke: e.id === selectedEdgeId ? "#0f766e" : "#64748b",
      strokeWidth: e.id === selectedEdgeId ? 2.5 : 1.5,
    },
  }));

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: SimNode) => selectNode(node.id),
    [selectNode],
  );

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => selectEdge(edge.id),
    [selectEdge],
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
    selectEdge(null);
  }, [selectNode, selectEdge]);

  const isValidConnection = useCallback((connection: Connection | Edge) => {
    if (!connection.source || !connection.target) return false;
    // Allow many edges per node / handle; only block self-loops.
    return connection.source !== connection.target;
  }, []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={styledEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      onEdgeClick={onEdgeClick}
      onPaneClick={onPaneClick}
      isValidConnection={isValidConnection}
      connectionMode={ConnectionMode.Loose}
      nodeTypes={nodeTypes}
      defaultEdgeOptions={{ type: "smoothstep" }}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      proOptions={{ hideAttribution: true }}
      minZoom={0.2}
      maxZoom={1.5}
      className="bg-transparent"
      edgesFocusable
      elementsSelectable
      edgesReconnectable
    >
      <FitViewOnReady nodeCount={nodes.length} />
      <Background
        variant={BackgroundVariant.Dots}
        gap={18}
        size={1}
        color="#94a3b8"
        className="opacity-40"
      />
      <Controls className="!shadow-sm !border-slate-200" />
      <MiniMap
        className="!border-slate-200 !shadow-sm"
        maskColor="rgb(15 23 42 / 0.08)"
        nodeColor="#0f766e"
      />
    </ReactFlow>
  );
}

export function DesignCanvas({ briefs }: { briefs: Brief[] }) {
  const inChallenge = useSimulatorStore((s) => s.challenge !== null);
  const loadDemo = useSimulatorStore((s) => s.loadDemo);
  const loadFanInDemo = useSimulatorStore((s) => s.loadFanInDemo);
  const clearCanvas = useSimulatorStore((s) => s.clearCanvas);
  const requestReplace = useSimulatorStore((s) => s.requestReplace);
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const check = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) setReady(true);
    };

    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap gap-2">
        <ChallengePicker briefs={briefs} />
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-md border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur">
          {/* Demos belong to the sandbox; in a challenge they would replace the brief. */}
          {inChallenge ? null : (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 text-xs"
                onClick={() =>
                  requestReplace("replace", "Loading the BeUWI demo replaces your design.", loadDemo)
                }
              >
                <Sparkles className="h-3.5 w-3.5" />
                Load BeUWI demo
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 text-xs"
                onClick={() =>
                  requestReplace("replace", "Loading the fan-in DB demo replaces your design.", loadFanInDemo)
                }
              >
                Fan-in DB demo
              </Button>
            </>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs text-slate-600"
            onClick={() =>
              requestReplace(
                "clear",
                "Every component and connection is removed. Requirements and targets stay.",
                clearCanvas,
              )
            }
          >
            <Eraser className="h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
        <DesignIo briefs={briefs} />
        <PendingProtocolPicker />
      </div>
      {ready ? (
        <ReactFlowProvider>
          <FlowCanvas />
        </ReactFlowProvider>
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-slate-400">
          Preparing canvas…
        </div>
      )}
    </div>
  );
}
