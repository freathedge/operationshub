"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBroadcastListener } from "@/lib/realtime/use-broadcast-listener";
import { isTaskOverdue } from "@/components/tasks/is-task-overdue";
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

interface TaskListItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  departmentId: string | null;
  dueDate: string | null;
}

const STATUS_OPTIONS = ["todo", "in_progress", "blocked", "completed", "cancelled"];
const PRIORITY_OPTIONS = ["low", "medium", "high", "critical"];

function formatOptionLabel(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function TaskListView({ companyId }: { companyId: string }) {
  const searchParams = useSearchParams();
  // assigneeId/departmentId have no dropdown control — they only ever come from a
  // link (e.g. a dashboard card), so they're read once and shown via the
  // clear-filter link below rather than exposed as an editable dropdown.
  const assigneeId = searchParams.get("assigneeId");
  const departmentId = searchParams.get("departmentId");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [priority, setPriority] = useState(searchParams.get("priority") ?? "");
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["tasks", { status, priority, assigneeId, departmentId }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      if (assigneeId) params.set("assigneeId", assigneeId);
      if (departmentId) params.set("departmentId", departmentId);
      const response = await fetch(`/api/tasks?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load tasks");
      const body = await response.json();
      return body.tasks as TaskListItem[];
    },
  });

  useBroadcastListener(`company:${companyId}:tasks`, () => {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Select value={status || "all"} onValueChange={(value) => setStatus(value === "all" ? "" : value)}>
          <SelectTrigger className="w-40">
            <SelectValue />
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
        <Select value={priority || "all"} onValueChange={(value) => setPriority(value === "all" ? "" : value)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {PRIORITY_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {formatOptionLabel(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(assigneeId || departmentId) && (
        <p className="text-sm text-muted-foreground">
          Showing a filtered view.{" "}
          <Link href="/tasks" className="underline">
            Clear filter
          </Link>
        </p>
      )}

      {isLoading && <p className="text-muted-foreground">Loading tasks...</p>}
      {error && <p className="text-red-600">Failed to load tasks.</p>}

      {data && (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Due date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <Link href={`/tasks/${task.id}`} className="hover:underline">
                        {task.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{task.status}</Badge>
                    </TableCell>
                    <TableCell>{task.priority}</TableCell>
                    <TableCell>
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}
                      {isTaskOverdue(task) && (
                        <Badge variant="destructive" className="ml-2">
                          Overdue
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No tasks found.
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
