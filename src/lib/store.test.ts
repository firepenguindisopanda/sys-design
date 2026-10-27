import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildDesign } from "./challenges/design";
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
