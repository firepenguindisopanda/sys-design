# Spec: screenshots and recordings for the README

Status: **approved** (2026-11-01) with these choices:
- featured challenge: *Lecture recording library*;
- `walkthrough.mp4` committed and linked;
- images at 2×;
- no dark-mode shots.

Module id `readme-media`. Branch: `docs/readme-media`, from `main` (`3aefa4b`).

## Objective

The README describes Sesim only in text, with no images. A visitor can't tell it's a visual
canvas tool until they clone it and run it. We want a few images and short recordings that
show the main flows, so people see how it works before they install anything.

Readers: students and lecturers arriving at the GitHub repo, and contributors.

## Approach

**Scripted, not hand-recorded.** One Playwright script, `scripts/capture-readme-media.mjs`,
drives the app and saves every image and raw video. ffmpeg then converts the videos. When the
UI changes, rerunning the script brings every image up to date.

- **Playwright is already a devDependency** (1.63). The script uses the installed Chrome
  (`channel: "chrome"`), so no browser download is needed.
- **Capture from a production build** (`npm run build`, then `next start` on port 43128), not
  `next dev`. The dev server draws the Next.js "N" badge in the bottom-left corner, over the
  results panel.
- **Viewport 1440×900.** Images are taken at 2× pixel density, so they stay sharp on high-DPI
  screens. Videos are recorded at 1×.
- **A visible cursor.** Headless Chrome draws no mouse pointer, so in a recording things would
  just change with no visible cause. The script injects a small cursor overlay (a DOM dot that
  follows mouse events and pulses on click). The mouse glides between targets
  (`mouse.move` with steps), so viewers can see what's being clicked.
- **Designs come from fixtures.** Challenge designs are loaded through **Import**
  (`setInputFiles`), so the recordings show the real feature. The files in
  `scripts/readme-media/` are copies of `good` and `bad-no-cdn` with node positions added
  (`at: [x, y]`). Without positions, the app lays nodes out in a grid where edges cross other
  nodes.
- **Short pauses** (about 0.8–1.5 s) after each step, so a viewer can read the result.
- **Recorded with Chrome's screencast**, not Playwright's `recordVideo`. `recordVideo` needs a
  separate ffmpeg download and records low-bitrate VP8, which blurs small text. The screencast
  sends a JPEG (quality 92) each time the page repaints, with a timestamp, and the system
  ffmpeg joins the frames into a 30 fps video.

### ffmpeg conversions

| Output | Use | Settings |
|---|---|---|
| `*.gif` | inline in the README (autoplays, loops) | 12 fps, 960 px wide, `palettegen`/`paletteuse` two-pass, target ≤ 4 MB each |
| `walkthrough.mp4` | full tour | H.264, CRF 23, `yuv420p`, `+faststart`, no audio |
| `*.mp4` (raw) | intermediate in the system temp folder, not committed | screencast frames → H.264, CRF 12, 30 fps |

**Videos on GitHub:** a README can't play an `.mp4` that's committed to the repo; it only shows
a link. To play one inline, you drag the file into a GitHub comment or PR box, which gives you
a `user-attachments` URL, and paste that URL into the README. So the GIFs carry the inline
demo, and the MP4 is committed and linked (or uploaded, if you'd rather; see the open
questions).

## Shot list

Everything goes in `docs/media/`.

### Images (PNG)

| File | Shows |
|---|---|
| `hero.png` | Sandbox with the **BeUWI demo** loaded and fitted to view, a simulation run, and the results panel open. This is the image at the top of the README. |
| `challenge-brief.png` | **Lecture recording library** picked; the right panel shows the Brief tab (scenario, out of scope, think-about questions). |
| `challenge-fail-hints.png` | Fixture `bad-no-cdn` imported and run: Fail result, with one staged hint opened. |
| `challenge-pass.png` | Fixture `good` imported and run: everything passes. |
| `edge-inspector.png` | A connection selected on the canvas, with the inspector showing the protocol picker. |
| `requirements.png` | Requirements panel: feature cards with memory/vCPU/disk, target RPM, and placement on compute (cropped to the panel). |

### GIFs (short loops, 8–15 s each)

1. **`build-a-design.gif`**: from an empty sandbox, add Mobile client → Load balancer →
   PaaS → Database by clicking the library, connect them by dragging between handles, then
   **Run simulation**. Shows the core loop.
2. **`challenge-flow.gif`**: pick a challenge → skim the brief → import a flawed design →
   run → Fail with a hint → import the good design → run → Pass.
3. **`stale-results.gif`**: after a run, change the design (e.g. delete the cache); the
   results dim and are labelled out of date; run again and see the new result.

### Video

- **`walkthrough.mp4`** (about 60–90 s): the three flows above in one take, plus Export
  saving a YAML file.

## README changes

- A **hero image** under the title, with one sentence on what it shows.
- A **"See it in action"** section after "What you can do", with the three GIFs, a caption
  for each, and a link to `walkthrough.mp4`.
- `challenge-brief.png` and `challenge-pass.png` in the **Challenges** section.
- A one-line note in "Run locally": `node scripts/capture-readme-media.mjs` regenerates the
  media (it needs a production build running on port 43128).

## Budget and boundaries

- Each GIF ≤ 4 MB; all of `docs/media/` ≤ 15 MB. If a GIF goes over, lower the fps to 10 or
  the width to 800 px before cutting content. No Git LFS.
- **No app code changes.** The cursor overlay is injected by the script only.
- The three old `scripts/capture-*.mjs` (from upstream, writing to `/cursor/...` paths) are
  left alone. The new script doesn't depend on them.

## Acceptance

- `node scripts/capture-readme-media.mjs` runs without errors against a production build and
  writes every file in the shot list. Rerunning it gives the same shots.
- Each image is readable at GitHub's README width (about 880 px): node labels and result rows
  can be read.
- GIFs loop cleanly and are within budget; the MP4 plays in a browser.
- The README renders on GitHub with all media showing (checked in a pushed branch or PR
  preview).
