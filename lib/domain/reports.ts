import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/domain/profiles";
import { canViewCompanyOverview } from "@/lib/domain/permissions";
import { ForbiddenError } from "@/lib/domain/errors";
import type { TaskStatus } from "@/lib/domain/task-status";
import type { RequestStatus } from "@/lib/domain/request-status";

// Same open-status sets dashboard.ts defines for the same reason — kept as a
// separate module-local copy rather than a cross-import, matching the
// project's existing precedent (lib/domain/dashboard.ts's ACTIVE_TASK_STATUSES).
export const OPEN_TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "blocked"];
export const OPEN_REQUEST_STATUSES: RequestStatus[] = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "in_progress",
];

export interface DepartmentRequestCount {
  departmentId: string;
  departmentName: string;
  count: number;
}

export interface TaskStatistics {
  open: number;
  completed: number;
  overdue: number;
}

export interface WeeklyTrend {
  weekStart: string;
  completedTasks: number;
  newRequests: number;
}

function mondayStartOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getTaskRequestTrends(profile: Profile, weeks: number): Promise<WeeklyTrend[]> {
  if (!canViewCompanyOverview(profile)) {
    throw new ForbiddenError("You cannot view reports");
  }

  const supabase = createSupabaseAdminClient();
  const currentWeekStart = mondayStartOf(new Date());
  const earliestWeekStart = new Date(currentWeekStart);
  earliestWeekStart.setUTCDate(earliestWeekStart.getUTCDate() - (weeks - 1) * 7);

  const [tasksResult, requestsResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("completed_at")
      .eq("company_id", profile.companyId)
      .gte("completed_at", earliestWeekStart.toISOString()),
    supabase
      .from("requests")
      .select("created_at")
      .eq("company_id", profile.companyId)
      .gte("created_at", earliestWeekStart.toISOString()),
  ]);
  if (tasksResult.error) throw tasksResult.error;
  if (requestsResult.error) throw requestsResult.error;

  const buckets: WeeklyTrend[] = [];
  for (let i = 0; i < weeks; i++) {
    const weekStart = new Date(earliestWeekStart);
    weekStart.setUTCDate(weekStart.getUTCDate() + i * 7);
    buckets.push({ weekStart: toDateKey(weekStart), completedTasks: 0, newRequests: 0 });
  }
  const indexByWeekStart = new Map(buckets.map((bucket, index) => [bucket.weekStart, index]));

  for (const row of tasksResult.data ?? []) {
    if (!row.completed_at) continue;
    const index = indexByWeekStart.get(toDateKey(mondayStartOf(new Date(row.completed_at))));
    if (index !== undefined) buckets[index].completedTasks += 1;
  }

  for (const row of requestsResult.data ?? []) {
    const index = indexByWeekStart.get(toDateKey(mondayStartOf(new Date(row.created_at))));
    if (index !== undefined) buckets[index].newRequests += 1;
  }

  return buckets;
}

export async function requestsByDepartment(profile: Profile): Promise<DepartmentRequestCount[]> {
  if (!canViewCompanyOverview(profile)) {
    throw new ForbiddenError("You cannot view reports");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("requests")
    .select("department_id, departments(name)")
    .eq("company_id", profile.companyId)
    .in("status", OPEN_REQUEST_STATUSES)
    .not("department_id", "is", null);
  if (error) throw error;

  const counts = new Map<string, DepartmentRequestCount>();
  for (const row of data ?? []) {
    const departmentId = row.department_id as string;
    const departmentName = (row.departments as { name: string } | null)?.name ?? "Unknown";
    const existing = counts.get(departmentId);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(departmentId, { departmentId, departmentName, count: 1 });
    }
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
}

export async function taskStatistics(profile: Profile): Promise<TaskStatistics> {
  if (!canViewCompanyOverview(profile)) {
    throw new ForbiddenError("You cannot view reports");
  }

  const supabase = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  const [openResult, completedResult, overdueResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("company_id", profile.companyId)
      .in("status", OPEN_TASK_STATUSES),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("company_id", profile.companyId)
      .eq("status", "completed"),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("company_id", profile.companyId)
      .in("status", OPEN_TASK_STATUSES)
      .lt("due_date", nowIso),
  ]);
  if (openResult.error) throw openResult.error;
  if (completedResult.error) throw completedResult.error;
  if (overdueResult.error) throw overdueResult.error;

  return {
    open: openResult.count ?? 0,
    completed: completedResult.count ?? 0,
    overdue: overdueResult.count ?? 0,
  };
}

export interface CategoryCompletionTime {
  category: string;
  avgDays: number;
  sampleSize: number;
}

export interface TemplateCompletionRate {
  templateId: string;
  templateName: string;
  completionRate: number;
  totalInstances: number;
}

export async function avgRequestCompletionTime(profile: Profile): Promise<CategoryCompletionTime[]> {
  if (!canViewCompanyOverview(profile)) {
    throw new ForbiddenError("You cannot view reports");
  }

  const supabase = createSupabaseAdminClient();

  const { data: completedRequests, error: requestsError } = await supabase
    .from("requests")
    .select("id, category, created_at")
    .eq("company_id", profile.companyId)
    .eq("status", "completed");
  if (requestsError) throw requestsError;
  if (!completedRequests || completedRequests.length === 0) return [];

  const requestIds = completedRequests.map((r) => r.id);
  const { data: completionActivity, error: activityError } = await supabase
    .from("activity_log")
    .select("entity_id, created_at")
    .eq("entity_type", "request")
    .in("entity_id", requestIds)
    .like("message", '%to "completed"');
  if (activityError) throw activityError;

  // A request could theoretically have been marked completed more than once in its
  // history (status transitions are not currently reversible per REQUEST_STATUS_TRANSITIONS,
  // so this shouldn't happen today, but take the earliest match defensively rather than
  // assuming exactly one row).
  const completionTimeByRequestId = new Map<string, string>();
  for (const row of completionActivity ?? []) {
    const existing = completionTimeByRequestId.get(row.entity_id);
    if (!existing || row.created_at < existing) {
      completionTimeByRequestId.set(row.entity_id, row.created_at);
    }
  }

  const byCategory = new Map<string, { totalDays: number; count: number }>();
  for (const request of completedRequests) {
    const completedAt = completionTimeByRequestId.get(request.id);
    if (!completedAt) continue; // no logged transition to completed — exclude, per spec §2
    const days =
      (new Date(completedAt).getTime() - new Date(request.created_at).getTime()) /
      (1000 * 60 * 60 * 24);
    const bucket = byCategory.get(request.category) ?? { totalDays: 0, count: 0 };
    bucket.totalDays += days;
    bucket.count += 1;
    byCategory.set(request.category, bucket);
  }

  return Array.from(byCategory.entries()).map(([category, { totalDays, count }]) => ({
    category,
    avgDays: totalDays / count,
    sampleSize: count,
  }));
}

export async function workflowCompletionRate(profile: Profile): Promise<TemplateCompletionRate[]> {
  if (!canViewCompanyOverview(profile)) {
    throw new ForbiddenError("You cannot view reports");
  }

  const supabase = createSupabaseAdminClient();

  const [templatesResult, instancesResult] = await Promise.all([
    supabase.from("workflow_templates").select("id, name").eq("company_id", profile.companyId),
    supabase
      .from("workflow_instances")
      .select("template_id, status")
      .eq("company_id", profile.companyId),
  ]);
  if (templatesResult.error) throw templatesResult.error;
  if (instancesResult.error) throw instancesResult.error;

  const countsByTemplate = new Map<string, { total: number; completed: number }>();
  for (const instance of instancesResult.data ?? []) {
    const bucket = countsByTemplate.get(instance.template_id) ?? { total: 0, completed: 0 };
    bucket.total += 1;
    if (instance.status === "completed") bucket.completed += 1;
    countsByTemplate.set(instance.template_id, bucket);
  }

  const rows: TemplateCompletionRate[] = [];
  for (const template of templatesResult.data ?? []) {
    const counts = countsByTemplate.get(template.id);
    if (!counts || counts.total === 0) continue; // no instances — nothing to rate, per spec §3
    rows.push({
      templateId: template.id,
      templateName: template.name,
      completionRate: counts.completed / counts.total,
      totalInstances: counts.total,
    });
  }
  return rows;
}
