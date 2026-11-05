import { describe, expect, it } from "vitest";
import { design, fixtureDesign, requirement } from "@/test/loadsim-designs";
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

  it("asks for a placed feature when none is placed", () => {
    const d = fixtureDesign("link-shortener", "good");
    const unplaced = d.features.map((f) => ({ ...f, placedOnNodeId: null }));
    expect(missingForLoad(d.nodes, d.edges, unplaced)).toEqual(["Place at least one feature on compute."]);
  });
});
