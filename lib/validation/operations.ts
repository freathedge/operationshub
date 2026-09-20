import { z } from "zod";
import {
  OPERATION_PRIORITIES,
  OPERATION_STATUSES,
  type OperationPriority,
  type OperationStatus,
} from "@/lib/domain/operation-status";

export const operationStatusSchema = z.enum(
  OPERATION_STATUSES as [OperationStatus, ...OperationStatus[]]
);
export const operationPrioritySchema = z.enum(
  OPERATION_PRIORITIES as [OperationPriority, ...OperationPriority[]]
);

export const createOperationSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(5000).optional(),
  ownerId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  priority: operationPrioritySchema.optional(),
  startDate: z.string().date().optional(),
  targetDate: z.string().date().optional(),
});
export type CreateOperationInput = z.infer<typeof createOperationSchema>;

export const updateOperationSchema = z.object({
  title: z.string().min(1, "Title is required").max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  ownerId: z.string().uuid().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  status: operationStatusSchema.optional(),
  priority: operationPrioritySchema.optional(),
  startDate: z.string().date().nullable().optional(),
  targetDate: z.string().date().nullable().optional(),
});
export type UpdateOperationInput = z.infer<typeof updateOperationSchema>;

export const operationFiltersSchema = z.object({
  status: operationStatusSchema.optional(),
  departmentId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
});
export type OperationFilters = z.infer<typeof operationFiltersSchema>;

const linkableEntityTypeSchema = z.enum(["task", "request", "asset", "employee"]);

export const linkActionSchema = z.union([
  z.object({
    action: z.literal("link"),
    entityType: linkableEntityTypeSchema,
    entityId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("unlink"),
    entityType: linkableEntityTypeSchema,
    entityId: z.string().uuid(),
  }),
]);
export type LinkActionInput = z.infer<typeof linkActionSchema>;
