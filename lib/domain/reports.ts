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
