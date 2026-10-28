import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadChallenges } from "@/lib/challenges/load";
import { runFixture } from "@/lib/challenges/run";

// Finding 12: a design that queues work, runs it in the background or pushes
// results must not score a slower request than the shortcut it replaces.
const PAIRS: [brief: string, shortcut: string][] = [
  ["lab-autograder", "bad-sync-grading"],
  ["lab-autograder", "bad-results-not-stored"],
  ["course-registration", "bad-direct-enrol"],
  ["shuttle-tracker", "bad-polling"],
  ["course-assistant", "bad-no-streaming"],
  ["chat-app", "bad-no-pubsub"],
  ["notification-system", "bad-sync-delivery"],
];

const challenges = loadChallenges(path.resolve(__dirname, "../challenges"));

function latency(briefId: string, fixtureName: string): number {
  const c = challenges.find((x) => x.brief.id === briefId);
  const fixture = c?.fixtures.find((f) => f.name === fixtureName);
  if (!c || !fixture) throw new Error(`no fixture ${briefId}/${fixtureName}`);
  return runFixture(c.brief, fixture).verification.estimatedLatencyMs;
}

// Finding 10: doing slow work inline makes the request wait for it.
const INLINE_PAIRS: [brief: string, shortcut: string][] = [
  ["lab-autograder", "bad-sync-grading"],
  ["notification-system", "bad-sync-delivery"],
  ["lecture-video-library", "bad-sync-transcode"],
];

describe("good designs are no slower than their shortcuts", () => {
  it.each(PAIRS)("%s: good vs %s", (brief, shortcut) => {
    expect(latency(brief, "good")).toBeLessThanOrEqual(latency(brief, shortcut));
  });
});

describe("good designs are faster than doing slow work inline", () => {
  it.each(INLINE_PAIRS)("%s: good vs %s", (brief, shortcut) => {
    expect(latency(brief, "good")).toBeLessThan(latency(brief, shortcut));
  });
});
