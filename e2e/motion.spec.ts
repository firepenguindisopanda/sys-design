import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { designFile, designText, RANDOM_200 } from "./support/designs";
import { collectErrors, emptyPanePoint, importDesign, openEditor } from "./support/measure";

// SPEC-canvas-render-scale.md, fixes 1 and 2: realtime edges keep their dashes but move only
// in a small design and only without prefers-reduced-motion; the edges layer exists only
// while the view moves.

/** The chat-app reference design: 8 nodes, 4 WebSocket edges (challenges/chat-app/fixtures). */
const CHAT_NODES = 8;
const CHAT_REALTIME = 4;

/**
 * The chat-app fixture as an importable file. A fixture has no requirements of its own and
 * is read for the current challenge, so the file names the challenge it belongs to.
 */
function chatFile(): string {
  const fixture = path.join(process.cwd(), "challenges", "chat-app", "fixtures", "good.yaml");
  return designFile("chat-app-good.yaml", `challenge: chat-app\n${readFileSync(fixture, "utf8")}`);
}

/** Running `dashdraw` animations, and animated edge paths with a dashed stroke. */
async function motion(page: Page) {
  return page.evaluate(() => {
    const running = document
      .getAnimations()
      .filter((a) => (a as CSSAnimation).animationName === "dashdraw").length;
    const paths = [...document.querySelectorAll<SVGPathElement>(".react-flow__edge.animated path")].filter(
      (p) => !p.classList.contains("react-flow__edge-interaction"),
    );
    const dashed = paths.filter((p) => getComputedStyle(p).strokeDasharray !== "none").length;
    return { running, animatedPaths: paths.length, dashed };
  });
}

test("motion: a small design's realtime edges move", async ({ page }) => {
  const errors = collectErrors(page);
  await openEditor(page);
  await importDesign(page, chatFile(), CHAT_NODES);
  const m = await motion(page);
  expect(m.animatedPaths).toBe(CHAT_REALTIME);
  expect(m.running).toBe(CHAT_REALTIME);
  expect(errors).toEqual([]);
});

test("motion: reduced motion keeps the dashes and stops the movement", async ({ page }) => {
  const errors = collectErrors(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openEditor(page);
  await importDesign(page, chatFile(), CHAT_NODES);
  const m = await motion(page);
  expect(m.animatedPaths).toBe(CHAT_REALTIME);
  expect(m.running).toBe(0);
  expect(m.dashed).toBe(CHAT_REALTIME);
  expect(errors).toEqual([]);
});

test("motion: a 200-node design keeps its dashes and stands still", async ({ page }) => {
  const errors = collectErrors(page);
  await openEditor(page);
  await importDesign(page, designFile("motion-random-200.yaml", designText(RANDOM_200)), 200);
  const m = await motion(page);
  expect(m.animatedPaths).toBe(197);
  expect(m.dashed).toBe(197);
  expect(m.running).toBe(0);
  expect(errors).toEqual([]);
});

const edgesLayer = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.querySelector(".react-flow__edges")!).willChange);

test("motion: the edges get their own layer only while the view moves", async ({ page }) => {
  // A standing layer changes how the text and fine lines around it are drawn, so the canvas
  // at rest must look as it always did; the layer is only for the move (fix 2).
  const errors = collectErrors(page);
  await openEditor(page);
  await importDesign(page, designFile("motion-random-200.yaml", designText(RANDOM_200)), 200);
  expect(await edgesLayer(page), "at rest").toBe("auto");

  const from = await emptyPanePoint(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(from.x - i * 20, from.y - i * 10);
  expect(await edgesLayer(page), "while panning").toBe("transform");
  await page.mouse.up();
  await expect.poll(() => edgesLayer(page), { message: "after the pan" }).toBe("auto");
  expect(errors).toEqual([]);
});
