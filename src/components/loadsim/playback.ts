"use client";

import { createContext, useContext, useEffect } from "react";
import { createStore, useStore, type StoreApi } from "zustand";

/** 1× plays the 600-step window in 30 seconds. */
export const STEPS_PER_SECOND_AT_1X = 20;

export type Speed = 1 | 2 | 4;

export type PlaybackState = {
  /** Fractional step, so slow frames still advance smoothly */
  position: number;
  /** The frame shown: the whole part of `position` */
  step: number;
  playing: boolean;
  speed: Speed;
  frameCount: number;
  /** A new run: back to the start, playing */
  reset: (frameCount: number) => void;
  /** A new run of a different length from the same moment (an outage changed): keep the place and play state */
  resize: (frameCount: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (step: number) => void;
  setSpeed: (speed: Speed) => void;
  tick: (elapsedMs: number) => void;
};

export function advance(position: number, elapsedMs: number, speed: number): number {
  return position + (elapsedMs / 1000) * STEPS_PER_SECOND_AT_1X * speed;
}

/** One store per page, so playback state never outlives the page that shows it. */
export function createPlaybackStore(): StoreApi<PlaybackState> {
  return createStore<PlaybackState>((set, get) => {
    const last = () => Math.max(0, get().frameCount - 1);
    const at = (position: number) => {
      const clamped = Math.min(Math.max(position, 0), last());
      return { position: clamped, step: Math.floor(clamped) };
    };
    return {
      position: 0,
      step: 0,
      playing: false,
      speed: 1,
      frameCount: 0,
      reset: (frameCount) => set({ frameCount, position: 0, step: 0, playing: frameCount > 1 }),
      resize: (frameCount) => {
        const position = Math.min(Math.max(get().position, 0), Math.max(0, frameCount - 1));
        set({ frameCount, position, step: Math.floor(position) });
      },
      play: () => set({ playing: true, ...(get().step >= last() ? at(0) : {}) }),
      pause: () => set({ playing: false }),
      toggle: () => (get().playing ? get().pause() : get().play()),
      seek: (step) => set(at(step)),
      setSpeed: (speed) => set({ speed }),
      tick: (elapsedMs) => {
        if (!get().playing) return;
        const next = at(advance(get().position, elapsedMs, get().speed));
        set({ ...next, playing: next.position < last() });
      },
    };
  });
}

export const PlaybackContext = createContext<StoreApi<PlaybackState> | null>(null);

function usePlaybackStore(): StoreApi<PlaybackState> {
  const store = useContext(PlaybackContext);
  if (!store) throw new Error("usePlayback needs a PlaybackContext provider");
  return store;
}

export function usePlayback<T>(selector: (s: PlaybackState) => T): T {
  return useStore(usePlaybackStore(), selector);
}

/** Drives playback from the display's frame clock while it plays. */
export function usePlaybackLoop(store: StoreApi<PlaybackState>) {
  useEffect(() => {
    let frame = 0;
    let previous: number | null = null;
    const loop = (now: number) => {
      // A hidden tab pauses the clock; don't jump ahead when it comes back.
      const elapsed = previous === null ? 0 : Math.min(now - previous, 100);
      previous = now;
      store.getState().tick(elapsed);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [store]);
}
