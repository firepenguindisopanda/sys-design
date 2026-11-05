import { isClientKind } from "@/lib/catalog";
import type { LoadRun, SimNode } from "@/lib/loadsim/types";
import { formatClock } from "./playback-bar";

const count = (n: number) => Math.round(n).toLocaleString("en");

/**
 * Each component's run in numbers: the accessible alternative to the animation, and a
 * way to compare components at a glance. Clients send rather than serve, so they're left out.
 */
export function NodeStatsTable({ run, nodes }: { run: LoadRun; nodes: SimNode[] }) {
  const rows = nodes.filter((n) => !isClientKind(n.data.componentKind));
  const notSimulated = new Set(run.summary.notSimulated.map((n) => n.id));
  return (
    <table className="w-full text-left text-xs text-slate-700">
      <caption className="px-3 py-2 text-left text-xs font-semibold text-slate-600">
        Each component over the whole run
      </caption>
      <thead className="bg-slate-50 text-slate-500">
        <tr>
          {["Component", "Peak busy", "Peak waiting", "Served", "Failed", "First saturated"].map((h) => (
            <th key={h} scope="col" className="px-3 py-1.5 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((n) => {
          const s = run.summary.perNode[n.id];
          const idle = notSimulated.has(n.id);
          return (
            <tr key={n.id} className="border-t border-slate-100">
              <th scope="row" className="px-3 py-1.5 font-medium text-slate-900">
                {n.data.label}
              </th>
              <td className="px-3 py-1.5 tabular-nums">{idle ? "not simulated" : `${Math.round(s.peakUtilisation * 100)}%`}</td>
              <td className="px-3 py-1.5 tabular-nums">{count(s.peakBacklog)}</td>
              <td className="px-3 py-1.5 tabular-nums">{count(s.served)}</td>
              <td className={`px-3 py-1.5 tabular-nums ${s.failed >= 0.5 ? "text-red-700" : ""}`}>{count(s.failed)}</td>
              <td className="px-3 py-1.5 tabular-nums">
                {s.firstSaturatedAt === null ? "—" : formatClock(s.firstSaturatedAt)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
