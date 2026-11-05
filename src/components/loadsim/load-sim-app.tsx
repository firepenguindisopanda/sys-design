"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Brief } from "@/lib/challenges/types";
import { loadHandoff } from "@/lib/loadsim/handoff";
import { simulateLoad } from "@/lib/loadsim/model";
import { toggleOutage, type Outage } from "@/lib/loadsim/outages";
import { defaultScenario, featureLoads } from "@/lib/loadsim/scenario";
import type { Scenario } from "@/lib/loadsim/types";
import { LoadSimView, type LoadSimState, type SimDesign } from "./load-sim-view";
import { NodeStatsTable } from "./node-stats-table";
import { OutageList, outageAnnouncement } from "./outage-list";
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
  // Components the student switched off (SPEC-loadsim-failures.md); a new scenario clears them.
  const [outages, setOutages] = useState<Outage[]>([]);
  const changed = useRef<"scenario" | "outages">("scenario");
  const onScenario = useCallback((next: Scenario) => {
    changed.current = "scenario";
    setScenario(next);
    setOutages([]);
  }, []);
  // The run without outages is kept, so a switch-off runs the model once, not twice.
  const plain = useMemo(
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
  const run = useMemo(
    () =>
      outages.length === 0
        ? plain
        : simulateLoad({
            nodes: design.nodes,
            edges: design.edges,
            features: design.features,
            scenario,
            loads: featureLoads(design.features, design.brief),
            outages,
            baseline: plain,
          }),
    [design, scenario, outages, plain],
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
        // A changed outage carries on from the same moment, so its story carries on too.
        const restarted = now.frameCount !== before.frameCount && changed.current !== "outages";
        const previous = now.step < before.step || restarted ? -1 : before.step;
        const message = announcementFor(previous, now.step, run);
        if (message) setAnnouncement(message);
      }),
    [playback, run],
  );
  // A new scenario plays from the start; a changed outage carries on from where it is.
  useEffect(() => {
    if (changed.current === "outages") playback.getState().resize(run.frames.length);
    else playback.getState().reset(run.frames.length);
  }, [playback, run]);

  const label = useCallback(
    (id: string) => design.nodes.find((n) => n.id === id)?.data.label ?? id,
    [design.nodes],
  );
  const changeOutages = useCallback((next: Outage[]) => {
    changed.current = "outages";
    setOutages(next);
  }, []);
  const onToggle = useCallback(
    (nodeId: string) => {
      const t = playback.getState().step * run.dtSeconds;
      const next = toggleOutage(outages, nodeId, t);
      const nowOff = next.some((o) => o.nodeId === nodeId && o.offAt <= t && (o.onAt === null || t < o.onAt));
      changeOutages(next);
      setAnnouncement(outageAnnouncement(label(nodeId), nowOff, t));
    },
    [playback, run.dtSeconds, outages, changeOutages, label],
  );

  return (
    <PlaybackContext.Provider value={playback}>
      <LoadSimView
        state={state}
        canvas={<SimCanvas design={design} run={run} onToggle={onToggle} />}
        table={<NodeStatsTable run={run} nodes={design.nodes} />}
        panel={
          <div className="space-y-5 p-4">
            <ScenarioControls scenario={scenario} defaults={defaults} onChange={onScenario} sandbox={!design.brief} />
            <PlaybackBar dtSeconds={run.dtSeconds} windowSteps={run.windowSteps} />
            <OutageList
              outages={outages}
              label={label}
              onRemove={(o) => changeOutages(outages.filter((x) => x !== o))}
              onClear={() => changeOutages([])}
            />
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
