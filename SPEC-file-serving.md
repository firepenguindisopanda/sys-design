# Spec: charge the servers for files they serve (finding 15)

Status: **implemented** (2026-10-28); approved as proposed: file-storage included, a store without a CDN left
uncharged, values 2400, 3000 and 1200, one combined plan and task list. Plan:
[tasks/file-serving/plan.md](tasks/file-serving/plan.md).
Engine change from finding 15 in `docs/challenges/phase1-findings.md`. Module id
`file-serving`. Branch: `fix/file-serving`, from `main` (`deb41ca`).

## Objective

A CDN takes file traffic (pages, scripts, video) off your servers. The engine doesn't
model that traffic at all, so serving the files from the API costs nothing, and dropping
the CDN saves money:

| Fixture | Latency | Throughput | Cost | Good design |
|---|---|---|---|---|
| `campus-food-guide/bad-pages-from-api` | 31 ms | 1660 | $224 | 31 ms, 1660, $236 |
| `lecture-video-library/bad-no-cdn` | 49 ms | 1678 | $345 | 49 ms, 1678, $357 |

Both are caught only by brief rules today. After this change, a design whose servers
serve the files should need the capacity to do it.

Users: students reading the Throughput figure; you, writing briefs.

## Change

The same shape as `pollingRpm` (findings 10 and 7).

**A third optional feature field** in `brief.yaml`, a number ≥ 1:

```yaml
feature:
  name: Watch lecture
  ...
  targetRpm: 800
  fileRpm: 3000   # requests per minute for files this feature has clients fetch
                  # (pages, scripts, video segments); your servers handle them unless
                  # the files come from a store
```

**Engine (`src/lib/simulation.ts`):**

1. **Files come from a store** when some client has an edge to static hosting or object
   storage, or an edge to a CDN that has an edge to static hosting or object storage.
   - This is design-wide, not per feature: one file store serves all of a design's files.
   - A CDN in front of the API, or one whose origin is a database, doesn't count.
2. **Otherwise the servers serve the files.** Each feature's `fileRpm` is added to the
   throughput target on top of its `targetRpm`. The target stays max(`minThroughputRpm`,
   the sum).
3. **Message:** the `nfr-throughput` detail names each such feature, whether it passes or
   fails: "The files for Watch lecture don't come from static hosting or object storage,
   so your servers serve them too: +3000 req/min. Put them in a store behind a CDN."
4. **Unchanged:**
   - Clients reaching a store directly, with no CDN, aren't charged on throughput.
     Static hosting without a CDN already adds 40 ms to latency and gets the `topo-cdn`
     warning; object storage without a CDN is left to brief rules (open question 2).
   - Latency, availability, cost and check ids.

**Plumbing**, as for the other two fields:
- types, the validator (a number ≥ 1), and `optionalWorkload` in `design.ts`, which
  covers fixtures, the store and the design file;
- the requirements panel doesn't show the field.

**Briefs that get the field:**

| Brief | Feature | `fileRpm` | Reason |
|---|---|---|---|
| campus-food-guide | `browse-vendors` | 2400 | About 800 visits a minute, each loading the page, its CSS and its script |
| lecture-video-library | `watch-lecture` | 3000 | About 300 students watching, each fetching a video segment every 6 s |
| file-storage | `download-file` | 1200 | Marking-day downloads, each a large file streamed in parts (open question 1) |

No brief's targets change.

## Prototype results

The prototype was built against `deb41ca` with the food guide and video library fields,
and then reverted.
- **Tests:** all 509 existing tests passed.
- **Unchanged:** every good design, both demos and every other fixture.
- **The file-storage row** is worked out by hand from the same rule, not run: its design
  has no store behind the CDN, its target becomes 120 + 600 + 300 + 1200, and its
  capacity is 1260. Every other file-storage design fetches through a CDN in front of
  object storage, so none of them moves.

| Fixture | Throughput target: before → after | Capacity | New engine fail |
|---|---|---|---|
| `campus-food-guide/bad-pages-from-api` | 1300 → 3690 | 1660 | `nfr-throughput` |
| `lecture-video-library/bad-no-cdn` | 1310 → 4310 | 1678 | `nfr-throughput` |
| `lecture-video-library/bad-video-in-db` | 1310 → 4310 | 2208 | `nfr-throughput` |
| `file-storage/bad-files-in-db` | 1020 → 2220 | 1260 | `nfr-throughput` |

- **Engine count:** three designs move from rule-only to engine-caught:
  `bad-pages-from-api`, `lecture-video-library/bad-no-cdn` and
  `file-storage/bad-files-in-db`. That takes the count from 42 to **45 of 53**.
  - `bad-video-in-db` was already counted, through a warning; it now also fails
    throughput.
  - `bad-files-in-db` is half of finding 5. It still scores better on latency and cost,
    because blob size isn't modelled.
- **`campus-food-guide/bad-no-cdn`** is unchanged: students fetch the files straight from
  static hosting, so the API isn't charged. The `topo-cdn` warning and the brief rules
  still catch it.

## Tests (written first)

- **`src/lib/simulation.test.ts`**, new `describe("file serving")`:
  - **Not charged:**
    - client → CDN → static hosting;
    - client → CDN → object storage;
    - client → static hosting directly.
  - **Charged:**
    - no store at all;
    - a CDN whose origin is the load balancer;
    - a CDN whose origin is a database;
    - object storage reached only by compute.
  - Two features with `fileRpm` both add theirs; a feature without it changes nothing.
  - The message names the feature in the pass and the fail case.
- **`validate.test.ts`:** `fileRpm` is accepted, and 0, a negative number or a string is
  rejected with the file and field.
- **`design.test.ts`** and **`design-file.test.ts`:** the field is copied and survives a
  round trip only when set, extending the existing tests.
- **Fixtures (strengthened only):** add `nfr-throughput` to `fails` in the four fixtures
  above.

## Docs

- **`docs/challenges/brief-format.md`:**
  - `fileRpm` next to the other two fields, with how to pick a value;
  - the `nfr-throughput` row.
- **`docs/challenges/phase1-findings.md`:**
  - an "Update: finding 15 addressed" section, with the table above and 45 of 53;
  - finding 15 marked addressed;
  - finding 5 notes the throughput catch.
- **`HANDOVER.md`** (untracked).

## Boundaries

- **Always:**
  - every good design and both demos stay unchanged;
  - fixture expectations only get stronger;
  - tests, types, lint and build stay green.
- **Ask first:**
  - giving the CDN a latency or capacity model;
  - charging object storage or static hosting served without a CDN;
  - changing any brief's targets.
- **Never:**
  - weaken a fixture's expectations;
  - make the field required.

## Success criteria

1. The four fixtures above fail `nfr-throughput`, and the throughput detail names the
   feature and what to change.
2. All other probe numbers are unchanged, and all tests, `tsc`, lint and build pass.
3. A browser check shows the message on `campus-food-guide/bad-pages-from-api`.

## Open questions

1. **file-storage.** Include `download-file: fileRpm 1200`, as proposed? It catches
   `bad-files-in-db` on throughput; the other choice is to leave finding 5 alone for now.
2. **Store without a CDN.** Leave it uncharged, as proposed? A direct client →
   object storage design is still caught by brief rules such as `playback-via-cdn`.
3. **Values.** 2400, 3000 and 1200, as listed?
4. **Plan format.** One combined plan and task list, as before?
