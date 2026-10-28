"use client";

import { useState } from "react";
import { countResults, orderResults, summarizeCounts, type ResultRow } from "@/lib/results";
import { useSimulatorStore } from "@/lib/store";
import type { CheckStatus, VerificationResult } from "@/lib/types";
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

const RESULTS_ID = "verification-results";

const STATUS_SPOKEN: Record<CheckStatus, string> = {
  fail: "Failed:",
  warn: "Warning:",
  pass: "Passed:",
};

export function VerificationPanel() {
  const run = useSimulatorStore((s) => s.runVerification);
  const verification = useSimulatorStore((s) => s.verification);
  const ruleResults = useSimulatorStore((s) => s.ruleResults);
  const stale = useSimulatorStore((s) => s.verification !== null && s.resultsAreStale());
  // Hidden only for the result it was hidden on, so a new run shows the panel again.
  const [hiddenFor, setHiddenFor] = useState<VerificationResult | null>(null);
  const hidden = verification !== null && hiddenFor === verification;
  // The same for the passed rows, so a new run collapses them again.
  const [passedShownFor, setPassedShownFor] = useState<VerificationResult | null>(null);
  const showPassed = verification !== null && passedShownFor === verification;

  const rows = verification ? orderResults(verification.checks, ruleResults) : [];
  const counts = countResults(rows);

  return (
    <div className="border-t border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
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
              {stale && " (old)"}
            </Badge>
          )}
          {verification && (
            <span className="hidden text-[11px] font-medium text-slate-600 sm:inline">
              {summarizeCounts(counts)}
            </span>
          )}
          {verification && (
            <div className="hidden text-[11px] text-slate-500 sm:flex sm:gap-3">
              <span>{verification.estimatedLatencyMs} ms latency</span>
              <span>{verification.estimatedThroughputRpm} RPM capacity</span>
              <span>{verification.estimatedAvailabilityPct}% avail</span>
              <span>${verification.estimatedMonthlyCostUsd}/mo</span>
            </div>
          )}
          {/* Rendered empty from the start so screen readers notice the text arriving. */}
          <span aria-live="polite" className="text-[11px] font-medium text-amber-800">
            {stale && "Design changed since this run."}
          </span>
          <span aria-live="polite" className="sr-only">
            {verification && `Run finished: ${summarizeCounts(counts, ", ")}.`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {verification && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-expanded={!hidden}
              aria-controls={RESULTS_ID}
              onClick={() => setHiddenFor(hidden ? null : verification)}
              className="h-8"
            >
              {hidden ? "Show results" : "Hide results"}
            </Button>
          )}
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
      </div>

      {verification && (
        <div
          id={RESULTS_ID}
          hidden={hidden}
          data-stale={stale || undefined}
          // relative: the rows' sr-only status text is absolutely positioned, and without a
          // positioned ancestor it escapes this scroll box and makes the page scroll.
          className="relative max-h-44 overflow-y-auto border-t border-slate-100 px-4 py-2"
        >
          <ResultRows
            rows={rows}
            stale={stale}
            showPassed={showPassed}
            onTogglePassed={() => setPassedShownFor(showPassed ? null : verification)}
          />
        </div>
      )}
    </div>
  );
}

/** Failures and warnings, then the passes, behind a toggle unless everything passes. */
function ResultRows({
  rows,
  stale,
  showPassed,
  onTogglePassed,
}: {
  rows: ResultRow[];
  stale: boolean;
  showPassed: boolean;
  onTogglePassed: () => void;
}) {
  const passed = rows.filter((r) => r.status === "pass").length;
  const collapsible = passed > 0 && passed < rows.length;
  const shown = collapsible && !showPassed ? rows.filter((r) => r.status !== "pass") : rows;

  return (
    <>
      <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((row) => (
          <li
            key={row.key}
            className={cn(
              "flex gap-2 rounded border px-2.5 py-2",
              // Brief rules, only in a challenge; they count toward the overall result.
              row.rule ? "border-teal-100 bg-teal-50/40" : "border-slate-100 bg-slate-50/80",
              // Old results: dashed outline and grey icons, but the text keeps its contrast.
              stale && "border-dashed border-slate-300",
            )}
          >
            <span className={cn("shrink-0", stale && "opacity-40 grayscale")}>
              <StatusIcon status={row.status} />
            </span>
            <div className="min-w-0">
              {/* A rule's id is on hover for brief authors. */}
              <div className="truncate text-xs font-medium text-slate-800" title={row.ruleId}>
                {/* The icon alone doesn't tell a screen reader the status. */}
                <span className="sr-only">{STATUS_SPOKEN[row.status]} </span>
                {row.title}
              </div>
              <div className="mt-0.5 text-[10px] leading-snug text-slate-500">
                {row.detail}
              </div>
              {(row.actual || row.target) && (
                <div className="mt-1 text-[10px] text-slate-600">
                  {row.actual && <span>Actual {row.actual}</span>}
                  {row.actual && row.target && <span> · </span>}
                  {row.target && <span>Target {row.target}</span>}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {collapsible && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-expanded={showPassed}
          onClick={onTogglePassed}
          className="mt-1.5 h-7 text-xs text-slate-600"
        >
          {showPassed ? "Hide passed" : `Show ${passed} passed`}
        </Button>
      )}
    </>
  );
}
