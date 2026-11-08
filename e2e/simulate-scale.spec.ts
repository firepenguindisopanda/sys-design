import { expect, test, type Page } from "@playwright/test";
import { APP_200, designFile, designText } from "./support/designs";
import {
  BUDGETS_ON,
  collectErrors,
  frameStats,
  importDesign,
  installRecorders,
  longTaskStats,
  ms,
  now,
  openEditor,
  report,
  smooth,
  timed,
  withinBudget,
} from "./support/measure";

// SPEC-browser-stress.md, scenario 2: /simulate at its largest scenario, 1,000,000 requests.
// Budgets set 2026-11-07, after three runs (tasks/browser-stress/todo.md, Task 3).

/**
 * The frame rate every case keeps during playback. App 200 managed 31–42 until
 * canvas-render-scale (2026-11-08) had each edge and node re-render only when what it shows
 * changes, instead of on every step: now 60, as the demo.
 */
const SMOOTH_FPS = 50;

const BUDGET = { openMs: 5_000, requestsMs: 5_000, requestsTaskMs: 2_000, medianFrameMs: 50, toggleMs: 5_000 };

type Case = { name: string; open: (page: Page) => Promise<void> };

const CASES: Case[] = [
  {
    name: "BeUWI demo",
    open: async (page) => {
      await page.getByRole("button", { name: /Load BeUWI demo/ }).click();
      await expect(page.locator(".react-flow__node").first()).toBeVisible();
    },
  },
  {
    name: "app 200 nodes, seed 1",
    open: (page) => importDesign(page, designFile("app-200-seed-1.yaml", designText(APP_200)), 200),
  },
];

/** The "Served" figure in What happened, which changes whenever the model runs again. */
const served = (page: Page) =>
  page.getByRole("region", { name: "What happened" }).locator("dt", { hasText: /^Served$/ }).locator("xpath=following-sibling::dd[1]");

/** The id of a node whose switch the mouse can reach: on screen and on top. Labels repeat. */
async function reachableSwitch(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    const pane = document.querySelector(".react-flow__pane")?.getBoundingClientRect();
    if (!pane) return null;
    for (const b of document.querySelectorAll<HTMLButtonElement>('.react-flow__node button[aria-label^="Switch off "]')) {
      const r = b.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (x < pane.left || x > pane.right || y < pane.top || y > pane.bottom) continue;
      if (document.elementFromPoint(x, y)?.closest("button") !== b) continue;
      return b.closest<HTMLElement>(".react-flow__node")?.dataset.id ?? null;
    }
    return null;
  });
  if (!id) throw new Error("no node switch the mouse can reach");
  return id;
}

/** Open /simulate, set 1,000,000 requests, play, switch a node off and back, measuring each. */
async function measureSimulate(page: Page, c: Case) {
  await installRecorders(page);
  await openEditor(page);
  await c.open(page);

  // Simulate load: a new page, so marks restart from its clock.
  const openMs = await timed(async () => {
    await page.getByRole("button", { name: "Simulate load" }).click();
    await page.waitForURL("**/simulate");
    await expect(served(page)).toBeVisible({ timeout: 30_000 });
  });
  const openTasks = await longTaskStats(page);

  // 1,000,000 requests.
  const before = await served(page).textContent();
  const requests = page.getByLabel("Requests");
  await requests.fill("1000000");
  let mark = await now(page);
  const requestsMs = await timed(async () => {
    await requests.press("Enter");
    await expect(served(page)).not.toHaveText(before ?? "", { timeout: 30_000 });
  });
  const requestsTasks = await longTaskStats(page, mark);
  await expect(page.getByLabel("Requests")).toHaveValue("1,000,000");

  // Play at the fastest speed for 5 s. The fixed wait is the measuring window itself.
  await page.getByRole("group", { name: "Speed" }).getByRole("button").last().click();
  const position = page.getByLabel("Playback position");
  const startStep = Number(await position.inputValue());
  await page.getByRole("button", { name: "Play" }).click();
  mark = await now(page);
  await page.waitForTimeout(5_000);
  const end = await now(page);
  const playFrames = await frameStats(page, mark, end);
  const playTasks = await longTaskStats(page, mark);
  const pause = page.getByRole("button", { name: "Pause" });
  if (await pause.isVisible()) await pause.click();
  expect(Number(await position.inputValue()), "the playback position moved").toBeGreaterThan(startStep);

  // Switch a node off, then bring it back. Paused, the outage lasts no time, so bringing
  // the node back removes it; anything left is cleared.
  const node = page.locator(`.react-flow__node[data-id="${await reachableSwitch(page)}"]`);
  const outages = page.getByRole("region", { name: "Outages" });
  const offMs = await timed(async () => {
    await node.getByRole("button", { name: /^Switch off / }).click();
    await expect(node.getByRole("button", { name: /^Bring back / })).toBeVisible({ timeout: 30_000 });
    await expect(outages).toBeVisible({ timeout: 30_000 });
  });
  const backMs = await timed(async () => {
    await node.getByRole("button", { name: /^Bring back / }).click();
    await expect(node.getByRole("button", { name: /^Switch off / })).toBeVisible({ timeout: 30_000 });
    if (await outages.isVisible()) await outages.getByRole("button", { name: "Clear all" }).click();
    await expect(outages).toHaveCount(0, { timeout: 30_000 });
  });
  const allTasks = await longTaskStats(page);

  report(`simulate ${c.name}`, [
    `open ${ms(openMs)} (longest task ${ms(openTasks.longestMs)})`,
    `1,000,000 requests ${ms(requestsMs)} (longest task ${ms(requestsTasks.longestMs)})`,
    `play median ${ms(playFrames.medianMs)} / worst ${ms(playFrames.worstMs)} (${playFrames.fps.toFixed(0)} fps, longest task ${ms(playTasks.longestMs)})`,
    `switch off ${ms(offMs)}, back ${ms(backMs)}`,
    `long tasks ${allTasks.count}, longest ${ms(allTasks.longestMs)}`,
  ]);

  return { openMs, requestsMs, requestsTasks, playFrames, offMs, backMs };
}

for (const c of CASES) {
  test(`simulate: ${c.name} at 1,000,000 requests`, async ({ page }) => {
    const errors = collectErrors(page);
    const m = await measureSimulate(page, c);
    withinBudget("open /simulate", m.openMs, BUDGET.openMs);
    withinBudget("1,000,000 requests", m.requestsMs, BUDGET.requestsMs);
    withinBudget("longest task at 1,000,000 requests", m.requestsTasks.longestMs, BUDGET.requestsTaskMs);
    withinBudget("switch off", m.offMs, BUDGET.toggleMs);
    withinBudget("bring back", m.backMs, BUDGET.toggleMs);
    withinBudget("playback median frame", m.playFrames.medianMs, BUDGET.medianFrameMs);
    if (BUDGETS_ON) smooth("playback", m.playFrames, SMOOTH_FPS);
    expect(errors).toEqual([]);
  });
}
