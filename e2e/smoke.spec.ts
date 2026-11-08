import { expect, test } from "@playwright/test";
import { APP_200, designFile, designText, RANDOM_200 } from "./support/designs";
import { canvasNodes, collectErrors, importDesign, openEditor, runSimulation } from "./support/measure";

// SPEC-browser-stress.md, Task 1: the runner, the production build and the helpers work.

test("the demo loads and Run simulation shows results", async ({ page }) => {
  const errors = collectErrors(page);
  await openEditor(page);
  await page.getByRole("button", { name: /Load BeUWI demo/ }).click();
  await expect(canvasNodes(page).first()).toBeVisible();
  await runSimulation(page);
  expect(errors).toEqual([]);
});

test("a generated 200-node design imports", async ({ page }) => {
  const errors = collectErrors(page);
  await openEditor(page);
  await importDesign(page, designFile("random-200-seed-1.yaml", designText(RANDOM_200)), 200);
  expect(errors).toEqual([]);
});

// Manual testing (2026-11-08): /simulate could scroll by 954 px in a 630 px window. Screen-
// reader text in the side panel had no positioned box, so it escaped the panel's scrolling.
test("the load page fits the window, with a long side panel", async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1238, height: 630 });
  await openEditor(page);
  await importDesign(page, designFile("app-200-seed-1.yaml", designText(APP_200)), 200);
  await page.getByRole("button", { name: "Simulate load" }).click();
  await page.waitForURL("**/simulate");
  await expect(page.getByRole("region", { name: "What happened" })).toBeVisible({ timeout: 30_000 });
  const { page: pageHeight, window: windowHeight } = await page.evaluate(() => ({
    page: document.documentElement.scrollHeight,
    window: innerHeight,
  }));
  expect(pageHeight, "the page's height against the window's").toBeLessThanOrEqual(windowHeight);
  expect(errors).toEqual([]);
});
