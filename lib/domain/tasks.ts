import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/domain/profiles";
import { logActivity } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import { canCreateTask, canViewTask } from "@/lib/domain/permissions";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import type { CreateTaskInput, TaskFilters } from "@/lib/validation/tasks";
import type { TaskPriority, TaskStatus } from "@/lib/domain/task-status";

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
