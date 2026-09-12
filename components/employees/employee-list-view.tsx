"use client";

import { useState } from "react";
import Link from "next/link";
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

interface EmployeeListItem {
  id: string;
  fullName: string;
  positionTitle: string | null;
  departmentId: string | null;
  status: "active" | "inactive";
}

const STATUS_OPTIONS = ["active", "inactive"];

export function EmployeeListView({
  companyId,
  canCreate,
}: {
  companyId: string;
  canCreate: boolean;
}) {
  const [status, setStatus] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["employees", { status }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      const response = await fetch(`/api/employees?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load employees");
      const body = await response.json();
      return body.employees as EmployeeListItem[];
    },
  });

  useBroadcastListener(`company:${companyId}:employees`, () => {
    queryClient.invalidateQueries({ queryKey: ["employees"] });
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </option>
          ))}
        </select>
        {canCreate && (
          <Button render={<Link href="/employees/new" />} nativeButton={false}>
            New employee
          </Button>
        )}
      </div>

      {isLoading && <p className="text-muted-foreground">Loading employees...</p>}
      {error && <p className="text-red-600">Failed to load employees.</p>}

      {data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((employee) => (
              <TableRow key={employee.id}>
                <TableCell>
                  <Link href={`/employees/${employee.id}`} className="hover:underline">
                    {employee.fullName}
                  </Link>
                </TableCell>
                <TableCell>{employee.positionTitle ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline">{employee.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No employees found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
