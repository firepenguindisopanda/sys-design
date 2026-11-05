import type { LoadRun } from "./types";

/** Requests failed so far at each node, by step, for the gauges' running count. */
export function cumulativeFailed(run: LoadRun): Record<string, Float64Array> {
  const out: Record<string, Float64Array> = {};
  const ids = Object.keys(run.frames[0]?.nodes ?? {});
  for (const id of ids) {
    const series = new Float64Array(run.frames.length);
    let total = 0;
    run.frames.forEach((frame, i) => {
      total += frame.nodes[id]?.failed ?? 0;
      series[i] = total;
    });
    out[id] = series;
  }
  return out;
}

/** The busiest edge's rate at any point in the run, in requests a second. */
export function maxEdgeRate(run: LoadRun): number {
  let max = 0;
  for (const frame of run.frames) {
    for (const edge of Object.values(frame.edges)) max = Math.max(max, edge.volume / run.dtSeconds);
  }
  return max;
}
