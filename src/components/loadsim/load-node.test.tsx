import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoadNodeBody, gaugeBand, nodeStatus } from "./load-node";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("gaugeBand", () => {
  it("is ok under 70%, busy to 99%, and saturated from 100%", () => {
    expect(gaugeBand(0.5)).toBe("ok");
    expect(gaugeBand(0.85)).toBe("busy");
    expect(gaugeBand(0.999)).toBe("busy");
    expect(gaugeBand(1)).toBe("saturated");
    expect(gaugeBand(1.2)).toBe("saturated");
  });
});

describe("nodeStatus", () => {
  const base = { kind: "database", utilisation: 0, failedSoFar: 0, ratePerSecond: 0, notSimulated: false };

  it("says how busy a component is, in words", () => {
    expect(nodeStatus({ ...base, utilisation: 0.5, ratePerSecond: 80 })).toBe("50% busy");
    expect(nodeStatus({ ...base, utilisation: 0.92, ratePerSecond: 80 })).toBe("92% busy");
  });

  it("says when it's saturated and how many have failed so far", () => {
    expect(nodeStatus({ ...base, utilisation: 1.2, ratePerSecond: 80 })).toBe("Saturated");
    expect(nodeStatus({ ...base, utilisation: 1.2, failedSoFar: 1204.4, ratePerSecond: 80 })).toBe(
      "Saturated · 1,204 failed",
    );
    expect(nodeStatus({ ...base, utilisation: 0.4, failedSoFar: 30, ratePerSecond: 80 })).toBe("40% busy · 30 failed");
  });

  it("says what clients send, and marks parts that aren't simulated or get no traffic", () => {
    expect(nodeStatus({ ...base, kind: "mobile", ratePerSecond: 83.4 })).toBe("Sending 83 req/s");
    expect(nodeStatus({ ...base, kind: "message_queue", notSimulated: true })).toBe("Not simulated yet");
    expect(nodeStatus(base)).toBe("No traffic");
  });

  it("shows a light load as at least 1%", () => {
    expect(nodeStatus({ ...base, utilisation: 0.002, ratePerSecond: 1 })).toBe("1% busy");
  });
});

describe("LoadNodeBody", () => {
  it("shows the label, a gauge in its band and the status text, and names itself from both", () => {
    const html = renderToStaticMarkup(
      <LoadNodeBody label="Registration DB" kind="database" utilisation={1.29} status="Saturated · 1,204 failed" />,
    );
    expect(text(html)).toContain("Registration DB");
    expect(text(html)).toContain("Saturated · 1,204 failed");
    expect(html).toContain('data-band="saturated"');
    expect(html).toContain('aria-label="Registration DB: Saturated · 1,204 failed"');
  });

  it("fills the gauge in proportion, capped at full", () => {
    const half = renderToStaticMarkup(<LoadNodeBody label="API" kind="paas" utilisation={0.5} status="50% busy" />);
    expect(half).toContain("width:50%");
    expect(half).toContain('data-band="ok"');
    const over = renderToStaticMarkup(<LoadNodeBody label="API" kind="paas" utilisation={1.5} status="Saturated" />);
    expect(over).toContain("width:100%");
  });

  it("has no gauge for a client", () => {
    const html = renderToStaticMarkup(<LoadNodeBody label="Phone" kind="mobile" utilisation={0} status="Sending 83 req/s" />);
    expect(html).not.toContain("data-band");
  });
});
