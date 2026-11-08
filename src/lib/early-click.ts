// Clicks before React hydrates (SPEC-browser-stress.md, scenario 4). The editor's buttons
// are in the server-rendered HTML, so they're on screen before React has attached its
// listeners, and a click in that window does nothing. While the scripts load quickly that
// window is too short to hit; when they arrive late (a slow network, or the dev server
// compiling on demand), a student's first click on Run simulation was lost.
//
// EARLY_CLICK_SCRIPT runs inline as the HTML is parsed. It remembers clicks on elements
// marked `data-early-click="<name>"` until the app takes them with `takeEarlyClick`, once
// React has hydrated. The first take ends the recording, so a click React handles itself is
// never run a second time.

export const EARLY_CLICK_ATTRIBUTE = "data-early-click";

type EarlyClicks = { taken: boolean; names: Record<string, true> };

export type EarlyClickWindow = { __earlyClicks?: EarlyClicks };

/** Plain ES5, as it runs before any of the app's code; installs itself once. */
export const EARLY_CLICK_SCRIPT = `(function () {
  if (window.__earlyClicks) return;
  var state = (window.__earlyClicks = { taken: false, names: {} });
  document.addEventListener(
    "click",
    function (e) {
      if (state.taken) return;
      var target = e.target;
      var marked = target && target.closest ? target.closest("[${EARLY_CLICK_ATTRIBUTE}]") : null;
      if (marked) state.names[marked.getAttribute("${EARLY_CLICK_ATTRIBUTE}")] = true;
    },
    true
  );
})();`;

/**
 * Whether `name` was clicked before React took over. Call once React has hydrated; the
 * first call ends the recording, so later calls are false.
 */
export function takeEarlyClick(name: string, win: EarlyClickWindow = window as EarlyClickWindow): boolean {
  const state = win.__earlyClicks;
  if (!state) return false;
  state.taken = true;
  const clicked = state.names[name] === true;
  delete state.names[name];
  return clicked;
}
