import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadChallenges } from "@/lib/challenges/load";
import { runFixture } from "@/lib/challenges/run";

// One test per fixture under challenges/. A fixture marked knownGap is a bad
// design the engine currently gets wrong: it runs as it.fails, so the suite
// stays green, and turns red once the engine is fixed and the mark must go.
const challenges = loadChallenges(path.resolve(__dirname, "../challenges"));

describe("challenges", () => {
  it("has at least one brief", () => {
    expect(challenges.length).toBeGreaterThan(0);
  });

  for (const { brief, fixtures } of challenges) {
    it(`${brief.id}: has one good fixture and at least three bad ones`, () => {
      const names = fixtures.map((f) => f.name);
      expect(names.filter((n) => n === "good")).toHaveLength(1);
      expect(names.filter((n) => n.startsWith("bad-")).length).toBeGreaterThanOrEqual(3);
    });

    for (const fixture of fixtures) {
      const name = `${brief.id}/${fixture.name}`;
      const test = () => expect(runFixture(brief, fixture).mismatches).toEqual([]);
      if (fixture.knownGap) {
        it.fails(`${name} [known gap: ${fixture.knownGap}]`, test);
      } else {
        it(name, test);
      }
    }
  }
});
