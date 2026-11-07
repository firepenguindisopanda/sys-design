"use client";

import { useId, useState } from "react";
import { limitFor, parseConfigInput } from "@/lib/config-limits";
import { useSimulatorStore } from "@/lib/store";
import type { ComponentKind } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";

/**
 * A number field held to the shared config limits (SPEC-config-bounds.md). While focused it
 * keeps what the student types and saves only in-range values; on leaving, an out-of-range
 * number snaps to the nearest limit and empty or non-numeric text shows the saved value
 * again. Unfocused it shows the saved value, so an import or reset shows up at once.
 */
function ConfigNumberField({
  id,
  kind,
  path,
  value,
  step,
  onCommit,
}: {
  id: string;
  kind: ComponentKind;
  path: string;
  value: number;
  step?: number;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const limit = limitFor(kind, path);
  return (
    <Input
      id={id}
      type="number"
      min={limit?.min}
      max={limit?.max}
      step={step}
      value={draft ?? String(value)}
      onFocus={() => setDraft(String(value))}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const n = parseConfigInput(kind, path, text);
        if (n !== null && n === Number(text)) onCommit(n);
      }}
      onBlur={() => {
        const n = draft === null ? null : parseConfigInput(kind, path, draft);
        if (n !== null && n !== value) onCommit(n);
        setDraft(null);
      }}
      className="h-8 text-xs"
    />
  );
}

/** The selected node's fields. `InspectorCard` owns the frame and the title. */
export function NodeInspector({ onDeleted }: { onDeleted?: () => void }) {
  const selectedNodeId = useSimulatorStore((s) => s.selectedNodeId);
  const nodes = useSimulatorStore((s) => s.nodes);
  const updateNodeData = useSimulatorStore((s) => s.updateNodeData);
  const updateNodeConfig = useSimulatorStore((s) => s.updateNodeConfig);
  const deleteNode = useSimulatorStore((s) => s.deleteNode);
  const node = nodes.find((n) => n.id === selectedNodeId);
  const id = useId();

  if (!node) return null;

  const cfg = node.data.config;

  return (
    <div className="space-y-3">
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
                <ConfigNumberField
                  id={`${id}-${key}`}
                  kind={cfg.kind}
                  path={`capacity.${key}`}
                  step={key === "vcpus" ? 0.5 : 1}
                  value={cfg.capacity[key]}
                  // The store merges capacity field by field, so only this one is sent.
                  onCommit={(n) => updateNodeConfig(node.id, { capacity: { [key]: n } })}
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
              <ConfigNumberField
                id={`${id}-replicas`}
                kind="database"
                path="replicas"
                value={cfg.replicas}
                onCommit={(n) => updateNodeConfig(node.id, { replicas: n })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${id}-shards`} className="text-[10px]">Shards</Label>
              <ConfigNumberField
                id={`${id}-shards`}
                kind="database"
                path="shards"
                value={cfg.shards}
                onCommit={(n) => updateNodeConfig(node.id, { shards: n })}
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
            <ConfigNumberField
              id={`${id}-memory-gb`}
              kind="cache"
              path="memoryGb"
              step={0.5}
              value={cfg.memoryGb}
              onCommit={(n) => updateNodeConfig(node.id, { memoryGb: n })}
            />
          </div>
        </div>
      )}

      {cfg.kind === "object_storage" && (
        <div className="space-y-1">
          <Label htmlFor={`${id}-storage-gb`} className="text-[10px]">Storage GB</Label>
          <ConfigNumberField
            id={`${id}-storage-gb`}
            kind="object_storage"
            path="storageGb"
            value={cfg.storageGb}
            onCommit={(n) => updateNodeConfig(node.id, { storageGb: n })}
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
          <ConfigNumberField
            id={`${id}-concurrency`}
            kind="task_worker"
            path="concurrency"
            value={cfg.concurrency}
            onCommit={(n) => updateNodeConfig(node.id, { concurrency: n })}
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

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 text-xs text-red-600 hover:text-red-700"
        onClick={() => {
          deleteNode(node.id);
          onDeleted?.();
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>
    </div>
  );
}
