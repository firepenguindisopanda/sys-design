import { expect, test, type Page } from "@playwright/test";
import type { GenerateOptions } from "@/test/gen-designs";
import { APP_200, designFile, designText, RANDOM_200 } from "./support/designs";
import {
  BUDGETS_ON,
  collectErrors,
  drag,
  emptyPanePoint,
  frameStats,
  importDesign,
  installRecorders,
  longTaskStats,
  ms,
  now,
  openEditor,
  reachableNode,
  report,
  runSimulation,
  smooth,
  timed,
  withinBudget,
} from "./support/measure";

// SPEC-browser-stress.md, scenario 1: a 200-node design on the canvas. Budgets set
// 2026-11-07, after three runs (tasks/browser-stress/todo.md, Task 2).

/** A pin's target: app 200 drags at 40 fps and pans and zooms at 52–60; random 200 manages 22–25. */
const SMOOTH_FPS = 35;

const BUDGET = { importMs: 5_000, importTaskMs: 2_000, runMs: 2_000, medianFrameMs: 50, worstDragFrameMs: 500 };

type Case = { name: string; design: GenerateOptions; estimated: boolean; owner?: string };

const CASES: Case[] = [
  // Pinned: dragging, panning and zooming run at a median frame of 50 ms (22–25 fps), with
  // no headroom against the budget, while app 200 runs at 40–60 fps. It has 395 edges
  // against app 200's 344, yet each frame takes three times as long.
  { name: "random 200 nodes, seed 1", design: RANDOM_200, estimated: true, owner: "canvas-render-scale" },
  { name: "app 200 nodes, seed 1", design: APP_200, estimated: false },
];

/** Import, run, drag a node, pan and zoom, measuring each. */
async function measureCanvas(page: Page, c: Case) {
  await installRecorders(page);
  await openEditor(page);
  const file = designFile(`${c.name.replace(/\W+/g, "-")}.yaml`, designText(c.design));

  let mark = await now(page);
  const importMs = await timed(() => importDesign(page, file, 200));
  const importTasks = await longTaskStats(page, mark);

  mark = await now(page);
  const runMs = await timed(() => runSimulation(page));
  const runTasks = await longTaskStats(page, mark);
  const estimate = page.getByText(/too many paths to time each one, so this is an estimate\.$/);
  if (c.estimated) await expect(estimate).toBeVisible();
  else await expect(estimate).toHaveCount(0);

  // Drag a node the mouse can reach 300 px in 30 moves: at the minimum zoom, 200 nodes
  // don't all fit on screen.
  const target = await reachableNode(page);
  const node = page.locator(`.react-flow__node[data-id="${target.id}"]`);
  const before = (await node.boundingBox())!;
  mark = await now(page);
  await drag(page, target, 300, 0, 30);
  let end = await now(page);
  const dragFrames = await frameStats(page, mark, end);
  const after = (await node.boundingBox())!;
  expect(after.x - before.x, "the node moved right").toBeGreaterThan(150);

  // Pan 300 px, then zoom in and out with the wheel.
  const empty = await emptyPanePoint(page);
  mark = await now(page);
  await drag(page, empty, -300, -150, 30);
  end = await now(page);
  const panFrames = await frameStats(page, mark, end);
  mark = await now(page);
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -100);
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 100);
  end = await now(page);
  const zoomFrames = await frameStats(page, mark, end);
  const allTasks = await longTaskStats(page);

  report(`canvas ${c.name}`, [
    `import ${ms(importMs)} (longest task ${ms(importTasks.longestMs)})`,
    `run ${ms(runMs)} (longest task ${ms(runTasks.longestMs)})`,
    `drag median ${ms(dragFrames.medianMs)} / worst ${ms(dragFrames.worstMs)} (${dragFrames.fps.toFixed(0)} fps)`,
    `pan median ${ms(panFrames.medianMs)} / worst ${ms(panFrames.worstMs)} (${panFrames.fps.toFixed(0)} fps)`,
    `zoom median ${ms(zoomFrames.medianMs)} / worst ${ms(zoomFrames.worstMs)} (${zoomFrames.fps.toFixed(0)} fps)`,
    `long tasks ${allTasks.count}, longest ${ms(allTasks.longestMs)}`,
  ]);
  return { importMs, importTasks, runMs, dragFrames, panFrames, zoomFrames };
}

for (const c of CASES) {
  test(`canvas: ${c.name}`, async ({ page }) => {
    const errors = collectErrors(page);
    const m = await measureCanvas(page, c);
    withinBudget("import", m.importMs, BUDGET.importMs);
    withinBudget("longest task while importing", m.importTasks.longestMs, BUDGET.importTaskMs);
    withinBudget("run", m.runMs, BUDGET.runMs);
    withinBudget("drag worst frame", m.dragFrames.worstMs, BUDGET.worstDragFrameMs);
    // A pinned case's frame rate is checked in its own test below.
    if (!c.owner) {
      withinBudget("drag median frame", m.dragFrames.medianMs, BUDGET.medianFrameMs);
      withinBudget("pan median frame", m.panFrames.medianMs, BUDGET.medianFrameMs);
      withinBudget("zoom median frame", m.zoomFrames.medianMs, BUDGET.medianFrameMs);
    }
    expect(errors).toEqual([]);
  });

  if (c.owner) {
    test(`[${c.owner}] canvas: ${c.name}, smooth frames`, async ({ page }) => {
      test.skip(!BUDGETS_ON, "measuring only");
      test.fail();
      const m = await measureCanvas(page, c);
      smooth("drag", m.dragFrames, SMOOTH_FPS);
      smooth("pan", m.panFrames, SMOOTH_FPS);
      smooth("zoom", m.zoomFrames, SMOOTH_FPS);
    });
  }
}
