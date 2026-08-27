export type TaskStatus = "todo" | "in_progress" | "blocked" | "completed" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "critical";

export const TASK_STATUSES: TaskStatus[] = [
  "todo",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
];

export const TASK_PRIORITIES: TaskPriority[] = ["low", "medium", "high", "critical"];

export const TASK_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  todo: ["in_progress", "cancelled"],
  in_progress: ["blocked", "completed", "cancelled"],
  blocked: ["in_progress", "cancelled"],
  completed: [],
  cancelled: [],
};

export function getValidNextStatuses(current: TaskStatus): TaskStatus[] {
  return TASK_STATUS_TRANSITIONS[current];
}
