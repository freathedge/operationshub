"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface OperationOption {
  id: string;
  title: string;
}

export function RequestOperationControl({
  requestId,
  relatedOperationId,
}: {
  requestId: string;
  relatedOperationId: string | null;
}) {
  const router = useRouter();
  const [operations, setOperations] = useState<OperationOption[]>([]);
  const [linkedTitle, setLinkedTitle] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (relatedOperationId) {
      fetch(`/api/operations/${relatedOperationId}`).then(async (response) => {
        if (cancelled || !response.ok) return;
        const body = await response.json();
        setLinkedTitle(body.operation.title);
      });
    } else {
      fetch("/api/operations").then(async (response) => {
        if (cancelled || !response.ok) return;
        const body = await response.json();
        setOperations(body.operations);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [relatedOperationId]);

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
        <Link href={`/operations/${relatedOperationId}`} className="hover:underline">
          {linkedTitle ?? "Loading..."}
        </Link>
        <Button variant="ghost" size="sm" disabled={isSubmitting} onClick={unlink}>
          Unlink
        </Button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="request-link-operation">Operation</Label>
      <div className="flex gap-2">
        <select
          id="request-link-operation"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">Select an operation</option>
          {operations.map((operation) => (
            <option key={operation.id} value={operation.id}>
              {operation.title}
            </option>
          ))}
        </select>
        <Button variant="outline" disabled={isSubmitting || !selectedId} onClick={link}>
          Link
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
