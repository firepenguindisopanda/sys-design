import { describe, expect, it } from "vitest";
import { buildDesign } from "@/lib/challenges/design";
import { challenges } from "./loadsim-designs";
import { generateDesign } from "./gen-designs";
import { brokenInvariants } from "./invariants";

// The invariant suite (SPEC-stress-harness.md), split over the `tests/stress-invariants-*`
// files so vitest runs the parts in parallel: one file of every design took 42 s alone.
//   STRESS_SEEDS=2000  more random designs (and a quarter as many app designs)
//   STRESS_SEED=7      only seed 7, in both shapes, with every check on; fixtures skip

/** A design runs the engine and the load model up to six times; fixtures with a brief load are the slowest. */
const TIMEOUT = 30_000;

/**
 * 100 random and 25 app designs by default. The spec's 200 and 50 made `npm test` 22 s
 * slower against a budget of 20 s; 100 and 25 cost 16 s (SPEC-stress-harness.md, Results).
 */
const DEFAULT_SEEDS = 100;

export const onlySeed = process.env.STRESS_SEED ? Number(process.env.STRESS_SEED) : null;
const randomCount = Number(process.env.STRESS_SEEDS ?? DEFAULT_SEEDS);
const counts = { random: randomCount, app: Math.ceil(randomCount / 4) };

/** Every fixture of every other brief, starting at `part` (0 or 1), so the two halves take about as long. */
export function fixtureInvariants(part: 0 | 1) {
  describe.skipIf(onlySeed !== null)(`fixtures, part ${part + 1} of 2`, () => {
    const cases = challenges
      .filter((_, i) => i % 2 === part)
      .flatMap((c) => c.fixtures.map((f) => [`${c.brief.id}/${f.name}`, c, f] as const));

    it.each(cases)("%s keeps every invariant", (name, challenge, fixture) => {
      expect(brokenInvariants(buildDesign(challenge.brief, fixture), challenge.brief), name).toEqual([]);
    }, TIMEOUT);
  });
}

/** Seeds 1 to the shape's count (or only STRESS_SEED); determinism on every tenth seed and on replays. */
export function seedInvariants(shape: "random" | "app") {
  const seeds = onlySeed !== null ? [onlySeed] : Array.from({ length: counts[shape] }, (_, i) => i + 1);
  describe(`${shape} designs`, () => {
    it.each(seeds)("seed %i keeps every invariant", (seed) => {
      const design = generateDesign({ seed, shape });
      // Comparing two runs doubles the time, so it's done on every tenth seed (and on replays).
      const determinism = onlySeed !== null || seed % 10 === 0;
      const broken = brokenInvariants(design, null, { determinism });
      const replay = `replay: STRESS_SEED=${seed} npx vitest run tests/stress-invariants`;
      expect(broken, `${design.description}\n${replay}`).toEqual([]);
    }, TIMEOUT);
  });
}
