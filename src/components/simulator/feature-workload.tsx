"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FeatureBlock } from "@/lib/types";

type WorkloadKey = "backgroundWorkMs" | "pollingRpm" | "fileRpm" | "writeRpm";
export type WorkloadPatch = Partial<Pick<FeatureBlock, WorkloadKey>>;

const FIELDS: { key: WorkloadKey; label: string; unit: string; help: string }[] = [
  {
    key: "backgroundWorkMs",
    label: "Slow work",
    unit: "ms",
    help: "Slow work this request starts, in ms. The request waits for it unless a task worker takes it from a queue.",
  },
  {
    key: "pollingRpm",
    label: "If polled",
    unit: "req/min",
    help: "Requests per minute if clients poll for updates. Counts instead of Target RPM unless the server pushes to them.",
  },
  {
    key: "fileRpm",
    label: "Files",
    unit: "req/min",
    help: "File requests per minute (pages, scripts, video). Your servers serve them unless clients get them from static hosting or through a CDN in front of a store.",
  },
  {
    key: "writeRpm",
    label: "Writes",
    unit: "req/min",
    help: "Requests per minute that write to the database. Only shards take writes, about 400 a minute each; caches and replicas only help reads.",
  },
];

/** A typed value the engine accepts (a number ≥ 1), or undefined for "not set". */
export function parseWorkloadInput(text: string): number | undefined {
  if (text.trim() === "") return undefined;
  const n = Number(text);
  return Number.isFinite(n) && n >= 1 ? n : undefined;
}

/**
 * The optional workload fields on a feature card (SPEC-workload-fields.md): editable in
 * the sandbox; in a challenge, read-only and only the ones the brief sets.
 */
export function FeatureWorkload({
  feature,
  locked,
  onChange,
}: {
  feature: FeatureBlock;
  locked: boolean;
  onChange: (patch: WorkloadPatch) => void;
}) {
  // While a box is being edited it shows what was typed, even text that parses to
  // "not set" (like "0.5" on the way to "05"); on blur it shows the stored value again.
  const [drafts, setDrafts] = useState<Partial<Record<WorkloadKey, string>>>({});

  const fields = locked ? FIELDS.filter((f) => feature[f.key] !== undefined) : FIELDS;
  if (fields.length === 0) return null;

  return (
    <div className="mt-2 grid grid-cols-3 gap-1.5">
      {fields.map(({ key, label, unit, help }) => (
        <div key={key} className="space-y-0.5" title={help}>
          <Label className="text-[10px] text-slate-500">{label}</Label>
          <Input
            type="number"
            min={1}
            placeholder={unit}
            value={drafts[key] ?? feature[key] ?? ""}
            onChange={(e) => {
              setDrafts((d) => ({ ...d, [key]: e.target.value }));
              onChange({ [key]: parseWorkloadInput(e.target.value) });
            }}
            onBlur={() =>
              setDrafts((d) => {
                const rest = { ...d };
                delete rest[key];
                return rest;
              })
            }
            disabled={locked}
            className="h-7 text-[11px]"
          />
        </div>
      ))}
    </div>
  );
}
