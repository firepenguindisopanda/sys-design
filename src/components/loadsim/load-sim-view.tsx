import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { LoadedDesign } from "@/lib/challenges/design-file";
import { missingForLoad } from "@/lib/loadsim/readiness";

/** What the page simulates: the design as handed over from the editor. */
export type SimDesign = Pick<LoadedDesign, "nodes" | "edges" | "features" | "brief">;

export type LoadSimState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "ready"; design: SimDesign };

function BackToDesign() {
  return (
    <Link
      href="/"
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      Back to design
    </Link>
  );
}

function Header({ subtitle }: { subtitle: string }) {
  return (
    <header className="relative z-20 flex items-center justify-between gap-3 border-b border-slate-200/80 bg-white/80 px-3 py-2.5 backdrop-blur-md sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-teal-800 text-white shadow-sm">
          <span className="font-[family-name:var(--font-display)] text-sm font-bold tracking-tight">Se</span>
        </div>
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
            Load simulation
          </h1>
          <p className="truncate text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      <BackToDesign />
    </header>
  );
}

/** A full-page message with the way back to the editor. */
function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-[family-name:var(--font-display)] text-base font-semibold text-slate-900">{title}</h2>
        <div className="mt-2 space-y-3 text-sm text-slate-600">{children}</div>
        <div className="mt-4">
          <BackToDesign />
        </div>
      </div>
    </div>
  );
}

/**
 * The load simulation page for each state of the hand-off (SPEC-dataflow-sim.md).
 * `canvas`, `table` (under the canvas) and `panel` (at the side) fill the ready page.
 */
export function LoadSimView({
  state,
  canvas,
  table,
  panel,
}: {
  state: LoadSimState;
  canvas?: ReactNode;
  table?: ReactNode;
  panel?: ReactNode;
}) {
  const subtitle = state.status === "ready" ? (state.design.brief?.title ?? "Sandbox") : "Sesim";
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--app-bg)] text-slate-900">
      <Header subtitle={subtitle} />
      {state.status === "loading" ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500" role="status">
          Loading design…
        </div>
      ) : state.status === "empty" ? (
        <Message title="There's no design to simulate yet">
          <p>Open the editor, draw and connect a design, then choose Simulate load.</p>
        </Message>
      ) : state.status === "error" ? (
        <Message title="The design couldn't be loaded">
          <p>{state.message}</p>
        </Message>
      ) : (
        <Ready design={state.design} canvas={canvas} table={table} panel={panel} />
      )}
    </div>
  );
}

function Ready({
  design,
  canvas,
  table,
  panel,
}: {
  design: SimDesign;
  canvas?: ReactNode;
  table?: ReactNode;
  panel?: ReactNode;
}) {
  const missing = missingForLoad(design.nodes, design.edges, design.features);
  if (missing.length > 0) {
    return (
      <Message title="This design isn't ready to simulate">
        <ul className="list-disc space-y-1 pl-5">
          {missing.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </Message>
    );
  }
  return (
    <>
      <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 lg:hidden">
        The load simulation is best on a laptop or desktop screen.
      </p>
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <section aria-label="Design under load" className="relative min-h-0 flex-1">
            {canvas}
          </section>
          {table ? <div className="max-h-48 shrink-0 overflow-y-auto border-t border-slate-200 bg-white">{table}</div> : null}
        </main>
        <aside
          aria-label="Scenario and results"
          // relative: screen-reader-only text in the results is absolutely positioned, and
          // without a positioned ancestor it escapes this scroll box and makes the page
          // scroll (954 px past a 630 px window with a 200-node design).
          className="relative w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white/90"
        >
          {panel}
        </aside>
      </div>
    </>
  );
}
