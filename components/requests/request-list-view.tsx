"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBroadcastListener } from "@/lib/realtime/use-broadcast-listener";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface RequestListItem {
  id: string;
  title: string;
  status: string;
  category: string;
  departmentId: string | null;
  createdAt: string;
}

const STATUS_OPTIONS = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "in_progress",
  "completed",
];
const CATEGORY_OPTIONS = [
  "equipment",
  "software",
  "access",
  "maintenance",
  "purchase",
  "hr",
  "general",
  "other",
];

function formatOptionLabel(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function RequestListView({ companyId }: { companyId: string }) {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [category, setCategory] = useState("");
  const [scope, setScope] = useState<"mine" | "all">(
    searchParams.get("scope") === "all" ? "all" : "mine"
  );
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["requests", { status, category, scope }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (category) params.set("category", category);
      params.set("scope", scope);
      const response = await fetch(`/api/requests?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load requests");
      const body = await response.json();
      return body.requests as RequestListItem[];
    },
  });

  useBroadcastListener(`company:${companyId}:requests`, () => {
    queryClient.invalidateQueries({ queryKey: ["requests"] });
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          <Button
            variant={scope === "mine" ? "default" : "outline"}
            onClick={() => setScope("mine")}
          >
            Mine
          </Button>
          <Button
            variant={scope === "all" ? "default" : "outline"}
            onClick={() => setScope("all")}
          >
            All
          </Button>
        </div>
        <Select value={status || "all"} onValueChange={(value) => setStatus(value === "all" || value === null ? "" : value)}>
          <SelectTrigger className="w-44">
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
        <Select value={category || "all"} onValueChange={(value) => setCategory(value === "all" || value === null ? "" : value)}>
          <SelectTrigger className="w-44">
            <SelectValue>{(value: string) => (value === "all" ? "All categories" : formatOptionLabel(value))}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORY_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {formatOptionLabel(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading requests...</p>}
      {error && <p className="text-red-600">Failed to load requests.</p>}

      {data && (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Link href={`/requests/${item.id}`} className="hover:underline">
                        {item.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.status}</Badge>
                    </TableCell>
                    <TableCell>{item.category}</TableCell>
                    <TableCell>{new Date(item.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
                {data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No requests found.
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
