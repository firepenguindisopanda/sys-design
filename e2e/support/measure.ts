import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

// SPEC-browser-stress.md: what the browser checks measure, and the editor steps they share.

declare global {
  interface Window {
    __frames?: number[];
    __longTasks?: { start: number; duration: number }[];
  }
}

/** Page errors and console errors, collected for the test to check last. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/**
 * Record every animation frame's timestamp, and every long task, from the first script on
 * each page. Call before the first `goto`.
 */
export async function installRecorders(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__frames = [];
    const tick = (t: number) => {
      window.__frames!.push(t);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.__longTasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__longTasks!.push({ start: e.startTime, duration: e.duration });
      }).observe({ type: "longtask", buffered: true });
    } catch {
      // No long-task timing in this browser: the stats read as none.
    }
  });
}

/** The page's clock, for marking the start and end of a step. */
export const now = (page: Page) => page.evaluate(() => performance.now());

export type FrameStats = { frames: number; medianMs: number; worstMs: number; fps: number };

/** Gaps between animation frames from `from` to `to` (page clock). */
export async function frameStats(page: Page, from: number, to: number): Promise<FrameStats> {
  const times = await page.evaluate(([a, b]) => (window.__frames ?? []).filter((t) => t >= a && t <= b), [from, to]);
  const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
  if (gaps.length === 0) return { frames: times.length, medianMs: to - from, worstMs: to - from, fps: 0 };
  return {
    frames: times.length,
    medianMs: gaps[Math.floor(gaps.length / 2)],
    worstMs: gaps[gaps.length - 1],
    fps: (gaps.length * 1000) / (times[times.length - 1] - times[0]),
  };
}

export type LongTaskStats = { count: number; totalMs: number; longestMs: number };

/** Long tasks that started from `from` on (page clock), or all of them. */
export async function longTaskStats(page: Page, from = 0): Promise<LongTaskStats> {
  const tasks = await page.evaluate((a) => (window.__longTasks ?? []).filter((t) => t.start >= a), from);
  return {
    count: tasks.length,
    totalMs: tasks.reduce((n, t) => n + t.duration, 0),
    longestMs: tasks.reduce((n, t) => Math.max(n, t.duration), 0),
  };
}

/** The JavaScript heap in use after a forced garbage collection, in bytes. */
export async function heapAfterGc(page: Page): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("HeapProfiler.collectGarbage");
    await cdp.send("Performance.enable");
    const { metrics } = await cdp.send("Performance.getMetrics");
    const used = metrics.find((m) => m.name === "JSHeapUsedSize");
    if (!used) throw new Error("no JSHeapUsedSize metric");
    return used.value;
  } finally {
    await cdp.detach();
  }
}

/** Milliseconds `step` took, by the test's clock. */
export async function timed(step: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  await step();
  return performance.now() - start;
}

export const ms = (n: number) => `${Math.round(n).toLocaleString("en")} ms`;

/** Print a scenario's one line of numbers, in the style of the size ladder. */
export function report(name: string, parts: string[]): void {
  console.log(`${name}: ${parts.join(", ")}`);
}

// --- Editor steps -------------------------------------------------------------------

/** The canvas's nodes. React Flow gives each one this class; it has no role of its own. */
export const canvasNodes = (page: Page) => page.locator(".react-flow__node");

/** Open the editor and wait for its canvas. */
export async function openEditor(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".react-flow")).toBeVisible();
}

/**
 * Import a design file through the editor's file input, confirming the replace if asked.
 *
 * The file is handed to the input from inside the page, as a picked file would be, rather
 * than with Playwright's `setInputFiles`. That keeps a DevTools handle to the input, and
 * so to the whole editor page around it, alive for the rest of the test: every time the
 * editor remounted, a detached copy of the old canvas stayed in memory (about 2.2 MB per
 * import with a 200-node design), which looked like a leak in the app (2026-11-07).
 */
export async function importDesign(page: Page, file: string, nodeCount: number): Promise<void> {
  const text = readFileSync(file, "utf8");
  await page.evaluate(
    ([t, name]) => {
      const input = document.querySelector<HTMLInputElement>('input[aria-label="Design file to import"]');
      if (!input) throw new Error("no design file input");
      const picked = new DataTransfer();
      picked.items.add(new File([t], name));
      input.files = picked.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    [text, path.basename(file)] as const,
  );
  const replace = page.getByRole("dialog", { name: "Replace your design?" });
  const nodes = canvasNodes(page);
  await expect(replace.or(nodes.nth(nodeCount - 1))).toBeVisible({ timeout: 30_000 });
  if (await replace.isVisible()) await replace.getByRole("button", { name: "Replace" }).click();
  await expect(nodes).toHaveCount(nodeCount, { timeout: 30_000 });
}

/** "Run finished: …", which the verification panel announces when results arrive. */
export const runFinished = (page: Page) => page.getByText(/^Run finished:/);

/** Press Run simulation and wait for the results. */
export async function runSimulation(page: Page, timeout = 30_000): Promise<void> {
  await page.getByRole("button", { name: "Run simulation" }).click();
  await expect(runFinished(page)).toBeAttached({ timeout });
}

// --- Budgets ------------------------------------------------------------------------

/**
 * `BUDGETS=off` records the numbers without failing on them, for measuring a scenario
 * before its budgets are set (SPEC-browser-stress.md, "The budgets").
 */
export const BUDGETS_ON = process.env.BUDGETS !== "off";

/** Fail when `value` is over `budget`, unless budgets are off; `unit` formats both (milliseconds by default). */
export function withinBudget(what: string, value: number, budget: number, unit: (n: number) => string = ms): void {
  if (BUDGETS_ON) expect(value, `${what}: ${unit(value)} against a budget of ${unit(budget)}`).toBeLessThanOrEqual(budget);
}

// --- Canvas gestures ----------------------------------------------------------------

/** A point on the canvas's empty background, away from every node and edge. */
export async function emptyPanePoint(page: Page): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(() => {
    const pane = document.querySelector(".react-flow__pane");
    if (!pane) return null;
    const box = pane.getBoundingClientRect();
    for (let fy = 0.1; fy < 0.9; fy += 0.05) {
      for (let fx = 0.1; fx < 0.9; fx += 0.05) {
        const x = box.left + box.width * fx;
        const y = box.top + box.height * fy;
        if (document.elementFromPoint(x, y) === pane) return { x, y };
      }
    }
    return null;
  });
  if (!point) throw new Error("no empty point on the canvas");
  return point;
}

/** Drag with the mouse from `from` by (`dx`, `dy`) in `steps` moves. */
export async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number, steps: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps });
  await page.mouse.up();
}

/** The id and centre of a node the mouse can reach: on screen and on top at its centre. */
export async function reachableNode(page: Page): Promise<{ id: string; x: number; y: number }> {
  const found = await page.evaluate(() => {
    const pane = document.querySelector(".react-flow__pane")?.getBoundingClientRect();
    if (!pane) return null;
    for (const node of document.querySelectorAll<HTMLElement>(".react-flow__node")) {
      const r = node.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (x < pane.left || x > pane.right || y < pane.top || y > pane.bottom) continue;
      if (document.elementFromPoint(x, y)?.closest(".react-flow__node") !== node) continue;
      return { id: node.dataset.id ?? "", x, y };
    }
    return null;
  });
  if (!found?.id) throw new Error("no node the mouse can reach");
  return found;
}

// --- Frame rates ----------------------------------------------------------------------

/**
 * A frame-rate target. It began as the check for pinned cases (SPEC-browser-stress.md,
 * "Problems found"), whose frames sat at their 50 ms budget. Since canvas-render-scale
 * brought those cases up (2026-11-08), every case is held to its spec's target: the
 * median-frame budget alone would let a case fall back to 20 fps unnoticed.
 */
export function smooth(what: string, frames: FrameStats, targetFps: number): void {
  expect(frames.fps, `${what}: ${frames.fps.toFixed(0)} fps against ${targetFps}`).toBeGreaterThanOrEqual(targetFps);
}
