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
  const requestReplace = useSimulatorStore((s) => s.requestReplace);

  // Lets <SelectValue> show titles instead of ids.
  const items: Record<string, string> = { [SANDBOX]: "Sandbox" };
  for (const b of briefs) items[b.id] = b.title;

  return (
    // min-w-0 and max-w-full let the tagline truncate when the inspector card narrows the toolbar.
    <div className="pointer-events-auto flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-slate-200 bg-white/95 px-2 py-1 shadow-sm backdrop-blur">
      <Target className="h-3.5 w-3.5 text-teal-700" aria-hidden />
      <span className="text-[10px] font-medium text-slate-500">Challenge</span>
      <Select
        items={items}
        value={challenge?.id ?? SANDBOX}
        onValueChange={(v) => {
          if (!v || v === (challenge?.id ?? SANDBOX)) return;
          const brief = briefs.find((b) => b.id === v);
          // The select stays on the current mode until the store changes, so a
          // cancelled request leaves it where it was.
          if (brief) {
            requestReplace("replace", `Starting “${brief.title}” replaces your design.`, () =>
              startChallenge(brief),
            );
          } else {
            requestReplace(
              "replace",
              "Going back to the sandbox loads the BeUWI demo in place of your design.",
              leaveChallenge,
            );
          }
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
        <span className="hidden max-w-[16rem] min-w-0 truncate text-[10px] text-slate-500 md:inline">
          {challenge.tagline}
        </span>
      ) : null}
    </div>
  );
}
