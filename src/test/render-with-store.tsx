import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useSimulatorStore } from "@/lib/store";

/**
 * Render `ui` to static markup as the live store state would show it.
 *
 * Zustand renders on the server from getInitialState(), which setState never touches,
 * so copy the live state into that object before rendering and put it back afterwards.
 */
export function renderWithStore(ui: ReactElement): string {
  const initial = useSimulatorStore.getInitialState();
  const saved = { ...initial };
  Object.assign(initial, useSimulatorStore.getState());
  try {
    return renderToStaticMarkup(ui);
  } finally {
    Object.assign(initial, saved);
  }
}
