"use client";

import { Target } from "lucide-react";
import { useSimulatorStore } from "@/lib/store";
import type { Brief } from "@/lib/challenges/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SANDBOX = "sandbox";

/** Choose the sandbox or a challenge brief; starting one replaces the canvas. */
export function ChallengePicker({ briefs }: { briefs: Brief[] }) {
  const challenge = useSimulatorStore((s) => s.challenge);
  const startChallenge = useSimulatorStore((s) => s.startChallenge);
  const leaveChallenge = useSimulatorStore((s) => s.leaveChallenge);

  // Lets <SelectValue> show titles instead of ids.
  const items: Record<string, string> = { [SANDBOX]: "Sandbox" };
  for (const b of briefs) items[b.id] = b.title;

  return (
    <div className="pointer-events-auto flex items-center gap-1.5 rounded-md border border-slate-200 bg-white/95 px-2 py-1 shadow-sm backdrop-blur">
      <Target className="h-3.5 w-3.5 text-teal-700" aria-hidden />
      <span className="text-[10px] font-medium text-slate-500">Challenge</span>
      <Select
        items={items}
        value={challenge?.id ?? SANDBOX}
        onValueChange={(v) => {
          if (!v || v === (challenge?.id ?? SANDBOX)) return;
          const brief = briefs.find((b) => b.id === v);
          if (brief) startChallenge(brief);
          else leaveChallenge();
        }}
      >
        <SelectTrigger
          aria-label="Challenge"
          className="h-7 w-[13rem] border-0 bg-transparent text-[11px] shadow-none"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SANDBOX}>Sandbox</SelectItem>
          {briefs.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {challenge ? (
        <span className="hidden max-w-[16rem] truncate text-[10px] text-slate-500 md:inline">
          {challenge.tagline}
        </span>
      ) : null}
    </div>
  );
}
