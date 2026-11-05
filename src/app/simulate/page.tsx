import path from "node:path";
import type { Metadata } from "next";
import { LoadSimApp } from "@/components/loadsim/load-sim-app";
import { loadChallenges } from "@/lib/challenges/load";

export const metadata: Metadata = {
  title: "Load simulation — Sesim",
  description: "Send a large load through your design and watch how each component copes.",
};

export default function SimulatePage() {
  // Briefs only, as on the editor page: a challenge design needs its brief to rebuild.
  const briefs = loadChallenges(path.join(process.cwd(), "challenges")).map((c) => c.brief);
  return <LoadSimApp briefs={briefs} />;
}
