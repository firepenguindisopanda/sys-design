import path from "node:path";
import { it } from "vitest";
import { loadChallenges } from "@/lib/challenges/load";
import { runFixture } from "@/lib/challenges/run";

// Authoring aid, skipped by default. Prints engine estimates and every
// non-passing check for each fixture, to calibrate a brief's NFRs:
//   PROBE=1 npx vitest run tests/probe.test.ts --reporter=verbose
it.runIf(process.env.PROBE)("print fixture estimates", () => {
  for (const { brief, fixtures } of loadChallenges(path.resolve(__dirname, "../challenges"))) {
    for (const fixture of fixtures) {
      const { verification: v, statuses, mismatches } = runFixture(brief, fixture);
      console.log(
        `\n${brief.id}/${fixture.name}: latency ${v.estimatedLatencyMs} ms, ` +
          `throughput ${v.estimatedThroughputRpm} rpm, availability ${v.estimatedAvailabilityPct}%, ` +
          `cost $${v.estimatedMonthlyCostUsd}/mo`,
      );
      for (const [id, s] of statuses) {
        if (s.status !== "pass") console.log(`  ${s.status} ${id}: ${s.detail}`);
      }
      for (const m of mismatches) console.log(`  MISMATCH ${m}`);
    }
  }
});
