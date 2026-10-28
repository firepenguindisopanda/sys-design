import { describe, expect, it } from "vitest";
import { createStyledEdge } from "./edges";
import { useSimulatorStore } from "./store";
import { fingerprint, hasUnsavedWork, type ReplaceableState } from "./unsaved";

/** A deep copy of the BeUWI demo, as the store loads it. */
function demo(): ReplaceableState {
  useSimulatorStore.getState().loadDemo();
  const { nodes, edges, features, functionalReqs, nfr } = useSimulatorStore.getState();
  return structuredClone({ nodes, edges, features, functionalReqs, nfr });
}

const baseline = fingerprint(demo());
const changed = (mutate: (s: ReplaceableState) => void) => {
  const s = demo();
  mutate(s);
  return hasUnsavedWork(s, baseline);
};

describe("hasUnsavedWork", () => {
  it("is false for the state the baseline was taken from", () => {
    expect(hasUnsavedWork(demo(), baseline)).toBe(false);
  });

  it.each<[string, (s: ReplaceableState) => void]>([
    ["moving a node 1 px", (s) => (s.nodes[0].position.x += 1)],
    ["renaming a node", (s) => (s.nodes[0].data.label = "Phone app")],
    ["changing a purpose", (s) => (s.nodes[0].data.purpose = "Students")],
    [
      "changing a config field",
      (s) => {
        const db = s.nodes.find((n) => n.data.componentKind === "database")!;
        (db.data.config as { replicas: number }).replicas = 3;
      },
    ],
    [
      "changing a nested config field",
      (s) => {
        const api = s.nodes.find((n) => n.data.componentKind === "paas")!;
        (api.data.config as { capacity: { vcpus: number } }).capacity.vcpus = 8;
      },
    ],
    ["deleting a node", (s) => s.nodes.pop()],
    [
      "adding a node",
      (s) => s.nodes.push({ ...structuredClone(s.nodes[0]), id: "mobile-99" }),
    ],
    ["deleting an edge", (s) => s.edges.pop()],
    [
      "adding an edge",
      (s) => s.edges.push(createStyledEdge({ source: s.nodes[0].id, target: s.nodes[1].id }, "http")),
    ],
    ["changing a protocol", (s) => (s.edges[0].data = { ...s.edges[0].data, protocol: "websocket" })],
    ["labelling an edge", (s) => (s.edges[0].data = { ...s.edges[0].data, label: "Search" })],
    ["unplacing a feature", (s) => (s.features[0].placedOnNodeId = null)],
    ["editing a requirement", (s) => (s.functionalReqs[0].text = "Browse programmes")],
    ["changing a feature's numbers", (s) => (s.features[0].targetRpm = 999)],
    ["changing a target", (s) => (s.nfr.maxLatencyMs = 300)],
  ])("counts %s", (_, mutate) => {
    expect(changed(mutate)).toBe(true);
  });

  it.each<[string, (s: ReplaceableState) => void]>([
    ["selecting a node", (s) => (s.nodes[0].selected = true)],
    ["selecting an edge", (s) => (s.edges[0].selected = true)],
    [
      "React Flow measuring nodes",
      (s) => {
        for (const n of s.nodes) {
          n.measured = { width: 180, height: 64 };
          n.width = 180;
          n.height = 64;
          n.dragging = false;
        }
      },
    ],
    ["a move under half a pixel", (s) => (s.nodes[0].position = { x: s.nodes[0].position.x + 0.4, y: s.nodes[0].position.y - 0.4 })],
    [
      "the same connection with a new id and handles",
      (s) => {
        const e = s.edges[0];
        s.edges[0] = { ...e, id: "e-redrawn", sourceHandle: "s-bottom-0", targetHandle: "t-top-0" };
      },
    ],
    ["edges in a different order", (s) => s.edges.reverse()],
    [
      "clearing the canvas with requirements untouched",
      (s) => {
        s.nodes = [];
        s.edges = [];
        for (const f of s.features) f.placedOnNodeId = null;
      },
    ],
  ])("ignores %s", (_, mutate) => {
    expect(changed(mutate)).toBe(false);
  });

  it("still counts edited requirements after the canvas is cleared", () => {
    expect(
      changed((s) => {
        s.nodes = [];
        s.edges = [];
        s.functionalReqs[0].text = "Changed";
      }),
    ).toBe(true);
  });

  it("stops counting a node dragged away and back", () => {
    expect(
      changed((s) => {
        const start = { ...s.nodes[0].position };
        s.nodes[0].position = { x: start.x + 200, y: start.y + 50 };
        s.nodes[0].position = start;
      }),
    ).toBe(false);
  });
});
