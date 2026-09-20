export type OperationStatus = "planning" | "in_progress" | "on_hold" | "completed" | "cancelled";
export type OperationPriority = "low" | "medium" | "high" | "critical";

export const OPERATION_STATUSES: OperationStatus[] = [
  "planning",
  "in_progress",
  "on_hold",
  "completed",
  "cancelled",
];

export const OPERATION_PRIORITIES: OperationPriority[] = ["low", "medium", "high", "critical"];
