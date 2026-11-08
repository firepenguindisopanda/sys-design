import { expect, test, type Page } from "@playwright/test";
import { APP_200, designFile, designText } from "./support/designs";
import { collectErrors, heapAfterGc, importDesign, openEditor, report, runSimulation, withinBudget } from "./support/measure";

// SPEC-browser-stress.md, scenario 3: memory over repeated use. Editor and /simulate move
// between each other without a page load (client-side navigation), so one heap carries
// across every cycle, as it would for a student working through a session.

const CYCLES = 10;
const MB = 1024 * 1024;
/**
 * Heap growth allowed from the end of cycle 1 to the end of cycle 10. Set 2026-11-07 at
 * 10 MB, down from the spec's first estimate of 50: three runs grew 1.5–1.8 MB, and a
 * canvas kept per cycle grows about 20 MB, which 50 MB would have let through.
 */
const GROWTH_BUDGET_MB = 10;

const mb = (bytes: number) => `${(bytes / MB).toFixed(1)} MB`;

/** Import, Run simulation, Simulate load, back to the editor. */
async function cycle(page: Page, file: string): Promise<void> {
  await importDesign(page, file, 200);
  await runSimulation(page);
  await page.getByRole("button", { name: "Simulate load" }).click();
  await page.waitForURL("**/simulate");
  await expect(page.getByRole("region", { name: "What happened" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: "Back to design" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("button", { name: "Run simulation" })).toBeVisible();
}

test("memory: ten cycles of import, run, simulate and back", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  const file = designFile("app-200-seed-1.yaml", designText(APP_200));
  await openEditor(page);

  // The reading is real: it rises when a 200-node design is loaded.
  const empty = await heapAfterGc(page);
  await importDesign(page, file, 200);
  const loaded = await heapAfterGc(page);
  expect(loaded - empty, "the heap grows when a 200-node design is loaded").toBeGreaterThan(MB);

  const heaps: number[] = [];
  for (let i = 1; i <= CYCLES; i++) {
    await cycle(page, file);
    heaps.push(await heapAfterGc(page));
  }
  const growth = heaps[CYCLES - 1] - heaps[0];

  report("memory", [
    `empty editor ${mb(empty)}`,
    `with app 200 ${mb(loaded)}`,
    `after each cycle ${heaps.map(mb).join(" → ")}`,
    `growth from cycle 1 to ${CYCLES}: ${mb(growth)} (budget ${GROWTH_BUDGET_MB} MB)`,
  ]);
  withinBudget(`heap growth over ${CYCLES - 1} cycles`, growth, GROWTH_BUDGET_MB * MB, mb);
  expect(errors).toEqual([]);
});
