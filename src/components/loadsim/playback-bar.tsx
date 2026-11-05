"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { SECTION_LABEL } from "@/components/simulator/styles";
import { usePlayback, type Speed } from "./playback";

const SPEEDS: Speed[] = [1, 2, 4];

export function formatClock(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** The simulated clock against the window, e.g. "4:12 of 20:00". */
export function positionText(step: number, dtSeconds: number, windowSteps: number): string {
  const text = `${formatClock(step * dtSeconds)} of ${formatClock(windowSteps * dtSeconds)}`;
  return step > windowSteps ? `${text}, draining` : text;
}

const iconButton =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-teal-700/40 focus-visible:outline-none";

export function PlaybackBar({ dtSeconds, windowSteps }: { dtSeconds: number; windowSteps: number }) {
  const step = usePlayback((s) => s.step);
  const playing = usePlayback((s) => s.playing);
  const speed = usePlayback((s) => s.speed);
  const frameCount = usePlayback((s) => s.frameCount);
  const toggle = usePlayback((s) => s.toggle);
  const seek = usePlayback((s) => s.seek);
  const reset = usePlayback((s) => s.reset);
  const setSpeed = usePlayback((s) => s.setSpeed);
  const position = positionText(step, dtSeconds, windowSteps);

  return (
    <section aria-labelledby="load-playback-heading" className="space-y-2">
      <h2 id="load-playback-heading" className={SECTION_LABEL}>
        Playback
      </h2>
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label={playing ? "Pause" : "Play"} className={iconButton} onClick={toggle}>
          {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
        </button>
        <button type="button" aria-label="Restart" className={iconButton} onClick={() => reset(frameCount)}>
          <RotateCcw className="h-4 w-4" aria-hidden />
        </button>
        <div role="group" aria-label="Speed" className="ml-auto flex overflow-hidden rounded-md border border-slate-300">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={speed === s}
              onClick={() => setSpeed(s)}
              className={`h-8 px-2.5 text-xs font-medium focus-visible:ring-2 focus-visible:ring-teal-700/40 focus-visible:outline-none ${
                speed === s ? "bg-teal-800 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {`${s}×`}
            </button>
          ))}
        </div>
      </div>
      <input
        type="range"
        aria-label="Playback position"
        aria-valuetext={position}
        min={0}
        max={Math.max(0, frameCount - 1)}
        step={1}
        value={step}
        onChange={(e) => seek(Number(e.target.value))}
        className="w-full accent-teal-700"
      />
      <p className="text-xs tabular-nums text-slate-600">{position}</p>
    </section>
  );
}
