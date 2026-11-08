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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChallengePicker } from "./challenge-picker";
import { DesignIo } from "./design-io";
import { DesignNode } from "./design-node";
import { canvasElements, createElementCache, type ElementCache } from "./canvas-elements";
import { PendingProtocolPicker } from "./edge-inspector";
import { InspectorCard } from "./inspector-card";
import { SimulateLoadButton } from "./simulate-load-button";
import { COMPONENT_CATALOG } from "@/lib/catalog";
import { animateRealtime } from "@/lib/edges";
import { DEFAULT_NODE_SIZE, LIBRARY_DRAG_TYPE } from "@/lib/placement";
import { useSimulatorStore, type SimNode } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Columns3, Eraser, Sparkles, Undo2 } from "lucide-react";
import type { Brief } from "@/lib/challenges/types";
import type { ComponentKind } from "@/lib/types";

const nodeTypes = {
  designNode: DesignNode,
} as NodeTypes;

/**
 * Re-fit the view when the whole design is replaced (a demo, a challenge, an import).
 * Adding, deleting, moving or connecting nodes never moves the camera. The first render
 * is skipped: ReactFlow's `fitView` prop already fits on mount.
 */
function FitViewOnReady({ layoutVersion }: { layoutVersion: number }) {
  const { fitView, setViewport } = useReactFlow();
  const fitted = useRef(layoutVersion);

  useEffect(() => {
    if (fitted.current === layoutVersion) return;
    fitted.current = layoutVersion;
    const id = requestAnimationFrame(() => {
      // On an empty canvas fitView doesn't do nothing: React Flow queues it until nodes
      // appear, so the first node added would zoom the view to the maximum. Reset instead.
      if (useSimulatorStore.getState().nodes.length === 0) {
        setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 200 });
      } else {
        fitView({ padding: 0.2, duration: 200 });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [fitView, setViewport, layoutVersion]);

  return null;
}

function FlowCanvas() {
  const nodes = useSimulatorStore((s) => s.nodes);
  const edges = useSimulatorStore((s) => s.edges);
  const selectedNodeId = useSimulatorStore((s) => s.selectedNodeId);
  const selectedEdgeId = useSimulatorStore((s) => s.selectedEdgeId);
  const onNodesChange = useSimulatorStore((s) => s.onNodesChange);
  const onEdgesChange = useSimulatorStore((s) => s.onEdgesChange);
  const onConnect = useSimulatorStore((s) => s.onConnect);
  const selectNode = useSimulatorStore((s) => s.selectNode);
  const selectEdge = useSimulatorStore((s) => s.selectEdge);
  const addComponent = useSimulatorStore((s) => s.addComponent);
  const setViewCentre = useSimulatorStore((s) => s.setViewCentre);
  const layoutVersion = useSimulatorStore((s) => s.layoutVersion);
  const { screenToFlowPosition } = useReactFlow();
  // Shows every node's handles while a connection is being drawn (see globals.css).
  const [connecting, setConnecting] = useState(false);
  // Matches when InspectorCard shows, so a tall card never covers the minimap.
  const inspectorOpen = useSimulatorStore(
    (s) =>
      s.nodes.some((n) => n.id === s.selectedNodeId) ||
      s.edges.some((e) => e.id === s.selectedEdgeId),
  );

  // Screen-reader names are added here only, never written to the store.
  // The store's selection also marks the node, as for edges, so a node added from the
  // library shows its selected border and handles like a clicked one.
  // Elements whose inputs didn't change keep their object, so a drag re-renders only the
  // moved node (SPEC-canvas-render-scale.md, fix 3). Past MAX_ANIMATED_EDGES realtime
  // edges they are marked `still`: dashed, not moving (fix 1).
  const cache = useRef<ElementCache>(createElementCache());
  const still = useMemo(() => !animateRealtime(edges), [edges]);
  const { nodes: namedNodes, edges: styledEdges } = useMemo(
    () => canvasElements(cache.current, nodes, edges, selectedNodeId, selectedEdgeId, still),
    [nodes, edges, selectedNodeId, selectedEdgeId, still],
  );

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

  // React Flow listens for Delete and Backspace on the whole page and only ignores text
  // fields, so Backspace on any button (the inspector's close, Run simulation) would
  // delete the selection. Only delete while keyboard focus is on the canvas itself.
  const flowRef = useRef<HTMLDivElement>(null);
  const onBeforeDelete = useCallback(
    async () => !!flowRef.current?.contains(document.activeElement),
    [],
  );

  // New nodes go where the student is looking: keep the store told of the view centre.
  const reportCentre = useCallback(() => {
    const el = flowRef.current;
    if (!el) return;
    const { left, top, width, height } = el.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    setViewCentre(screenToFlowPosition({ x: left + width / 2, y: top + height / 2 }));
  }, [screenToFlowPosition, setViewCentre]);

  // While the view is dragged, globals.css gives the edges their own layer, so the browser
  // moves them without repainting every path (SPEC-canvas-render-scale.md, fix 2). Only
  // while dragging: a standing layer changes how the text and fine lines around it are
  // drawn. Not for the wheel: each wheel gesture switched the layer on and off, and every
  // switch repainted all the edges, so zooming random 200 fell to 26–33 fps (manual
  // testing, 2026-11-08). A data attribute, so React's className never overwrites it.
  const onMoveStart = useCallback((event: MouseEvent | TouchEvent | null) => {
    if (flowRef.current && event && event.type !== "wheel") flowRef.current.dataset.moving = "";
  }, []);
  const onMoveEnd = useCallback(() => {
    delete flowRef.current?.dataset.moving;
    reportCentre();
  }, [reportCentre]);

  useEffect(() => {
    const el = flowRef.current;
    if (!el) return;
    const ro = new ResizeObserver(reportCentre);
    ro.observe(el);
    return () => ro.disconnect();
  }, [reportCentre]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes(LIBRARY_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // A library item dropped on the canvas lands centred on the pointer.
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      const kind = event.dataTransfer.getData(LIBRARY_DRAG_TYPE) as ComponentKind;
      if (!COMPONENT_CATALOG.some((c) => c.kind === kind)) return;
      event.preventDefault();
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addComponent(kind, {
        x: point.x - DEFAULT_NODE_SIZE.width / 2,
        y: point.y - DEFAULT_NODE_SIZE.height / 2,
      });
    },
    [addComponent, screenToFlowPosition],
  );

  const onConnectStart = useCallback(() => setConnecting(true), []);
  const onConnectEnd = useCallback(() => setConnecting(false), []);

  const isValidConnection = useCallback((connection: Connection | Edge) => {
    if (!connection.source || !connection.target) return false;
    // Allow many edges per node / handle; only block self-loops.
    return connection.source !== connection.target;
  }, []);

  return (
    <ReactFlow
      ref={flowRef}
      onBeforeDelete={onBeforeDelete}
      nodes={namedNodes}
      edges={styledEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onConnectStart={onConnectStart}
      onConnectEnd={onConnectEnd}
      onInit={reportCentre}
      onMoveStart={onMoveStart}
      onMoveEnd={onMoveEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
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
      className={connecting ? "bg-transparent connecting" : "bg-transparent"}
      edgesFocusable
      elementsSelectable
      edgesReconnectable
      // React Flow's screen-reader text says "press delete"; its default is Backspace only.
      deleteKeyCode={["Backspace", "Delete"]}
    >
      <FitViewOnReady layoutVersion={layoutVersion} />
      <Background
        variant={BackgroundVariant.Dots}
        gap={18}
        size={1}
        color="#94a3b8"
        className="opacity-40"
      />
      <Controls className="!shadow-sm !border-slate-200" />
      {inspectorOpen ? null : (
        <MiniMap
          className="!border-slate-200 !shadow-sm"
          maskColor="rgb(15 23 42 / 0.08)"
          nodeColor="#0f766e"
        />
      )}
    </ReactFlow>
  );
}

const LAYOUT_ANNOUNCER_ID = "layout-announcement";

/**
 * Tidy layout lays the design out in columns by role; until the design next changes, the
 * same place offers Undo tidy (SPEC-auto-layout.md). The store decides when the undo goes.
 */
function TidyLayoutButton() {
  const empty = useSimulatorStore((s) => s.nodes.length === 0);
  const canUndo = useSimulatorStore((s) => s.tidyUndo !== null);
  const tidyLayout = useSimulatorStore((s) => s.tidyLayout);
  const undoTidy = useSimulatorStore((s) => s.undoTidy);
  const [said, setSaid] = useState("");

  return (
    <>
      {canUndo ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-controls={LAYOUT_ANNOUNCER_ID}
          className="h-7 gap-1.5 text-xs text-slate-600"
          onClick={() => {
            undoTidy();
            setSaid("Layout undone.");
          }}
        >
          <Undo2 className="h-3.5 w-3.5" />
          Undo tidy
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={empty}
          aria-controls={LAYOUT_ANNOUNCER_ID}
          className="h-7 gap-1.5 text-xs text-slate-600"
          onClick={() => setSaid(`Laid out in ${tidyLayout()} columns.`)}
        >
          <Columns3 className="h-3.5 w-3.5" />
          Tidy layout
        </Button>
      )}
      {/* Rendered empty from the start so screen readers notice the text arriving. */}
      <span id={LAYOUT_ANNOUNCER_ID} aria-live="polite" className="sr-only">
        {said}
      </span>
    </>
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

  // The inspector card unmounts on close or delete; keep focus on the canvas.
  const focusCanvas = useCallback(() => containerRef.current?.focus(), []);

  return (
    <div ref={containerRef} tabIndex={-1} className="relative h-full w-full outline-none">
      <div className="pointer-events-none absolute inset-3 z-10 flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
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
            <TidyLayoutButton />
          </div>
          <DesignIo briefs={briefs} />
          <SimulateLoadButton />
          <PendingProtocolPicker />
        </div>
        <InspectorCard onClose={focusCanvas} />
      </div>
      {ready ? (
        <ReactFlowProvider>
          <FlowCanvas />
        </ReactFlowProvider>
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-slate-500">
          Preparing canvas…
        </div>
      )}
    </div>
  );
}
