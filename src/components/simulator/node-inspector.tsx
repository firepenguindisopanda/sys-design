"use client";

import { useId } from "react";
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
import { SECTION_LABEL } from "./styles";

export function NodeInspector() {
  const selectedNodeId = useSimulatorStore((s) => s.selectedNodeId);
  const nodes = useSimulatorStore((s) => s.nodes);
  const updateNodeData = useSimulatorStore((s) => s.updateNodeData);
  const updateNodeConfig = useSimulatorStore((s) => s.updateNodeConfig);
  const node = nodes.find((n) => n.id === selectedNodeId);
  const id = useId();

  if (!node) {
    return (
      <div className="rounded-md border border-dashed border-slate-200 bg-slate-50/80 px-3 py-4 text-xs text-slate-500">
        Select a canvas node to edit name, purpose, and type-specific options.
      </div>
    );
  }

  const cfg = node.data.config;

  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
      <div>
        <div className={SECTION_LABEL}>
          Selected node
        </div>
        <div className="mt-0.5 text-sm font-semibold text-slate-900">{node.data.label}</div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-name`} className="text-xs">Name</Label>
        <Input
          id={`${id}-name`}
          value={node.data.label}
          onChange={(e) => updateNodeData(node.id, { label: e.target.value })}
          className="h-8 text-xs"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-purpose-note`} className="text-xs">Purpose note</Label>
        <Input
          id={`${id}-purpose-note`}
          value={node.data.purpose}
          onChange={(e) => updateNodeData(node.id, { purpose: e.target.value })}
          className="h-8 text-xs"
        />
      </div>

      {(cfg.kind === "vm" ||
        cfg.kind === "paas" ||
        cfg.kind === "functions" ||
        cfg.kind === "edge") && (
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
                <Label htmlFor={`${id}-${key}`} className="text-[10px]">
                  {label}
                </Label>
                <Input
                  id={`${id}-${key}`}
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
              <Label htmlFor={`${id}-app-type`} className="text-[10px]">App type</Label>
              <Input
                id={`${id}-app-type`}
                value={cfg.appType}
                onChange={(e) => updateNodeConfig(node.id, { appType: e.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${id}-hosting`} className="text-[10px]">Hosting</Label>
              <Input
                id={`${id}-hosting`}
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
            <Label htmlFor={`${id}-engine`} className="text-xs">Engine</Label>
            <Select
              value={cfg.engine}
              onValueChange={(v) => {
                if (v) updateNodeConfig(node.id, { engine: v });
              }}
            >
              <SelectTrigger id={`${id}-engine`} className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relational">Relational</SelectItem>
                <SelectItem value="document">Document / NoSQL</SelectItem>
                <SelectItem value="graph">Graph</SelectItem>
                <SelectItem value="vector">Vector</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor={`${id}-replicas`} className="text-[10px]">Replicas</Label>
              <Input
                id={`${id}-replicas`}
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
              <Label htmlFor={`${id}-shards`} className="text-[10px]">Shards</Label>
              <Input
                id={`${id}-shards`}
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

      {cfg.kind === "cache" && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor={`${id}-engine`} className="text-[10px]">Engine</Label>
            <Select
              value={cfg.engine}
              onValueChange={(v) => {
                if (v) updateNodeConfig(node.id, { engine: v });
              }}
            >
              <SelectTrigger id={`${id}-engine`} className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="redis">Redis</SelectItem>
                <SelectItem value="memcached">Memcached</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-memory-gb`} className="text-[10px]">Memory GB</Label>
            <Input
              id={`${id}-memory-gb`}
              type="number"
              min={0.5}
              step={0.5}
              value={cfg.memoryGb}
              onChange={(e) =>
                updateNodeConfig(node.id, { memoryGb: Number(e.target.value) })
              }
              className="h-8 text-xs"
            />
          </div>
        </div>
      )}

      {cfg.kind === "object_storage" && (
        <div className="space-y-1">
          <Label htmlFor={`${id}-storage-gb`} className="text-[10px]">Storage GB</Label>
          <Input
            id={`${id}-storage-gb`}
            type="number"
            min={1}
            value={cfg.storageGb}
            onChange={(e) =>
              updateNodeConfig(node.id, { storageGb: Number(e.target.value) })
            }
            className="h-8 text-xs"
          />
        </div>
      )}

      {cfg.kind === "message_queue" && (
        <div className="space-y-1">
          <Label htmlFor={`${id}-mode`} className="text-[10px]">Mode</Label>
          <Select
            value={cfg.mode}
            onValueChange={(v) => {
              if (v) updateNodeConfig(node.id, { mode: v });
            }}
          >
            <SelectTrigger id={`${id}-mode`} className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="queue">Message queue</SelectItem>
              <SelectItem value="pubsub">Pub / Sub</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {cfg.kind === "task_worker" && (
        <div className="space-y-1">
          <Label htmlFor={`${id}-concurrency`} className="text-[10px]">Concurrency</Label>
          <Input
            id={`${id}-concurrency`}
            type="number"
            min={1}
            max={64}
            value={cfg.concurrency}
            onChange={(e) =>
              updateNodeConfig(node.id, { concurrency: Number(e.target.value) })
            }
            className="h-8 text-xs"
          />
        </div>
      )}

      {cfg.kind === "external_api" && (
        <div className="space-y-1">
          <Label htmlFor={`${id}-provider`} className="text-[10px]">Provider</Label>
          <Input
            id={`${id}-provider`}
            value={cfg.provider}
            onChange={(e) => updateNodeConfig(node.id, { provider: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
      )}

      {(cfg.kind === "mobile" || cfg.kind === "desktop" || cfg.kind === "iot") && (
        <div className="space-y-1">
          <Label htmlFor={`${id}-platform-device`} className="text-[10px]">Platform / device</Label>
          <Input
            id={`${id}-platform-device`}
            value={cfg.platform}
            onChange={(e) => updateNodeConfig(node.id, { platform: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
      )}
    </div>
  );
}
