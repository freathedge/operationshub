"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RequestApprovalControl({ approvalId }: { approvalId: string }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approved" | "rejected") {
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/approvals/${approvalId}/decide`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(comment ? { decision, comment } : { decision }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to record decision");
      return;
    }

    router.refresh();
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-medium">Your decision</h2>
      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Optional comment"
        className="min-h-16 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      <div className="flex gap-2">
        <Button disabled={isSubmitting} onClick={() => decide("approved")}>
          Approve
        </Button>
        <Button variant="outline" disabled={isSubmitting} onClick={() => decide("rejected")}>
          Reject
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
