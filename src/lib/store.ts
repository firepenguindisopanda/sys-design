"use client";

import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { create } from "zustand";
import { COMPONENT_CATALOG, DEFAULT_CAPACITIES } from "./catalog";
import { createStyledEdge, styleEdgeForProtocol } from "./edges";
import { evaluateRules } from "./challenges/rules";
import type { Brief, RuleResult } from "./challenges/types";
import { canPlaceFeature, runVerification } from "./simulation";
import type {
  CheckStatus,
  ComponentKind,
  DesignNodeData,
  EdgeProtocol,
  FeatureBlock,
  FunctionalRequirement,
  NonFunctionalRequirements,
  VerificationResult,
} from "./types";

export type SimNode = Node<DesignNodeData>;

type SimulatorState = {
  nodes: SimNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  /** Protocol applied to the next connection drawn on the canvas */
  pendingProtocol: EdgeProtocol;
  functionalReqs: FunctionalRequirement[];
  features: FeatureBlock[];
  nfr: NonFunctionalRequirements;
  verification: VerificationResult | null;
  /** Active challenge brief; null in the sandbox */
  challenge: Brief | null;
  /** Brief rule results from the last verification in a challenge */
  ruleResults: RuleResult[] | null;
  onNodesChange: (changes: NodeChange<SimNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addComponent: (kind: ComponentKind) => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  setPendingProtocol: (protocol: EdgeProtocol) => void;
  updateNodeData: (id: string, patch: Partial<DesignNodeData>) => void;
  updateNodeConfig: (id: string, configPatch: Record<string, unknown>) => void;
  updateEdge: (
    edgeId: string,
    patch: {
      protocol?: EdgeProtocol;
      label?: string;
      source?: string;
      target?: string;
    },
  ) => void;
  reverseEdge: (edgeId: string) => void;
  deleteEdge: (edgeId: string) => void;
  addFunctionalRequirement: (text: string) => void;
  removeFunctionalRequirement: (id: string) => void;
  updateFeature: (id: string, patch: Partial<FeatureBlock>) => void;
  placeFeature: (featureId: string, nodeId: string | null) => { ok: boolean; reason?: string };
  setNfr: (patch: Partial<NonFunctionalRequirements>) => void;
  runVerification: () => void;
  loadDemo: () => void;
  loadFanInDemo: () => void;
  clearCanvas: () => void;
  startChallenge: (brief: Brief) => void;
  leaveChallenge: () => void;
};

let seq = 1;
const uid = (prefix: string) => `${prefix}-${seq++}`;

function createNode(kind: ComponentKind, position: { x: number; y: number }): SimNode {
  const item = COMPONENT_CATALOG.find((c) => c.kind === kind)!;
  return {
    id: uid(kind),
    type: "designNode",
    position,
    data: {
      label: item.label,
      componentKind: kind,
      purpose: item.description.split(".")[0] ?? item.label,
      config: structuredClone(item.defaultConfig),
    },
  };
}

const demoSeed = (): Pick<
  SimulatorState,
  | "nodes"
  | "edges"
  | "functionalReqs"
  | "features"
  | "nfr"
  | "verification"
  | "selectedNodeId"
  | "selectedEdgeId"
  | "pendingProtocol"
> => {
  seq = 1;
  const mobile = createNode("mobile", { x: 20, y: 20 });
  mobile.data.label = "Mobile app";
  const desktop = createNode("desktop", { x: 20, y: 140 });
  desktop.data.label = "Desktop web";
  const iot = createNode("iot", { x: 20, y: 260 });
  iot.data.label = "Campus IoT";
  const cdn = createNode("cdn", { x: 240, y: 40 });
  const staticNode = createNode("static_hosting", { x: 240, y: 160 });
  const lb = createNode("load_balancer", { x: 460, y: 100 });
  const paas = createNode("paas", { x: 680, y: 40 });
  paas.data.label = "Programme API";
  paas.data.purpose = "Search & admin API";
  if (paas.data.config.kind === "paas") {
    paas.data.config.appType = "express";
    paas.data.config.hosting = "digitalocean-apps";
    paas.data.config.capacity = { ...DEFAULT_CAPACITIES.paas };
  }
  const cache = createNode("cache", { x: 920, y: 0 });
  cache.data.label = "Read cache";
  if (cache.data.config.kind === "cache") {
    cache.data.config.engine = "redis";
    cache.data.config.memoryGb = 2;
  }
  const db = createNode("database", { x: 920, y: 160 });
  db.data.label = "Programme Graph DB";
  if (db.data.config.kind === "database") {
    db.data.config.engine = "graph";
    db.data.config.replicas = 2;
    db.data.config.shards = 1;
  }
  const objects = createNode("object_storage", { x: 680, y: 240 });
  objects.data.label = "CSV uploads";
  const queue = createNode("message_queue", { x: 460, y: 280 });
  queue.data.label = "Upload events";
  if (queue.data.config.kind === "message_queue") {
    queue.data.config.mode = "pubsub";
  }

  const browseId = uid("feat");
  const adminId = uid("feat");
  const features: FeatureBlock[] = [
    {
      id: browseId,
      name: "Browse / search programmes",
      description: "High-traffic search client queries",
      resources: { memoryGb: 1.5, vcpus: 1, storageGb: 2 },
      targetRpm: 120,
      computeMsPerRequest: 40,
      placedOnNodeId: paas.id,
    },
    {
      id: adminId,
      name: "Admin CSV upload",
      description: "Upload programmes and manage rollbacks",
      resources: { memoryGb: 1, vcpus: 0.5, storageGb: 4 },
      targetRpm: 10,
      computeMsPerRequest: 80,
      placedOnNodeId: paas.id,
    },
  ];

  return {
    nodes: [mobile, desktop, iot, cdn, staticNode, lb, paas, cache, db, objects, queue],
    edges: [
      createStyledEdge(
        {
          id: "e-mobile-cdn",
          source: mobile.id,
          target: cdn.id,
          sourceHandle: "s-right-0",
          targetHandle: "t-left-0",
        },
        "http",
      ),
      createStyledEdge(
        {
          id: "e-desktop-static",
          source: desktop.id,
          target: staticNode.id,
          sourceHandle: "s-right-1",
          targetHandle: "t-left-1",
        },
        "http",
      ),
      createStyledEdge(
        {
          id: "e-iot-queue",
          source: iot.id,
          target: queue.id,
          sourceHandle: "s-right-2",
          targetHandle: "t-left-0",
        },
        "websocket",
      ),
      createStyledEdge(
        { id: "e-cdn-static", source: cdn.id, target: staticNode.id },
        "http",
      ),
      createStyledEdge(
        { id: "e-static-lb", source: staticNode.id, target: lb.id },
        "http",
      ),
      createStyledEdge({ id: "e-lb-paas", source: lb.id, target: paas.id }, "http"),
      createStyledEdge(
        {
          id: "e-paas-db",
          source: paas.id,
          target: db.id,
          sourceHandle: "s-right-2",
          targetHandle: "t-left-2",
        },
        "db",
      ),
      createStyledEdge({ id: "e-paas-cache", source: paas.id, target: cache.id }, "db"),
      createStyledEdge(
        { id: "e-paas-ws", source: paas.id, target: staticNode.id },
        "websocket",
      ),
      createStyledEdge(
        { id: "e-paas-objects", source: paas.id, target: objects.id },
        "http",
      ),
      createStyledEdge(
        { id: "e-paas-queue", source: paas.id, target: queue.id },
        "http",
      ),
    ],
    functionalReqs: [
      {
        id: uid("freq"),
        text: "Browse programmes and search by requirements",
        featureId: browseId,
      },
      {
        id: uid("freq"),
        text: "Admin uploads programmes via CSV and can rollback",
        featureId: adminId,
      },
    ],
    features,
    nfr: {
      maxLatencyMs: 500,
      minThroughputRpm: 100,
      minAvailabilityPct: 99.5,
      maxMonthlyCostUsd: 250,
    },
    verification: null,
    selectedNodeId: null,
    selectedEdgeId: null,
    pendingProtocol: "http",
  };
};

/** Five compute replicas writing to one shared database — fan-in demo. */
const fanInSeed = (): ReturnType<typeof demoSeed> => {
  seq = 1;
  const db = createNode("database", { x: 640, y: 200 });
  db.data.label = "Shared primary DB";
  if (db.data.config.kind === "database") {
    db.data.config.engine = "relational";
    db.data.config.replicas = 3;
    db.data.config.shards = 1;
  }

  const vms = [0, 1, 2, 3, 4].map((i) => {
    const n = createNode("vm", { x: 120, y: 40 + i * 100 });
    n.data.label = `API replica ${i + 1}`;
    if (n.data.config.kind === "vm") {
      n.data.config.capacity = { ...DEFAULT_CAPACITIES.vm };
      n.data.config.appType = "express";
    }
    return n;
  });

  const featId = uid("feat");
  return {
    nodes: [...vms, db],
    edges: vms.map((vm, i) =>
      createStyledEdge(
        {
          id: `e-vm${i}-db`,
          source: vm.id,
          target: db.id,
          sourceHandle: `s-right-${i % 5}`,
          targetHandle: `t-left-${i % 5}`,
        },
        "db",
      ),
    ),
    functionalReqs: [
      {
        id: uid("freq"),
        text: "Write path shared across five compute replicas",
        featureId: featId,
      },
    ],
    features: [
      {
        id: featId,
        name: "Shared write API",
        description: "Fan-in writes from replicas to one database",
        resources: { memoryGb: 1, vcpus: 0.5, storageGb: 1 },
        targetRpm: 200,
        computeMsPerRequest: 30,
        placedOnNodeId: vms[0]!.id,
      },
    ],
    nfr: {
      maxLatencyMs: 500,
      minThroughputRpm: 150,
      minAvailabilityPct: 99.5,
      maxMonthlyCostUsd: 400,
    },
    verification: null,
    selectedNodeId: null,
    selectedEdgeId: null,
    pendingProtocol: "db",
  };
};

const SEVERITY: Record<CheckStatus, number> = { pass: 0, warn: 1, fail: 2 };

/** Fresh canvas for a challenge: the brief's requirements as unplaced features. */
function challengeSeed(brief: Brief) {
  return {
    challenge: brief,
    ruleResults: null,
    nodes: [],
    edges: [],
    functionalReqs: brief.functionalRequirements.map((fr) => ({
      id: `freq-${fr.id}`,
      text: fr.text,
      featureId: fr.id,
    })),
    features: brief.functionalRequirements.map(
      (fr): FeatureBlock => ({ id: fr.id, ...fr.feature, placedOnNodeId: null }),
    ),
    nfr: { ...brief.nfr },
    verification: null,
    selectedNodeId: null,
    selectedEdgeId: null,
  };
}

/** Features stay placed only on nodes that still exist. */
function unplaceMissing(features: FeatureBlock[], nodes: SimNode[]): FeatureBlock[] {
  const ids = new Set(nodes.map((n) => n.id));
  return features.map((f) =>
    f.placedOnNodeId && !ids.has(f.placedOnNodeId) ? { ...f, placedOnNodeId: null } : f,
  );
}

export const useSimulatorStore = create<SimulatorState>((set, get) => ({
  ...demoSeed(),
  challenge: null,
  ruleResults: null,

  onNodesChange: (changes) => {
    const nodes = applyNodeChanges(changes, get().nodes) as SimNode[];
    set({ nodes, features: unplaceMissing(get().features, nodes) });
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
    const selected = get().selectedEdgeId;
    if (selected && !get().edges.some((e) => e.id === selected)) {
      set({ selectedEdgeId: null });
    }
  },

  onConnect: (connection) => {
    const protocol = get().pendingProtocol;
    const edge = createStyledEdge(
      {
        ...connection,
        source: connection.source!,
        target: connection.target!,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
      },
      protocol,
    );
    set({
      edges: [...get().edges, edge],
      selectedEdgeId: edge.id,
      selectedNodeId: null,
    });
  },

  addComponent: (kind) => {
    const offset = get().nodes.length * 24;
    const node = createNode(kind, { x: 120 + offset, y: 100 + (offset % 160) });
    set({
      nodes: [...get().nodes, node],
      selectedNodeId: node.id,
      selectedEdgeId: null,
    });
  },

  selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: id ? null : get().selectedEdgeId }),

  selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: id ? null : get().selectedNodeId }),

  setPendingProtocol: (protocol) => set({ pendingProtocol: protocol }),

  updateNodeData: (id, patch) =>
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
    }),

  updateNodeConfig: (id, configPatch) =>
    set({
      nodes: get().nodes.map((n) => {
        if (n.id !== id) return n;
        return {
          ...n,
          data: {
            ...n.data,
            config: { ...n.data.config, ...configPatch } as DesignNodeData["config"],
          },
        };
      }),
    }),

  updateEdge: (edgeId, patch) =>
    set({
      edges: get().edges.map((e) => {
        if (e.id !== edgeId) return e;
        const next = {
          ...e,
          source: patch.source ?? e.source,
          target: patch.target ?? e.target,
        };
        const protocol = patch.protocol ?? ((e.data as { protocol?: EdgeProtocol })?.protocol ?? "http");
        const label =
          patch.label !== undefined
            ? patch.label
            : ((e.data as { label?: string })?.label ?? undefined);
        return styleEdgeForProtocol(next, protocol, label);
      }),
    }),

  reverseEdge: (edgeId) =>
    set({
      edges: get().edges.map((e) => {
        if (e.id !== edgeId) return e;
        const protocol = ((e.data as { protocol?: EdgeProtocol })?.protocol ?? "http") as EdgeProtocol;
        const label = (e.data as { label?: string })?.label;
        return styleEdgeForProtocol(
          { ...e, source: e.target, target: e.source },
          protocol,
          label,
        );
      }),
    }),

  deleteEdge: (edgeId) =>
    set({
      edges: get().edges.filter((e) => e.id !== edgeId),
      selectedEdgeId: get().selectedEdgeId === edgeId ? null : get().selectedEdgeId,
    }),

  addFunctionalRequirement: (text) => {
    if (get().challenge) return; // a challenge's requirements are fixed
    const featureId = uid("feat");
    const reqId = uid("freq");
    const feature: FeatureBlock = {
      id: featureId,
      name: text.slice(0, 48) || "New feature",
      description: text,
      resources: { memoryGb: 1, vcpus: 0.5, storageGb: 1 },
      targetRpm: 50,
      computeMsPerRequest: 50,
      placedOnNodeId: null,
    };
    set({
      functionalReqs: [...get().functionalReqs, { id: reqId, text, featureId }],
      features: [...get().features, feature],
    });
  },

  removeFunctionalRequirement: (id) => {
    if (get().challenge) return;
    const req = get().functionalReqs.find((r) => r.id === id);
    set({
      functionalReqs: get().functionalReqs.filter((r) => r.id !== id),
      features: get().features.filter((f) => f.id !== req?.featureId),
    });
  },

  updateFeature: (id, patch) => {
    if (get().challenge) return; // feature numbers come from the brief
    set({
      features: get().features.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    });
  },

  placeFeature: (featureId, nodeId) => {
    const { features, nodes } = get();
    const feature = features.find((f) => f.id === featureId);
    if (!feature) return { ok: false, reason: "Feature not found" };
    if (nodeId === null) {
      set({
        features: features.map((f) =>
          f.id === featureId ? { ...f, placedOnNodeId: null } : f,
        ),
      });
      return { ok: true };
    }
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return { ok: false, reason: "Node not found" };
    if (!canPlaceFeature(node, feature, features)) {
      return {
        ok: false,
        reason: "Not enough remaining memory, vCPUs, or storage on that compute instance.",
      };
    }
    set({
      features: features.map((f) =>
        f.id === featureId ? { ...f, placedOnNodeId: nodeId } : f,
      ),
    });
    return { ok: true };
  },

  setNfr: (patch) => {
    if (get().challenge) return; // brief targets are fixed in a challenge
    set({ nfr: { ...get().nfr, ...patch } });
  },

  runVerification: () => {
    const { nodes, edges, features, nfr, challenge } = get();
    const verification = runVerification(nodes, edges, features, nfr);
    if (!challenge) {
      set({ verification, ruleResults: null });
      return;
    }
    // In a challenge the brief's rules count too: overall is the worst of both.
    const ruleResults = evaluateRules(challenge, nodes, edges);
    const overall = [verification.overall, ...ruleResults.map((r) => r.status)].reduce(
      (a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a),
    );
    set({ verification: { ...verification, overall }, ruleResults });
  },

  loadDemo: () => set({ ...demoSeed(), challenge: null, ruleResults: null }),

  loadFanInDemo: () => set({ ...fanInSeed(), challenge: null, ruleResults: null }),

  clearCanvas: () =>
    set({
      nodes: [],
      edges: [],
      features: unplaceMissing(get().features, []),
      selectedNodeId: null,
      selectedEdgeId: null,
      verification: null,
      ruleResults: null,
    }),

  startChallenge: (brief) => set(challengeSeed(brief)),

  leaveChallenge: () => set({ ...demoSeed(), challenge: null, ruleResults: null }),
}));
