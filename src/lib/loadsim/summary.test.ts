import { describe, expect, it } from "vitest";
import { design, fixtureDesign, requirement, runDesign } from "@/test/loadsim-designs";
import { defaultScenario } from "./scenario";
import type { FeatureLoads } from "./types";

// A database doing all the work: a big VM in front, and a 100 ms read with no cache.
// One copy has 2 × 1000 × 0.7 = 1,400 ms of work a second, so it takes 14 reads a second.
const dbBound = design(
  [requirement("browse", { name: "Browse", targetRpm: 60, computeMsPerRequest: 10 })],
  [
    ["desktop", "desktop"],
    ["vm", "vm", { capacity: { vcpus: 16 } }],
    ["db", "database", {}, "Course DB"],
  ],
  ["desktop -> vm : http", "vm -> db : db"],
  { browse: "vm" },
);
const readsOnly: FeatureLoads = { browse: { share: 1, writeShare: 0, readDbMs: 100, writeDbMs: 100, batch: 1, slowWork: "wait", apiMs: null } };

// The same, with two VMs behind a balancer: 20 database connections between them.
const dbBoundPair = design(
  [requirement("browse", { name: "Browse", targetRpm: 60, computeMsPerRequest: 10 })],
  [
    ["desktop", "desktop"],
    ["lb", "load_balancer"],
    ["vm-1", "vm", { capacity: { vcpus: 16 } }, "Course API 1"],
    ["vm-2", "vm", { capacity: { vcpus: 16 } }, "Course API 2"],
    ["db", "database", {}, "Course DB"],
  ],
  ["desktop -> lb : http", "lb -> vm-1 : http", "lb -> vm-2 : http", "vm-1 -> db : db", "vm-2 -> db : db"],
  { browse: "vm-1" },
);

describe("first saturation", () => {
  it("explains a database saturated by reads with no cache in front", () => {
    // 40 reads a second against 14. Two VMs have 20 connections: enough to keep the
    // database's queue over its capacity, since at 14 a second each read holds one for
    // 20 ÷ 14 ≈ 1.4 s. (Before SPEC-loadsim-cascades.md this used one VM, whose 10
    // connections now hold the database under full: see the next test.)
    const run = runDesign(dbBoundPair, { requests: 2_400, windowSeconds: 60, shape: "steady" }, { loads: readsOnly });
    const first = run.summary.firstSaturation!;
    expect(first.nodeId).toBe("db");
    expect(first.atSeconds).toBe(0);
    expect(first.note).toBe(
      "Course DB saturated at 0:00: every Browse read reaches it. A cache in front would take most of them.",
    );
    expect(run.summary.busiest).toBeNull();
  });

  it("holds the database just under full behind one VM's 10 connections (SPEC-loadsim-cascades.md)", () => {
    // Each read holds a connection for 1 ms + 100 ms + its queueing wait at the database.
    // 10 connections carry rate × hold = 10: about 13 a second, where the database is
    // 93% busy and a read waits about 6.6 × 100 ms. The other 27 a second time out at the
    // VM. The VM is held back by its connections, so it isn't the headline; the database
    // is the busiest, and the VM's connection note tells the rest.
    const run = runDesign(dbBound, { requests: 2_400, windowSeconds: 60, shape: "steady" }, { loads: readsOnly });
    const s = run.summary;
    expect(s.firstSaturation).toBeNull();
    expect(s.busiest?.nodeId).toBe("db");
    expect(s.busiest!.peakUtilisation).toBeGreaterThan(0.92);
    expect(s.busiest!.peakUtilisation).toBeLessThan(0.94);
    expect(s.notes).toContain(
      `Virtual Machine's database connections were all busy from 0:00, while Course DB was 93% busy. ${Math.round(s.perNode.vm.failed).toLocaleString("en")} requests timed out there, not at the database.`,
    );
    const rates = run.frames.slice(300, 600).map((f) => f.nodes.vm.served / run.dtSeconds);
    expect(Math.min(...rates)).toBeGreaterThan(12.5);
    expect(Math.max(...rates)).toBeLessThan(13.5);
  });
});

describe("busiest component when nothing saturates", () => {
  // 7 reads a second: 700 ms of 1,400, so 50%; with 90% of reads from a cache, 5%.
  const run = runDesign(dbBound, { requests: 420, windowSeconds: 60, shape: "steady" }, { loads: readsOnly });

  it("names the busiest component", () => {
    expect(run.summary.firstSaturation).toBeNull();
    expect(run.summary.busiest).toEqual({
      nodeId: "db",
      peakUtilisation: expect.closeTo(0.5, 6),
      note: "Course DB peaked at 50% busy.",
    });
  });

  it("estimates what a cache would save for a database doing mostly reads", () => {
    expect(run.summary.notes).toContain(
      "Course DB peaked at 50% busy, mostly with Browse reads. A cache in front would bring it to about 5%.",
    );
  });

  it("gives no cache estimate for a database with a cache in front", () => {
    const built = fixtureDesign("link-shortener", "good");
    const summary = runDesign(built, defaultScenario(built.brief), { brief: built.brief }).summary;
    expect(summary.notes.some((n) => n.includes("A cache in front"))).toBe(false);
  });

  it("gives a plain note when the busiest component isn't a database", () => {
    const run = runDesign(
      design(
        [requirement("ping", { targetRpm: 60, computeMsPerRequest: 10, resources: { memoryGb: 1, vcpus: 1, storageGb: 0 } })],
        [
          ["desktop", "desktop"],
          ["vm", "vm", { capacity: { vcpus: 1 } }, "App VM"],
        ],
        ["desktop -> vm : http"],
        { ping: "vm" },
      ),
      { requests: 2_100, windowSeconds: 60, shape: "steady" },
    );
    // 35 req/s against 70.
    expect(run.summary.busiest?.note).toBe("App VM peaked at 50% busy.");
  });
});

describe("failures", () => {
  it("groups requests with no route by client and feature, in words", () => {
    const built = fixtureDesign("link-shortener", "bad-no-load-balancer");
    const run = runDesign(built, defaultScenario(built.brief), { brief: built.brief });
    const phone = run.summary.failures.find(
      (f) => f.reason === "no-route" && f.clientId === "phone" && f.featureId === "redirect",
    );
    expect(phone).toBeDefined();
    expect(phone!.nodeId).toBeNull();
    expect(phone!.count).toBeGreaterThan(0);
    expect(phone!.text).toContain("Student phone");
    expect(phone!.text).toContain("Redirect");
  });

  it("reports per-component totals and the time each first saturated", () => {
    // Two VMs, so the database saturates. Since SPEC-loadsim-cascades.md its queue stays
    // within what a request can wait (about 1.4 s), so the excess times out at the VMs,
    // waiting for a connection, rather than at the database as before.
    const run = runDesign(dbBoundPair, { requests: 2_400, windowSeconds: 60, shape: "steady" }, { loads: readsOnly });
    const { perNode, failed } = run.summary;
    expect(perNode.db.firstSaturatedAt).toBe(0);
    expect(perNode.db.failed).toBe(0);
    expect(perNode["vm-1"].failed).toBeGreaterThan(0);
    expect(Math.abs(perNode["vm-1"].failed + perNode["vm-2"].failed - failed)).toBeLessThan(0.5);
  });

  it("moves the timeouts to the VM when its connections hold the database back", () => {
    const run = runDesign(dbBound, { requests: 2_400, windowSeconds: 60, shape: "steady" }, { loads: readsOnly });
    expect(run.summary.perNode.db.firstSaturatedAt).toBeNull();
    expect(run.summary.perNode.db.failed).toBe(0);
    expect(run.summary.perNode.vm.firstSaturatedAt).toBe(0);
    expect(run.summary.perNode.vm.failed).toBeGreaterThan(0);
  });
});
