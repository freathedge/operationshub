import { z } from "zod";
import { roleSchema } from "@/lib/validation/auth";
import { PROFILE_STATUSES, type ProfileStatus } from "@/lib/domain/profiles";

export const profileStatusSchema = z.enum(PROFILE_STATUSES as [ProfileStatus, ...ProfileStatus[]]);

export const createEmployeeSchema = z.object({
  email: z.string().email("Enter a valid email"),
  fullName: z.string().min(1, "Name is required").max(200),
  role: roleSchema,
  departmentId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  positionTitle: z.string().max(200).optional(),
  employeeNumber: z.string().max(50).optional(),
  startOnboarding: z.boolean().optional(),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object({
  positionTitle: z.string().max(200).optional(),
  employeeNumber: z.string().max(50).optional(),
  departmentId: z.string().uuid().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  status: profileStatusSchema.optional(),
});
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export const employeeFiltersSchema = z.object({
  departmentId: z.string().uuid().optional(),
  status: profileStatusSchema.optional(),
});
export type EmployeeFilters = z.infer<typeof employeeFiltersSchema>;
