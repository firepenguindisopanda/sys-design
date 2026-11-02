// Screenshots and recordings for the README, written to docs/media/.
//
//   npm run build && npx next start -p 43128
//   node scripts/capture-readme-media.mjs [stills|videos|convert] [name]   (default: all)
//
// A name after "videos" records only that clip, e.g. "videos build-a-design".
//
// Uses the installed Chrome through Playwright, and ffmpeg on PATH for the GIFs and MP4.
// See SPEC-readme-media.md.
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = process.env.SESIM_URL ?? "http://localhost:43128";
const OUT = path.resolve("docs/media");
const RAW = path.join(tmpdir(), "sesim-readme-media");
const VIEWPORT = { width: 1440, height: 900 };
const CHALLENGE = "Lecture recording library";
// Copies of two lecture-video-library fixtures with node positions, for a readable layout.
const FIXTURES = path.resolve("scripts/readme-media");

const step = process.argv[2] ?? "all";
const only = process.argv[3];

// A pointer for recordings: headless Chrome draws none. It follows real mouse events and
// shows a ring on each click, so viewers can see what's being pressed.
const CURSOR_SCRIPT = `
addEventListener("DOMContentLoaded", () => {
  const cursor = document.createElement("div");
  cursor.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l15 11.5-6.6.9 3.9 7.6-3 1.5-3.9-7.7L4 20z" fill="#0f172a" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  Object.assign(cursor.style, {
    position: "fixed", left: "-40px", top: "-40px", width: "22px", height: "22px",
    marginLeft: "-4px", marginTop: "-2px", pointerEvents: "none", zIndex: 2147483647,
    filter: "drop-shadow(0 1px 2px rgba(0,0,0,.35))",
  });
  document.body.appendChild(cursor);
  addEventListener("mousemove", (e) => {
    cursor.style.left = e.clientX + "px";
    cursor.style.top = e.clientY + "px";
  }, true);
  addEventListener("mousedown", (e) => {
    const ring = document.createElement("div");
    Object.assign(ring.style, {
      position: "fixed", left: e.clientX - 16 + "px", top: e.clientY - 16 + "px",
      width: "32px", height: "32px", borderRadius: "50%", border: "3px solid #0d9488",
      pointerEvents: "none", zIndex: 2147483646, transition: "transform .45s, opacity .45s",
    });
    document.body.appendChild(ring);
    requestAnimationFrame(() => { ring.style.transform = "scale(1.8)"; ring.style.opacity = "0"; });
    setTimeout(() => ring.remove(), 500);
  }, true);
});`;

// --- helpers ---------------------------------------------------------------------------

/** Moves the mouse in visible steps when recording; jumps when taking stills. */
function actor(page, { recording }) {
  let at = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };
  const pause = (ms) => page.waitForTimeout(recording ? ms : Math.min(ms, 300));

  async function moveTo(x, y) {
    if (recording) {
      const steps = Math.max(12, Math.round(Math.hypot(x - at.x, y - at.y) / 18));
      await page.mouse.move(x, y, { steps });
    } else {
      await page.mouse.move(x, y);
    }
    at = { x, y };
  }

  async function clickAt(x, y) {
    await moveTo(x, y);
    await pause(150);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
  }

  async function click(locator) {
    await locator.waitFor({ state: "visible" });
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    await clickAt(box.x + box.width / 2, box.y + box.height / 2);
  }

  async function drag(from, to) {
    await moveTo(from.x, from.y);
    await pause(150);
    await page.mouse.down();
    await moveTo(to.x, to.y);
    await pause(150);
    await page.mouse.up();
  }

  return { pause, moveTo, click, clickAt, drag };
}

async function open(context) {
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator(".react-flow__renderer").waitFor();
  await page.waitForTimeout(500);
  return page;
}

/** Accepts the "Replace your design?" dialog when it appears. */
async function confirmReplace(page, a) {
  const replace = page.getByRole("dialog").getByRole("button", { name: /^(Replace|Clear)$/ });
  try {
    await replace.waitFor({ state: "visible", timeout: 700 });
  } catch {
    return;
  }
  await a.pause(500);
  await a.click(replace);
  await replace.waitFor({ state: "hidden" });
}

async function pickChallenge(page, a, title) {
  await a.click(page.getByRole("combobox", { name: "Challenge" }));
  await a.pause(600);
  await a.click(page.getByRole("option", { name: title }));
  await confirmReplace(page, a);
  await a.pause(800);
}

async function importFixture(page, a, name) {
  await a.click(page.getByRole("button", { name: "Import" }));
  await page.getByLabel("Design file to import").setInputFiles(path.join(FIXTURES, `${name}.yaml`));
  await confirmReplace(page, a);
  await fitView(page, a);
}

/** Fits the design in view without moving the mouse, so recordings don't detour to it. */
async function fitView(page, a) {
  await page.getByRole("button", { name: /fit view/i }).evaluate((b) => b.click());
  await a.pause(500);
}

/** Runs the simulation, then refits: the results panel takes height from the canvas. */
async function run(page, a, { fit = true } = {}) {
  await a.click(page.getByRole("button", { name: "Run simulation" }));
  await a.pause(1200);
  if (fit) await fitView(page, a);
}

/** Zooms the empty canvas to about 100% with the zoom buttons. */
async function zoomToActual(page) {
  const scale = () =>
    page.locator(".react-flow__viewport").evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  for (let i = 0; i < 10 && (await scale()) < 0.95; i++) {
    await page.getByRole("button", { name: /zoom in/i }).evaluate((b) => b.click());
    await page.waitForTimeout(150);
  }
  for (let i = 0; i < 10 && (await scale()) > 1.15; i++) {
    await page.getByRole("button", { name: /zoom out/i }).evaluate((b) => b.click());
    await page.waitForTimeout(150);
  }
}

/** Screen position of the middle of an edge's path, so a click lands on the line. */
async function edgeMidpoint(page, source, target) {
  return page.evaluate(
    ([s, t]) => {
      const edge = [...document.querySelectorAll(".react-flow__edge")].find((el) => {
        const label = el.getAttribute("aria-label") ?? "";
        return label.includes(s) && label.includes(t);
      });
      if (!edge) throw new Error(`no edge ${s} -> ${t}`);
      const p = edge.querySelector("path.react-flow__edge-path");
      const pt = p.getPointAtLength(p.getTotalLength() / 2);
      const m = p.getScreenCTM();
      return { x: pt.x * m.a + pt.y * m.c + m.e, y: pt.x * m.b + pt.y * m.d + m.f };
    },
    [source, target],
  );
}

/** Centre of a node's handle, e.g. handle(page, "Database", "t-top-0"). */
async function handle(page, nodeLabel, id) {
  const node = page.locator(".react-flow__node", { hasText: nodeLabel }).first();
  const box = await node.locator(`.react-flow__handle[data-handleid="${id}"]`).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// --- stills ----------------------------------------------------------------------------

async function stills(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await open(context);
  const a = actor(page, { recording: false });
  const shot = (name, opts = {}) => page.screenshot({ path: path.join(OUT, name), ...opts });

  // Sandbox: the BeUWI demo with a run.
  await a.click(page.getByRole("button", { name: "Load BeUWI demo" }));
  await confirmReplace(page, a);
  await run(page, a);
  await page.mouse.move(0, 0);
  await shot("hero.png");

  const panel = page.locator("aside").filter({ hasText: "Functional → features" });
  await shot("requirements.png", { clip: await panel.boundingBox() });

  // Challenge: brief, a flawed design with a hint, then the reference design.
  await pickChallenge(page, a, CHALLENGE);
  await page.mouse.move(0, 0);
  await shot("challenge-brief.png");

  await importFixture(page, a, "bad-no-cdn");
  await run(page, a);
  await a.click(page.getByRole("button", { name: "Show a hint" }).first());
  await a.click(page.getByRole("button", { name: /^Why\?/ }).first());
  await page.mouse.move(0, 0);
  await shot("challenge-fail-hints.png");

  await importFixture(page, a, "good");
  await run(page, a);
  await page.mouse.move(0, 0);
  await shot("challenge-pass.png");

  const mid = await edgeMidpoint(page, "Video CDN", "Recordings");
  await a.clickAt(mid.x, mid.y);
  await page.getByText("Selected connection").waitFor();
  await a.pause(400);
  await page.mouse.move(0, 0);
  await shot("edge-inspector.png");

  await context.close();
}

// --- videos ----------------------------------------------------------------------------

// Chrome's screencast rather than Playwright's recordVideo: recordVideo needs its own ffmpeg
// download and encodes at a low bitrate that blurs small text. The screencast sends a JPEG
// whenever the page repaints, with a timestamp; ffmpeg turns them into a 30 fps video.
async function record(browser, name, { setup, script }) {
  if (only && only !== name) return;
  const dir = path.join(RAW, name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript(CURSOR_SCRIPT);
  const page = await open(context);
  // Setup runs before the recording starts, at full speed.
  if (setup) await setup(page, actor(page, { recording: false }));
  const a = actor(page, { recording: true });

  const cdp = await context.newCDPSession(page);
  const frames = [];
  const writes = [];
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    const file = path.join(dir, `f${String(frames.length).padStart(5, "0")}.jpg`);
    frames.push({ file, t: metadata.timestamp });
    writes.push(writeFile(file, Buffer.from(data, "base64")));
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92 });
  await a.pause(600);
  await script(page, a);
  await a.pause(1500);
  const end = Date.now() / 1000;
  await cdp.send("Page.stopScreencast");
  await Promise.all(writes);
  await context.close();

  // Each frame stays on screen until the next one; the last until the recording stopped.
  const list = frames.flatMap((f, i) => {
    const until = i + 1 < frames.length ? frames[i + 1].t : end;
    return [`file '${f.file.replaceAll("\\", "/")}'`, `duration ${Math.max(until - f.t, 0.001).toFixed(3)}`];
  });
  list.push(`file '${frames.at(-1).file.replaceAll("\\", "/")}'`);
  const listFile = path.join(dir, "frames.txt");
  await writeFile(listFile, list.join("\n"));
  ffmpeg([
    "-f", "concat", "-safe", "0", "-i", listFile,
    "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "12", "-preset", "fast",
    path.join(RAW, `${name}.mp4`),
  ]);
  console.log(`${name}: ${frames.length} frames, ${(end - frames[0].t).toFixed(1)} s`);
}

async function clearCanvas(page, a) {
  await a.click(page.getByRole("button", { name: "Clear" }));
  await confirmReplace(page, a);
  await zoomToActual(page);
}

/** Drag four components from the library, wire them, place the features and run. */
async function buildADesign(page, a) {
  const column = [
    ["Mobile Client", 560, 250],
    ["Load Balancer", 560, 400],
    ["PaaS / App Platform", 560, 550],
    ["Database", 560, 700],
  ];
  for (const [name, x, y] of column) {
    const item = page.getByRole("button", { name: new RegExp(`^${name}`) });
    await item.scrollIntoViewIfNeeded();
    const box = await item.boundingBox();
    await a.drag({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, { x, y });
    await a.pause(400);
  }

  for (let i = 0; i + 1 < column.length; i++) {
    const from = await handle(page, column[i][0], "s-bottom-0");
    const to = await handle(page, column[i + 1][0], "t-top-0");
    await a.drag(from, to);
    await a.pause(400);
  }

  // The sandbox keeps the demo's two features; put both on the new PaaS node.
  const requirements = page.locator("aside").filter({ hasText: "Functional → features" });
  for (let i = 0; i < 2; i++) {
    await a.click(requirements.getByRole("combobox").filter({ hasText: "Unplaced" }).first());
    await a.pause(400);
    await a.click(page.getByRole("option", { name: /PaaS \/ App Platform/ }));
    await a.pause(500);
  }

  await a.clickAt(900, 760); // empty canvas: closes the inspector
  await run(page, a, { fit: false });
  await a.pause(1500);
}

async function challengeFlow(page, a) {
  await pickChallenge(page, a, CHALLENGE);
  await a.pause(800);
  await importFixture(page, a, "bad-no-cdn");
  await run(page, a);
  await a.click(page.getByRole("button", { name: "Show a hint" }).first());
  await a.pause(1200);
  await a.click(page.getByRole("button", { name: /^Why\?/ }).first());
  await a.pause(1800);
  await importFixture(page, a, "good");
  await run(page, a);
  await a.pause(1500);
}

async function staleResults(page, a) {
  await a.click(page.locator(".react-flow__node", { hasText: "Video CDN" }).first());
  await a.pause(600);
  await a.click(page.getByRole("button", { name: "Delete", exact: true }));
  await a.pause(2000);
  await run(page, a);
  await a.pause(1500);
}

async function walkthrough(page, a) {
  await clearCanvas(page, a);
  await buildADesign(page, a);
  await challengeFlow(page, a);
  await staleResults(page, a);
  await a.click(page.getByRole("button", { name: "Export" }));
  await a.pause(1200);
}

async function videos(browser) {
  await record(browser, "build-a-design", { setup: clearCanvas, script: buildADesign });
  await record(browser, "challenge-flow", { script: challengeFlow });
  await record(browser, "stale-results", {
    setup: async (page, a) => {
      await pickChallenge(page, a, CHALLENGE);
      await importFixture(page, a, "good");
      await run(page, a);
    },
    script: staleResults,
  });
  await record(browser, "walkthrough", { script: walkthrough });
}

// --- ffmpeg ----------------------------------------------------------------------------

function ffmpeg(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    stdio: "inherit",
  });
  if (r.error) throw new Error(`ffmpeg not found on PATH (${r.error.message})`);
  if (r.status !== 0) throw new Error(`ffmpeg exited with ${r.status}`);
}

async function convert() {
  for (const name of ["build-a-design", "challenge-flow", "stale-results"]) {
    const input = path.join(RAW, `${name}.mp4`);
    const output = path.join(OUT, `${name}.gif`);
    ffmpeg([
      "-i", input,
      "-vf",
      "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
      output,
    ]);
    console.log(`${name}.gif  ${((await stat(output)).size / 1e6).toFixed(1)} MB`);
  }
  const mp4 = path.join(OUT, "walkthrough.mp4");
  ffmpeg([
    "-i", path.join(RAW, "walkthrough.mp4"),
    "-c:v", "libx264", "-crf", "23", "-preset", "slow", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", "-an", mp4,
  ]);
  console.log(`walkthrough.mp4  ${((await stat(mp4)).size / 1e6).toFixed(1)} MB`);
}

// --- main ------------------------------------------------------------------------------

await mkdir(OUT, { recursive: true });
await mkdir(RAW, { recursive: true });

if (step !== "convert") {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    if (step === "all" || step === "stills") await stills(browser);
    if (step === "all" || step === "videos") await videos(browser);
  } finally {
    await browser.close();
  }
}
if (step === "all" || step === "convert") await convert();
console.log(`done: ${OUT}`);
