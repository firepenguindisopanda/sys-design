import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

await mkdir("/cursor/stores/self/media", { recursive: true });
await mkdir("/tmp/sesim-cf-vid", { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:43127/", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.getByRole("button", { name: /Load BeUWI demo/i }).click();
await page.waitForTimeout(1400);
await page.screenshot({ path: "/cursor/stores/self/media/simulator-clients.png" });

await page.getByRole("button", { name: /Fan-in DB demo/i }).click();
await page.waitForTimeout(1400);
await page.screenshot({ path: "/cursor/stores/self/media/simulator-fan-in.png" });
await page.close();

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: "/tmp/sesim-cf-vid", size: { width: 1440, height: 900 } },
});
const v = await context.newPage();
await v.goto("http://localhost:43127/", { waitUntil: "networkidle" });
await v.waitForTimeout(600);
await v.getByRole("button", { name: /Load BeUWI demo/i }).click();
await v.waitForTimeout(1000);
await v.getByRole("button", { name: /Fan-in DB demo/i }).click();
await v.waitForTimeout(1000);
await v.getByRole("button", { name: /Run simulation/i }).click();
await v.waitForTimeout(1200);
await context.close();
await browser.close();

console.log("clients/fan-in captures ok");
