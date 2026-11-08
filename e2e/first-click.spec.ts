import { expect, test, type Page } from "@playwright/test";
import { collectErrors, report, runFinished } from "./support/measure";

// SPEC-browser-stress.md, scenario 4: the first click on Run simulation after a page load.
// Seen once in the workload-fields browser check: the click didn't register, and a second
// one worked. The likeliest cause is a click on the server-rendered button before React has
// hydrated it, so each try clicks as early as Playwright can, and records whether React had
// taken over the button by then. A slowed CPU, like a slow laptop's, widens that window.
//
// Found 2026-11-07: on a production build the scripts arrive before Playwright can click,
// even with the CPU slowed 6×. When they arrive late (a slow network, or the dev server
// compiling on demand, where the flake was seen), every early click was lost. A small
// inline script now remembers it (src/lib/early-click.ts), and the panel runs it once React
// takes over. The last variant holds the scripts back to prove it.

const TRIES = 20;
/** How long the results may take to appear, after React has taken over, before a click counts as lost. */
const LOST_AFTER_MS = 2_000;

declare global {
  interface Window {
    __runClicks?: { hydrated: boolean }[];
  }
}

/** Record, for each click on Run simulation, whether React had hydrated the button. */
async function recordClicks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__runClicks = [];
    document.addEventListener(
      "click",
      (e) => {
        const button = (e.target as Element | null)?.closest("button");
        if (!button || !button.textContent?.includes("Run simulation")) return;
        // React marks each element it has hydrated with a "__reactProps$…" key.
        window.__runClicks!.push({ hydrated: Object.keys(button).some((k) => k.startsWith("__reactProps$")) });
      },
      true,
    );
  });
}

type Try = { registered: boolean; hydrated: boolean | null };

/** One fresh page load, clicking as soon as the button can be clicked. */
async function oneTry(page: Page, v: Variant): Promise<Try> {
  await page.goto("/", { waitUntil: "commit" });
  await v.steps(page);
  await page.getByRole("button", { name: "Run simulation" }).click();
  let registered = true;
  try {
    await expect(runFinished(page)).toBeAttached({ timeout: LOST_AFTER_MS + (v.scriptDelayMs ?? 0) });
  } catch {
    registered = false;
  }
  const clicks = await page.evaluate(() => window.__runClicks ?? []);
  return { registered, hydrated: clicks[0]?.hydrated ?? null };
}

type Variant = {
  name: string;
  cpuSlowdown?: number;
  /** Hold the page's JavaScript back this long, so the button is on screen before React is. */
  scriptDelayMs?: number;
  /** Whether the click must land before React takes over the button. */
  early?: boolean;
  steps: (page: Page) => Promise<void>;
};

const VARIANTS: Variant[] = [
  { name: "Run first, on the empty sandbox", steps: async () => {} },
  { name: "Run first, CPU slowed 6×", cpuSlowdown: 6, steps: async () => {} },
  { name: "Run first, scripts 1.5 s late", scriptDelayMs: 1_500, early: true, steps: async () => {} },
  {
    name: "Run after loading the BeUWI demo",
    steps: async (page) => {
      await page.getByRole("button", { name: /Load BeUWI demo/ }).click();
      await expect(page.locator(".react-flow__node").first()).toBeVisible();
    },
  },
];

for (const v of VARIANTS) {
  test(`first click: ${v.name}, ${TRIES} fresh loads`, async ({ page }) => {
    test.setTimeout(TRIES * (15_000 + 2 * (v.scriptDelayMs ?? 0)));
    const errors = collectErrors(page);
    await recordClicks(page);
    if ((v.cpuSlowdown ?? 1) > 1) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: v.cpuSlowdown! });
    }
    if (v.scriptDelayMs) {
      // Only the JavaScript: held-back stylesheets would stop the page painting at all.
      await page.route(/\/_next\/static\/chunks\/.*\.js(\?|$)/, async (route) => {
        await new Promise((r) => setTimeout(r, v.scriptDelayMs));
        await route.continue();
      });
    }
    const tries: Try[] = [];
    for (let i = 0; i < TRIES; i++) tries.push(await oneTry(page, v));
    const lost = tries.flatMap((t, i) => (t.registered ? [] : [i + 1]));
    const early = tries.filter((t) => t.hydrated === false).length;
    report(`first click ${v.name}`, [
      `${TRIES - lost.length} of ${TRIES} registered`,
      `lost on tries ${lost.join(", ") || "none"}`,
      `${early} clicked before React took over the button`,
    ]);
    expect(lost, "tries whose click on Run simulation was lost").toEqual([]);
    if (v.early) expect(early, "clicks that landed before React took over the button").toBe(TRIES);
    expect(errors).toEqual([]);
  });
}
