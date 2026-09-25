"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface OperationOption {
  id: string;
  title: string;
}

export function RequestOperationControl({
  requestId,
  relatedOperationId,
  canManage,
}: {
  requestId: string;
  relatedOperationId: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [operations, setOperations] = useState<OperationOption[]>([]);
  const [operationsLoaded, setOperationsLoaded] = useState(false);
  const [linkedTitle, setLinkedTitle] = useState<string | null>(null);
  const [titleLoadFailed, setTitleLoadFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (relatedOperationId) {
      fetch(`/api/operations/${relatedOperationId}`)
        .then(async (response) => {
          if (cancelled) return;
          if (!response.ok) {
            setTitleLoadFailed(true);
            return;
          }
          const body = await response.json();
          setLinkedTitle(body.operation.title);
        })
        .catch(() => {
          if (!cancelled) setTitleLoadFailed(true);
        });
    } else if (canManage) {
      fetch("/api/operations")
        .then(async (response) => {
          if (cancelled) return;
          if (!response.ok) {
            setError("Failed to load operations");
            setOperationsLoaded(true);
            return;
          }
          const body = await response.json();
          setOperations(body.operations);
          setOperationsLoaded(true);
        })
        .catch(() => {
          if (cancelled) return;
          setError("Failed to load operations");
          setOperationsLoaded(true);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [relatedOperationId, canManage]);

  async function link() {
    if (!selectedId) return;
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/operations/${selectedId}/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "link", entityType: "request", entityId: requestId }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to link operation");
      return;
    }

    router.refresh();
  }

  async function unlink() {
    if (!relatedOperationId) return;
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/operations/${relatedOperationId}/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "unlink", entityType: "request", entityId: requestId }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to unlink operation");
      return;
    }

    router.refresh();
  }

  if (relatedOperationId) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Operation:</span>
        {titleLoadFailed ? (
          <span className="text-red-600">Failed to load operation</span>
        ) : (
          <Link href={`/operations/${relatedOperationId}`} className="hover:underline">
            {linkedTitle ?? "Loading..."}
          </Link>
        )}
        {canManage && (
          <Button variant="ghost" size="sm" disabled={isSubmitting} onClick={unlink}>
            Unlink
          </Button>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  if (!canManage) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="request-link-operation">Operation</Label>
      <div className="flex gap-2">
        <Select
          value={selectedId}
          onValueChange={(value) => setSelectedId(value ?? undefined)}
          disabled={!operationsLoaded}
        >
          <SelectTrigger id="request-link-operation" className="w-56">
            <SelectValue placeholder={operationsLoaded ? "Select an operation" : "Loading..."} />
          </SelectTrigger>
          <SelectContent>
            {operations.map((operation) => (
              <SelectItem key={operation.id} value={operation.id}>
                {operation.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" disabled={isSubmitting || !selectedId} onClick={link}>
          Link
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
