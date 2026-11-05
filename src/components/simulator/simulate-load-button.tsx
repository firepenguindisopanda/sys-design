"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveHandoff } from "@/lib/loadsim/handoff";
import { useSimulatorStore } from "@/lib/store";

/** Opens the load simulation page with the design as it is now (SPEC-dataflow-sim.md). */
export function SimulateLoadButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    let result: ReturnType<typeof saveHandoff>;
    try {
      result = saveHandoff(useSimulatorStore.getState(), window.sessionStorage);
    } catch {
      result = { error: "Your browser blocked session storage, so the design can't be passed to the simulation." };
    }
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    router.push("/simulate");
  };

  return (
    <>
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-md border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur">
        <Button type="button" size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={onClick}>
          <Activity className="h-3.5 w-3.5" />
          Simulate load
        </Button>
      </div>
      {error ? (
        <div
          role="alert"
          className="pointer-events-auto order-last mr-3 flex basis-full items-start gap-2 rounded-md border border-red-200 bg-red-50/95 px-2.5 py-1.5 text-[11px] text-red-800 shadow-sm sm:max-w-xl"
        >
          <span className="min-w-0 flex-1 break-words">{error}</span>
          <button
            type="button"
            aria-label="Dismiss"
            className="shrink-0 rounded p-0.5 text-red-700 hover:bg-red-100"
            onClick={() => setError(null)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </>
  );
}
