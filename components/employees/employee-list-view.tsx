"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBroadcastListener } from "@/lib/realtime/use-broadcast-listener";
import { Badge } from "@/components/ui/badge";
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

interface EmployeeListItem {
  id: string;
  fullName: string;
  positionTitle: string | null;
  departmentId: string | null;
  status: "active" | "inactive";
}

const STATUS_OPTIONS = ["active", "inactive"];

export function EmployeeListView({ companyId }: { companyId: string }) {
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

      {isLoading && <p className="text-muted-foreground">Loading employees...</p>}
      {error && <p className="text-red-600">Failed to load employees.</p>}

      {data && (
        <Card>
          <CardContent>
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
