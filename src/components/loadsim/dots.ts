/** The busiest edge shows at most this many dots at once. */
export const MAX_DOTS_PER_EDGE = 12;
/** Dots on screen at once, across every edge, so playback stays smooth. */
export const MAX_DOTS_TOTAL = 300;

/** Requests a second one dot stands for: a 1, 2 or 5 so the legend reads cleanly. */
export function ratePerDot(maxRate: number): number {
  const raw = maxRate / MAX_DOTS_PER_EDGE;
  if (raw <= 0) return 1;
  const scale = 10 ** Math.floor(Math.log10(raw));
  for (const step of [1, 2, 5, 10]) {
    if (step * scale >= raw - 1e-9) return Math.max(1, step * scale);
  }
  return 10 * scale;
}

export function dotCount(rate: number, perDot: number): number {
  if (rate <= 0) return 0;
  return Math.min(MAX_DOTS_PER_EDGE, Math.max(1, Math.ceil(rate / perDot - 1e-9)));
}

/** Scales counts down to the cap, keeping one dot on every edge that has any. */
export function capTotal(counts: number[], cap: number): number[] {
  const total = counts.reduce((s, c) => s + c, 0);
  if (total <= cap) return counts;
  const scale = cap / total;
  return counts.map((c) => (c > 0 ? Math.max(1, Math.floor(c * scale)) : 0));
}

/** Where each dot sits along the edge (0 to 1), evenly spaced and moved on by the phase. */
export function dotFractions(count: number, phase: number): number[] {
  return Array.from({ length: count }, (_, i) => (((i / count + phase) % 1) + 1) % 1);
}

/** How many of an edge's dots are red: the share that failed where it leads. */
export function redCount(count: number, failedShare: number): number {
  return Math.round(count * Math.min(Math.max(failedShare, 0), 1));
}
