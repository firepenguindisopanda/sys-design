import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FeatureBlock } from "@/lib/types";
import { FeatureWorkload, parseWorkloadInput } from "./feature-workload";

const feature: FeatureBlock = {
  id: "live-map",
  name: "Live map",
  description: "",
  resources: { memoryGb: 1, vcpus: 1, storageGb: 0.5 },
  targetRpm: 900,
  computeMsPerRequest: 5,
  placedOnNodeId: null,
};

function render(f: FeatureBlock, locked: boolean): string {
  return renderToStaticMarkup(<FeatureWorkload feature={f} locked={locked} onChange={() => {}} />);
}

/** The <input> tags in the markup, in order. */
function inputs(html: string): string[] {
  return html.match(/<input[^>]*>/g) ?? [];
}

describe("FeatureWorkload", () => {
  it("shows all three boxes in the sandbox, set or empty, and editable", () => {
    const html = render({ ...feature, pollingRpm: 3600 }, false);
    for (const label of ["Slow work", "If polled", "Files"]) expect(html).toContain(label);
    const boxes = inputs(html);
    expect(boxes).toHaveLength(3);
    expect(boxes[0]).toContain('value=""');
    expect(boxes[1]).toContain('value="3600"');
    expect(boxes[2]).toContain('value=""');
    expect(boxes.some((b) => b.includes('disabled=""'))).toBe(false);
  });

  it("shows only the brief's fields in a challenge, read-only, with an explanation", () => {
    const html = render({ ...feature, pollingRpm: 3600, fileRpm: 1200 }, true);
    expect(html).not.toContain("Slow work");
    const boxes = inputs(html);
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toContain('value="3600"');
    expect(boxes[1]).toContain('value="1200"');
    for (const b of boxes) expect(b).toContain('disabled=""');
    expect(html).toMatch(/title="[^"]*push/);
    expect(html).toMatch(/title="[^"]*store/);
  });

  it("explains slow work in a challenge", () => {
    expect(render({ ...feature, backgroundWorkMs: 3000 }, true)).toMatch(/title="[^"]*task worker/);
  });

  it("renders nothing in a challenge when the brief sets none of them", () => {
    expect(render(feature, true)).toBe("");
  });
});

describe("parseWorkloadInput", () => {
  it.each([
    ["2400", 2400],
    ["1", 1],
    ["0.5", undefined],
    ["", undefined],
    ["0", undefined],
    ["-3", undefined],
    ["abc", undefined],
  ])("reads %j as %j", (text, expected) => {
    expect(parseWorkloadInput(text)).toBe(expected);
  });
});
