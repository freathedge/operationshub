"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type LinkableEntityType = "task" | "request" | "asset" | "employee";

interface PickableItem {
  id: string;
  label: string;
}

const ENTITY_CONFIG: Record<
  LinkableEntityType,
  { endpoint: string; responseKey: string; label: (item: Record<string, unknown>) => string }
> = {
  task: { endpoint: "/api/tasks", responseKey: "tasks", label: (item) => String(item.title) },
  request: {
    endpoint: "/api/requests",
    responseKey: "requests",
    label: (item) => String(item.title),
  },
  asset: { endpoint: "/api/assets", responseKey: "assets", label: (item) => String(item.name) },
  employee: {
    endpoint: "/api/employees",
    responseKey: "employees",
    label: (item) => String(item.fullName),
  },
};

export function OperationLinkPicker({
  operationId,
  entityType,
}: {
  operationId: string;
  entityType: LinkableEntityType;
}) {
  const router = useRouter();
  const [items, setItems] = useState<PickableItem[]>([]);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const config = ENTITY_CONFIG[entityType];
    fetch(config.endpoint)
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setError("Failed to load items to link");
          setItemsLoaded(true);
          return;
        }
        const body = await response.json();
        const list = (body[config.responseKey] ?? []) as Record<string, unknown>[];
        setItems(list.map((item) => ({ id: String(item.id), label: config.label(item) })));
        setItemsLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Failed to load items to link");
        setItemsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [entityType]);

  async function link() {
    if (!selectedId) return;
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/operations/${operationId}/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "link", entityType, entityId: selectedId }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to link");
      return;
    }

    setSelectedId(null);
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <Select value={selectedId} onValueChange={setSelectedId} disabled={!itemsLoaded}>
        <SelectTrigger className="w-56">
          <SelectValue>
            {(value: string | null) =>
              value ? (items.find((i) => i.id === value)?.label ?? value) : itemsLoaded ? "Select an item to link" : "Loading..."
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" disabled={isSubmitting || !selectedId} onClick={link}>
        Link
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function OperationUnlinkButton({
  operationId,
  entityType,
  entityId,
}: {
  operationId: string;
  entityType: LinkableEntityType;
  entityId: string;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlink() {
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/operations/${operationId}/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "unlink", entityType, entityId }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to unlink");
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <Button variant="ghost" size="sm" disabled={isSubmitting} onClick={unlink}>
        Unlink
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
