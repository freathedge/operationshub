"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AssetReportIssueForm({ assetId }: { assetId: string }) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!description.trim()) return;
    setIsSubmitting(true);
    setError(null);
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: description, relatedAssetId: assetId }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to report issue");
      return;
    }

    setDescription("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="issue-description">Describe the issue</Label>
      <div className="flex gap-2">
        <Input
          id="issue-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <Button variant="outline" disabled={isSubmitting || !description.trim()} onClick={submit}>
          Report issue
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
