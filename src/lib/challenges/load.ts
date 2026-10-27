import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type { Brief, Fixture } from "./types";
import { validateBrief, validateFixture } from "./validate";

export type LoadedChallenge = {
  brief: Brief;
  fixtures: Fixture[];
};

/** Path shown in error messages: relative to the cwd, with forward slashes. */
function displayPath(file: string): string {
  return path.relative(process.cwd(), file).split(path.sep).join("/");
}

function readYaml(file: string): unknown {
  try {
    return parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`${displayPath(file)}: ${(e as Error).message}`);
  }
}

/**
 * Read every `<root>/<id>/brief.yaml` and its `fixtures/*.yaml`.
 * Node-only (uses fs); throws on the first invalid file.
 */
export function loadChallenges(root: string): LoadedChallenge[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map((dir) => {
      const briefFile = path.join(root, dir, "brief.yaml");
      if (!existsSync(briefFile)) {
        throw new Error(`${displayPath(path.join(root, dir))}: missing brief.yaml`);
      }
      const brief = validateBrief(readYaml(briefFile), displayPath(briefFile));
      if (brief.id !== dir) {
        throw new Error(`${displayPath(briefFile)}: id: "${brief.id}" must match its folder "${dir}"`);
      }

      const fixtureDir = path.join(root, dir, "fixtures");
      const fixtures = existsSync(fixtureDir)
        ? readdirSync(fixtureDir)
            .filter((f) => f.endsWith(".yaml"))
            .sort()
            .map((f) => {
              const file = path.join(fixtureDir, f);
              return validateFixture(readYaml(file), brief, displayPath(file), f.replace(/\.yaml$/, ""));
            })
        : [];

      return { brief, fixtures };
    });
}
