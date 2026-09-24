import { z } from "zod";

export const workflowInstanceFiltersSchema = z.object({
  status: z.enum(["in_progress", "completed"]).optional(),
  scope: z.enum(["mine", "all"]).optional(),
});
export type WorkflowInstanceFiltersInput = z.infer<typeof workflowInstanceFiltersSchema>;
