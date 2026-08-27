import { z } from "zod";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/domain/task-status";

export const taskStatusSchema = z.enum(
  TASK_STATUSES as [TaskStatus, ...TaskStatus[]]
);
export const taskPrioritySchema = z.enum(
  TASK_PRIORITIES as [TaskPriority, ...TaskPriority[]]
);

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(5000).optional(),
  priority: taskPrioritySchema.optional(),
  departmentId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  relatedEmployeeId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const patchTaskSchema = z.union([
  z.object({ status: taskStatusSchema }),
  z.object({ assigneeId: z.string().uuid() }),
]);
export type PatchTaskInput = z.infer<typeof patchTaskSchema>;

export const taskFiltersSchema = z.object({
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigneeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
});
export type TaskFilters = z.infer<typeof taskFiltersSchema>;

export const addCommentSchema = z.object({
  body: z.string().min(1, "Comment cannot be empty").max(5000),
});
export type AddCommentInput = z.infer<typeof addCommentSchema>;

export const createAttachmentSchema = z.object({
  filename: z.string().min(1).max(255),
});
export type CreateAttachmentInput = z.infer<typeof createAttachmentSchema>;
