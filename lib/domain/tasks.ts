import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getProfileById, type Profile } from "@/lib/domain/profiles";
import { logActivity } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import { canAssignTask, canChangeTaskStatus, canCreateTask, canDeleteTask, canViewTask } from "@/lib/domain/permissions";
import { ForbiddenError, InvalidTransitionError, NotFoundError } from "@/lib/domain/errors";
import type { CreateTaskInput, TaskFilters } from "@/lib/validation/tasks";
import { TASK_STATUS_TRANSITIONS, type TaskPriority, type TaskStatus } from "@/lib/domain/task-status";

export interface Task {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  creatorId: string | null;
  departmentId: string | null;
  relatedEmployeeId: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface TaskRow {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  creator_id: string | null;
  department_id: string | null;
  related_employee_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    companyId: row.company_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assigneeId: row.assignee_id,
    creatorId: row.creator_id,
    departmentId: row.department_id,
    relatedEmployeeId: row.related_employee_id,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

const TASK_COLUMNS =
  "id, company_id, title, description, status, priority, assignee_id, creator_id, department_id, related_employee_id, due_date, completed_at, created_at";

const COMPANY_WIDE_VIEW_ROLES = new Set(["operations_manager", "it", "hr", "admin"]);

export async function createTask(profile: Profile, input: CreateTaskInput): Promise<Task> {
  if (!canCreateTask(profile)) {
    throw new ForbiddenError("You cannot create tasks");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      company_id: profile.companyId,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? "medium",
      assignee_id: input.assigneeId ?? null,
      creator_id: profile.id,
      department_id: input.departmentId ?? null,
      related_employee_id: input.relatedEmployeeId ?? null,
      due_date: input.dueDate ?? null,
    })
    .select(TASK_COLUMNS)
    .single();
  if (error) throw error;

  const task = toTask(data);
  await logActivity("task", task.id, profile.id, `${profile.fullName} created this task`);
  await broadcastChange(profile.companyId, "tasks", { type: "task_created" });
  return task;
}

export async function loadTaskOrThrow(taskId: string): Promise<Task> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError("Task not found");
  return toTask(data);
}

export async function getTask(profile: Profile, taskId: string): Promise<Task> {
  const task = await loadTaskOrThrow(taskId);
  if (!canViewTask(profile, task)) {
    throw new ForbiddenError("You cannot view this task");
  }
  return task;
}

export async function listTasks(profile: Profile, filters: TaskFilters): Promise<Task[]> {
  const supabase = createSupabaseAdminClient();
  let query = supabase.from("tasks").select(TASK_COLUMNS).eq("company_id", profile.companyId);

  if (!COMPANY_WIDE_VIEW_ROLES.has(profile.role)) {
    if (profile.role === "manager" && profile.departmentId) {
      query = query.or(
        `assignee_id.eq.${profile.id},creator_id.eq.${profile.id},department_id.eq.${profile.departmentId}`
      );
    } else {
      query = query.or(`assignee_id.eq.${profile.id},creator_id.eq.${profile.id}`);
    }
  }

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.assigneeId) query = query.eq("assignee_id", filters.assigneeId);
  if (filters.departmentId) query = query.eq("department_id", filters.departmentId);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toTask);
}

export async function updateTaskStatus(
  profile: Profile,
  taskId: string,
  newStatus: TaskStatus
): Promise<Task> {
  const task = await loadTaskOrThrow(taskId);
  const assignee = task.assigneeId ? await getProfileById(task.assigneeId) : null;

  if (!canChangeTaskStatus(profile, task, assignee)) {
    throw new ForbiddenError("You cannot change this task's status");
  }

  if (!TASK_STATUS_TRANSITIONS[task.status].includes(newStatus)) {
    throw new InvalidTransitionError(
      `Cannot move a task from "${task.status}" to "${newStatus}"`
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({
      status: newStatus,
      completed_at: newStatus === "completed" ? new Date().toISOString() : task.completedAt,
    })
    .eq("id", taskId)
    .select(TASK_COLUMNS)
    .single();
  if (error) throw error;

  const updated = toTask(data);
  await logActivity(
    "task",
    updated.id,
    profile.id,
    `${profile.fullName} changed status from "${task.status}" to "${newStatus}"`
  );
  await broadcastChange(profile.companyId, "tasks", { type: "task_updated" });
  return updated;
}

export async function assignTask(
  profile: Profile,
  taskId: string,
  targetAssigneeId: string
): Promise<Task> {
  const task = await loadTaskOrThrow(taskId);
  const targetAssignee = await getProfileById(targetAssigneeId);
  if (!targetAssignee || targetAssignee.companyId !== task.companyId) {
    throw new NotFoundError("Target assignee not found");
  }
  const currentAssignee = task.assigneeId ? await getProfileById(task.assigneeId) : null;

  if (!canAssignTask(profile, task, currentAssignee, targetAssignee)) {
    throw new ForbiddenError("You cannot assign this task");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ assignee_id: targetAssigneeId })
    .eq("id", taskId)
    .select(TASK_COLUMNS)
    .single();
  if (error) throw error;

  const updated = toTask(data);
  await logActivity(
    "task",
    updated.id,
    profile.id,
    `${profile.fullName} assigned this task to ${targetAssignee.fullName}`
  );
  await broadcastChange(profile.companyId, "tasks", { type: "task_updated" });
  return updated;
}

export async function deleteTask(profile: Profile, taskId: string): Promise<void> {
  const task = await loadTaskOrThrow(taskId);
  if (!canDeleteTask(profile, task)) {
    throw new ForbiddenError("You cannot delete this task");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) throw error;

  await broadcastChange(profile.companyId, "tasks", { type: "task_deleted" });
}
