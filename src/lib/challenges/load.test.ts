import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadChallenges } from "./load";

const BRIEF = `
id: demo
title: Demo
tagline: Demo
source: Test
summary: Demo
functionalRequirements:
  - id: read
    text: Read.
    feature:
      name: Read
      resources: { memoryGb: 1, vcpus: 1, storageGb: 1 }
      targetRpm: 100
      computeMsPerRequest: 20
nfr: { maxLatencyMs: 200, minThroughputRpm: 100, minAvailabilityPct: 99 }
`;

const FIXTURE = `
description: Minimal.
design:
  nodes:
    - { id: api, kind: paas }
  placements: { read: api }
expect: { pass: true }
`;

describe("loadChallenges", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "challenges-"));
    mkdirSync(path.join(root, "demo", "fixtures"), { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const write = (rel: string, text: string) => writeFileSync(path.join(root, rel), text);

  it("loads a brief and its fixtures, sorted by name", () => {
    write("demo/brief.yaml", BRIEF);
    write("demo/fixtures/good.yaml", FIXTURE);
    write("demo/fixtures/bad-a.yaml", FIXTURE);
    write("demo/fixtures/notes.txt", "ignored");
    const [c] = loadChallenges(root);
    expect(c.brief.id).toBe("demo");
    expect(c.fixtures.map((f) => f.name)).toEqual(["bad-a", "good"]);
  });

  it("reports invalid content with the file path", () => {
    write("demo/brief.yaml", BRIEF.replace("source: Test", "source: ''"));
    expect(() => loadChallenges(root)).toThrow(/demo\/brief\.yaml: source: expected a non-empty string/);
  });

  it("reports YAML syntax errors with the file path", () => {
    write("demo/brief.yaml", BRIEF);
    write("demo/fixtures/good.yaml", "design: [unclosed");
    expect(() => loadChallenges(root)).toThrow(/demo\/fixtures\/good\.yaml: /);
  });

  it("requires the brief id to match its folder", () => {
    write("demo/brief.yaml", BRIEF.replace("id: demo", "id: other"));
    expect(() => loadChallenges(root)).toThrow(/id: "other" must match its folder "demo"/);
  });

  it("requires brief.yaml in every challenge folder", () => {
    expect(() => loadChallenges(root)).toThrow(/demo: missing brief\.yaml/);
  });
});
