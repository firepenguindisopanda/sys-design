"use client";

import { useEffect, useMemo, useState } from "react";
import type { Brief } from "@/lib/challenges/types";
import { loadHandoff } from "@/lib/loadsim/handoff";
import { simulateLoad } from "@/lib/loadsim/model";
import { defaultScenario, featureLoads } from "@/lib/loadsim/scenario";
import type { Scenario } from "@/lib/loadsim/types";
import { LoadSimView, type LoadSimState, type SimDesign } from "./load-sim-view";
import { NodeStatsTable } from "./node-stats-table";
import { PlaybackContext, createPlaybackStore, usePlaybackLoop } from "./playback";
import { PlaybackBar } from "./playback-bar";
import { RunSummary, announcementFor } from "./run-summary";
import { ScenarioControls } from "./scenario-controls";
import { SimCanvas } from "./sim-canvas";

/**
 * The /simulate page. The design comes from the editor through session storage, which
 * only the browser has, so the first render (and the prerendered page) says "Loading".
 */
export function LoadSimApp({ briefs }: { briefs: Brief[] }) {
  const [state, setState] = useState<LoadSimState>({ status: "loading" });

  useEffect(() => {
    let next: LoadSimState;
    try {
      const result = loadHandoff(window.sessionStorage, briefs);
      next =
        "loaded" in result
          ? { status: "ready", design: result.loaded }
          : "empty" in result
            ? { status: "empty" }
            : { status: "error", message: result.error };
    } catch {
      next = { status: "error", message: "Your browser blocked session storage, so the design can't be read." };
    }
    setState(next);
  }, [briefs]);

  if (state.status !== "ready") return <LoadSimView state={state} />;
  return <ReadyPage key={state.design.brief?.id ?? "sandbox"} state={state} design={state.design} />;
}

/** A design to simulate: runs the model for the scenario and plays it back. */
function ReadyPage({ state, design }: { state: LoadSimState; design: SimDesign }) {
  const defaults = useMemo(() => defaultScenario(design.brief), [design.brief]);
  const [scenario, setScenario] = useState<Scenario>(defaults);
  const run = useMemo(
    () =>
      simulateLoad({
        nodes: design.nodes,
        edges: design.edges,
        features: design.features,
        scenario,
        loads: featureLoads(design.features, design.brief),
      }),
    [design, scenario],
  );

  const [playback] = useState(createPlaybackStore);
  usePlaybackLoop(playback);

  // Tell screen readers when playback reaches the first saturation, and when it ends.
  // Subscribed before the reset below, so a saturation at 0:00 is announced too.
  const [announcement, setAnnouncement] = useState("");
  useEffect(
    () =>
      playback.subscribe((now, before) => {
        // Going back (a new run, Restart or seeking earlier) starts the story again.
        const previous = now.step < before.step || now.frameCount !== before.frameCount ? -1 : before.step;
        const message = announcementFor(previous, now.step, run);
        if (message) setAnnouncement(message);
      }),
    [playback, run],
  );
  useEffect(() => playback.getState().reset(run.frames.length), [playback, run]);

  return (
    <PlaybackContext.Provider value={playback}>
      <LoadSimView
        state={state}
        canvas={<SimCanvas design={design} run={run} />}
        table={<NodeStatsTable run={run} nodes={design.nodes} />}
        panel={
          <div className="space-y-5 p-4">
            <ScenarioControls scenario={scenario} defaults={defaults} onChange={setScenario} sandbox={!design.brief} />
            <PlaybackBar dtSeconds={run.dtSeconds} windowSteps={run.windowSteps} />
            <RunSummary run={run} />
            <p aria-live="polite" className="sr-only">
              {announcement}
            </p>
          </div>
        }
      />
    </PlaybackContext.Provider>
  );
}
