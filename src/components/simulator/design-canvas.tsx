"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useMemo } from "react";
import { DesignNode } from "./design-node";
import { useSimulatorStore, type SimNode } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Eraser, Sparkles } from "lucide-react";

export function DesignCanvas() {
  const nodes = useSimulatorStore((s) => s.nodes);
  const edges = useSimulatorStore((s) => s.edges);
  const onNodesChange = useSimulatorStore((s) => s.onNodesChange);
  const onEdgesChange = useSimulatorStore((s) => s.onEdgesChange);
  const onConnect = useSimulatorStore((s) => s.onConnect);
  const selectNode = useSimulatorStore((s) => s.selectNode);
  const loadDemo = useSimulatorStore((s) => s.loadDemo);
  const clearCanvas = useSimulatorStore((s) => s.clearCanvas);

  const nodeTypes: NodeTypes = useMemo(
    () => ({ design: DesignNode as unknown as NodeTypes[string] }),
    [],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: SimNode) => selectNode(node.id),
    [selectNode],
  );

  const onPaneClick = useCallback(() => selectNode(null), [selectNode]);

  return (
    <div className="relative h-full w-full">
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex gap-2">
        <div className="pointer-events-auto flex gap-1.5 rounded-md border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs"
            onClick={loadDemo}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Load BeUWI demo
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs text-slate-600"
            onClick={clearCanvas}
          >
            <Eraser className="h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        className="bg-transparent"
      >
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
    </div>
  );
}
