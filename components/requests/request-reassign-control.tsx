"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";

interface PeerProfile {
  id: string;
  fullName: string;
}

export function RequestReassignControl({
  approvalId,
  currentApproverRole,
}: {
  approvalId: string;
  currentApproverRole: Role;
}) {
  const router = useRouter();
  const [peers, setPeers] = useState<PeerProfile[]>([]);
  const [peersLoaded, setPeersLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadPeers() {
      const response = await fetch(`/api/profiles?role=${currentApproverRole}`);
      if (cancelled) return;
      if (!response.ok) {
        setPeersLoaded(true);
        return;
      }
      const body = await response.json();
      setPeers(body.profiles);
      setPeersLoaded(true);
    }
    loadPeers();
    return () => {
      cancelled = true;
    };
  }, [currentApproverRole]);

  async function reassign() {
    if (!selectedId) return;
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/approvals/${approvalId}/reassign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        comment ? { newApproverId: selectedId, comment } : { newApproverId: selectedId }
      ),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to reassign approval");
      return;
    }

    router.refresh();
  }

  if (peersLoaded && peers.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-medium">Reassign to someone else</h2>
      <select
        value={selectedId}
        onChange={(event) => setSelectedId(event.target.value)}
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        disabled={!peersLoaded}
      >
        <option value="">{peersLoaded ? "Select a colleague" : "Loading..."}</option>
        {peers.map((peer) => (
          <option key={peer.id} value={peer.id}>
            {peer.fullName}
          </option>
        ))}
      </select>
      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Optional comment"
        className="min-h-16 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      <Button variant="outline" disabled={isSubmitting || !selectedId} onClick={reassign}>
        Reassign
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
