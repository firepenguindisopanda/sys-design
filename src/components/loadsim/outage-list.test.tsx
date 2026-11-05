import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OutageList, outageAnnouncement } from "./outage-list";

// SPEC-loadsim-failures.md: the side panel's list of outages, and what a screen reader
// hears when the student presses a power button.

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const labels: Record<string, string> = { "api-1": "Lab API 1", cache: "Section cache" };
const label = (id: string) => labels[id] ?? id;

describe("OutageList", () => {
  const html = renderToStaticMarkup(
    <OutageList
      outages={[
        { nodeId: "api-1", offAt: 252, onAt: 360 },
        { nodeId: "cache", offAt: 120, onAt: null },
      ]}
      label={label}
      onRemove={() => {}}
      onClear={() => {}}
    />,
  );

  it("lists each outage with when it went off and came back, earliest first", () => {
    const t = text(html);
    expect(t).toContain("Outages");
    expect(t).toContain("Lab API 1: off 4:12, back 6:00");
    expect(t).toContain("Section cache: off 2:00");
    expect(t.indexOf("Section cache")).toBeLessThan(t.indexOf("Lab API 1"));
  });

  it("has a named remove button for each, and Clear all", () => {
    expect(html).toMatch(/<button[^>]*aria-label="Remove Lab API 1&#x27;s outage at 4:12"/);
    expect(html).toMatch(/<button[^>]*aria-label="Remove Section cache&#x27;s outage at 2:00"/);
    expect(text(html)).toContain("Clear all");
  });

  it("renders nothing without outages", () => {
    expect(renderToStaticMarkup(<OutageList outages={[]} label={label} onRemove={() => {}} onClear={() => {}} />)).toBe("");
  });
});

describe("outageAnnouncement", () => {
  it("says what the button did, and when", () => {
    expect(outageAnnouncement("Lab API 1", true, 252)).toBe("Lab API 1 switched off at 4:12.");
    expect(outageAnnouncement("Lab API 1", false, 360)).toBe("Lab API 1 back at 6:00.");
  });
});
