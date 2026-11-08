import { expect, test } from "@playwright/test";
import { designFile, designText, RANDOM_200 } from "./support/designs";
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
