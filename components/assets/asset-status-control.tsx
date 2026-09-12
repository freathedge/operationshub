"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ASSET_STATUSES, type AssetStatus } from "@/lib/domain/asset-status";
import { Button } from "@/components/ui/button";

export function AssetStatusControl({
  assetId,
  currentStatus,
}: {
  assetId: string;
  currentStatus: AssetStatus;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function changeStatus(nextStatus: AssetStatus) {
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/assets/${assetId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "changeStatus", status: nextStatus }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to update status");
      return;
    }

    router.refresh();
  }

  const otherStatuses = ASSET_STATUSES.filter((status) => status !== currentStatus);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        Status: <span className="font-medium">{currentStatus}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {otherStatuses.map((nextStatus) => (
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
