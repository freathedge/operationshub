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

export function EmployeeOperationControl({
  employeeId,
  relatedOperationId,
}: {
  employeeId: string;
  relatedOperationId: string | null;
}) {
  const router = useRouter();
  const [operations, setOperations] = useState<OperationOption[]>([]);
  const [operationsLoaded, setOperationsLoaded] = useState(false);
  const [linkedTitle, setLinkedTitle] = useState<string | null>(null);
  const [titleLoadFailed, setTitleLoadFailed] = useState(false);
  const [selectedId, setSelectedId] = useState("");
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
    } else {
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
  }, [relatedOperationId]);

  async function link() {
    if (!selectedId) return;
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/operations/${selectedId}/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "link", entityType: "employee", entityId: employeeId }),
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
      body: JSON.stringify({ action: "unlink", entityType: "employee", entityId: employeeId }),
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
        <Button variant="ghost" size="sm" disabled={isSubmitting} onClick={unlink}>
          Unlink
        </Button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="employee-link-operation">Operation</Label>
      <div className="flex gap-2">
        <select
          id="employee-link-operation"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          disabled={!operationsLoaded}
        >
          <option value="">{operationsLoaded ? "Select an operation" : "Loading..."}</option>
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
