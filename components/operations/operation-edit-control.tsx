"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  OPERATION_PRIORITIES,
  OPERATION_STATUSES,
  type OperationPriority,
  type OperationStatus,
} from "@/lib/domain/operation-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OperationEditControl({
  operationId,
  title,
  status,
  priority,
}: {
  operationId: string;
  title: string;
  status: OperationStatus;
  priority: OperationPriority;
}) {
  const router = useRouter();
  const [titleValue, setTitleValue] = useState(title);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/operations/${operationId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const responseBody = await response.json();
      setError(
        typeof responseBody.error === "string" ? responseBody.error : "Failed to update operation"
      );
      return;
    }

    router.refresh();
  }

  const otherStatuses = OPERATION_STATUSES.filter((nextStatus) => nextStatus !== status);
  const otherPriorities = OPERATION_PRIORITIES.filter(
    (nextPriority) => nextPriority !== priority
  );
  const titleUnchanged = titleValue.trim() === "" || titleValue === title;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="operation-title">Title</Label>
        <div className="flex gap-2">
          <Input
            id="operation-title"
            value={titleValue}
            onChange={(event) => setTitleValue(event.target.value)}
            disabled={isSubmitting}
          />
          <Button
            variant="outline"
            disabled={isSubmitting || titleUnchanged}
            onClick={() => patch({ title: titleValue })}
          >
            Save
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm">
          Status: <span className="font-medium">{status}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {otherStatuses.map((nextStatus) => (
            <Button
              key={nextStatus}
              variant="outline"
              disabled={isSubmitting}
              onClick={() => patch({ status: nextStatus })}
            >
              Move to {nextStatus}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm">
          Priority: <span className="font-medium">{priority}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {otherPriorities.map((nextPriority) => (
            <Button
              key={nextPriority}
              variant="outline"
              disabled={isSubmitting}
              onClick={() => patch({ priority: nextPriority })}
            >
              Set priority to {nextPriority}
            </Button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
