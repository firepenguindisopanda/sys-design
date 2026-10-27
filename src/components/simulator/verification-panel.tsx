"use client";

import { useSimulatorStore } from "@/lib/store";
import type { CheckStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, CircleAlert, Play } from "lucide-react";

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "pass") return <CheckCircle2 className="h-4 w-4 text-teal-600" />;
  if (status === "warn") return <CircleAlert className="h-4 w-4 text-amber-500" />;
  return <AlertCircle className="h-4 w-4 text-red-500" />;
}

function statusLabel(status: CheckStatus) {
  if (status === "pass") return "Pass";
  if (status === "warn") return "Warn";
  return "Fail";
}

export function VerificationPanel() {
  const run = useSimulatorStore((s) => s.runVerification);
  const verification = useSimulatorStore((s) => s.verification);
  const ruleResults = useSimulatorStore((s) => s.ruleResults);

  return (
    <div className="border-t border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold text-slate-900">
            Verification run
          </h2>
          {verification && (
            <Badge
              className={cn(
                "text-[10px]",
                verification.overall === "pass" && "bg-teal-100 text-teal-900",
                verification.overall === "warn" && "bg-amber-100 text-amber-900",
                verification.overall === "fail" && "bg-red-100 text-red-900",
              )}
            >
              {statusLabel(verification.overall)}
            </Badge>
          )}
          {verification && (
            <div className="hidden text-[11px] text-slate-500 sm:flex sm:gap-3">
              <span>{verification.estimatedLatencyMs} ms latency</span>
              <span>{verification.estimatedThroughputRpm} RPM capacity</span>
              <span>{verification.estimatedAvailabilityPct}% avail</span>
              <span>${verification.estimatedMonthlyCostUsd}/mo</span>
            </div>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          onClick={run}
          className="h-8 gap-1.5 bg-teal-700 hover:bg-teal-800"
        >
          <Play className="h-3.5 w-3.5" />
          Run simulation
        </Button>
      </div>

      {verification && (
        <div className="max-h-44 overflow-y-auto border-t border-slate-100 px-4 py-2">
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {verification.checks.map((check) => (
              <li
                key={check.id}
                className="flex gap-2 rounded border border-slate-100 bg-slate-50/80 px-2.5 py-2"
              >
                <StatusIcon status={check.status} />
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-slate-800">
                    {check.title}
                  </div>
                  <div className="mt-0.5 text-[10px] leading-snug text-slate-500">
                    {check.detail}
                  </div>
                  {(check.actual || check.target) && (
                    <div className="mt-1 text-[10px] text-slate-600">
                      {check.actual && <span>Actual {check.actual}</span>}
                      {check.actual && check.target && <span> · </span>}
                      {check.target && <span>Target {check.target}</span>}
                    </div>
                  )}
                </div>
              </li>
            ))}
            {/* Brief rules, only in a challenge; they count toward the overall result. */}
            {ruleResults?.map((rule) => (
              <li
                key={`rule-${rule.id}`}
                className="flex gap-2 rounded border border-teal-100 bg-teal-50/40 px-2.5 py-2"
              >
                <StatusIcon status={rule.status} />
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-slate-800">
                    Brief rule: {rule.id}
                  </div>
                  <div className="mt-0.5 text-[10px] leading-snug text-slate-500">
                    {rule.detail}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
