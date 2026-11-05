"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LoadShape } from "@/lib/challenges/types";
import type { Scenario } from "@/lib/loadsim/types";
import { SECTION_LABEL } from "@/components/simulator/styles";

const LIMITS = {
  requests: { min: 1_000, max: 1_000_000 },
  windowSeconds: { min: 60, max: 3_600 },
};

const SHAPES: { value: LoadShape; label: string }[] = [
  { value: "spike", label: "Spike: half in the first quarter" },
  { value: "steady", label: "Steady" },
  { value: "ramp", label: "Ramp: rising from zero" },
];

const clamp = (n: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, n));

/** A typed field's value, kept within the page's limits; null when it isn't a number. */
export function parseScenarioField(field: "requests" | "windowMinutes", text: string): number | null {
  const n = Number(text.replace(/,/g, "").trim());
  if (text.trim() === "" || !Number.isFinite(n)) return null;
  return field === "requests"
    ? clamp(Math.round(n), LIMITS.requests)
    : clamp(Math.round(n * 60), LIMITS.windowSeconds);
}

const inputClass =
  "h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 focus-visible:border-teal-700 focus-visible:ring-2 focus-visible:ring-teal-700/30 focus-visible:outline-none";
const labelClass = "mb-1 block text-xs font-medium text-slate-700";

/**
 * The load to send. Typed numbers apply when the field loses focus or on Enter; anything
 * out of range is brought within it, and anything that isn't a number puts the field back.
 */
export function ScenarioControls({
  scenario,
  defaults,
  onChange,
  sandbox = false,
}: {
  scenario: Scenario;
  defaults: Scenario;
  onChange: (next: Scenario) => void;
  sandbox?: boolean;
}) {
  const commit = (field: "requests" | "windowMinutes", input: HTMLInputElement) => {
    const value = parseScenarioField(field, input.value);
    const next =
      value === null
        ? scenario
        : field === "requests"
          ? { ...scenario, requests: value }
          : { ...scenario, windowSeconds: value };
    input.value = field === "requests" ? next.requests.toLocaleString("en") : String(next.windowSeconds / 60);
    if (next !== scenario) onChange(next);
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
  };
  const isDefault =
    scenario.requests === defaults.requests &&
    scenario.windowSeconds === defaults.windowSeconds &&
    scenario.shape === defaults.shape;

  return (
    <section aria-labelledby="load-scenario-heading" className="space-y-3">
      <h2 id="load-scenario-heading" className={SECTION_LABEL}>
        Load
      </h2>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="load-requests" className={labelClass}>
            Requests
          </label>
          <input
            id="load-requests"
            key={`r-${scenario.requests}`}
            type="text"
            inputMode="numeric"
            defaultValue={scenario.requests.toLocaleString("en")}
            onBlur={(e) => commit("requests", e.currentTarget)}
            onKeyDown={onKey}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="load-window" className={labelClass}>
            Window (minutes)
          </label>
          <input
            id="load-window"
            key={`w-${scenario.windowSeconds}`}
            type="text"
            inputMode="decimal"
            defaultValue={String(scenario.windowSeconds / 60)}
            onBlur={(e) => commit("windowMinutes", e.currentTarget)}
            onKeyDown={onKey}
            className={inputClass}
          />
        </div>
      </div>
      {/* Its own row: the shape descriptions don't fit half the panel. */}
      <div>
        <label htmlFor="load-shape" className={labelClass}>
          Shape
        </label>
        <select
          id="load-shape"
          value={scenario.shape}
          onChange={(e) => onChange({ ...scenario, shape: e.target.value as LoadShape })}
          className={inputClass}
        >
          {SHAPES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 text-xs"
        disabled={isDefault}
        onClick={() => onChange(defaults)}
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        Reset to {sandbox ? "sandbox" : "brief"} default
      </Button>
    </section>
  );
}
