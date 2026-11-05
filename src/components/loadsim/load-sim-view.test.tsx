import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { briefById, fixtureDesign } from "@/test/loadsim-designs";
import { LoadSimView } from "./load-sim-view";

/** Rendered text with tags removed and React's entity escapes undone. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

const backLink = /<a[^>]*href="\/"[^>]*>[^]*?Back to design[^]*?<\/a>/;

describe("LoadSimView", () => {
  it("says it's loading before the design is read", () => {
    const html = renderToStaticMarkup(<LoadSimView state={{ status: "loading" }} />);
    expect(text(html)).toContain("Loading design");
  });

  it("explains there's nothing to simulate, with the way back", () => {
    const html = renderToStaticMarkup(<LoadSimView state={{ status: "empty" }} />);
    expect(text(html)).toContain("There's no design to simulate yet");
    expect(html).toMatch(backLink);
  });

  it("shows a bad hand-off's message, with the way back", () => {
    const html = renderToStaticMarkup(<LoadSimView state={{ status: "error", message: "It broke." }} />);
    expect(text(html)).toContain("It broke.");
    expect(html).toMatch(backLink);
  });

  it("lists what's missing instead of the canvas", () => {
    const d = fixtureDesign("link-shortener", "good");
    const unplaced = { ...d, features: d.features.map((f) => ({ ...f, placedOnNodeId: null })) };
    const html = renderToStaticMarkup(<LoadSimView state={{ status: "ready", design: unplaced }} />);
    expect(text(html)).toContain("Place at least one feature on compute.");
    expect(html).not.toContain('aria-label="Design under load"');
    expect(html).toMatch(backLink);
  });

  it("shows the brief's title, the page title and the way back for a ready design", () => {
    const d = fixtureDesign("link-shortener", "good");
    const html = renderToStaticMarkup(<LoadSimView state={{ status: "ready", design: d }} />);
    expect(text(html)).toContain(briefById("link-shortener").title);
    expect(html).toMatch(/<h1[^>]*>[^<]*Load simulation/);
    expect(html).toMatch(backLink);
    expect(html).toContain('aria-label="Design under load"');
    expect(text(html)).toContain("best on a laptop");
  });

  it("calls a design without a brief the sandbox", () => {
    const d = fixtureDesign("link-shortener", "good");
    const html = renderToStaticMarkup(<LoadSimView state={{ status: "ready", design: { ...d, brief: null } }} />);
    expect(text(html)).toContain("Sandbox");
  });
});
