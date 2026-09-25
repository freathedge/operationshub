"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBroadcastListener } from "@/lib/realtime/use-broadcast-listener";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

interface ApprovalListItem {
  id: string;
  requestId: string;
  requestTitle: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  decidedAt: string | null;
}

const STATUS_OPTIONS = ["pending", "approved", "rejected"];

export function ApprovalListView({
  companyId,
  canViewAll,
}: {
  companyId: string;
  canViewAll: boolean;
}) {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [scope, setScope] = useState<"mine" | "all">(
    canViewAll && searchParams.get("scope") === "all" ? "all" : "mine"
  );
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["approvals", { status, scope }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      params.set("scope", scope);
      const response = await fetch(`/api/approvals?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load approvals");
      const body = await response.json();
      return body.approvals as ApprovalListItem[];
    },
  });

  // Approvals piggyback on the request and workflow broadcast channels: decideApproval/
  // reassignApproval call broadcastChange(companyId, "requests", ...), and a workflow step
  // advancing to its next approval calls broadcastChange(companyId, "workflows", ...) —
  // there is no separate approvals channel.
  useBroadcastListener(`company:${companyId}:requests`, () => {
    queryClient.invalidateQueries({ queryKey: ["approvals"] });
  });
  useBroadcastListener(`company:${companyId}:workflows`, () => {
    queryClient.invalidateQueries({ queryKey: ["approvals"] });
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <div className="flex gap-1">
          <Button
            variant={scope === "mine" ? "default" : "outline"}
            onClick={() => setScope("mine")}
          >
            Mine
          </Button>
          {canViewAll && (
            <Button
              variant={scope === "all" ? "default" : "outline"}
              onClick={() => setScope("all")}
            >
              All
            </Button>
          )}
        </div>
        <Select value={status || "all"} onValueChange={(value) => setStatus(value === "all" || value === null ? "" : value)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading approvals...</p>}
      {error && <p className="text-red-600">Failed to load approvals.</p>}

      {data && (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Decided</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Link href={`/requests/${item.requestId}`} className="hover:underline">
                        {item.requestTitle}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.status}</Badge>
                    </TableCell>
                    <TableCell>{new Date(item.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {item.decidedAt ? new Date(item.decidedAt).toLocaleDateString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No approvals found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
