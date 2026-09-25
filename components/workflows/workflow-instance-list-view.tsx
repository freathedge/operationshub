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

interface WorkflowInstanceListItem {
  id: string;
  templateName: string;
  status: "in_progress" | "completed";
  createdAt: string;
}

const STATUS_OPTIONS = ["in_progress", "completed"];

function formatOptionLabel(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function WorkflowInstanceListView({
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
    queryKey: ["workflow-instances", { status, scope }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      params.set("scope", scope);
      const response = await fetch(`/api/workflows/instances?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load workflows");
      const body = await response.json();
      return body.instances as WorkflowInstanceListItem[];
    },
  });

  useBroadcastListener(`company:${companyId}:workflows`, () => {
    queryClient.invalidateQueries({ queryKey: ["workflow-instances"] });
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
            <SelectValue>{(value: string) => (value === "all" ? "All statuses" : formatOptionLabel(value))}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {formatOptionLabel(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading workflows...</p>}
      {error && <p className="text-red-600">Failed to load workflows.</p>}

      {data && (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Link href={`/workflows/${item.id}`} className="hover:underline">
                        {item.templateName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.status}</Badge>
                    </TableCell>
                    <TableCell>{new Date(item.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
                {data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No workflows found.
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
