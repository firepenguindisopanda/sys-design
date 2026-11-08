import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { designFile } from "./support/designs";
import { canvasNodes, collectErrors, importDesign, openEditor } from "./support/measure";

// SPEC-auto-layout.md: designs laid out in columns by role, on import and with Tidy layout.

/** Every node's position in flow coordinates, from React Flow's transform on the node. */
const flowPositions = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>(".react-flow__node")].map((n) => {
        const m = new DOMMatrixReadOnly(getComputedStyle(n).transform);
        return [n.dataset.id!, { x: Math.round(m.e), y: Math.round(m.f) }];
      }),
    ),
  );

/** Pairs of nodes whose boxes on screen overlap. */
const overlapping = (page: Page) =>
  page.evaluate(() => {
    const boxes = [...document.querySelectorAll<HTMLElement>(".react-flow__node")].map((n) => ({
      id: n.dataset.id!,
      r: n.getBoundingClientRect(),
    }));
    const found: string[] = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r;
        const b = boxes[j].r;
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) found.push(`${boxes[i].id} and ${boxes[j].id}`);
      }
    }
    return found;
  });

/** Nodes any part of which lies outside the canvas. */
const outsideCanvas = (page: Page) =>
  page.evaluate(() => {
    const pane = document.querySelector(".react-flow")!.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>(".react-flow__node")]
      .filter((n) => {
        const r = n.getBoundingClientRect();
        return r.left < pane.left || r.right > pane.right || r.top < pane.top || r.bottom > pane.bottom;
      })
      .map((n) => n.dataset.id!);
  });

const tidy = (page: Page) => page.getByRole("button", { name: "Tidy layout" });
const undo = (page: Page) => page.getByRole("button", { name: "Undo tidy" });
const announcement = (page: Page) => page.locator("#layout-announcement");

test("layout: a challenge fixture imports in columns by role, not on a grid", async ({ page }) => {
  const errors = collectErrors(page);
  await openEditor(page);
  const fixture = readFileSync(path.join(process.cwd(), "challenges/chat-app/fixtures/good.yaml"), "utf8");
  await importDesign(page, designFile("layout-chat-app.yaml", `challenge: chat-app\n${fixture}`), 8);
  const at = await flowPositions(page);
  expect(at.phone.x).toBe(at.laptop.x);
  expect(at.phone.x).toBeLessThan(at.lb.x);
  expect(at.lb.x).toBeLessThan(at["chat-1"].x);
  expect(at["chat-1"].x).toBe(at["chat-2"].x);
  expect(at.db.x).toBeGreaterThan(at.bus.x);
  expect(await overlapping(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("layout: Tidy layout, then Undo tidy puts every node back", async ({ page }) => {
  const errors = collectErrors(page);
  await openEditor(page);
  await page.getByRole("button", { name: "Load BeUWI demo" }).click();
  await expect(canvasNodes(page).first()).toBeVisible();
  const before = await flowPositions(page);

  await tidy(page).click();
  await expect(undo(page)).toBeVisible();
  await expect(announcement(page)).toHaveText(/^Laid out in \d+ columns\.$/);
  const after = await flowPositions(page);
  expect(after).not.toEqual(before);
  expect(await overlapping(page)).toEqual([]);
  // The view re-fits to the new, wider layout.
  await expect.poll(() => outsideCanvas(page), { message: "nodes outside the canvas after the tidy" }).toEqual([]);

  // Still offered once React Flow has measured everything again.
  await page.waitForTimeout(1_000);
  await expect(undo(page)).toBeVisible();

  await undo(page).click();
  await expect(tidy(page)).toBeVisible();
  await expect(announcement(page)).toHaveText("Layout undone.");
  expect(await flowPositions(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test("layout: moving a node after a tidy takes Undo tidy away", async ({ page }) => {
  await openEditor(page);
  await page.getByRole("button", { name: "Load BeUWI demo" }).click();
  await expect(canvasNodes(page).first()).toBeVisible();
  await tidy(page).click();
  await expect(undo(page)).toBeVisible();
  const box = (await canvasNodes(page).first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  await expect(tidy(page)).toBeVisible();
  await expect(undo(page)).toHaveCount(0);
});

test("layout: Tidy layout is disabled on an empty canvas", async ({ page }) => {
  await openEditor(page);
  await page.getByRole("button", { name: "Clear" }).click();
  const replace = page.getByRole("dialog");
  if (await replace.isVisible()) await replace.getByRole("button", { name: /Clear|Replace/ }).click();
  await expect(canvasNodes(page)).toHaveCount(0);
  await expect(tidy(page)).toBeDisabled();
});
