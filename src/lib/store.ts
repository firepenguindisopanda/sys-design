"use client";

import {
  addEdge,
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
import { canPlaceFeature, runVerification } from "./simulation";
import type {
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
  functionalReqs: FunctionalRequirement[];
  features: FeatureBlock[];
  nfr: NonFunctionalRequirements;
  verification: VerificationResult | null;
  onNodesChange: (changes: NodeChange<SimNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addComponent: (kind: ComponentKind) => void;
  selectNode: (id: string | null) => void;
  updateNodeData: (id: string, patch: Partial<DesignNodeData>) => void;
  updateNodeConfig: (id: string, configPatch: Record<string, unknown>) => void;
  setEdgeProtocol: (edgeId: string, protocol: EdgeProtocol) => void;
  addFunctionalRequirement: (text: string) => void;
  removeFunctionalRequirement: (id: string) => void;
  updateFeature: (id: string, patch: Partial<FeatureBlock>) => void;
  placeFeature: (featureId: string, nodeId: string | null) => { ok: boolean; reason?: string };
  setNfr: (patch: Partial<NonFunctionalRequirements>) => void;
  runVerification: () => void;
  loadDemo: () => void;
  clearCanvas: () => void;
};

let seq = 1;
const uid = (prefix: string) => `${prefix}-${seq++}`;

function createNode(kind: ComponentKind, position: { x: number; y: number }): SimNode {
  const item = COMPONENT_CATALOG.find((c) => c.kind === kind)!;
  return {
    id: uid(kind),
    type: "design",
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
  "nodes" | "edges" | "functionalReqs" | "features" | "nfr" | "verification" | "selectedNodeId"
> => {
  seq = 1;
  const staticNode = createNode("static_hosting", { x: 80, y: 80 });
  const cdn = createNode("cdn", { x: 80, y: 220 });
  const lb = createNode("load_balancer", { x: 320, y: 140 });
  const paas = createNode("paas", { x: 560, y: 80 });
  paas.data.label = "Programme API";
  paas.data.purpose = "Search & admin API";
  if (paas.data.config.kind === "paas") {
    paas.data.config.appType = "express";
    paas.data.config.hosting = "digitalocean-apps";
    paas.data.config.capacity = { ...DEFAULT_CAPACITIES.paas };
  }
  const db = createNode("database", { x: 820, y: 140 });
  db.data.label = "Programme Graph DB";
  if (db.data.config.kind === "database") {
    db.data.config.engine = "graph";
    db.data.config.replicas = 2;
    db.data.config.shards = 1;
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
    nodes: [staticNode, cdn, lb, paas, db],
    edges: [
      {
        id: "e-cdn-static",
        source: cdn.id,
        target: staticNode.id,
        animated: true,
        data: { protocol: "http" as EdgeProtocol },
        label: "HTTP",
      },
      {
        id: "e-static-lb",
        source: staticNode.id,
        target: lb.id,
        animated: true,
        data: { protocol: "http" as EdgeProtocol },
        label: "HTTP",
      },
      {
        id: "e-lb-paas",
        source: lb.id,
        target: paas.id,
        animated: true,
        data: { protocol: "http" as EdgeProtocol },
        label: "HTTP",
      },
      {
        id: "e-paas-db",
        source: paas.id,
        target: db.id,
        animated: true,
        data: { protocol: "db" as EdgeProtocol },
        label: "DB",
      },
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
      maxMonthlyCostUsd: 200,
    },
    verification: null,
    selectedNodeId: null,
  };
};

export const useSimulatorStore = create<SimulatorState>((set, get) => ({
  ...demoSeed(),

  onNodesChange: (changes) =>
    set({ nodes: applyNodeChanges(changes, get().nodes) as SimNode[] }),

  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),

  onConnect: (connection) =>
    set({
      edges: addEdge(
        {
          ...connection,
          animated: true,
          data: { protocol: "http" as EdgeProtocol },
          label: "HTTP",
        },
        get().edges,
      ),
    }),

  addComponent: (kind) => {
    const offset = get().nodes.length * 24;
    const node = createNode(kind, { x: 120 + offset, y: 100 + (offset % 160) });
    set({ nodes: [...get().nodes, node], selectedNodeId: node.id });
  },

  selectNode: (id) => set({ selectedNodeId: id }),

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

  setEdgeProtocol: (edgeId, protocol) =>
    set({
      edges: get().edges.map((e) =>
        e.id === edgeId
          ? {
              ...e,
              data: { ...(e.data as object), protocol },
              label: protocol === "db" ? "DB" : protocol.toUpperCase(),
            }
          : e,
      ),
    }),

  addFunctionalRequirement: (text) => {
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
    const req = get().functionalReqs.find((r) => r.id === id);
    set({
      functionalReqs: get().functionalReqs.filter((r) => r.id !== id),
      features: get().features.filter((f) => f.id !== req?.featureId),
    });
  },

  updateFeature: (id, patch) =>
    set({
      features: get().features.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }),

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

  setNfr: (patch) => set({ nfr: { ...get().nfr, ...patch } }),

  runVerification: () => {
    const { nodes, edges, features, nfr } = get();
    set({ verification: runVerification(nodes, edges, features, nfr) });
  },

  loadDemo: () => set({ ...demoSeed() }),

  clearCanvas: () =>
    set({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      verification: null,
    }),
}));
