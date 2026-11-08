import { defineConfig, devices } from "@playwright/test";

// SPEC-browser-stress.md: the browser checks, against a production build on a port of
// their own (43128), so a dev server on 43127 can't be tested by mistake. They take a few
// minutes, so they aren't part of `npm test`; run them with `npm run test:browser`.
const PORT = 43128;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  // A retry would hide exactly the kind of flake these tests look for.
  retries: 0,
  timeout: 60_000,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    // The installed Google Chrome, not a downloaded Chromium: no download, and it's the
    // browser students use. Headless Chrome is the full browser, so frames are paced as usual.
    channel: "chrome",
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium" }],
  webServer: {
    command: `npm run build && npx next start -H 127.0.0.1 -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
