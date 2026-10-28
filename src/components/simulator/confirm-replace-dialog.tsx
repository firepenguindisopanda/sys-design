"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSimulatorStore, type PendingReplace } from "@/lib/store";

/**
 * Asks before a replace or clear request discards unsaved work, and has the browser
 * warn before the tab is closed or reloaded with unsaved work.
 */
export function ConfirmReplaceDialog() {
  const pending = useSimulatorStore((s) => s.pendingReplace);
  const confirmReplace = useSimulatorStore((s) => s.confirmReplace);
  const cancelReplace = useSimulatorStore((s) => s.cancelReplace);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Keep showing the last request while the dialog animates closed.
  const [shown, setShown] = useState<PendingReplace | null>(pending);
  if (pending && pending !== shown) setShown(pending);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useSimulatorStore.getState().hasUnsavedWork()) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const clear = shown?.kind === "clear";

  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) cancelReplace();
      }}
    >
      <DialogContent initialFocus={cancelRef} showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{clear ? "Clear the canvas?" : "Replace your design?"}</DialogTitle>
          <DialogDescription>
            {shown?.description} Export first if you want to keep this design.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button ref={cancelRef} type="button" variant="outline" onClick={cancelReplace}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={confirmReplace}>
            {clear ? "Clear" : "Replace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
