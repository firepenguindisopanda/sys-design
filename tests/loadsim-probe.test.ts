import { it } from "vitest";
import { defaultScenario } from "@/lib/loadsim/scenario";
import { challenges, runDesign } from "@/test/loadsim-designs";
import { buildDesign } from "@/lib/challenges/design";

// Authoring aid, skipped by default. Prints the load simulation's results for each
// fixture under its brief's default scenario, to calibrate a brief's `load` block:
//   LOADSIM_PROBE=1 npx vitest run tests/loadsim-probe.test.ts --reporter=verbose
// Narrow it to some briefs with LOADSIM_BRIEFS=link-shortener,course-registration.
it.runIf(process.env.LOADSIM_PROBE)("print load simulation results", () => {
  const only = process.env.LOADSIM_BRIEFS?.split(",");
  for (const { brief, fixtures } of challenges) {
    if (only && !only.includes(brief.id)) continue;
    const scenario = defaultScenario(brief);
    console.log(`\n== ${brief.id}: ${scenario.requests} requests over ${scenario.windowSeconds} s, ${scenario.shape}`);
    for (const fixture of fixtures) {
      const { summary: s } = runDesign(buildDesign(brief, fixture), scenario, { brief });
      const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
      const headline = s.firstSaturation
        ? `first saturation ${s.firstSaturation.nodeId} at ${s.firstSaturation.atSeconds.toFixed(0)} s`
        : `busiest ${s.busiest?.nodeId ?? "-"}`;
      console.log(
        `${fixture.name}: served ${pct(s.served / s.requests)}, failed ${Math.round(s.failed)}, ` +
          `p50 ${s.p50Ms} ms, p95 ${s.p95Ms} ms, ${headline}`,
      );
      const peaks = Object.entries(s.perNode)
        .filter(([, n]) => n.peakUtilisation > 0)
        .map(([id, n]) => `${id} ${pct(n.peakUtilisation)}`)
        .join(", ");
      console.log(`  peak utilisation: ${peaks}`);
      if (s.jobs) {
        const j = s.jobs;
        const queues = Object.entries(j.perQueue)
          .map(([id, q]) => `${id} peak ${Math.round(q.peakBacklog)}${q.emptyAt === null ? "" : ` empty at ${q.emptyAt.toFixed(0)} s`}`)
          .join(", ");
        console.log(
          `  jobs: queued ${Math.round(j.queued)}, done ${Math.round(j.done)}, still waiting ${Math.round(j.stillWaiting)}, ` +
            `never done ${Math.round(j.neverDone)}, p50 ${j.p50Ms} ms, p95 ${j.p95Ms} ms; ${queues}`,
        );
      }
      for (const f of s.failures) console.log(`  failed ${Math.round(f.count)}: ${f.text}`);
      for (const n of s.notes) console.log(`  note: ${n}`);
    }
  }
});
