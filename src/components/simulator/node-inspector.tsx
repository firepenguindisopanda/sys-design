"use client";

import { useSimulatorStore } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function NodeInspector() {
  const selectedNodeId = useSimulatorStore((s) => s.selectedNodeId);
  const nodes = useSimulatorStore((s) => s.nodes);
  const updateNodeData = useSimulatorStore((s) => s.updateNodeData);
  const updateNodeConfig = useSimulatorStore((s) => s.updateNodeConfig);
  const node = nodes.find((n) => n.id === selectedNodeId);

  if (!node) {
    return (
      <div className="rounded-md border border-dashed border-slate-200 bg-slate-50/80 px-3 py-4 text-xs text-slate-500">
        Select a canvas node to edit name, purpose, capacity, or database options.
      </div>
    );
  }

  const cfg = node.data.config;

  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Selected node
        </div>
        <div className="mt-0.5 text-sm font-semibold text-slate-900">{node.data.label}</div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Name / purpose</Label>
        <Input
          value={node.data.label}
          onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
          className="h-8 text-xs"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Purpose note</Label>
        <Input
          value={node.data.purpose}
          onChange={(e) => updateNodeData(node.id, { purpose: e.target.value })}
          className="h-8 text-xs"
        />
      </div>

      {(cfg.kind === "vm" || cfg.kind === "paas" || cfg.kind === "functions") && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["vcpus", "vCPUs"],
                ["memoryGb", "Memory GB"],
                ["storageGb", "Storage GB"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label className="text-[10px]">{label}</Label>
                <Input
                  type="number"
                  min={0}
                  step={key === "vcpus" ? 0.5 : 1}
                  value={cfg.capacity[key]}
                  onChange={(e) =>
                    updateNodeConfig(node.id, {
                      capacity: {
                        ...cfg.capacity,
                        [key]: Number(e.target.value),
                      },
                    })
                  }
                  className="h-8 text-xs"
                />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px]">App type</Label>
              <Input
                value={cfg.appType}
                onChange={(e) => updateNodeConfig(node.id, { appType: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Hosting</Label>
              <Input
                value={cfg.hosting}
                onChange={(e) => updateNodeConfig(node.id, { hosting: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
          </div>
        </>
      )}

      {cfg.kind === "database" && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Engine</Label>
            <Select
              value={cfg.engine}
              onValueChange={(v) => updateNodeConfig(node.id, { engine: v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relational">Relational</SelectItem>
                <SelectItem value="document">Document / NoSQL</SelectItem>
                <SelectItem value="graph">Graph</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px]">Replicas</Label>
              <Input
                type="number"
                min={1}
                max={8}
                value={cfg.replicas}
                onChange={(e) =>
                  updateNodeConfig(node.id, { replicas: Number(e.target.value) })
                }
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Shards</Label>
              <Input
                type="number"
                min={1}
                max={16}
                value={cfg.shards}
                onChange={(e) =>
                  updateNodeConfig(node.id, { shards: Number(e.target.value) })
                }
                className="h-8 text-xs"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
