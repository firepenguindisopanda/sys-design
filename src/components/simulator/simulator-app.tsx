"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { ComponentLibrary } from "./component-library";
import { DesignCanvas } from "./design-canvas";
import { RequirementsPanel } from "./requirements-panel";
import { VerificationPanel } from "./verification-panel";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Boxes, ListChecks } from "lucide-react";

export function SimulatorApp() {
  return (
    <TooltipProvider>
      <ReactFlowProvider>
        <div className="flex h-dvh flex-col overflow-hidden bg-[var(--app-bg)] text-slate-900">
          <header className="relative z-20 flex items-center justify-between gap-3 border-b border-slate-200/80 bg-white/80 px-3 py-2.5 backdrop-blur-md sm:px-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-teal-800 text-white shadow-sm">
                <span className="font-[family-name:var(--font-display)] text-sm font-bold tracking-tight">
                  Se
                </span>
              </div>
              <div className="min-w-0">
                <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                  Sesim
                </h1>
                <p className="truncate text-[11px] text-slate-500 sm:text-xs">
                  System design simulator — topology, feature placement, NFR verification
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 lg:hidden">
              <Sheet>
                <SheetTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium">
                  <Boxes className="h-3.5 w-3.5" />
                  Library
                </SheetTrigger>
                <SheetContent side="left" className="w-[280px] p-0">
                  <ComponentLibrary />
                </SheetContent>
              </Sheet>
              <Sheet>
                <SheetTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium">
                  <ListChecks className="h-3.5 w-3.5" />
                  Reqs
                </SheetTrigger>
                <SheetContent side="right" className="w-[320px] p-0">
                  <RequirementsPanel />
                </SheetContent>
              </Sheet>
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            <div className="hidden w-56 shrink-0 lg:block xl:w-60">
              <ComponentLibrary />
            </div>
            <main className="relative min-w-0 flex-1">
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    "radial-gradient(ellipse 80% 50% at 20% 0%, rgba(13,148,136,0.08), transparent), radial-gradient(ellipse 60% 40% at 90% 10%, rgba(14,116,144,0.07), transparent), linear-gradient(180deg, #f1f5f9 0%, #e8eef4 100%)",
                }}
              />
              <div className="absolute inset-0">
                <DesignCanvas />
              </div>
            </main>
            <div className="hidden w-80 shrink-0 xl:block 2xl:w-[22rem]">
              <RequirementsPanel />
            </div>
          </div>

          <VerificationPanel />
        </div>
      </ReactFlowProvider>
    </TooltipProvider>
  );
}
