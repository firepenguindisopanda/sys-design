"use client";

import { COMPONENT_CATALOG } from "@/lib/catalog";
import { useSimulatorStore } from "@/lib/store";
import type { CatalogCategory, ComponentKind } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Boxes,
  Cloud,
  Cpu,
  Database,
  Globe,
  HardDrive,
  Layers,
  ListTodo,
  Monitor,
  Network,
  Plug,
  Server,
  Smartphone,
  Zap,
} from "lucide-react";

const ICONS: Record<ComponentKind, typeof Server> = {
  vm: Server,
  paas: Cloud,
  functions: Zap,
  edge: Layers,
  database: Database,
  cache: HardDrive,
  object_storage: Boxes,
  message_queue: ListTodo,
  task_worker: ListTodo,
  load_balancer: Network,
  static_hosting: Globe,
  cdn: Globe,
  external_api: Plug,
  mobile: Smartphone,
  desktop: Monitor,
  iot: Cpu,
};

const CATEGORY_ORDER: CatalogCategory[] = [
  "clients",
  "compute",
  "data",
  "messaging",
  "network",
  "edge",
  "external",
];

const CATEGORY_LABEL: Record<CatalogCategory, string> = {
  clients: "Clients",
  compute: "Compute",
  data: "Data",
  messaging: "Messaging & workers",
  network: "Network",
  edge: "Edge & static",
  external: "External",
};

export function ComponentLibrary() {
  const addComponent = useSimulatorStore((s) => s.addComponent);

  return (
    <aside className="flex h-full flex-col border-r border-slate-200 bg-[var(--panel)]">
      <div className="border-b border-slate-200 px-3 py-3">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-tight text-slate-900">
          Components
        </h2>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
          Click to place. Connect with the protocol picker on the canvas.
        </p>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {CATEGORY_ORDER.map((cat) => {
          const items = COMPONENT_CATALOG.filter((c) => c.category === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat}>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {CATEGORY_LABEL[cat]}
              </div>
              <ul className="space-y-1.5">
                {items.map((item) => {
                  const Icon = ICONS[item.kind];
                  return (
                    <li key={item.kind}>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => addComponent(item.kind)}
                        className="h-auto w-full justify-start gap-2 border-slate-200 bg-white px-2.5 py-2 text-left shadow-none hover:border-teal-300 hover:bg-teal-50/50"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-teal-700" />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium text-slate-900">
                            {item.label}
                          </span>
                          <span className="block truncate text-[10px] font-normal text-slate-500">
                            {item.shortLabel}
                          </span>
                        </span>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
