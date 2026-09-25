"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBroadcastListener } from "@/lib/realtime/use-broadcast-listener";
import { Badge } from "@/components/ui/badge";
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
import type { Department } from "@/lib/domain/departments";

interface OperationListItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  departmentId: string | null;
}

const STATUS_OPTIONS = ["planning", "in_progress", "on_hold", "completed", "cancelled"];

export function OperationListView({
  companyId,
  departments,
}: {
  companyId: string;
  departments: Department[];
}) {
  const [status, setStatus] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["operations", { status, departmentId }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (departmentId) params.set("departmentId", departmentId);
      const response = await fetch(`/api/operations?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load operations");
      const body = await response.json();
      return body.operations as OperationListItem[];
    },
  });

  useBroadcastListener(`company:${companyId}:operations`, () => {
    queryClient.invalidateQueries({ queryKey: ["operations"] });
  });

  function departmentName(id: string | null) {
    if (!id) return "—";
    return departments.find((department) => department.id === id)?.name ?? "—";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Select value={status || "all"} onValueChange={(value) => setStatus(value === "all" || value === null ? "" : value)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={departmentId || "all"}
          onValueChange={(value) => setDepartmentId(value === "all" || value === null ? "" : value)}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map((department) => (
              <SelectItem key={department.id} value={department.id}>
                {department.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading operations...</p>}
      {error && <p className="text-red-600">Failed to load operations.</p>}

      {data && (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Department</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((operation) => (
                  <TableRow key={operation.id}>
                    <TableCell>
                      <Link href={`/operations/${operation.id}`} className="hover:underline">
                        {operation.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{operation.status.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell>{operation.priority}</TableCell>
                    <TableCell>{departmentName(operation.departmentId)}</TableCell>
                  </TableRow>
                ))}
                {data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No operations found.
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
