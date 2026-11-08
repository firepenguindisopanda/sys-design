import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { exportDesignFile } from "@/lib/challenges/design-file";
import { generateDesign, type GenerateOptions } from "@/test/gen-designs";

// SPEC-browser-stress.md: the design files the browser checks import, made the same way as
// the Node stress tests make them (the harness's generator, the app's own export), so a
// failure here can be replayed in vitest from the same seed.

const DIR = path.join(tmpdir(), `sesim-e2e-${process.pid}`);

/** The design's file text, as Export would write it. */
export function designText(options: GenerateOptions): string {
  const file = exportDesignFile({ ...generateDesign(options), challenge: null });
  if ("error" in file) throw new Error(`${JSON.stringify(options)}: ${file.error}`);
  return file.text;
}

/** `text` with one piece replaced; throws if it isn't there, so a case can't test the original. */
export function textWith(text: string, from: RegExp, to: (match: RegExpMatchArray) => string): string {
  const match = text.match(from);
  if (!match) throw new Error(`${from} isn't in the file`);
  return text.replace(from, to(match));
}

/** Write `text` to a temp file, for the editor's file input; returns its path. */
export function designFile(name: string, text: string): string {
  mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, name);
  writeFileSync(file, text);
  return file;
}

export const RANDOM_200: GenerateOptions = { seed: 1, shape: "random", nodes: 200 };
export const APP_200: GenerateOptions = { seed: 1, shape: "app", nodes: 200 };
export const STACKED_5X4: GenerateOptions = { shape: "stacked", layers: 5, width: 4 };
