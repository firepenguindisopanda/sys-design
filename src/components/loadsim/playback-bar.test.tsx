import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlaybackBar, formatClock, positionText } from "./playback-bar";
import { PlaybackContext, createPlaybackStore } from "./playback";

describe("formatClock", () => {
  it("writes minutes and seconds", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(252)).toBe("4:12");
    expect(formatClock(1200)).toBe("20:00");
    expect(formatClock(59.9)).toBe("0:59");
  });
});

describe("positionText", () => {
  it("gives the simulated clock against the window", () => {
    expect(positionText(126, 2, 600)).toBe("4:12 of 20:00");
  });

  it("says when the backlog is draining after the window", () => {
    expect(positionText(603, 2, 600)).toBe("20:06 of 20:00, draining");
  });
});

function render(setup: (store: ReturnType<typeof createPlaybackStore>) => void) {
  const store = createPlaybackStore();
  setup(store);
  // Zustand renders on the server from the initial state, so copy the live state there.
  Object.assign(store.getInitialState(), store.getState());
  return renderToStaticMarkup(
    <PlaybackContext.Provider value={store}>
      <PlaybackBar dtSeconds={2} windowSteps={600} />
    </PlaybackContext.Provider>,
  );
}

describe("PlaybackBar", () => {
  it("names its controls and describes the position for screen readers", () => {
    const html = render((s) => {
      s.getState().reset(620);
      s.getState().seek(126);
    });
    expect(html).toContain('aria-label="Pause"');
    expect(html).toContain('aria-label="Restart"');
    expect(html).toContain('aria-label="Playback position"');
    expect(html).toContain('aria-valuetext="4:12 of 20:00"');
    expect(html).toContain('max="619"');
    expect(html).toContain('value="126"');
    expect(html).toContain("4:12 of 20:00");
  });

  it("offers Play when paused, and marks the chosen speed", () => {
    const html = render((s) => {
      s.getState().reset(620);
      s.getState().pause();
      s.getState().setSpeed(2);
    });
    expect(html).toContain('aria-label="Play"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>2×/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>1×/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>4×/);
  });
});
