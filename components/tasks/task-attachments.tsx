"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

interface AttachmentWithUrl {
  id: string;
  storagePath: string;
  downloadUrl: string | null;
}

export function TaskAttachments({
  taskId,
  initialAttachments,
}: {
  taskId: string;
  initialAttachments: AttachmentWithUrl[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    const response = await fetch(`/api/tasks/${taskId}/attachments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: file.name }),
    });

    if (!response.ok) {
      setIsUploading(false);
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to prepare upload");
      return;
    }

    const { attachment, token } = await response.json();
    const supabase = createSupabaseBrowserClient();
    const { error: uploadError } = await supabase.storage
      .from("attachments")
      .uploadToSignedUrl(attachment.storagePath, token, file);
    setIsUploading(false);

    if (uploadError) {
      setError("Failed to upload file");
      return;
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">Attachments</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {initialAttachments.map((attachment) => (
          <li key={attachment.id}>
            {attachment.downloadUrl ? (
              <a href={attachment.downloadUrl} className="hover:underline">
                {attachment.storagePath.split("/").pop()}
              </a>
            ) : (
              <span className="text-muted-foreground">
                {attachment.storagePath.split("/").pop()} (unavailable)
              </span>
            )}
          </li>
        ))}
        {initialAttachments.length === 0 && (
          <li className="text-muted-foreground">No attachments yet.</li>
        )}
      </ul>
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          disabled={isUploading}
        />
        {isUploading && <span className="text-sm text-muted-foreground">Uploading...</span>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
