import { describe, expect, it } from "vitest";
import { parseScenarioField } from "@/components/loadsim/scenario-controls";
import { exportDesignFile, importDesignFile, type LoadedDesign } from "@/lib/challenges/design-file";
import { HANDOFF_KEY, loadHandoff, type HandoffStorage } from "@/lib/loadsim/handoff";
import { generateDesign } from "@/test/gen-designs";
import { brokenInvariants } from "@/test/invariants";
import { briefById, briefs, fixtureDesign } from "@/test/loadsim-designs";

// SPEC-stress-harness.md, import edge cases. Cases already in design-file.test.ts and
// handoff.test.ts (invalid YAML, an unknown challenge, an edge to an unknown node, an empty
// file, corrupt storage) aren't repeated.

const NAME = "test.yaml";
const brief = briefById("link-shortener");

/** The link shortener's reference design as Export writes it: the file students import. */
const BASE = (() => {
  const built = fixtureDesign("link-shortener", "good");
  const file = exportDesignFile({
    ...built,
    functionalReqs: brief.functionalRequirements.map((fr) => ({ id: `freq-${fr.id}`, text: fr.text, featureId: fr.id })),
    challenge: brief,
  });
  if ("error" in file) throw new Error(file.error);
  return file.text;
})();

/** BASE with one piece of text replaced; throws if it isn't there, so a case can't silently test BASE. */
function fileWith(from: string, to: string, text = BASE): string {
  if (!text.includes(from)) throw new Error(`"${from}" isn't in the file`);
  return text.replace(from, to);
}

/** BASE with one more line after the `lb -> api-1` edge. */
const withEdge = (line: string) => fileWith("    - lb -> api-1: http\n", `    - lb -> api-1: http\n    - ${line}\n`);

/** BASE with one more node at the end of the node list. */
const withNode = (node: string) => fileWith("  edges:\n", `    - ${node}\n  edges:\n`);

const importText = (text: string) => importDesignFile(text, NAME, briefs, null);

function refusal(text: string): string {
  const result = importText(text);
  if (!("error" in result)) throw new Error("expected the file to be refused, but it was accepted");
  return result.error;
}

function loaded(text: string): LoadedDesign {
  const result = importText(text);
  if ("error" in result) throw new Error(`expected the file to be accepted: ${result.error}`);
  return result.loaded;
}

/** What import gives, without the node positions that a CRLF or BOM can't change anyway. */
const view = (d: LoadedDesign) => ({
  brief: d.brief?.id ?? null,
  nodes: d.nodes.map((n) => [n.id, n.data.componentKind, n.data.label, n.data.purpose, n.data.config, n.position]),
  edges: d.edges.map((e) => [e.source, e.target]),
  placements: d.features.map((f) => [f.id, f.placedOnNodeId]),
});

describe("refused, naming the file and the path", () => {
  it.each([
    ["only comments", "# nothing here\n", "(root): expected a mapping"],
    ["a list at the top level", "- a\n- b\n", "(root): expected a mapping"],
    ["a string at the top level", "hello\n", "(root): expected a mapping"],
    ["a number at the top level", "42\n", "(root): expected a mapping"],
  ])("%s", (_, text, message) => {
    expect(refusal(text)).toBe(`${NAME}: ${message}`);
  });

  it("a tab indent", () => {
    expect(refusal(fileWith("design:\n  nodes:", "design:\n\tnodes:"))).toMatch(new RegExp(`^${NAME}: `));
  });

  it("a YAML alias bomb (the yaml library's alias limit)", () => {
    const bomb = [
      'a: &a ["x","x","x","x","x","x","x","x","x","x"]',
      "b: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]",
      "c: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]",
      "d: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c,*c]",
      "e: &e [*d,*d,*d,*d,*d,*d,*d,*d,*d,*d]",
      "f: [*e,*e,*e,*e,*e,*e,*e,*e,*e,*e]",
    ].join("\n");
    expect(refusal(bomb)).toMatch(new RegExp(`^${NAME}: .*alias`, "i"));
  });

  it.each([
    ["an unknown top-level key", fileWith("design:\n", "colour: blue\ndesign:\n"), "colour: unknown field"],
    ["an unknown key on a node", fileWith("label: Student phone,", "label: Student phone, colour: blue,"), "design.nodes[0]"],
    ["an unknown key in config", fileWith("config: { memoryGb: 6 }", "config: { memoryGb: 6, colour: blue }"), "design.nodes[5].config"],
    ["a config value of the wrong type", fileWith("config: { memoryGb: 6 }", "config: { memoryGb: six }"), "design.nodes[5].config.memoryGb"],
    ["a duplicate node id", fileWith("id: lab-pc", "id: phone"), "design.nodes"],
    ["a duplicate edge", withEdge("phone -> lb: http"), "design.edges"],
    ["a malformed edge line", withEdge("phone => lb: http"), "design.edges[3]"],
    ["an unknown protocol", withEdge("phone -> api-1: carrier_pigeon"), "design.edges[3]"],
    ["an unknown kind", fileWith("kind: mobile", "kind: mainframe"), "design.nodes[0].kind"],
    ["an `at` with three numbers", fileWith("at: [ 0, 0 ]", "at: [ 0, 0, 0 ]"), "design.nodes[0].at"],
    ["an `at` that is a string", fileWith("at: [ 0, 0 ]", "at: here"), "design.nodes[0].at"],
    ["an `at` with .nan", fileWith("at: [ 0, 0 ]", "at: [ .nan, 0 ]"), "design.nodes[0].at"],
    ["an `at` with .inf", fileWith("at: [ 0, 0 ]", "at: [ .inf, 0 ]"), "design.nodes[0].at"],
  ])("%s", (_, text, path) => {
    const message = refusal(text);
    expect(message.startsWith(`${NAME}: ${path}`), message).toBe(true);
  });
});

describe("accepted, and unchanged by the change", () => {
  it("CRLF line endings", () => {
    expect(view(loaded(BASE.replace(/\n/g, "\r\n")))).toEqual(view(loaded(BASE)));
  });

  it("a UTF-8 byte order mark (recorded first: accepted)", () => {
    expect(view(loaded("﻿" + BASE))).toEqual(view(loaded(BASE)));
  });

  it("Unicode labels and purpose notes, and a label of 10,000 characters, survive export and import", () => {
    const long = "é".repeat(10_000);
    const text = fileWith("label: Student phone,", `label: "Café ☕ 学生 📱", purpose: "Ἀθῆναι → 東京",`).replace(
      "label: Lab machine,",
      `label: "${long}",`,
    );
    const first = loaded(text);
    expect(first.nodes[0].data.label).toBe("Café ☕ 学生 📱");
    expect(first.nodes[0].data.purpose).toBe("Ἀθῆναι → 東京");
    expect(first.nodes[1].data.label).toBe(long);
    const again = exportDesignFile({ ...first, challenge: first.brief });
    if ("error" in again) throw new Error(again.error);
    expect(view(loaded(again.text))).toEqual(view(first));
  });

  it("a 2,000-node file imports within 2 s", () => {
    const big = generateDesign({ seed: 1, shape: "random", nodes: 2_000 });
    const file = exportDesignFile({ ...big, challenge: null });
    if ("error" in file) throw new Error(file.error);
    const start = performance.now();
    const result = importText(file.text);
    const ms = performance.now() - start;
    expect("loaded" in result).toBe(true);
    expect(ms, `took ${ms.toFixed(0)} ms for ${(file.text.length / 1024).toFixed(0)} KB`).toBeLessThan(2_000);
  });
});

describe("recorded first, then pinned as they behave", () => {
  // The canvas refuses a self-loop, but import accepts one; nothing breaks.
  it("a self-loop is accepted and keeps every invariant", () => {
    const d = loaded(withEdge("api-1 -> api-1: http"));
    expect(d.edges.some((e) => e.source === "api-1" && e.target === "api-1")).toBe(true);
    expect(brokenInvariants(d, d.brief)).toEqual([]);
  });

  // Export only refuses two connections in the same direction.
  it("a -> b with b -> a is accepted and keeps every invariant", () => {
    const d = loaded(withEdge("api-1 -> lb: http"));
    expect(d.edges.filter((e) => [e.source, e.target].sort().join() === "api-1,lb")).toHaveLength(2);
    expect(brokenInvariants(d, d.brief)).toEqual([]);
  });

  it("a saved /simulate design whose brief is gone gives an error naming it", () => {
    const text = fileWith("challenge: link-shortener", "challenge: retired-brief");
    const result = loadHandoff(storageWith(text, "retired-brief"), briefs);
    expect(result).toEqual({ error: 'retired-brief-design.yaml: challenge: no challenge called "retired-brief"' });
  });
});

function storageWith(text: string, briefId: string): HandoffStorage {
  const stored = JSON.stringify({ text, fileName: `${briefId}-design.yaml`, briefId });
  return { getItem: (key) => (key === HANDOFF_KEY ? stored : null), setItem: () => {} };
}

describe("out-of-range config (pinned for config-bounds)", () => {
  // Import only, never the engine or the load model: `.inf` replicas crash the model's worker.
  const db = (config: string) => fileWith("config: { replicas: 2 }", `config: { ${config} }`);
  const worker = (concurrency: string) => withNode(`{ id: worker, kind: task_worker, config: { concurrency: ${concurrency} } }`);
  const vcpus = (value: string) =>
    fileWith("label: Link API 1, at: [ 660, 0 ] }", `label: Link API 1, at: [ 660, 0 ], config: { capacity: { vcpus: ${value} } } }`);

  const cases: [string, string, string][] = [
    ...["0", "-1", "1.5", ".nan", ".inf", "1000000"].flatMap((v): [string, string, string][] => [
      [`replicas: ${v}`, db(`replicas: ${v}`), "design.nodes[6].config.replicas"],
      [`shards: ${v}`, db(`shards: ${v}`), "design.nodes[6].config.shards"],
    ]),
    ["worker concurrency: 0", worker("0"), "design.nodes[7].config.concurrency"],
    ["worker concurrency: .nan", worker(".nan"), "design.nodes[7].config.concurrency"],
    ["compute capacity.vcpus: -1", vcpus("-1"), "design.nodes[3].config.capacity.vcpus"],
  ];

  // Guards the pins below: each file is accepted today, so each pin fails for the reason it
  // names, not because of a typo in the case. config-bounds turns these around.
  it.each(cases)("today, %s is accepted", (_, text) => {
    expect(importText(text)).toHaveProperty("loaded");
  });

  it("the same files with in-range values are accepted", () => {
    expect(importText(db("replicas: 3, shards: 2"))).toHaveProperty("loaded");
    expect(importText(worker("8"))).toHaveProperty("loaded");
    expect(importText(vcpus("2"))).toHaveProperty("loaded");
  });

  it.fails.each(cases)("[config-bounds] refuses %s", (_, text, path) => {
    const message = refusal(text);
    expect(message.startsWith(`${NAME}: ${path}`), message).toBe(true);
  });

  it("today, a saved /simulate design with replicas: .inf loads", () => {
    expect(loadHandoff(storageWith(db("replicas: .inf"), "link-shortener"), briefs)).toHaveProperty("loaded");
  });

  // Today it loads, and the page's run crashes; the design stays in session storage, so a
  // reload crashes again (CAPABILITY-MAP-stress.md).
  it.fails("[config-bounds] a saved /simulate design with replicas: .inf gives an error, not a design", () => {
    expect(loadHandoff(storageWith(db("replicas: .inf"), "link-shortener"), briefs)).toHaveProperty("error");
  });
});

describe("scenario fields (cases not in scenario-controls.test.tsx)", () => {
  it.each([
    [" ", null],
    ["-5", 1_000],
    ["1e9", 1_000_000],
    ["Infinity", null],
    ["NaN", null],
    // Number("0x10") is 16, which clamps to the minimum: odd but harmless.
    ["0x10", 1_000],
    ["12.6", 1_000],
  ])("requests %j gives %j", (text, expected) => {
    expect(parseScenarioField("requests", text)).toBe(expected);
  });

  it.each([
    ["NaN", null],
    ["-5", 60],
  ])("window %j gives %j", (text, expected) => {
    expect(parseScenarioField("windowMinutes", text)).toBe(expected);
  });
});
