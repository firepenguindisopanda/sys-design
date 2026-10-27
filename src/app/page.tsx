import path from "node:path";
import { SimulatorApp } from "@/components/simulator/simulator-app";
import { loadChallenges } from "@/lib/challenges/load";

export default function Home() {
  // Read at build time (and per request in dev). Only briefs go to the browser:
  // fixtures include the reference designs, which are the answers.
  const briefs = loadChallenges(path.join(process.cwd(), "challenges")).map((c) => c.brief);
  return <SimulatorApp briefs={briefs} />;
}
