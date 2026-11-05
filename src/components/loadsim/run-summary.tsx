import { SECTION_LABEL } from "@/components/simulator/styles";
import type { LoadRun } from "@/lib/loadsim/types";

const count = (n: number) => Math.round(n).toLocaleString("en");
const share = (part: number, whole: number) => `${Number(((part / Math.max(whole, 1)) * 100).toFixed(1))}%`;
const ms = (n: number) => `${Number(n.toFixed(1)).toLocaleString("en")} ms`;

/** What a screen reader hears as playback passes a moment worth telling. */
export function announcementFor(previousStep: number, step: number, run: LoadRun): string | null {
  const first = run.summary.firstSaturation;
  if (first) {
    const at = Math.round(first.atSeconds / run.dtSeconds);
    // Just the "<node> saturated at m:ss" part of the note.
    if (previousStep < at && step >= at) return `${/^.* saturated at \d+:\d{2}/.exec(first.note)?.[0] ?? first.note}.`;
  }
  const last = run.frames.length - 1;
  const jobs = run.summary.jobs;
  if (previousStep < last && step >= last) {
    const served = `${share(run.summary.served, run.summary.requests)} of requests served`;
    return jobs ? `Playback finished: ${served}, ${count(jobs.done)} of ${count(jobs.queued)} jobs done.` : `Playback finished: ${served}.`;
  }
  // Requests stop at the end of the window; with jobs still waiting, the run drains on.
  const end = run.windowSteps;
  if (jobs && end < last && previousStep < end && step >= end && jobsWaitingAt(run, end) >= 0.5) {
    return "Requests stopped arriving; the queues are draining.";
  }
  return null;
}

/** Jobs waiting on any queue at a step, never-done jobs left out. */
function jobsWaitingAt(run: LoadRun, step: number): number {
  const frame = run.frames[step];
  if (!frame || !run.summary.jobs) return 0;
  return Object.entries(run.summary.jobs.perQueue).reduce(
    (sum, [id, q]) => sum + Math.max(0, (frame.nodes[id]?.backlog ?? 0) - q.neverDone),
    0,
  );
}

/** A job's time to done: milliseconds, seconds, or minutes and seconds. */
function duration(msValue: number): string {
  if (msValue < 1000) return ms(msValue);
  const seconds = Math.round(msValue / 1000);
  if (seconds < 60) return `${seconds} s`;
  const rest = seconds % 60;
  return rest === 0 ? `${Math.floor(seconds / 60)} min` : `${Math.floor(seconds / 60)} min ${rest} s`;
}

/** The whole run in words: what was served, what failed and why, and what to look at. */
export function RunSummary({ run }: { run: LoadRun }) {
  const s = run.summary;
  // A cache note already opens with "<database> peaked at N% busy", so don't say it twice.
  const busiest = s.busiest && !s.notes.some((n) => n.startsWith(s.busiest!.note.slice(0, -1))) ? s.busiest.note : null;
  const headline = s.firstSaturation?.note ?? busiest;
  return (
    <section aria-labelledby="load-summary-heading" className="space-y-3 text-sm text-slate-700">
      <h2 id="load-summary-heading" className={SECTION_LABEL}>
        What happened
      </h2>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
        <dt className="text-slate-500">Served</dt>
        <dd className="text-right tabular-nums">
          {count(s.served)} ({share(s.served, s.requests)})
        </dd>
        <dt className="text-slate-500">Failed</dt>
        <dd className="text-right tabular-nums">
          {count(s.failed)} ({share(s.failed, s.requests)})
        </dd>
        <dt className="text-slate-500">Typical answer (p50)</dt>
        <dd className="text-right tabular-nums">{ms(s.p50Ms)}</dd>
        <dt className="text-slate-500">Slowest 5% (p95)</dt>
        <dd className="text-right tabular-nums">{ms(s.p95Ms)}</dd>
      </dl>
      {headline ? <p className="rounded-md bg-slate-50 p-2 text-slate-800">{headline}</p> : null}
      {s.failures.length > 0 ? (
        <ul className="space-y-1">
          {s.failures.map((f) => (
            <li key={`${f.reason}|${f.nodeId}|${f.clientId}|${f.featureId}`} className="flex gap-2">
              <span className="shrink-0 tabular-nums text-red-700">{count(f.count)}</span>
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {s.jobs ? (
        <div>
          <h3 className="mb-1 text-xs font-semibold text-slate-600">Background jobs</h3>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            <dt className="text-slate-500">Queued</dt>
            <dd className="text-right tabular-nums">{count(s.jobs.queued)}</dd>
            <dt className="text-slate-500">Done</dt>
            <dd className="text-right tabular-nums">{count(s.jobs.done)}</dd>
            {s.jobs.stillWaiting >= 0.5 ? (
              <>
                <dt className="text-slate-500">Still waiting</dt>
                <dd className="text-right tabular-nums text-amber-700">{count(s.jobs.stillWaiting)}</dd>
              </>
            ) : null}
            {s.jobs.neverDone >= 0.5 ? (
              <>
                <dt className="text-slate-500">Never done</dt>
                <dd className="text-right tabular-nums text-red-700">{count(s.jobs.neverDone)}</dd>
              </>
            ) : null}
            {s.jobs.done >= 0.5 ? (
              <>
                <dt className="text-slate-500">Typical time to done</dt>
                <dd className="text-right tabular-nums">{duration(s.jobs.p50Ms)}</dd>
                <dt className="text-slate-500">Slowest 5%</dt>
                <dd className="text-right tabular-nums">{duration(s.jobs.p95Ms)}</dd>
              </>
            ) : null}
          </dl>
        </div>
      ) : null}
      {s.notes.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5">
          {s.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      {s.notSimulated.length > 0 ? (
        <div>
          <h3 className="mb-1 text-xs font-semibold text-slate-600">Not simulated yet</h3>
          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
            {s.notSimulated.map((n) => (
              <li key={n.id}>{n.text}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
