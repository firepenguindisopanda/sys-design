import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

await mkdir("/cursor/stores/self/media", { recursive: true });
await mkdir("/tmp/sesim-vid", { recursive: true });

const browser = await chromium.launch({ headless: true });

// Screenshot 1: loaded demo
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:43127/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /Load BeUWI demo/i }).click();
await page.waitForTimeout(1000);
await page.screenshot({ path: "/cursor/stores/self/media/simulator-demo.png" });

// Screenshot 2: verification
await page.getByRole("button", { name: /Run simulation/i }).click();
await page.waitForTimeout(1000);
await page.screenshot({ path: "/cursor/stores/self/media/simulator-verification.png" });
await page.close();

// Video walkthrough
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: "/tmp/sesim-vid", size: { width: 1440, height: 900 } },
});
const vpage = await context.newPage();
await vpage.goto("http://localhost:43127/", { waitUntil: "networkidle" });
await vpage.waitForTimeout(800);
await vpage.getByRole("button", { name: /Load BeUWI demo/i }).click();
await vpage.waitForTimeout(900);
await vpage.getByRole("button", { name: /Run simulation/i }).click();
await vpage.waitForTimeout(1200);
await vpage.getByRole("button", { name: /Virtual Machine/i }).click();
await vpage.waitForTimeout(900);
await vpage.getByRole("button", { name: /Run simulation/i }).click();
await vpage.waitForTimeout(1000);
await context.close();
await browser.close();

console.log("screenshots ok");
