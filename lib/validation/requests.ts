import { z } from "zod";
import {
  REQUEST_CATEGORIES,
  REQUEST_STATUSES,
  type RequestCategory,
  type RequestStatus,
} from "@/lib/domain/request-status";

export const requestStatusSchema = z.enum(
  REQUEST_STATUSES as [RequestStatus, ...RequestStatus[]]
);
export const requestCategorySchema = z.enum(
  REQUEST_CATEGORIES as [RequestCategory, ...RequestCategory[]]
);

export const createRequestSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(5000).optional(),
  category: requestCategorySchema,
  departmentId: z.string().uuid().optional(),
});
export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export const patchRequestSchema = z.object({ status: requestStatusSchema });
export type PatchRequestInput = z.infer<typeof patchRequestSchema>;

export const requestFiltersSchema = z.object({
  status: requestStatusSchema.optional(),
  category: requestCategorySchema.optional(),
  departmentId: z.string().uuid().optional(),
  scope: z.enum(["mine", "all"]).optional(),
});
export type RequestFilters = z.infer<typeof requestFiltersSchema>;

export const decideApprovalSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().max(5000).optional(),
});
export type DecideApprovalInput = z.infer<typeof decideApprovalSchema>;

export const reassignApprovalSchema = z.object({
  newApproverId: z.string().uuid(),
  comment: z.string().max(5000).optional(),
});
export type ReassignApprovalInput = z.infer<typeof reassignApprovalSchema>;
