import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { loadChallenges } from "@/lib/challenges/load";
import { BriefPanel } from "./brief-panel";

const brief = loadChallenges(path.join(process.cwd(), "challenges")).find(
  (c) => c.brief.id === "link-shortener",
)!.brief;

/** Rendered text with tags removed and React's entity escapes undone. */
function renderText(b = brief): string {
  return renderToStaticMarkup(<BriefPanel brief={b} />)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

describe("BriefPanel", () => {
  it("shows the summary, out-of-scope items and reflection questions", () => {
    const text = renderText();
    expect(text).toContain(brief.title);
    expect(text).toContain(brief.tagline);
    expect(text).toContain(brief.summary);
    expect(text).toContain("Out of scope");
    for (const item of brief.outOfScope) expect(text).toContain(item);
    expect(text).toContain("Think about");
    for (const q of brief.reflection) expect(text).toContain(q);
  });

  it("leaves out empty sections", () => {
    const text = renderText({ ...brief, outOfScope: [], reflection: [] });
    expect(text).toContain(brief.summary);
    expect(text).not.toContain("Out of scope");
    expect(text).not.toContain("Think about");
  });

  it("does not show the authoring source or the rules", () => {
    const text = renderText();
    expect(text).not.toContain(brief.source);
    for (const rule of brief.rules) expect(text).not.toContain(rule.title);
  });
});

describe("BriefPanel hints", () => {
  it("says that unmet scenario checks appear as hints", () => {
    expect(renderText()).toContain(
      "After a run, scenario checks you haven't met appear as hints you can open one at a time.",
    );
  });
});
