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

/**
 * The frame rate every case keeps while dragging, panning and zooming. Random 200 managed
 * 20–25 until canvas-render-scale (2026-11-08) stopped its 197 dashes moving, gave the edges
 * a layer while the view moves, and re-rendered only what a drag changes: now 35–38 on drag
 * and 52–57 on pan and zoom on a quiet machine. App 200 runs at 40–49 on drag, 48–54 on pan
 * and 60 on zoom.
 */
const SMOOTH_FPS = 35;

const BUDGET = { importMs: 5_000, importTaskMs: 2_000, runMs: 2_000, medianFrameMs: 50, worstDragFrameMs: 500 };

type Case = {
  name: string;
  design: GenerateOptions;
  estimated: boolean;
  /** A lower drag target than `SMOOTH_FPS`, where agreed */
  dragFps?: number;
};

const CASES: Case[] = [
  // 395 edges, 197 of them realtime: past 20 they keep their dashes but stand still.
  // Its drag runs at 35–38 fps on a quiet machine but 25–27 on a busy one, so its drag
  // target is 20, agreed 2026-11-08 (SPEC-canvas-render-scale.md, Results). That still
  // catches the moving dashes coming back, which held drag at 16–17.
  { name: "random 200 nodes, seed 1", design: RANDOM_200, estimated: true, dragFps: 20 },
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
    withinBudget("drag median frame", m.dragFrames.medianMs, BUDGET.medianFrameMs);
    withinBudget("pan median frame", m.panFrames.medianMs, BUDGET.medianFrameMs);
    withinBudget("zoom median frame", m.zoomFrames.medianMs, BUDGET.medianFrameMs);
    if (BUDGETS_ON) {
      smooth("drag", m.dragFrames, c.dragFps ?? SMOOTH_FPS);
      smooth("pan", m.panFrames, SMOOTH_FPS);
      smooth("zoom", m.zoomFrames, SMOOTH_FPS);
    }
    expect(errors).toEqual([]);
  });
}
