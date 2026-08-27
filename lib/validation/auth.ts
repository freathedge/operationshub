import { z } from "zod";

export const roleSchema = z.enum([
  "employee",
  "manager",
  "operations_manager",
  "it",
  "hr",
  "admin",
]);

export type Role = z.infer<typeof roleSchema>;

export const completeSignupSchema = z.object({
  fullName: z.string().min(1, "Name is required").max(200),
  role: roleSchema,
});

export type CompleteSignupInput = z.infer<typeof completeSignupSchema>;
