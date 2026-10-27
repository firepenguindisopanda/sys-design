"use client";

import { useSimulatorStore } from "@/lib/store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BriefPanel } from "./brief-panel";
import { RequirementsPanel } from "./requirements-panel";

/** Right-hand panel: requirements in the sandbox; brief and requirements tabs in a challenge. */
export function SidePanel() {
  const challenge = useSimulatorStore((s) => s.challenge);

  return (
    <div className="h-full border-l border-slate-200 bg-[var(--panel)]">
      {challenge ? (
        // Keyed so a newly picked challenge opens on its brief.
        <Tabs key={challenge.id} defaultValue="brief" className="h-full flex-col gap-0">
          {/* Below xl this panel is in a sheet; leave room for the sheet's close button. */}
          <div className="border-b border-slate-200 py-2 pr-12 pl-3 xl:pr-3">
            <TabsList className="w-full">
              <TabsTrigger value="brief" className="text-xs">
                Brief
              </TabsTrigger>
              <TabsTrigger value="requirements" className="text-xs">
                Requirements
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="brief" className="min-h-0">
            <BriefPanel brief={challenge} />
          </TabsContent>
          <TabsContent value="requirements" className="min-h-0">
            <RequirementsPanel />
          </TabsContent>
        </Tabs>
      ) : (
        <RequirementsPanel />
      )}
    </div>
  );
}
