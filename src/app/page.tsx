import path from "node:path";
import { SimulatorApp } from "@/components/simulator/simulator-app";
import { loadChallenges } from "@/lib/challenges/load";
import { EARLY_CLICK_SCRIPT } from "@/lib/early-click";

export default function Home() {
  // Read at build time (and per request in dev). Only briefs go to the browser:
  // fixtures include the reference designs, which are the answers.
  const briefs = loadChallenges(path.join(process.cwd(), "challenges")).map((c) => c.brief);
  return (
    <>
      {/* Runs as the HTML is parsed, so a click on Run simulation before React is ready
          isn't lost (src/lib/early-click.ts). */}
      <script dangerouslySetInnerHTML={{ __html: EARLY_CLICK_SCRIPT }} />
      <SimulatorApp briefs={briefs} />
    </>
  );
}
