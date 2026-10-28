"use client";

import { useRef, useState } from "react";
import { Download, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportDesignFile, importDesignFile } from "@/lib/challenges/design-file";
import type { Brief } from "@/lib/challenges/types";
import { useSimulatorStore } from "@/lib/store";

/** Export the canvas to a design file and import one back, in either mode. */
export function DesignIo({ briefs }: { briefs: Brief[] }) {
  const loadDesign = useSimulatorStore((s) => s.loadDesign);
  const markSaved = useSimulatorStore((s) => s.markSaved);
  const requestReplace = useSimulatorStore((s) => s.requestReplace);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const onExport = () => {
    const result = exportDesignFile(useSimulatorStore.getState());
    if ("error" in result) {
      setError(result.error);
      return;
    }
    const url = URL.createObjectURL(new Blob([result.text], { type: "application/yaml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = result.fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    markSaved();
    setError(null);
  };

  const onFile = async (file: File) => {
    const current = useSimulatorStore.getState().challenge?.id ?? null;
    const result = importDesignFile(await file.text(), file.name, briefs, current);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    requestReplace("replace", `Importing ${file.name} replaces your design.`, () =>
      loadDesign(result.loaded),
    );
  };

  return (
    <>
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-md border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur">
        <Button type="button" size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={onExport}>
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 text-xs"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          Import
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".yaml,.yml"
          className="hidden"
          aria-label="Design file to import"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Reset so picking the same file again still fires onChange.
            e.target.value = "";
            if (file) void onFile(file);
          }}
        />
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
