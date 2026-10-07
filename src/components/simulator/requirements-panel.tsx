"use client";

import { useState } from "react";
import { useSimulatorStore } from "@/lib/store";
import { isComputeKind } from "@/lib/catalog";
import { remainingCapacity } from "@/lib/simulation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2 } from "lucide-react";
import { NodeInspector } from "./node-inspector";

export function RequirementsPanel() {
  const [reqText, setReqText] = useState("");
  const [placeError, setPlaceError] = useState<string | null>(null);

  const functionalReqs = useSimulatorStore((s) => s.functionalReqs);
  const features = useSimulatorStore((s) => s.features);
  const nodes = useSimulatorStore((s) => s.nodes);
  const nfr = useSimulatorStore((s) => s.nfr);
  const addFunctionalRequirement = useSimulatorStore((s) => s.addFunctionalRequirement);
  const removeFunctionalRequirement = useSimulatorStore((s) => s.removeFunctionalRequirement);
  const updateFeature = useSimulatorStore((s) => s.updateFeature);
  const placeFeature = useSimulatorStore((s) => s.placeFeature);
  const setNfr = useSimulatorStore((s) => s.setNfr);

  const computeNodes = nodes.filter((n) => isComputeKind(n.data.componentKind));

  return (
    <aside className="flex h-full flex-col border-l border-slate-200 bg-[var(--panel)]">
      <div className="border-b border-slate-200 px-3 py-3">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-tight text-slate-900">
          Requirements
        </h2>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
          Map functional needs to feature blocks, place them on compute, set NFRs.
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        <section className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Functional → features
          </div>
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!reqText.trim()) return;
              addFunctionalRequirement(reqText.trim());
              setReqText("");
            }}
          >
            <Input
              value={reqText}
              onChange={(e) => setReqText(e.target.value)}
              placeholder="e.g. Real-time coupon delivery"
              className="h-8 text-xs"
            />
            <Button type="submit" size="sm" className="h-8 shrink-0 bg-teal-700 hover:bg-teal-800">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </form>

          <ul className="space-y-2">
            {functionalReqs.map((req) => {
              const feature = features.find((f) => f.id === req.featureId);
              if (!feature) return null;
              return (
                <li
                  key={req.id}
                  className="rounded-md border border-slate-200 bg-white p-2.5 shadow-none"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium leading-snug text-slate-800">{req.text}</p>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0 text-slate-400"
                      onClick={() => removeFunctionalRequirement(req.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>

                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {(
                      [
                        ["memoryGb", "Mem"],
                        ["vcpus", "vCPU"],
                        ["storageGb", "Disk"],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key} className="space-y-0.5">
                        <Label className="text-[10px] text-slate-500">{label}</Label>
                        <Input
                          type="number"
                          min={0}
                          step={0.5}
                          value={feature.resources[key]}
                          onChange={(e) =>
                            updateFeature(feature.id, {
                              resources: {
                                ...feature.resources,
                                [key]: Number(e.target.value),
                              },
                            })
                          }
                          className="h-7 text-[11px]"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <div className="space-y-0.5">
                      <Label className="text-[10px] text-slate-500">Target RPM</Label>
                      <Input
                        type="number"
                        min={1}
                        value={feature.targetRpm}
                        onChange={(e) =>
                          updateFeature(feature.id, { targetRpm: Number(e.target.value) })
                        }
                        className="h-7 text-[11px]"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[10px] text-slate-500">Place on compute</Label>
                      <Select
                        value={feature.placedOnNodeId ?? "unplaced"}
                        onValueChange={(v) => {
                          const result = placeFeature(
                            feature.id,
                            v === "unplaced" ? null : v,
                          );
                          setPlaceError(result.ok ? null : result.reason ?? "Cannot place");
                        }}
                      >
                        <SelectTrigger className="h-7 text-[11px]">
                          <SelectValue placeholder="Unplaced" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unplaced">Unplaced</SelectItem>
                          {computeNodes.map((n) => {
                            const rem = remainingCapacity(n, features);
                            return (
                              <SelectItem key={n.id} value={n.id}>
                                {n.data.label}
                                {rem
                                  ? ` (${rem.vcpus.toFixed(1)} vCPU left)`
                                  : ""}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {feature.placedOnNodeId ? (
                    <Badge
                      variant="secondary"
                      className="mt-2 bg-teal-50 text-[10px] text-teal-800"
                    >
                      Placed
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="mt-2 bg-amber-50 text-[10px] text-amber-900"
                    >
                      Needs placement
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
          {placeError && (
            <p className="text-[11px] text-red-600">{placeError}</p>
          )}
        </section>

        <Separator />

        <section className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Non-functional
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px]">Max latency (ms)</Label>
              <Input
                type="number"
                value={nfr.maxLatencyMs}
                onChange={(e) => setNfr({ maxLatencyMs: Number(e.target.value) })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Min throughput (RPM)</Label>
              <Input
                type="number"
                value={nfr.minThroughputRpm}
                onChange={(e) => setNfr({ minThroughputRpm: Number(e.target.value) })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Min availability %</Label>
              <Input
                type="number"
                step={0.01}
                value={nfr.minAvailabilityPct}
                onChange={(e) => setNfr({ minAvailabilityPct: Number(e.target.value) })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Max cost $/mo</Label>
              <Input
                type="number"
                value={nfr.maxMonthlyCostUsd ?? ""}
                placeholder="optional"
                onChange={(e) =>
                  setNfr({
                    maxMonthlyCostUsd:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="h-8 text-xs"
              />
            </div>
          </div>
          <p className="text-[10px] leading-snug text-slate-500">
            Defaults mirror BeUWI case study from the PDF (query &lt; 500ms, high search traffic).
          </p>
        </section>

        <Separator />

        <section className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Node inspector
          </div>
          <NodeInspector />
        </section>
      </div>
    </aside>
  );
}
