import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

await mkdir("/cursor/stores/self/media", { recursive: true });
await mkdir("/tmp/sesim-ext-vid", { recursive: true });

const browser = await chromium.launch({ headless: true });

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:43127/", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /Load BeUWI demo/i }).click();
await page.waitForTimeout(1200);
await page.screenshot({
  path: "/cursor/stores/self/media/simulator-new-nodes.png",
});

// Click a WebSocket edge label/path — select by clicking near WS connection
// Prefer clicking the edge via React Flow edge path
const wsEdge = page.locator(".react-flow__edge").filter({ hasText: "WS" }).first();
if (await wsEdge.count()) {
  await wsEdge.click({ force: true });
} else {
  // fallback: click any edge then change protocol in inspector
  await page.locator(".react-flow__edge").first().click({ force: true });
}
await page.waitForTimeout(600);

// Ensure connection inspector shows — change protocol to WebSocket if needed
const protocolTrigger = page
  .locator("text=Connection inspector")
  .locator("..")
  .locator('[data-slot="select-trigger"]')
  .first();
if (await protocolTrigger.count()) {
  await protocolTrigger.click();
  await page.getByRole("option", { name: /WebSocket/i }).click().catch(() => {});
  await page.waitForTimeout(400);
}

await page.screenshot({
  path: "/cursor/stores/self/media/simulator-edge-edit.png",
});
await page.close();

// Short video: load demo, select edge, change protocol, add Edge compute
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: "/tmp/sesim-ext-vid", size: { width: 1440, height: 900 } },
});
const v = await context.newPage();
await v.goto("http://localhost:43127/", { waitUntil: "networkidle" });
await v.waitForTimeout(700);
await v.getByRole("button", { name: /Load BeUWI demo/i }).click();
await v.waitForTimeout(900);
await v.locator(".react-flow__edge").first().click({ force: true });
await v.waitForTimeout(700);
await v.getByRole("button", { name: /Edge Compute/i }).click();
await v.waitForTimeout(700);
await v.getByRole("button", { name: /Message Queue/i }).click();
await v.waitForTimeout(700);
await v.getByRole("button", { name: /Run simulation/i }).click();
await v.waitForTimeout(1200);
await context.close();
await browser.close();

console.log("extension captures ok");
