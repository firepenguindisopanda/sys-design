import { expect, test, type Page } from "@playwright/test";
import { designText, STACKED_5X4, textWith } from "./support/designs";
import { collectErrors, installRecorders, longTaskStats, ms, openEditor, report, timed, withinBudget } from "./support/measure";

// SPEC-browser-stress.md, scenario 5: reloading /simulate with a bad saved design. Each case
// writes the tab's saved design, as the editor's Simulate load would, then opens /simulate.

const KEY = "sesim:load-sim";
const UNREADABLE = "The saved design couldn't be read. Go back to the editor and try again.";
/** A small app-shaped design: it has a database with replicas, and edges to copy. */
const SMALL_APP = designText({ seed: 1, shape: "app", nodes: 12 });

const stored = (text: string) => JSON.stringify({ text, fileName: "sandbox-design.yaml", briefId: null });

/** Save `value` as the tab's saved design (or clear it), then open /simulate. */
async function openWithSaved(page: Page, value: string | null): Promise<void> {
  await page.goto("/");
  await page.evaluate(([key, v]) => (v === null ? sessionStorage.removeItem(key) : sessionStorage.setItem(key, v)), [KEY, value] as const);
  await page.goto("/simulate");
}

const CASES: { name: string; value: string | null; expected: string | RegExp }[] = [
  { name: "not JSON", value: "{ this isn't json", expected: UNREADABLE },
  { name: "JSON without text", value: JSON.stringify({ fileName: "sandbox-design.yaml" }), expected: UNREADABLE },
  {
    name: "replicas: .inf",
    value: stored(textWith(SMALL_APP, /replicas: \d+/, () => "replicas: .inf")),
    expected: /config\.replicas: expected a whole number from 1 to 8/,
  },
  {
    name: "a self-loop",
    value: stored(textWith(SMALL_APP, /^(\s+- )([\w-]+) -> [\w-]+: (\w+)$/m, (m) => `${m[0]}\n${m[1]}${m[2]} -> ${m[2]}: ${m[3]}`)),
    expected: /an edge can't connect "[^"]+" to itself/,
  },
  {
    name: "stacked 5 × 4 load balancers",
    value: stored(designText(STACKED_5X4)),
    expected: "This design has more than 2,000 ways for a request to travel through it",
  },
  { name: "nothing saved", value: null, expected: "Open the editor, draw and connect a design, then choose Simulate load." },
];

for (const c of CASES) {
  test(`saved design: ${c.name}`, async ({ page }) => {
    const errors = collectErrors(page);
    await installRecorders(page);
    const shownMs = await timed(async () => {
      await openWithSaved(page, c.value);
      await expect(page.getByText(c.expected)).toBeVisible({ timeout: 30_000 });
    });
    const tasks = await longTaskStats(page);
    report(`saved design ${c.name}`, [`message ${ms(shownMs)}`, `longest task ${ms(tasks.longestMs)}`]);
    // Measured from the editor's page load, so it includes opening the editor first.
    withinBudget("message shown", shownMs, 2_000);
    // The route refusal comes before the load model runs, so nothing long happens.
    if (c.name.startsWith("stacked")) withinBudget("longest task", tasks.longestMs, 200);
    expect(errors).toEqual([]);
  });
}

test("saved design: a good design gives the same results after a reload", async ({ page }) => {
  const errors = collectErrors(page);
  await openEditor(page);
  await page.getByRole("button", { name: /Load BeUWI demo/ }).click();
  await page.getByRole("button", { name: "Simulate load" }).click();
  await page.waitForURL("**/simulate");
  const summary = page.getByRole("region", { name: "What happened" });
  await expect(summary).toBeVisible({ timeout: 30_000 });
  const before = await summary.innerText();
  const reloadMs = await timed(async () => {
    await page.reload();
    await expect(summary).toBeVisible({ timeout: 30_000 });
  });
  expect(await summary.innerText()).toBe(before);
  report("saved design: good design reloaded", [`results ${ms(reloadMs)}`]);
  withinBudget("results after the reload", reloadMs, 5_000);
  expect(errors).toEqual([]);
});
