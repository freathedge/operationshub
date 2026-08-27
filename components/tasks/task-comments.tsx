"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Comment } from "@/lib/domain/comments";
import { Button } from "@/components/ui/button";

export function TaskComments({
  taskId,
  initialComments,
}: {
  taskId: string;
  initialComments: Comment[];
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitComment() {
    if (!body.trim()) return;
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/tasks/${taskId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const responseBody = await response.json();
      setError(
        typeof responseBody.error === "string" ? responseBody.error : "Failed to add comment"
      );
      return;
    }

    setBody("");
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">Comments</h2>
      <ul className="flex flex-col gap-2">
        {initialComments.map((comment) => (
          <li key={comment.id} className="text-sm">
            {comment.body}
          </li>
        ))}
        {initialComments.length === 0 && (
          <li className="text-sm text-muted-foreground">No comments yet.</li>
        )}
      </ul>
      <div className="flex flex-col gap-2">
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="min-h-16 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          placeholder="Add a comment..."
        />
        <Button onClick={submitComment} disabled={isSubmitting}>
          {isSubmitting ? "Posting..." : "Post comment"}
        </Button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </section>
  );
}
