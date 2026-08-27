"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getValidNextStatuses, type TaskStatus } from "@/lib/domain/task-status";
import { Button } from "@/components/ui/button";

export function TaskStatusControl({
  taskId,
  currentStatus,
}: {
  taskId: string;
  currentStatus: TaskStatus;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function changeStatus(nextStatus: TaskStatus) {
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to update status");
      return;
    }

    router.refresh();
  }

  const nextStatuses = getValidNextStatuses(currentStatus);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        Status: <span className="font-medium">{currentStatus}</span>
      </p>
      <div className="flex gap-2">
        {nextStatuses.map((nextStatus) => (
          <Button
            key={nextStatus}
            variant="outline"
            disabled={isSubmitting}
            onClick={() => changeStatus(nextStatus)}
          >
            Move to {nextStatus}
          </Button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
