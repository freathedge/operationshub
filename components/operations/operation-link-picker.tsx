"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

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
  const [selectedId, setSelectedId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const config = ENTITY_CONFIG[entityType];
    fetch(config.endpoint).then(async (response) => {
      if (cancelled || !response.ok) return;
      const body = await response.json();
      const list = (body[config.responseKey] ?? []) as Record<string, unknown>[];
      setItems(list.map((item) => ({ id: String(item.id), label: config.label(item) })));
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

    setSelectedId("");
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <select
        value={selectedId}
        onChange={(event) => setSelectedId(event.target.value)}
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
      >
        <option value="">Select an item to link</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
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

  async function unlink() {
    setIsSubmitting(true);
    const response = await fetch(`/api/operations/${operationId}/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "unlink", entityType, entityId }),
    });
    setIsSubmitting(false);
    if (response.ok) {
      router.refresh();
    }
  }

  return (
    <Button variant="ghost" size="sm" disabled={isSubmitting} onClick={unlink}>
      Unlink
    </Button>
  );
}
