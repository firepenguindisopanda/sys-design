import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildDesign } from "./challenges/design";
import { exportDesignFile, importDesignFile } from "./challenges/design-file";
import { loadChallenges } from "./challenges/load";
import { runFixture } from "./challenges/run";
import { useSimulatorStore } from "./store";

const store = () => useSimulatorStore.getState();

const challenges = loadChallenges(path.resolve(__dirname, "../../challenges"));
const linkShortener = challenges.find((c) => c.brief.id === "link-shortener")!;
const brief = linkShortener.brief;

// The BeUWI demo places both features on the "Programme API" PaaS node.
function demoApiNodeId(): string {
  const id = store().features[0]?.placedOnNodeId;
  if (!id) throw new Error("demo should start with a placed feature");
  return id;
}

describe("unplacing features when their node is removed", () => {
  beforeEach(() => store().loadDemo());

  it("clearCanvas unplaces every feature", () => {
    expect(store().features.every((f) => f.placedOnNodeId)).toBe(true);
    store().clearCanvas();
    expect(store().features.map((f) => f.placedOnNodeId)).toEqual([null, null]);
  });

  it("deleting a node unplaces only the features on that node", () => {
    const apiId = demoApiNodeId();
    // Add a second compute node and move one feature onto it.
    store().addComponent("vm");
    const vm = store().nodes.at(-1)!;
    const [first, second] = store().features;
    expect(store().placeFeature(second.id, vm.id).ok).toBe(true);

    store().onNodesChange([{ type: "remove", id: apiId }]);

    const byId = new Map(store().features.map((f) => [f.id, f.placedOnNodeId]));
    expect(byId.get(first.id)).toBeNull();
    expect(byId.get(second.id)).toBe(vm.id);
  });

  it("other node changes leave placements alone", () => {
    const apiId = demoApiNodeId();
    store().onNodesChange([{ type: "position", id: apiId, position: { x: 1, y: 2 } }]);
    expect(store().features.every((f) => f.placedOnNodeId === apiId)).toBe(true);
  });
});

describe("challenge session", () => {
  beforeEach(() => store().loadDemo());

  it("starts in the sandbox", () => {
    expect(store().challenge).toBeNull();
    expect(store().ruleResults).toBeNull();
  });

  it("startChallenge empties the canvas and loads the brief's requirements and NFRs", () => {
    store().startChallenge(brief);
    const s = store();
    expect(s.challenge?.id).toBe("link-shortener");
    expect(s.nodes).toEqual([]);
    expect(s.edges).toEqual([]);
    expect(s.verification).toBeNull();
    expect(s.nfr).toEqual(brief.nfr);
    expect(s.functionalReqs.map((r) => r.text)).toEqual(
      brief.functionalRequirements.map((fr) => fr.text),
    );
    expect(s.features).toEqual(
      brief.functionalRequirements.map((fr) => ({
        id: fr.id,
        ...fr.feature,
        placedOnNodeId: null,
      })),
    );
    expect(s.functionalReqs.map((r) => r.featureId)).toEqual(s.features.map((f) => f.id));
  });

  it("locks requirements, feature numbers and NFRs in a challenge", () => {
    store().startChallenge(brief);
    const before = { reqs: store().functionalReqs, features: store().features, nfr: store().nfr };

    store().addFunctionalRequirement("Something extra");
    store().removeFunctionalRequirement(before.reqs[0].id);
    store().updateFeature(before.features[0].id, { targetRpm: 1 });
    store().setNfr({ maxLatencyMs: 9999 });

    expect(store().functionalReqs).toEqual(before.reqs);
    expect(store().features).toEqual(before.features);
    expect(store().nfr).toEqual(before.nfr);
  });

  it("keeps the same actions working in the sandbox", () => {
    const count = store().functionalReqs.length;
    store().addFunctionalRequirement("Something extra");
    store().setNfr({ maxLatencyMs: 9999 });
    expect(store().functionalReqs).toHaveLength(count + 1);
    expect(store().nfr.maxLatencyMs).toBe(9999);
  });

  it("still allows placing features on compute in a challenge", () => {
    store().startChallenge(brief);
    store().addComponent("paas");
    const api = store().nodes[0];
    expect(store().placeFeature("redirect", api.id).ok).toBe(true);
    expect(store().features.find((f) => f.id === "redirect")?.placedOnNodeId).toBe(api.id);
  });

  it("leaveChallenge returns to the starting demo", () => {
    store().startChallenge(brief);
    store().leaveChallenge();
    const s = store();
    expect(s.challenge).toBeNull();
    expect(s.ruleResults).toBeNull();
    expect(s.nodes).toHaveLength(11);
    expect(s.functionalReqs).toHaveLength(2);
  });

  it("loading a demo also leaves the challenge", () => {
    store().startChallenge(brief);
    store().loadFanInDemo();
    expect(store().challenge).toBeNull();
  });

  it("sandbox verification has no rule results", () => {
    store().runVerification();
    expect(store().verification).not.toBeNull();
    expect(store().ruleResults).toBeNull();
  });
});

describe("challenge verification matches the fixture harness", () => {
  // Put a fixture's canvas into the store, then use the real actions to place
  // features and verify, as a student would.
  function attempt(fixtureName: string) {
    const fixture = linkShortener.fixtures.find((f) => f.name === fixtureName)!;
    store().startChallenge(brief);
    const { nodes, edges } = buildDesign(brief, fixture);
    useSimulatorStore.setState({ nodes, edges });
    for (const [frId, nodeId] of Object.entries(fixture.design.placements)) {
      expect(store().placeFeature(frId, nodeId).ok).toBe(true);
    }
    store().runVerification();
    return { s: store(), expected: runFixture(brief, fixture) };
  }

  it("good design: same checks and rules, overall not fail", () => {
    const { s, expected } = attempt("good");
    expect(s.verification?.checks).toEqual(expected.verification.checks);
    expect(s.ruleResults).toEqual(expected.rules);
    expect(s.verification?.overall).not.toBe("fail");
  });

  it("bad-no-cache: the rule fails and so does the overall result", () => {
    const { s, expected } = attempt("bad-no-cache");
    expect(s.ruleResults).toEqual(expected.rules);
    expect(s.ruleResults?.find((r) => r.id === "cache-on-read-path")?.status).toBe("fail");
    expect(s.verification?.overall).toBe("fail");
  });

  it("a failing rule fails the run even when every engine check passes", () => {
    // bad-client-to-db only trips brief rules and engine warnings, never an engine fail.
    const { s, expected } = attempt("bad-client-to-db");
    expect(expected.verification.overall).not.toBe("fail");
    expect(s.verification?.overall).toBe("fail");
  });
});

describe("loadDesign", () => {
  beforeEach(() => store().loadDemo());

  function load(text: string, current: string | null = null) {
    const result = importDesignFile(text, "test.yaml", [brief], current);
    if ("error" in result) throw new Error(result.error);
    store().selectNode(store().nodes[0]?.id ?? null);
    store().runVerification();
    store().loadDesign(result.loaded);
    return result.loaded;
  }

  const good = linkShortener.fixtures.find((f) => f.name === "good")!;
  const goodText = readFileSync(
    path.resolve(__dirname, "../../challenges/link-shortener/fixtures/good.yaml"),
    "utf8",
  );

  it("starts the file's challenge with its design, locks in place", () => {
    const loaded = load(`challenge: link-shortener\n${goodText}`);
    const s = store();
    expect(s.challenge).toBe(brief);
    expect(s.nodes).toEqual(loaded.nodes);
    expect(s.edges).toEqual(loaded.edges);
    expect(s.features).toEqual(loaded.features);
    expect(s.nfr).toEqual(brief.nfr);
    expect(s.verification).toBeNull();
    expect(s.ruleResults).toBeNull();
    expect(s.selectedNodeId).toBeNull();

    const before = { reqs: s.functionalReqs, features: s.features, nfr: s.nfr };
    store().addFunctionalRequirement("Something extra");
    store().updateFeature("redirect", { targetRpm: 1 });
    store().setNfr({ maxLatencyMs: 9999 });
    expect(store().functionalReqs).toEqual(before.reqs);
    expect(store().features).toEqual(before.features);
    expect(store().nfr).toEqual(before.nfr);

    store().runVerification();
    const expected = runFixture(brief, good);
    expect(store().verification?.checks).toEqual(expected.verification.checks);
    expect(store().ruleResults).toEqual(expected.rules);
  });

  it("loads a fixture into the current challenge", () => {
    store().startChallenge(brief);
    load(goodText, "link-shortener");
    expect(store().challenge).toBe(brief);
    expect(store().nodes).toHaveLength(good.design.nodes.length);
  });

  /** A sandbox file with paas-1…paas-n and requirements feat-1…feat-n. */
  function sandboxText(n: number) {
    const ids = Array.from({ length: n }, (_, i) => i + 1);
    return [
      "functionalRequirements:",
      ...ids.flatMap((i) => [
        `  - id: feat-${i}`,
        `    text: Requirement ${i}`,
        `    feature: { name: Feature ${i}, resources: { memoryGb: 0.1, vcpus: 0.1, storageGb: 0.1 }, targetRpm: 5, computeMsPerRequest: 50 }`,
      ]),
      "nfr: { maxLatencyMs: 300, minThroughputRpm: 50, minAvailabilityPct: 99, maxMonthlyCostUsd: null }",
      "design:",
      "  nodes:",
      ...ids.map((i) => `    - { id: paas-${i}, kind: paas }`),
      "  placements: { feat-1: paas-1 }",
    ].join("\n");
  }

  it("leaves a challenge for a sandbox file, with editable requirements", () => {
    store().startChallenge(brief);
    load(sandboxText(1), "link-shortener");
    const s = store();
    expect(s.challenge).toBeNull();
    expect(s.functionalReqs).toEqual([{ id: "freq-feat-1", text: "Requirement 1", featureId: "feat-1" }]);
    expect(s.features[0]).toMatchObject({ id: "feat-1", name: "Feature 1", placedOnNodeId: "paas-1" });
    expect(s.nfr.maxMonthlyCostUsd).toBeNull();

    store().setNfr({ maxLatencyMs: 9999 });
    store().addFunctionalRequirement("Write things");
    expect(store().nfr.maxLatencyMs).toBe(9999);
    expect(store().functionalReqs).toHaveLength(2);
  });

  it("never reuses an id already on the canvas", () => {
    // The store's counter is well below 60 after loading the demo, so it has to
    // step past ids the file already uses.
    load(sandboxText(60));
    for (let i = 0; i < 6; i++) store().addComponent("paas");
    for (let i = 0; i < 3; i++) store().addFunctionalRequirement(`Extra ${i}`);
    const nodeIds = store().nodes.map((n) => n.id);
    const featureIds = store().features.map((f) => f.id);
    const reqIds = store().functionalReqs.map((r) => r.id);
    expect(new Set(nodeIds).size).toBe(66);
    expect(new Set(featureIds).size).toBe(63);
    expect(new Set(reqIds).size).toBe(63);
  });
});

describe("unsaved work and replace requests", () => {
  beforeEach(() => store().loadDemo());

  const loads: [string, () => void][] = [
    ["loadDemo", () => store().loadDemo()],
    ["loadFanInDemo", () => store().loadFanInDemo()],
    ["startChallenge", () => store().startChallenge(brief)],
    ["leaveChallenge", () => store().leaveChallenge()],
    [
      "loadDesign",
      () => {
        const result = importDesignFile(`challenge: link-shortener\ndesign: { nodes: [{ id: api, kind: paas }] }`, "t.yaml", [brief], null);
        if ("error" in result) throw new Error(result.error);
        store().loadDesign(result.loaded);
      },
    ],
  ];

  it.each(loads)("nothing is unsaved straight after %s", (_, load) => {
    store().addComponent("vm");
    expect(store().hasUnsavedWork()).toBe(true);
    load();
    expect(store().hasUnsavedWork()).toBe(false);
  });

  it("runs a request at once when nothing would be lost", () => {
    let ran = 0;
    store().requestReplace("replace", "Test", () => ran++);
    expect(ran).toBe(1);
    expect(store().pendingReplace).toBeNull();
  });

  it("holds a request until it's confirmed when there's unsaved work", () => {
    store().addComponent("vm");
    let ran = 0;
    store().requestReplace("clear", "Everything goes.", () => ran++);
    expect(ran).toBe(0);
    expect(store().pendingReplace).toMatchObject({ kind: "clear", description: "Everything goes." });

    store().confirmReplace();
    expect(ran).toBe(1);
    expect(store().pendingReplace).toBeNull();
  });

  it("cancel drops the request and changes nothing else", () => {
    store().addComponent("vm");
    store().requestReplace("replace", "Test", () => store().startChallenge(brief));
    const { nodes, edges, features, functionalReqs, nfr, challenge } = store();

    store().cancelReplace();
    const s = store();
    expect(s.pendingReplace).toBeNull();
    expect([s.nodes, s.edges, s.features, s.functionalReqs, s.nfr, s.challenge]).toEqual([
      nodes,
      edges,
      features,
      functionalReqs,
      nfr,
      challenge,
    ]);
  });

  it("markSaved counts the current design as saved until the next change", () => {
    store().addComponent("vm");
    store().markSaved();
    expect(store().hasUnsavedWork()).toBe(false);
    store().updateNodeData(store().nodes.at(-1)!.id, { label: "Worker VM" });
    expect(store().hasUnsavedWork()).toBe(true);
  });

  it("clearing an untouched demo leaves nothing unsaved", () => {
    store().clearCanvas();
    expect(store().hasUnsavedWork()).toBe(false);
  });

  it("requirements edited in the sandbox stay unsaved after Clear", () => {
    store().addFunctionalRequirement("Export grades");
    store().clearCanvas();
    expect(store().hasUnsavedWork()).toBe(true);
  });

  it("placing a feature counts in a challenge", () => {
    store().startChallenge(brief);
    store().addComponent("paas");
    store().markSaved();
    expect(store().placeFeature("redirect", store().nodes[0].id).ok).toBe(true);
    expect(store().hasUnsavedWork()).toBe(true);
  });
});

describe("workload fields in the sandbox", () => {
  beforeEach(() => store().loadDemo());

  const exportText = () => {
    const result = exportDesignFile(store());
    if ("error" in result) throw new Error(result.error);
    return result.text;
  };
  const results = () => {
    store().runVerification();
    return { ...store().verification!, ranAt: 0 };
  };

  it("setting then clearing a field leaves Export and the results as before", () => {
    const id = store().features[0].id;
    const before = { text: exportText(), results: results() };

    store().updateFeature(id, { fileRpm: 2400 });
    expect(exportText()).toContain("fileRpm: 2400");

    store().updateFeature(id, { fileRpm: undefined });
    expect(exportText()).toBe(before.text);
    expect(results()).toEqual(before.results);
  });
});

describe("stale results", () => {
  beforeEach(() => store().loadDemo());

  const run = () => store().runVerification();
  const node = (kind: string) => store().nodes.find((n) => n.data.componentKind === kind)!;

  it("is not stale with no result", () => {
    expect(store().verification).toBeNull();
    expect(store().resultsAreStale()).toBe(false);
  });

  it("is not stale right after a run", () => {
    run();
    expect(store().verifiedFingerprint).not.toBeNull();
    expect(store().resultsAreStale()).toBe(false);
  });

  it.each<[string, () => void]>([
    ["adding a node", () => store().addComponent("vm")],
    ["deleting an edge", () => store().deleteEdge(store().edges[0].id)],
    ["changing a protocol", () => store().updateEdge(store().edges[0].id, { protocol: "websocket" })],
    ["unplacing a feature", () => store().placeFeature(store().features[0].id, null)],
    ["changing a target in the sandbox", () => store().setNfr({ maxLatencyMs: 300 })],
    ["renaming a node", () => store().updateNodeData(node("paas").id, { label: "Search API" })],
    ["changing a config field", () => store().updateNodeConfig(node("database").id, { replicas: 3 })],
  ])("is stale after %s", (_, change) => {
    run();
    change();
    expect(store().resultsAreStale()).toBe(true);
  });

  it.each<[string, () => void]>([
    [
      "moving a node",
      () => store().onNodesChange([{ type: "position", id: node("paas").id, position: { x: 900, y: 500 } }]),
    ],
    [
      "React Flow measuring a node",
      () =>
        store().onNodesChange([
          { type: "dimensions", id: node("paas").id, dimensions: { width: 180, height: 64 } },
        ]),
    ],
    ["selecting a node", () => store().selectNode(node("paas").id)],
    ["selecting an edge", () => store().selectEdge(store().edges[0].id)],
    ["editing a purpose", () => store().updateNodeData(node("paas").id, { purpose: "Search" })],
  ])("is not stale after %s", (_, change) => {
    run();
    change();
    expect(store().resultsAreStale()).toBe(false);
  });

  it("is fresh again after running again", () => {
    run();
    store().addComponent("vm");
    run();
    expect(store().resultsAreStale()).toBe(false);
  });

  const goodText = readFileSync(
    path.resolve(__dirname, "../../challenges/link-shortener/fixtures/good.yaml"),
    "utf8",
  );

  it.each<[string, () => void]>([
    ["clearCanvas", () => store().clearCanvas()],
    ["startChallenge", () => store().startChallenge(brief)],
    [
      "loadDesign",
      () => {
        const result = importDesignFile(`challenge: link-shortener\n${goodText}`, "test.yaml", [brief], null);
        if ("error" in result) throw new Error(result.error);
        store().loadDesign(result.loaded);
      },
    ],
    ["loadDemo", () => store().loadDemo()],
  ])("%s clears the result and its record", (_, replace) => {
    run();
    replace();
    expect(store().verification).toBeNull();
    expect(store().verifiedFingerprint).toBeNull();
    expect(store().resultsAreStale()).toBe(false);
  });
});
