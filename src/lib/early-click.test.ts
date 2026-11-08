import { beforeEach, describe, expect, it } from "vitest";
import { EARLY_CLICK_SCRIPT, takeEarlyClick, type EarlyClickWindow } from "./early-click";

// SPEC-browser-stress.md, scenario 4: clicks made before React hydrates are remembered.

type Listener = (e: { target: unknown }) => void;

/** A stand-in for the page: the script's click listeners, and a window to hold its state. */
function fakePage() {
  const listeners: Listener[] = [];
  const document = {
    addEventListener: (type: string, fn: Listener, capture: boolean) => {
      expect(type).toBe("click");
      expect(capture).toBe(true);
      listeners.push(fn);
    },
  };
  const window: EarlyClickWindow = {};
  const runScript = () => new Function("window", "document", EARLY_CLICK_SCRIPT)(window, document);
  /** A click on an element inside one marked `data-early-click="<name>"`, or on an unmarked one. */
  const click = (name: string | null) => {
    const marked = name === null ? null : { getAttribute: (a: string) => (a === "data-early-click" ? name : null) };
    const target = { closest: (selector: string) => (selector === "[data-early-click]" ? marked : null) };
    for (const fn of listeners) fn({ target });
  };
  return { window, listeners, runScript, click };
}

describe("early clicks", () => {
  let page: ReturnType<typeof fakePage>;
  beforeEach(() => {
    page = fakePage();
    page.runScript();
  });

  it("remembers a click on a marked element made before React takes it", () => {
    page.click("run");
    expect(takeEarlyClick("run", page.window)).toBe(true);
  });

  it("gives a click only once", () => {
    page.click("run");
    takeEarlyClick("run", page.window);
    expect(takeEarlyClick("run", page.window)).toBe(false);
  });

  it("is false with no click, or a click on something else", () => {
    page.click(null);
    page.click("other");
    expect(takeEarlyClick("run", page.window)).toBe(false);
  });

  it("stops recording once React has taken the clicks, so a later click can't run twice", () => {
    takeEarlyClick("run", page.window);
    page.click("run");
    expect(takeEarlyClick("run", page.window)).toBe(false);
  });

  it("installs one listener even if the script runs twice", () => {
    page.runScript();
    expect(page.listeners).toHaveLength(1);
  });

  it("is false when the script never ran", () => {
    expect(takeEarlyClick("run", {})).toBe(false);
  });
});
