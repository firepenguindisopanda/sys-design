import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("globals.css font tokens", () => {
  it("never defines a --font-x token in terms of itself", () => {
    const css = readFileSync(path.join(__dirname, "globals.css"), "utf8");
    const selfRefs = [...css.matchAll(/(--font-[\w-]+)\s*:\s*var\(\s*([\w-]+)/g)]
      .filter(([, name, ref]) => name === ref)
      .map(([decl]) => decl);
    expect(selfRefs).toEqual([]);
  });
});
