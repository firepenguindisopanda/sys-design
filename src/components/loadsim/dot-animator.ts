import type { Frame } from "@/lib/loadsim/types";
import { MAX_DOTS_TOTAL, capTotal, dotCount, dotFractions, redCount } from "./dots";

/** A dot takes this long to travel the length of an edge. */
const TRAVEL_MS = 1600;
const SVG = "http://www.w3.org/2000/svg";
const DOT_COLOUR = "#0f766e";
const FAILED_COLOUR = "#dc2626";

type Registered = { path: SVGPathElement; group: SVGGElement };

/** What the animator needs each frame: the frame shown, its step length and the dot scale. */
export type DotSource = () => { frame: Frame | null; dtSeconds: number; perDot: number };

/**
 * Moves the dots on every edge outside React: one requestAnimationFrame loop sets each
 * circle's position along its edge's path. Dot counts follow the current frame's rates;
 * the red ones are the share that failed where the edge leads (SPEC-dataflow-sim.md).
 */
export class DotAnimator {
  private edges = new Map<string, Registered>();
  private frameId = 0;

  constructor(private readonly source: DotSource) {}

  register(id: string, path: SVGPathElement, group: SVGGElement): () => void {
    this.edges.set(id, { path, group });
    return () => {
      if (this.edges.get(id)?.group === group) this.edges.delete(id);
    };
  }

  start() {
    const loop = (now: number) => {
      this.draw(now);
      this.frameId = requestAnimationFrame(loop);
    };
    this.frameId = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.frameId);
    for (const { group } of this.edges.values()) group.replaceChildren();
  }

  /** Path lengths by their `d`, so a path is only measured again when its shape changes. */
  private lengths = new Map<string, number>();

  private lengthOf(path: SVGPathElement): number {
    const d = path.getAttribute("d") ?? "";
    let length = this.lengths.get(d);
    if (length === undefined) {
      length = path.getTotalLength();
      if (this.lengths.size > 500) this.lengths.clear();
      this.lengths.set(d, length);
    }
    return length;
  }

  private draw(now: number) {
    const { frame, dtSeconds, perDot } = this.source();
    const ids = [...this.edges.keys()].sort();
    const wanted = ids.map((id) => {
      const edge = frame?.edges[id];
      return edge ? dotCount(edge.volume / dtSeconds, perDot) : 0;
    });
    const counts = capTotal(wanted, MAX_DOTS_TOTAL);
    const phase = (now % TRAVEL_MS) / TRAVEL_MS;

    // Read every position first, then write: alternating reads of path geometry with
    // writes to the dots made the browser lay the page out again for every edge.
    const plans = ids.map((id, i) => {
      const { path, group } = this.edges.get(id)!;
      const count = counts[i];
      if (count === 0) return { group, dots: [] };
      const length = this.lengthOf(path);
      const red = redCount(count, frame?.edges[id]?.failedShare ?? 0);
      const dots = dotFractions(count, phase).map((fraction, j) => {
        // Red dots stop at the end of the edge: they failed where it leads.
        const failed = j < red;
        const point = path.getPointAtLength(length * (failed ? Math.min(fraction * 1.15, 1) : fraction));
        return { x: point.x.toFixed(1), y: point.y.toFixed(1), failed };
      });
      return { group, dots };
    });

    for (const { group, dots } of plans) {
      while (group.childNodes.length < dots.length) {
        const dot = document.createElementNS(SVG, "circle");
        dot.setAttribute("r", "3.5");
        group.appendChild(dot);
      }
      while (group.childNodes.length > dots.length) group.lastChild!.remove();
      dots.forEach(({ x, y, failed }, j) => {
        const dot = group.childNodes[j] as SVGCircleElement;
        dot.setAttribute("cx", x);
        dot.setAttribute("cy", y);
        dot.setAttribute("fill", failed ? FAILED_COLOUR : DOT_COLOUR);
      });
    }
  }
}
