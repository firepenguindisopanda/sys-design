import { X } from "lucide-react";
import { SECTION_LABEL } from "@/components/simulator/styles";
import type { Outage } from "@/lib/loadsim/outages";
import { formatClock } from "./playback-bar";

/** What a screen reader hears when a power button is pressed (SPEC-loadsim-failures.md). */
export function outageAnnouncement(label: string, nowOff: boolean, seconds: number): string {
  return nowOff ? `${label} switched off at ${formatClock(seconds)}.` : `${label} back at ${formatClock(seconds)}.`;
}

/** The components the student has switched off, earliest first, each removable. */
export function OutageList({
  outages,
  label,
  onRemove,
  onClear,
}: {
  outages: Outage[];
  label: (nodeId: string) => string;
  onRemove: (outage: Outage) => void;
  onClear: () => void;
}) {
  if (outages.length === 0) return null;
  const ordered = [...outages].sort((a, b) => a.offAt - b.offAt || a.nodeId.localeCompare(b.nodeId));
  return (
    <section aria-labelledby="outages-heading" className="space-y-2 text-sm text-slate-700">
      <div className="flex items-center justify-between">
        <h2 id="outages-heading" className={SECTION_LABEL}>
          Outages
        </h2>
        <button
          type="button"
          onClick={onClear}
          className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-teal-700"
        >
          Clear all
        </button>
      </div>
      <ul className="space-y-1">
        {ordered.map((o) => {
          const name = label(o.nodeId);
          const when = `off ${formatClock(o.offAt)}${o.onAt === null ? "" : `, back ${formatClock(o.onAt)}`}`;
          return (
            <li key={`${o.nodeId}@${o.offAt}`} className="flex items-center justify-between gap-2">
              <span>
                {name}: {when}
              </span>
              <button
                type="button"
                aria-label={`Remove ${name}'s outage at ${formatClock(o.offAt)}`}
                onClick={() => onRemove(o)}
                className="shrink-0 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-teal-700"
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
