import { ReactFlowProvider, type NodeProps } from "@xyflow/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DesignNode } from "./design-node";

// Regression: the card used the `border` shorthand next to `borderLeft`. When
// `selected` toggled, React re-applied only `border`, which reset the left side
// and wiped the kind's 4px accent (and logged a style-conflict warning).
function cardStyle(selected: boolean): string {
  const props = {
    id: "phone",
    selected,
    data: {
      label: "Mobile app",
      componentKind: "mobile",
      purpose: "",
      config: { kind: "mobile", platform: "iOS / Android" },
    },
  } as unknown as NodeProps;
  const html = renderToStaticMarkup(
    <ReactFlowProvider>
      <DesignNode {...props} />
    </ReactFlowProvider>,
  );
  // The card is the first element the node renders.
  return /^<div style="([^"]*)"/.exec(html)![1];
}

describe("DesignNode card border", () => {
  it.each([false, true])("keeps the 4px accent on the left when selected=%s", (selected) => {
    expect(cardStyle(selected)).toContain("border-left:4px solid #0369a1");
  });

  it("never uses the border shorthand alongside per-side borders", () => {
    for (const selected of [false, true]) {
      expect(cardStyle(selected)).not.toMatch(/(^|;)border:/);
    }
  });

  it("shows selection on the other three sides", () => {
    expect(cardStyle(true)).toContain("border-top:2px solid #0f766e");
    expect(cardStyle(false)).toContain("border-top:1px solid #e2e8f0");
  });
});
