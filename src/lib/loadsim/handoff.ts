import {
  exportDesignFile,
  importDesignFile,
  type DesignState,
  type LoadedDesign,
} from "@/lib/challenges/design-file";
import type { Brief } from "@/lib/challenges/types";

/**
 * Passing the design from the editor to the load simulation page (SPEC-dataflow-sim.md).
 * It's written in the design-file format, so it's validated on the way back, carries the
 * node positions, and keeps the challenge it belongs to. Session storage keeps it for
 * the tab, so reloading /simulate (or the editor) finds it again.
 */
export const HANDOFF_KEY = "sesim:load-sim";

export type HandoffStorage = Pick<Storage, "getItem" | "setItem">;

type Stored = { text: string; fileName: string; briefId: string | null };

/** Store the design, or say why it can't be (the same message Export would give). */
export function saveHandoff(state: DesignState, storage: HandoffStorage): { ok: true } | { error: string } {
  const file = exportDesignFile(state);
  if ("error" in file) return file;
  const stored: Stored = { text: file.text, fileName: file.fileName, briefId: state.challenge?.id ?? null };
  storage.setItem(HANDOFF_KEY, JSON.stringify(stored));
  return { ok: true };
}

/** The stored design, rebuilt; `empty` when there is none. Never throws. */
export function loadHandoff(
  storage: HandoffStorage,
  briefs: Brief[],
): { loaded: LoadedDesign } | { empty: true } | { error: string } {
  const raw = storage.getItem(HANDOFF_KEY);
  if (raw === null) return { empty: true };
  let stored: Partial<Stored>;
  try {
    stored = JSON.parse(raw) as Partial<Stored>;
  } catch {
    return { error: "The saved design couldn't be read. Go back to the editor and try again." };
  }
  if (typeof stored?.text !== "string" || typeof stored.fileName !== "string") {
    return { error: "The saved design couldn't be read. Go back to the editor and try again." };
  }
  return importDesignFile(stored.text, stored.fileName, briefs, stored.briefId ?? null);
}
