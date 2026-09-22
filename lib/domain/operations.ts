import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getProfileById, PROFILE_COLUMNS, toProfile, type Profile } from "@/lib/domain/profiles";
import { logActivity } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import { canCreateOperation, canManageOperation, canViewOperation } from "@/lib/domain/permissions";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import type {
  CreateOperationInput,
  OperationFilters,
  UpdateOperationInput,
} from "@/lib/validation/operations";
import type { OperationPriority, OperationStatus } from "@/lib/domain/operation-status";
import { TASK_COLUMNS, toTask, type Task } from "@/lib/domain/tasks";
import { REQUEST_COLUMNS, toRequest, type Request } from "@/lib/domain/requests";
import { ASSET_COLUMNS, toAsset, type Asset } from "@/lib/domain/assets";

export interface Operation {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  ownerId: string;
  departmentId: string | null;
  status: OperationStatus;
  priority: OperationPriority;
  startDate: string | null;
  targetDate: string | null;
  createdAt: string;
}

interface OperationRow {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  owner_id: string;
  department_id: string | null;
  status: OperationStatus;
  priority: OperationPriority;
  start_date: string | null;
  target_date: string | null;
  created_at: string;
}

function toOperation(row: OperationRow): Operation {
  return {
    id: row.id,
    companyId: row.company_id,
    title: row.title,
    description: row.description,
    ownerId: row.owner_id,
    departmentId: row.department_id,
    status: row.status,
    priority: row.priority,
    startDate: row.start_date,
    targetDate: row.target_date,
    createdAt: row.created_at,
  };
}

const OPERATION_COLUMNS =
  "id, company_id, title, description, owner_id, department_id, status, priority, start_date, target_date, created_at";

export async function createOperation(
  profile: Profile,
  input: CreateOperationInput
): Promise<Operation> {
  if (!canCreateOperation(profile)) {
    throw new ForbiddenError("You cannot create operations");
  }

  let ownerId = profile.id;
  if (input.ownerId) {
    const owner = await getProfileById(input.ownerId);
    if (!owner || owner.companyId !== profile.companyId) {
      throw new NotFoundError("Owner not found");
    }
    ownerId = owner.id;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("operations")
    .insert({
      company_id: profile.companyId,
      title: input.title,
      description: input.description ?? null,
      owner_id: ownerId,
      department_id: input.departmentId ?? null,
      priority: input.priority ?? "medium",
      start_date: input.startDate ?? null,
      target_date: input.targetDate ?? null,
    })
    .select(OPERATION_COLUMNS)
    .single();
  if (error) throw error;

  const operation = toOperation(data);
  await logActivity(
    "operation",
    operation.id,
    profile.id,
    `${profile.fullName} created this operation`
  );
  try {
    await broadcastChange(profile.companyId, "operations", { type: "operation_created" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }
  return operation;
}

export async function loadOperationOrThrow(operationId: string): Promise<Operation> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("operations")
    .select(OPERATION_COLUMNS)
    .eq("id", operationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError("Operation not found");
  return toOperation(data);
}

export interface OperationProgress {
  completedTasks: number;
  totalTasks: number;
}

export interface OperationDetail {
  operation: Operation;
  progress: OperationProgress;
  tasks: Task[];
  requests: Request[];
  assets: Asset[];
  employees: Profile[];
}

export async function getOperation(profile: Profile, operationId: string): Promise<OperationDetail> {
  const operation = await loadOperationOrThrow(operationId);
  if (!canViewOperation(profile, operation)) {
    throw new ForbiddenError("You cannot view this operation");
  }

  const supabase = createSupabaseAdminClient();
  const [tasksResult, requestsResult, assetsResult, employeesResult] = await Promise.all([
    supabase
      .from("tasks")
      .select(TASK_COLUMNS)
      .eq("related_operation_id", operationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("requests")
      .select(REQUEST_COLUMNS)
      .eq("related_operation_id", operationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("assets")
      .select(ASSET_COLUMNS)
      .eq("related_operation_id", operationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("related_operation_id", operationId)
      .order("full_name", { ascending: true }),
  ]);
  if (tasksResult.error) throw tasksResult.error;
  if (requestsResult.error) throw requestsResult.error;
  if (assetsResult.error) throw assetsResult.error;
  if (employeesResult.error) throw employeesResult.error;

  const tasks = tasksResult.data.map(toTask);
  const requests = requestsResult.data.map(toRequest);
  const assets = assetsResult.data.map(toAsset);
  const employees = employeesResult.data.map(toProfile);

  const completedTasks = tasks.filter((task) => task.status === "completed").length;

  return {
    operation,
    progress: { completedTasks, totalTasks: tasks.length },
    tasks,
    requests,
    assets,
    employees,
  };
}

export async function updateOperation(
  profile: Profile,
  operationId: string,
  input: UpdateOperationInput
): Promise<Operation> {
  const operation = await loadOperationOrThrow(operationId);
  if (!canManageOperation(profile, operation)) {
    throw new ForbiddenError("You cannot update this operation");
  }

  let ownerId = operation.ownerId;
  if (input.ownerId) {
    const owner = await getProfileById(input.ownerId);
    if (!owner || owner.companyId !== profile.companyId) {
      throw new NotFoundError("Owner not found");
    }
    ownerId = owner.id;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("operations")
    .update({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      owner_id: ownerId,
      ...(input.departmentId !== undefined && { department_id: input.departmentId }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.startDate !== undefined && { start_date: input.startDate }),
      ...(input.targetDate !== undefined && { target_date: input.targetDate }),
    })
    .eq("id", operationId)
    .select(OPERATION_COLUMNS)
    .single();
  if (error) throw error;

  const updated = toOperation(data);
  await logActivity(
    "operation",
    updated.id,
    profile.id,
    `${profile.fullName} updated this operation`
  );
  try {
    await broadcastChange(profile.companyId, "operations", { type: "operation_updated" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }
  return updated;
}

export async function listOperations(
  profile: Profile,
  filters: OperationFilters
): Promise<Operation[]> {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("operations")
    .select(OPERATION_COLUMNS)
    .eq("company_id", profile.companyId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.departmentId) query = query.eq("department_id", filters.departmentId);
  if (filters.ownerId) query = query.eq("owner_id", filters.ownerId);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toOperation);
}
