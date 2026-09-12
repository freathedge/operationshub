import { z } from "zod";
import { ASSET_STATUSES, type AssetStatus } from "@/lib/domain/asset-status";

export const assetStatusSchema = z.enum(ASSET_STATUSES as [AssetStatus, ...AssetStatus[]]);

export const createAssetSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  category: z.string().min(1, "Category is required").max(100),
  departmentId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  purchaseInfo: z.record(z.string(), z.unknown()).optional(),
  warrantyInfo: z.record(z.string(), z.unknown()).optional(),
});
export type CreateAssetInput = z.infer<typeof createAssetSchema>;

export const patchAssetSchema = z.union([
  z.object({ action: z.literal("assign"), targetEmployeeId: z.string().uuid() }),
  z.object({ action: z.literal("changeStatus"), status: assetStatusSchema }),
]);
export type PatchAssetInput = z.infer<typeof patchAssetSchema>;

export const assetFiltersSchema = z.object({
  category: z.string().optional(),
  status: assetStatusSchema.optional(),
  departmentId: z.string().uuid().optional(),
});
export type AssetFilters = z.infer<typeof assetFiltersSchema>;
