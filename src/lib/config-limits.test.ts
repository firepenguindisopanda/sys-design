import { describe, expect, it } from "vitest";
import { COMPONENT_CATALOG } from "@/lib/catalog";
import { useSimulatorStore } from "@/lib/store";
import type { ComponentKind } from "@/lib/types";
import { challenges } from "@/test/loadsim-designs";
import { buildDesign } from "@/lib/challenges/design";
import {
  CONFIG_LIMITS,
  clampConfigValue,
  clampPatch,
  configProblem,
  limitFor,
  numericConfigFields,
  parseConfigInput,
} from "./config-limits";

// SPEC-config-bounds.md: one set of limits for node config.

type Config = Record<string, unknown>;

function problems(kind: ComponentKind, config: Config): string[] {
  return numericConfigFields(config).flatMap(([path, value]) => {
    const problem = configProblem(kind, path, value);
    return problem ? [`${kind} ${path} = ${String(value)}: ${problem}`] : [];
  });
}

describe("everything that exists today fits", () => {
  it("every catalog default", () => {
    for (const item of COMPONENT_CATALOG) {
      expect(problems(item.kind, item.defaultConfig as unknown as Config), item.kind).toEqual([]);
    }
  });

  it("every node of every fixture", () => {
    for (const c of challenges) {
      for (const f of c.fixtures) {
        for (const n of buildDesign(c.brief, f).nodes) {
          const config = n.data.config as unknown as Config;
          expect(problems(n.data.componentKind, config), `${c.brief.id}/${f.name} ${n.id}`).toEqual([]);
        }
      }
    }
  });

  it.each(["loadDemo", "loadFanInDemo"] as const)("every node of %s", (load) => {
    useSimulatorStore.getState()[load]();
    for (const n of useSimulatorStore.getState().nodes) {
      expect(problems(n.data.componentKind, n.data.config as unknown as Config), n.id).toEqual([]);
    }
  });
});

describe("the table", () => {
  it("has the spec's limits", () => {
    expect(CONFIG_LIMITS.database).toEqual({
      replicas: { min: 1, max: 8, whole: true },
      shards: { min: 1, max: 16, whole: true },
      storageGb: { min: 1, max: 100_000 },
    });
    expect(CONFIG_LIMITS.cache).toEqual({ memoryGb: { min: 0.5, max: 256 } });
    expect(CONFIG_LIMITS.object_storage).toEqual({ storageGb: { min: 1, max: 100_000 } });
    expect(CONFIG_LIMITS.task_worker).toEqual({ concurrency: { min: 1, max: 64, whole: true } });
    for (const kind of ["vm", "paas", "functions", "edge"] as const) {
      expect(CONFIG_LIMITS[kind]).toEqual({
        "capacity.vcpus": { min: 0.5, max: 64 },
        "capacity.memoryGb": { min: 0.5, max: 512 },
        "capacity.storageGb": { min: 0.25, max: 10_000 },
      });
    }
  });

  it("limitFor finds a field, and gives null for a field with no limit", () => {
    expect(limitFor("database", "replicas")).toEqual({ min: 1, max: 8, whole: true });
    expect(limitFor("database", "engine")).toBeNull();
    expect(limitFor("load_balancer", "anything")).toBeNull();
  });
});

describe("configProblem", () => {
  it("accepts each limit's min and max", () => {
    for (const [kind, fields] of Object.entries(CONFIG_LIMITS)) {
      for (const [path, limit] of Object.entries(fields)) {
        expect(configProblem(kind as ComponentKind, path, limit.min), `${kind} ${path} min`).toBeNull();
        expect(configProblem(kind as ComponentKind, path, limit.max), `${kind} ${path} max`).toBeNull();
      }
    }
  });

  it("refuses just outside the limits, with the spec's wording", () => {
    expect(configProblem("vm", "capacity.vcpus", 0.49)).toBe("expected a number from 0.5 to 64");
    expect(configProblem("vm", "capacity.vcpus", 64.01)).toBe("expected a number from 0.5 to 64");
    expect(configProblem("database", "replicas", 0)).toBe("expected a whole number from 1 to 8");
    expect(configProblem("database", "replicas", 9)).toBe("expected a whole number from 1 to 8");
  });

  it("refuses a fraction for a whole-number field, but not elsewhere", () => {
    expect(configProblem("database", "replicas", 1.5)).toBe("expected a whole number from 1 to 8");
    expect(configProblem("vm", "capacity.vcpus", 1.25)).toBeNull();
  });

  it.each([NaN, Infinity, -Infinity])("refuses %s", (value) => {
    expect(configProblem("database", "shards", value)).toBe("expected a whole number from 1 to 16");
    expect(configProblem("cache", "memoryGb", value)).toBe("expected a number from 0.5 to 256");
  });

  it("leaves fields with no limit alone", () => {
    expect(configProblem("database", "engine", "document")).toBeNull();
    expect(configProblem("message_queue", "mode", "pubsub")).toBeNull();
  });
});

describe("clampConfigValue and parseConfigInput", () => {
  it.each([
    ["", null],
    [" ", null],
    ["abc", null],
    ["NaN", null],
    ["Infinity", null],
    ["-1", 1],
    ["20", 8],
    ["1e9", 8],
    ["2.6", 3],
    ["5", 5],
  ])("replicas %j gives %j", (text, expected) => {
    expect(parseConfigInput("database", "replicas", text)).toBe(expected);
  });

  it("keeps fractions where they're allowed", () => {
    expect(parseConfigInput("cache", "memoryGb", "0.75")).toBe(0.75);
    expect(parseConfigInput("cache", "memoryGb", "0.2")).toBe(0.5);
    expect(parseConfigInput("cache", "memoryGb", "1e9")).toBe(256);
  });

  it("clamps numbers and refuses non-finite ones", () => {
    expect(clampConfigValue("vm", "capacity.vcpus", 0)).toBe(0.5);
    expect(clampConfigValue("vm", "capacity.vcpus", 100)).toBe(64);
    expect(clampConfigValue("task_worker", "concurrency", 3.4)).toBe(3);
    expect(clampConfigValue("database", "replicas", NaN)).toBeNull();
    expect(clampConfigValue("database", "replicas", Infinity)).toBeNull();
  });
});

describe("numericConfigFields", () => {
  it("lists numeric fields, nested ones by dotted path", () => {
    expect(numericConfigFields({ kind: "vm", appType: "x", capacity: { vcpus: 2, memoryGb: 4 } })).toEqual([
      ["capacity.vcpus", 2],
      ["capacity.memoryGb", 4],
    ]);
    expect(numericConfigFields({ replicas: NaN, engine: "graph" })).toEqual([["replicas", NaN]]);
  });
});

describe("clampPatch", () => {
  it("clamps numbers, drops non-finite ones and leaves the rest", () => {
    expect(clampPatch("database", { replicas: 20 })).toEqual({ replicas: 8 });
    expect(clampPatch("database", { replicas: NaN, shards: 2 })).toEqual({ shards: 2 });
    expect(clampPatch("database", { engine: "document" })).toEqual({ engine: "document" });
    expect(clampPatch("vm", { capacity: { vcpus: 0, memoryGb: 8, storageGb: 80 } })).toEqual({
      capacity: { vcpus: 0.5, memoryGb: 8, storageGb: 80 },
    });
    expect(clampPatch("vm", { capacity: { vcpus: Infinity, memoryGb: 8 } })).toEqual({ capacity: { memoryGb: 8 } });
  });
});
