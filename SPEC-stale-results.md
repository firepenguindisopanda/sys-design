# Spec: mark stale results, and make the results panel easier to read

Status: **approved** (2026-10-28) as proposed:
- dim and label old results;
- renaming a node counts as a change;
- passes are shown when everything passes;
- the seven messages as in the table;
- one combined plan and task list.

Plan: [tasks/stale-results/plan.md](tasks/stale-results/plan.md). Module id `stale-results`. Branch: `feat/stale-results`,
from `main` (`80735c5`). Covers findings 1 and 10 of
[docs/ui-ux-audit.md](docs/ui-ux-audit.md).

## Objective

**Results go stale without saying so (finding 1).** After a run, the results stay on screen
however much the design changes. In the audit, the food-guide brief still said "Topology:
Canvas is empty" and "Fail" while a VM sat on the canvas. Students will read old numbers as
the result of their latest change.

**The results panel is hard to scan (finding 10):**
- Checks appear in engine order, so failures sit among passes. The demo shows 12 rows, and
  the one warning is fifth.
- There's no count, only one overall badge.
- The panel takes up to 176 px plus its header, and at 1280×800 the canvas loses about 30%
  of its height. It can't be hidden.
- Seven engine messages cite "PDF" ("PDF: mainly only compute components…"). Students in a
  challenge don't have that PDF.

Users: every student, after every run.

## Change

### A. Stale results

- **When a run finishes, the store records what the design looked like.** This is a new
  field, `verifiedFingerprint`, holding the same kind of `Fingerprint` that
  `src/lib/unsaved.ts` already computes for unsaved work. It's set by `runVerification`,
  and set to `null` wherever `verification` is.
- **Results are stale when the design differs from that record.** A new store method,
  `resultsAreStale()`, compares the record with the design now.
  - What counts: nodes, their labels and settings, edges and protocols, placements,
    requirements, feature numbers and targets. These are what the engine and the brief
    rules read; labels count because they appear in the result text.
  - What doesn't count: **node positions**, a node's purpose note, selection and
    measured sizes. None of them changes a result, and dragging a node to tidy the canvas
    shouldn't mark the run as old.
  - So `fingerprint` gains an option to leave out positions and purpose notes:
    `fingerprint(state, { forResults: true })`. Unsaved-work detection is unchanged.
- **What a stale panel shows:**
  - A notice in the header: "Design changed since this run." The **Run simulation**
    button stays where it is.
  - The result rows dim (reduced opacity) but stay readable. Students often compare old
    and new numbers.
  - The overall badge keeps its colour but gains "(old)", for example "Fail (old)".
  - The notice is in a polite live region, so a screen reader announces it once when it
    appears.
- **Running again** replaces the record, and the notice goes away.

### B. A more readable results panel

- **Order:** failures first, then warnings, then passes. Within each group the current
  order is kept (engine checks, then brief rules). Brief rules keep their teal tint.
- **Counts:** next to the badge, for example "3 failed · 1 warning · 8 passed". Groups
  with no rows are left out.
- **Passes collapse:** when anything fails or warns, passed rows are hidden behind a
  "Show 8 passed" button, which then reads "Hide passed". When everything passes, they
  show. This resets to collapsed after each run.
- **Hide the panel:** a "Hide results" / "Show results" button in the header, with
  `aria-expanded`. Hidden, only the header row shows. A new run shows it again.
- **Announcement:** when a run finishes, a polite live region says the counts, for
  example "Run finished: 3 failed, 1 warning, 8 passed."
- The panel's maximum height (`max-h-44`) is unchanged.

### C. Engine messages without "PDF"

The `detail` text of seven checks in `src/lib/simulation.ts` is rewritten to stand on its
own. Statuses, numbers, ids and titles don't change.

| Line | Now | Proposed |
|---|---|---|
| 573 | PDF guideline: clients should reach databases via compute intermediates. | Clients should reach a database through compute, such as an API, not directly. |
| 609 | PDF: mainly only compute components should be intermediates between others. | Requests pass through this on the way to other components. Usually only compute sits in the middle. |
| 630 | Static hosting without CDN — higher client latency for assets (PDF pattern). | Static hosting without a CDN in front: every client loads the site's files from one place, which is slower. |
| 640 | No cache next to the database — consider Redis/Memcached for hot reads (PDF / cost case study). | No cache next to the database. A cache (Redis or Memcached) can take the repeated reads. |
| 687 | PDF/security: API keys on the client risk reverse engineering. Prefer proxying through compute (Type B). | A client calling an external API directly has to hold its API key, where anyone can extract it. Call the API from your server instead. |
| 727 | Draw SSE / Web Push from server → client (PDF: server delivers messages). | SSE and Web Push go from server to client. Draw the arrow that way. |
| 852 | Estimated monthly cost is within budget (heuristic; PDF stresses cost as a design axis). | Estimated monthly cost is within budget (a rough estimate). |

Code comments that mention the PDF, and the sandbox's "Defaults mirror BeUWI case study from
the PDF" note (finding 18), are left alone.

## Out of scope

- **Staged hints for brief rules** (finding 2): that's `staged-hints`, which needs a
  teaching decision.
- **The first click on Run after a page load sometimes not registering** (deferred polish
  in `HANDOVER.md`). If it shows up in the browser check, I'll note it, not fix it here.
- **Drag-to-resize**, and **remembering whether the panel is hidden** across reloads.

## Code

- **`src/lib/unsaved.ts`:** `fingerprint(s, opts?)` with `opts.forResults` leaving out `at`
  and `purpose`. A short comment says why.
- **`src/lib/store.ts`:**
  - `verifiedFingerprint: Fingerprint | null` in state and in the three seeds;
  - `runVerification` sets it;
  - every action that sets `verification: null` also sets it to `null`;
  - a new `resultsAreStale(): boolean` method, which is `false` when there is no result.
- **New `src/lib/results.ts`** (pure, no React):
  - `orderResults(checks, rules)`: one list of rows (`{ key, title, detail, status,
    actual?, target?, rule: boolean }`) sorted fail → warn → pass, stable within each
    group;
  - `countResults(rows)` returns `{ fail, warn, pass }`;
  - `summarizeCounts(counts)` returns "3 failed · 1 warning · 8 passed".
- **`verification-panel.tsx`:** renders from `orderResults`, adds the counts, the stale
  notice and the dimming, the passed toggle, the hide toggle and the live region. Local
  `useState` holds the two toggles; both reset when a new result arrives (keyed on the
  result object).
- **Test helper:** `a11y.test.tsx` patches Zustand's initial state so static rendering sees
  the live state. A second panel test will need the same, so this moves to
  `src/test/render-with-store.tsx` (`renderWithStore(ui)`, which restores the state
  afterwards), and `a11y.test.tsx` uses it.
- **Next.js:** none of this touches Next APIs.

## Tests (written first)

- **`src/lib/unsaved.test.ts`:** with `forResults`, moving a node or editing its purpose
  note leaves the fingerprint unchanged; renaming a node or changing its config changes
  it. Without the option, behaviour is unchanged (the existing tests stay as they are).
- **`src/lib/store.test.ts`:**
  - no result → not stale;
  - after `runVerification` → not stale;
  - each of these makes it stale: add a node; delete an edge; change a protocol; place a
    feature; in the sandbox, change an NFR target; rename a node;
  - none of these does: move a node; select or deselect; edit a purpose note;
  - running again → not stale;
  - `clearCanvas`, `startChallenge` and `loadDesign` clear both the result and the record.
- **`src/lib/results.test.ts`:**
  - the demo's checks come out fail, then warn, then pass, stable within each group;
  - brief rules are merged in by status and keep `rule: true`;
  - counts, and summary text with empty groups left out ("1 warning · 11 passed").
- **`verification-panel.test.tsx`** (static render with `renderWithStore`):
  - no result: just the header and the Run button;
  - after a run: the counts, failures first, passes behind "Show N passed";
  - all passing: passes shown, no toggle;
  - stale: the notice, "(old)" on the badge, the rows dimmed.
- **`src/lib/simulation.test.ts`:** no check's `detail` contains "PDF".
- **Existing tests** stay green; the demo and fixture results are unchanged apart from the
  seven messages.

## Browser check (Chrome DevTools)

- **Sandbox, 1440×900:**
  - Run, then drag a node: not stale.
  - Add a node: the notice appears, the rows dim and the badge reads "(old)".
  - Run again: the notice is gone.
- **Challenge, 1280×800:** run on an empty canvas, then add a VM: stale. The counts are
  correct, failures are first and passes are collapsed.
- **Toggles:** "Hide results" shrinks the panel to its header and the canvas grows; a new
  run shows the panel again. "Show N passed" works.
- **Lighthouse** accessibility snapshot in both modes: still 100.
- **Screen reader:** the accessibility snapshot shows the live region text after a run and
  after a change.
- The console has no new errors.

## Docs

- `docs/ui-ux-audit.md`: mark findings 1 and 10 fixed (10's resizable panel becomes
  "collapsible").
- `docs/challenges/brief-format.md`: nothing (no brief field changes).
- `HANDOVER.md` (untracked).

## Boundaries

- **Always:**
  - engine statuses, numbers, ids and titles unchanged;
  - briefs, fixtures and demos unchanged;
  - tests, `tsc`, lint and build stay green;
  - Lighthouse accessibility stays 100.
- **Ask first:**
  - clearing results instead of dimming them;
  - running the check automatically on every change;
  - a drag-to-resize panel;
  - changing the brief rules' "Needs a …" hints (that's `staged-hints`).
- **Never:** hide a failing or warning row by default.

## Success criteria

1. After any change that can alter a result, the panel says the results are old until the
   next run. Moving nodes doesn't trigger it.
2. Failures come first, a count summary is shown, and passes are one click away.
3. The results panel can be hidden and comes back on the next run.
4. No student-facing check message mentions "PDF".
5. All tests, `tsc`, lint and build pass; the browser checks pass; Lighthouse stays at 100.

## Open questions

1. **Dim or clear?** Proposed: dim and label as old, so students can compare before and
   after. Clearing is simpler, but loses that.
2. **Should a renamed node make results stale?** Proposed yes, because the names appear in
   the result text. The alternative leaves labels out too, so only structural changes
   count.
3. **Passes when everything passes.** Proposed: shown expanded, as a visible "all green".
   The alternative is to collapse them always.
4. **The seven rewritten messages.** As in the table, or would you like different wording?
5. **Plan format.** One combined plan and task list, as before?
