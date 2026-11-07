import { describe, expect, it } from "vitest";
import { buildDesign } from "@/lib/challenges/design";
import { generateDesign } from "@/test/gen-designs";
import { challenges, design, fixtureDesign, requirement } from "@/test/loadsim-designs";
import { missingForLoad } from "./readiness";

describe("missingForLoad", () => {
  it("is empty for a connected design with placed features", () => {
    const d = fixtureDesign("link-shortener", "good");
    expect(missingForLoad(d.nodes, d.edges, d.features)).toEqual([]);
  });

  it("asks for a client when there is none", () => {
    const d = design([requirement("a", { targetRpm: 1, computeMsPerRequest: 10 })], [["vm", "vm"]], [], { a: "vm" });
    expect(missingForLoad(d.nodes, d.edges, d.features)).toEqual([
      "Add a client (mobile, desktop or IoT) and connect it to your design.",
    ]);
  });

  it("asks for a connection when no client has one", () => {
    const d = design(
      [requirement("a", { targetRpm: 1, computeMsPerRequest: 10 })],
      [
        ["desktop", "desktop"],
        ["vm", "vm"],
      ],
      [],
      { a: "vm" },
    );
    expect(missingForLoad(d.nodes, d.edges, d.features)).toEqual(["Connect a client to your design."]);
  });

  it("asks for a client that sends requests when every client only receives pushes", () => {
    const d = design(
      [requirement("a", { targetRpm: 1, computeMsPerRequest: 10 })],
      [
        ["phone", "mobile"],
        ["vm", "vm"],
      ],
      ["vm -> phone : web_push"],
      { a: "vm" },
    );
    expect(missingForLoad(d.nodes, d.edges, d.features)).toEqual([
      "Connect a client to compute or a load balancer. Your clients only receive pushes or talk to parts not simulated yet.",
    ]);
  });

  it("asks for a placed feature when none is placed", () => {
    const d = fixtureDesign("link-shortener", "good");
    const unplaced = d.features.map((f) => ({ ...f, placedOnNodeId: null }));
    expect(missingForLoad(d.nodes, d.edges, unplaced)).toEqual(["Place at least one feature on compute."]);
  });

  // SPEC-loadsim-route-scale.md
  describe("too many routes", () => {
    const TOO_MANY =
      "This design has more than 2,000 ways for a request to travel through it, too many to simulate. " +
      "That usually means load balancers stacked in layers: one load balancer in front of each group of servers is enough.";
    const stacked = (layers: number) => generateDesign({ shape: "stacked", layers, width: 4 });

    it("says so for 5 stacked layers of load balancers", () => {
      const d = stacked(5);
      expect(missingForLoad(d.nodes, d.edges, d.features)).toEqual([TOO_MANY]);
    });

    it("is quiet for 4 stacked layers, and for every fixture", () => {
      const d = stacked(4);
      expect(missingForLoad(d.nodes, d.edges, d.features)).toEqual([]);
      for (const c of challenges) {
        for (const f of c.fixtures) {
          const built = buildDesign(c.brief, f);
          expect(missingForLoad(built.nodes, built.edges, built.features), `${c.brief.id}/${f.name}`).not.toContain(TOO_MANY);
        }
      }
    });

    it("waits until nothing else is missing", () => {
      const d = stacked(5);
      const unplaced = d.features.map((f) => ({ ...f, placedOnNodeId: null }));
      expect(missingForLoad(d.nodes, d.edges, unplaced)).toEqual(["Place at least one feature on compute."]);
    });
  });
});
