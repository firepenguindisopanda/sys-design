import { describe, expect, it } from "vitest";
import { STEPS_PER_SECOND_AT_1X, advance, createPlaybackStore } from "./playback";

describe("advance", () => {
  it("plays the 600-step window in 30 s at 1×", () => {
    expect(STEPS_PER_SECOND_AT_1X).toBe(20);
    expect(advance(0, 1000, 1)).toBeCloseTo(20, 9);
    expect(advance(0, 30_000, 1)).toBeCloseTo(600, 9);
  });

  it("goes faster at 2× and 4×", () => {
    expect(advance(10, 1000, 2)).toBeCloseTo(50, 9);
    expect(advance(10, 1000, 4)).toBeCloseTo(90, 9);
  });
});

describe("playback store", () => {
  it("starts playing from the first frame after a reset", () => {
    const store = createPlaybackStore();
    store.getState().reset(650);
    expect(store.getState()).toMatchObject({ position: 0, step: 0, playing: true, frameCount: 650 });
  });

  it("advances on each tick and stops at the last frame", () => {
    const store = createPlaybackStore();
    store.getState().reset(100);
    store.getState().tick(1000);
    expect(store.getState().step).toBe(20);
    store.getState().tick(10_000);
    expect(store.getState()).toMatchObject({ step: 99, playing: false });
  });

  it("ignores ticks while paused", () => {
    const store = createPlaybackStore();
    store.getState().reset(100);
    store.getState().pause();
    store.getState().tick(1000);
    expect(store.getState().step).toBe(0);
  });

  it("seeks within the frames, and restarts from the end when played again", () => {
    const store = createPlaybackStore();
    store.getState().reset(100);
    store.getState().seek(40);
    expect(store.getState().step).toBe(40);
    store.getState().seek(500);
    expect(store.getState().step).toBe(99);
    store.getState().pause();
    store.getState().play();
    expect(store.getState()).toMatchObject({ step: 0, playing: true });
  });

  it("keeps its place and play state when the run changes length (SPEC-loadsim-failures.md)", () => {
    const store = createPlaybackStore();
    store.getState().reset(600);
    store.getState().seek(240);
    store.getState().resize(650);
    expect(store.getState()).toMatchObject({ step: 240, playing: true, frameCount: 650 });
    store.getState().pause();
    store.getState().resize(620);
    expect(store.getState()).toMatchObject({ step: 240, playing: false, frameCount: 620 });
  });

  it("clamps its place when the run gets shorter than it", () => {
    const store = createPlaybackStore();
    store.getState().reset(650);
    store.getState().seek(640);
    store.getState().resize(600);
    expect(store.getState()).toMatchObject({ step: 599, frameCount: 600 });
  });

  it("keeps the chosen speed across resets", () => {
    const store = createPlaybackStore();
    store.getState().setSpeed(4);
    store.getState().reset(100);
    store.getState().tick(1000);
    expect(store.getState().step).toBe(80);
  });
});
