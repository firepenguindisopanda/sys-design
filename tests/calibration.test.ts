import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadChallenges } from "@/lib/challenges/load";
import { runFixture } from "@/lib/challenges/run";

// Latency targets are calibrated at about twice the good design's latency. An engine
// change that makes good designs much faster leaves the targets loose (finding 12
// did), so this fails once a target is more than three times the good latency.
const MAX_RATIO = 3;

const challenges = loadChallenges(path.resolve(__dirname, "../challenges"));

const cases = challenges.map((c) => {
  const good = c.fixtures.find((f) => f.name === "good");
  if (!good) throw new Error(`no good fixture for ${c.brief.id}`);
  const latency = runFixture(c.brief, good).verification.estimatedLatencyMs;
  return { id: c.brief.id, latency, target: c.brief.nfr.maxLatencyMs };
});

describe("latency targets are calibrated against the good design", () => {
  it.each(cases)("$id: good design meets the target", ({ latency, target }) => {
    expect(latency, `good design ${latency} ms vs target ${target} ms`).toBeLessThanOrEqual(target);
  });

  it.each(cases)(`$id: target is at most ${MAX_RATIO}× the good design`, ({ latency, target }) => {
    expect(target, `target ${target} ms vs good design ${latency} ms`).toBeLessThanOrEqual(
      MAX_RATIO * latency,
    );
  });
});
