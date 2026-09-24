import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getProfileById, type Profile } from "@/lib/domain/profiles";
import { logActivity } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import {
  canAssignAsset,
  canChangeAssetStatus,
  canChangeTaskStatus,
  canCreateAsset,
  canViewAsset,
} from "@/lib/domain/permissions";
import { ForbiddenError, NotFoundError, UnprocessableRequestError } from "@/lib/domain/errors";
import type { AssetStatus } from "@/lib/domain/asset-status";
import type { AssetFilters, CreateAssetInput } from "@/lib/validation/assets";
import type { Json } from "@/lib/supabase/database.types";
import { loadTaskOrThrow, updateTaskStatus, type Task } from "@/lib/domain/tasks";
import { findWorkflowStepByTaskId } from "@/lib/domain/workflows";
import { loadRequestOrThrow } from "@/lib/domain/requests";
import { createNotification } from "@/lib/domain/notifications";

export interface Asset {
  id: string;
  companyId: string;
  assetCode: string;
  name: string;
  category: string;
  status: AssetStatus;
  assignedTo: string | null;
  departmentId: string | null;
  locationId: string | null;
  relatedOperationId: string | null;
  purchaseInfo: Record<string, unknown> | null;
  warrantyInfo: Record<string, unknown> | null;
  createdAt: string;
}

interface AssetRow {
  id: string;
  company_id: string;
  asset_code: string;
  name: string;
  category: string;
  status: AssetStatus;
  assigned_to: string | null;
  department_id: string | null;
  location_id: string | null;
  related_operation_id: string | null;
  purchase_info: Json | null;
  warranty_info: Json | null;
  created_at: string;
}

export function toAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    companyId: row.company_id,
    assetCode: row.asset_code,
    name: row.name,
    category: row.category,
    status: row.status,
    assignedTo: row.assigned_to,
    departmentId: row.department_id,
    locationId: row.location_id,
    relatedOperationId: row.related_operation_id,
    purchaseInfo: row.purchase_info as Record<string, unknown> | null,
    warrantyInfo: row.warranty_info as Record<string, unknown> | null,
    createdAt: row.created_at,
  };
}

export const ASSET_COLUMNS =
  "id, company_id, asset_code, name, category, status, assigned_to, department_id, location_id, related_operation_id, purchase_info, warranty_info, created_at";

async function generateAssetCode(companyId: string): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const { count, error } = await supabase
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);
  if (error) throw error;
  return `AST-${String((count ?? 0) + 1).padStart(5, "0")}`;
}

interface InsertAssetInput {
  name: string;
  category: string;
  status?: AssetStatus;
  assignedTo?: string | null;
  departmentId?: string | null;
  locationId?: string | null;
  purchaseInfo?: Record<string, unknown> | null;
  warrantyInfo?: Record<string, unknown> | null;
}

async function insertAsset(companyId: string, input: InsertAssetInput): Promise<Asset> {
  const assetCode = await generateAssetCode(companyId);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("assets")
    .insert({
      company_id: companyId,
      asset_code: assetCode,
      name: input.name,
      category: input.category,
      status: input.status ?? "available",
      assigned_to: input.assignedTo ?? null,
      department_id: input.departmentId ?? null,
      location_id: input.locationId ?? null,
      purchase_info: (input.purchaseInfo as Json) ?? null,
      warranty_info: (input.warrantyInfo as Json) ?? null,
    })
    .select(ASSET_COLUMNS)
    .single();
  if (error) throw error;
  return toAsset(data);
}

export async function createAsset(profile: Profile, input: CreateAssetInput): Promise<Asset> {
  if (!canCreateAsset(profile)) {
    throw new ForbiddenError("You cannot create assets");
  }

  const asset = await insertAsset(profile.companyId, input);
  await logActivity("asset", asset.id, profile.id, `${profile.fullName} created this asset`);
  try {
    await broadcastChange(profile.companyId, "assets", { type: "asset_created" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }
  return asset;
}

export async function loadAssetOrThrow(assetId: string): Promise<Asset> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("assets")
    .select(ASSET_COLUMNS)
    .eq("id", assetId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError("Asset not found");
  return toAsset(data);
}

export async function getAsset(profile: Profile, assetId: string): Promise<Asset> {
  const asset = await loadAssetOrThrow(assetId);
  if (!canViewAsset(profile, asset)) {
    throw new ForbiddenError("You cannot view this asset");
  }
  return asset;
}

export async function listAssets(profile: Profile, filters: AssetFilters): Promise<Asset[]> {
  const supabase = createSupabaseAdminClient();
  let query = supabase.from("assets").select(ASSET_COLUMNS).eq("company_id", profile.companyId);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.departmentId) query = query.eq("department_id", filters.departmentId);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toAsset);
}

export async function assignAsset(
  profile: Profile,
  assetId: string,
  targetEmployeeId: string
): Promise<Asset> {
  const asset = await loadAssetOrThrow(assetId);
  if (!canAssignAsset(profile, asset)) {
    throw new ForbiddenError("You cannot assign assets");
  }

  const targetEmployee = await getProfileById(targetEmployeeId);
  if (!targetEmployee || targetEmployee.companyId !== profile.companyId) {
    throw new NotFoundError("Employee not found");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("assets")
    .update({ assigned_to: targetEmployeeId, status: "assigned" })
    .eq("id", assetId)
    .select(ASSET_COLUMNS)
    .single();
  if (error) throw error;

  const updated = toAsset(data);
  await logActivity("asset", updated.id, profile.id, `${profile.fullName} assigned this asset`);
  try {
    await broadcastChange(profile.companyId, "assets", { type: "asset_updated" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }

  if (targetEmployeeId !== profile.id) {
    await createNotification(
      targetEmployeeId,
      "asset",
      updated.id,
      "asset_assigned",
      `${profile.fullName} assigned you the asset "${updated.name}"`
    );
  }

  return updated;
}

export async function changeAssetStatus(
  profile: Profile,
  assetId: string,
  newStatus: AssetStatus
): Promise<Asset> {
  const asset = await loadAssetOrThrow(assetId);
  if (!canChangeAssetStatus(profile, asset)) {
    throw new ForbiddenError("You cannot change this asset's status");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("assets")
    .update({ status: newStatus })
    .eq("id", assetId)
    .select(ASSET_COLUMNS)
    .single();
  if (error) throw error;

  const updated = toAsset(data);
  await logActivity(
    "asset",
    updated.id,
    profile.id,
    `${profile.fullName} changed status from "${asset.status}" to "${newStatus}"`
  );
  try {
    await broadcastChange(profile.companyId, "assets", { type: "asset_updated" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }
  return updated;
}

export async function completeAssetAssignmentTask(
  profile: Profile,
  taskId: string,
  input: CreateAssetInput
): Promise<{ task: Task; asset: Asset }> {
  const task = await loadTaskOrThrow(taskId);
  const assignee = task.assigneeId ? await getProfileById(task.assigneeId) : null;
  if (!canChangeTaskStatus(profile, task, assignee)) {
    throw new ForbiddenError("You cannot complete this task");
  }

  const workflowStep = await findWorkflowStepByTaskId(taskId);
  if (!workflowStep || !workflowStep.createsAsset) {
    throw new UnprocessableRequestError("This task does not create an asset");
  }
  if (!workflowStep.relatedRequestId) {
    throw new UnprocessableRequestError("This workflow instance has no related request");
  }

  const request = await loadRequestOrThrow(workflowStep.relatedRequestId);

  const asset = await insertAsset(profile.companyId, {
    name: input.name,
    category: input.category,
    status: "assigned",
    assignedTo: request.createdBy,
    departmentId: request.departmentId,
    purchaseInfo: input.purchaseInfo ?? null,
    warrantyInfo: input.warrantyInfo ?? null,
  });
  await logActivity(
    "asset",
    asset.id,
    profile.id,
    `${profile.fullName} created this asset and assigned it via workflow`
  );
  try {
    await broadcastChange(profile.companyId, "assets", { type: "asset_created" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }

  const updatedTask = await updateTaskStatus(profile, taskId, "completed");

  return { task: updatedTask, asset };
}

export async function setAssetOperation(
  assetId: string,
  operationId: string | null
): Promise<Asset> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("assets")
    .update({ related_operation_id: operationId })
    .eq("id", assetId)
    .select(ASSET_COLUMNS)
    .single();
  if (error) throw error;
  return toAsset(data);
}
