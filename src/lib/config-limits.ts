import type { ComponentKind } from "./types";

// One set of limits for a node's numeric config (SPEC-config-bounds.md), shared by the
// design-file validator, the store and the inspector, so a value means the same thing
// however it was set. Fields are named by path; nested ones as `capacity.vcpus`.

export type Limit = { min: number; max: number; whole?: boolean };

const COMPUTE: Record<string, Limit> = {
  // The minimums are the smallest catalog defaults (an edge function's).
  "capacity.vcpus": { min: 0.5, max: 64 },
  "capacity.memoryGb": { min: 0.5, max: 512 },
  "capacity.storageGb": { min: 0.25, max: 10_000 },
};

export const CONFIG_LIMITS: Partial<Record<ComponentKind, Record<string, Limit>>> = {
  vm: COMPUTE,
  paas: COMPUTE,
  functions: COMPUTE,
  edge: COMPUTE,
  database: {
    replicas: { min: 1, max: 8, whole: true },
    shards: { min: 1, max: 16, whole: true },
    storageGb: { min: 1, max: 100_000 },
  },
  cache: { memoryGb: { min: 0.5, max: 256 } },
  object_storage: { storageGb: { min: 1, max: 100_000 } },
  task_worker: { concurrency: { min: 1, max: 64, whole: true } },
};

type Obj = Record<string, unknown>;

/** A mapping, as nested config fields are (not an array or null). */
export const isPlainObject = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isObj = isPlainObject;

/** The limit on a field, or null when it has none (a string field, or a kind with no numbers). */
export function limitFor(kind: ComponentKind, path: string): Limit | null {
  return CONFIG_LIMITS[kind]?.[path] ?? null;
}

const describe = (l: Limit) => `expected a ${l.whole ? "whole " : ""}number from ${l.min} to ${l.max}`;

/** Why a config value is out of range, or null when it's fine or the field has no limit. */
export function configProblem(kind: ComponentKind, path: string, value: unknown): string | null {
  const limit = limitFor(kind, path);
  if (!limit) return null;
  const ok =
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= limit.min &&
    value <= limit.max &&
    (!limit.whole || Number.isInteger(value));
  return ok ? null : describe(limit);
}

/** The nearest allowed value (whole-number fields rounded first), or null for NaN or ±Infinity. */
export function clampConfigValue(kind: ComponentKind, path: string, value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const limit = limitFor(kind, path);
  if (!limit) return value;
  const n = limit.whole ? Math.round(value) : value;
  return Math.min(limit.max, Math.max(limit.min, n));
}

/** What an inspector field's text saves: the clamped number, or null for empty or non-numeric text. */
export function parseConfigInput(kind: ComponentKind, path: string, text: string): number | null {
  if (text.trim() === "") return null;
  return clampConfigValue(kind, path, Number(text));
}

/** Every numeric field of a config as [path, value], nested ones by dotted path. */
export function numericConfigFields(config: Obj, prefix = ""): [string, unknown][] {
  return Object.entries(config).flatMap(([key, value]): [string, unknown][] => {
    if (isObj(value)) return numericConfigFields(value, `${prefix}${key}.`);
    return typeof value === "number" ? [[`${prefix}${key}`, value]] : [];
  });
}

/**
 * A config patch with each limited number clamped and each non-finite one dropped (so the
 * field keeps its value), nested objects field by field. Other fields pass through.
 */
export function clampPatch(kind: ComponentKind, patch: Obj, prefix = ""): Obj {
  const out: Obj = {};
  for (const [key, value] of Object.entries(patch)) {
    const path = `${prefix}${key}`;
    if (isObj(value)) {
      out[key] = clampPatch(kind, value, `${path}.`);
    } else if (typeof value === "number") {
      const clamped = clampConfigValue(kind, path, value);
      if (clamped !== null) out[key] = clamped;
    } else {
      out[key] = value;
    }
  }
  return out;
}
