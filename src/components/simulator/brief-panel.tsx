import type { Brief } from "@/lib/challenges/types";
import { SECTION_LABEL } from "./styles";

/**
 * The scenario text of a challenge. Rules are left out on purpose: they read like
 * hints, so students meet them as verification rows after a run.
 */
export function BriefPanel({ brief }: { brief: Brief }) {
  return (
    <div className="flex h-full flex-col bg-[var(--panel)]">
      <div className="border-b border-slate-200 px-3 py-3">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-tight text-slate-900">
          {brief.title}
        </h2>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{brief.tagline}</p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        <section className="space-y-1.5">
          <div className={SECTION_LABEL}>Scenario</div>
          <p className="text-xs leading-relaxed text-slate-700">{brief.summary}</p>
        </section>

        {brief.outOfScope.length > 0 && (
          <section className="space-y-1.5">
            <div className={SECTION_LABEL}>Out of scope</div>
            <ul className="list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-slate-600">
              {brief.outOfScope.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        )}

        {brief.reflection.length > 0 && (
          <section className="space-y-1.5">
            <div className={SECTION_LABEL}>Think about</div>
            <p className="text-[10px] leading-snug text-slate-500">
              Not graded; use them to check your design.
            </p>
            <ol className="list-decimal space-y-1 pl-4 text-[11px] leading-snug text-slate-600">
              {brief.reflection.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ol>
            <p className="text-[10px] leading-snug text-slate-500">
              After a run, scenario checks you haven&apos;t met appear as hints you can open one
              at a time.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
