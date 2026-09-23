import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/domain/profiles";
import type { ActivityEntry } from "@/lib/domain/activity";
import { TASK_COLUMNS, toTask, type Task } from "@/lib/domain/tasks";
import { TASK_PRIORITIES, type TaskPriority, type TaskStatus } from "@/lib/domain/task-status";
import type { RequestStatus } from "@/lib/domain/request-status";
import { canViewCompanyOverview } from "@/lib/domain/permissions";
import { ForbiddenError } from "@/lib/domain/errors";

const OPEN_TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "blocked"];
const OPEN_REQUEST_STATUSES: RequestStatus[] = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "in_progress",
];
// requests has no due_date column; "overdue" is a proxy — open for more than this many days.
const REQUEST_OVERDUE_DAYS = 7;
const RECENT_ACTIVITY_FETCH_LIMIT = 30;
const RECENT_ACTIVITY_DISPLAY_LIMIT = 8;

export interface DashboardTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
}

export interface PersonalOverview {
  counts: {
    myOpenTasks: number;
    pendingApprovals: number;
    myOpenRequests: number;
    activeWorkflows: number;
  };
  myTasks: DashboardTask[];
  recentActivity: ActivityEntry[];
  upcoming: {
    overdue: number;
    dueToday: number;
    dueThisWeek: number;
  };
  unreadNotifications: number;
}

function toDashboardTask(task: Task): DashboardTask {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
  };
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function bucketByDueDate(
  tasks: { dueDate: string | null }[]
): PersonalOverview["upcoming"] {
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  let overdue = 0;
  let dueToday = 0;
  let dueThisWeek = 0;

  for (const task of tasks) {
    if (!task.dueDate) continue;
    const due = new Date(task.dueDate);
    if (due < today) {
      overdue++;
    } else if (due < tomorrow) {
      dueToday++;
    } else if (due < weekEnd) {
      dueThisWeek++;
    }
  }

  return { overdue, dueToday, dueThisWeek };
}

// activity_log has no company_id column; every entity_type in use today (task, request,
// asset, profile, operation — see every logActivity(...) call site) belongs to a table
// that has one. This filters a batch of activity rows down to ones whose entity actually
// belongs to companyId, without adding a column for this one caller.
async function filterActivityByCompany(
  entries: ActivityEntry[],
  companyId: string
): Promise<ActivityEntry[]> {
  const supabase = createSupabaseAdminClient();
  const idsByType = new Map<string, Set<string>>();
  for (const entry of entries) {
    if (!idsByType.has(entry.entityType)) idsByType.set(entry.entityType, new Set());
    idsByType.get(entry.entityType)!.add(entry.entityId);
  }

  const tableByType: Record<string, "tasks" | "requests" | "assets" | "profiles" | "operations"> =
    {
      task: "tasks",
      request: "requests",
      asset: "assets",
      profile: "profiles",
      operation: "operations",
    };

  const allowedIds = new Set<string>();
  for (const [entityType, ids] of idsByType) {
    const table = tableByType[entityType];
    if (!table) continue; // unknown entity_type: exclude rather than guess
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .in("id", Array.from(ids))
      .eq("company_id", companyId);
    if (error) throw error;
    for (const row of data ?? []) allowedIds.add(row.id as string);
  }

  return entries.filter((entry) => allowedIds.has(entry.entityId));
}

export async function getPersonalOverview(profile: Profile): Promise<PersonalOverview> {
  const supabase = createSupabaseAdminClient();

  const [
    myOpenTasksResult,
    pendingApprovalsResult,
    myOpenRequestsResult,
    activeWorkflowStepsResult,
    myTasksResult,
    dueDateTasksResult,
    recentActivityResult,
    notificationsResult,
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("company_id", profile.companyId)
      .eq("assignee_id", profile.id)
      .in("status", OPEN_TASK_STATUSES),
    supabase
      .from("approvals")
      .select("id, requests!inner(company_id)", { count: "exact", head: true })
      .eq("approver_id", profile.id)
      .eq("status", "pending")
      .eq("requests.company_id", profile.companyId),
    supabase
      .from("requests")
      .select("id", { count: "exact", head: true })
      .eq("company_id", profile.companyId)
      .eq("created_by", profile.id)
      .in("status", OPEN_REQUEST_STATUSES),
    supabase
      .from("workflow_instance_steps")
      .select(
        "id, instance_id, tasks!inner(assignee_id, company_id), workflow_instances!inner(status)"
      )
      .eq("tasks.assignee_id", profile.id)
      .eq("tasks.company_id", profile.companyId)
      .eq("workflow_instances.status", "in_progress")
      .neq("status", "completed"),
    supabase
      .from("tasks")
      .select(TASK_COLUMNS)
      .eq("company_id", profile.companyId)
      .eq("assignee_id", profile.id)
      .in("status", OPEN_TASK_STATUSES)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(5),
    // Unlimited (unlike myTasksResult above, which is capped at 5 for the display list):
    // "upcoming" must count every open task with a due date, not just the 5 shown.
    supabase
      .from("tasks")
      .select("due_date")
      .eq("company_id", profile.companyId)
      .eq("assignee_id", profile.id)
      .in("status", OPEN_TASK_STATUSES)
      .not("due_date", "is", null),
    supabase
      .from("activity_log")
      .select("id, entity_type, entity_id, actor_id, message, created_at")
      .order("created_at", { ascending: false })
      .limit(RECENT_ACTIVITY_FETCH_LIMIT),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profile.id)
      .is("read_at", null),
  ]);

  if (myOpenTasksResult.error) throw myOpenTasksResult.error;
  if (pendingApprovalsResult.error) throw pendingApprovalsResult.error;
  if (myOpenRequestsResult.error) throw myOpenRequestsResult.error;
  if (activeWorkflowStepsResult.error) throw activeWorkflowStepsResult.error;
  if (myTasksResult.error) throw myTasksResult.error;
  if (dueDateTasksResult.error) throw dueDateTasksResult.error;
  if (recentActivityResult.error) throw recentActivityResult.error;
  if (notificationsResult.error) throw notificationsResult.error;

  // Secondary sort: due_date asc (already applied by the query, nulls last) then priority
  // desc, so same-day tasks don't appear in arbitrary order in the 5-item display list.
  const myTasks = myTasksResult.data.map(toTask).sort((a, b) => {
    const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    if (aTime !== bTime) return aTime - bTime;
    return TASK_PRIORITIES.indexOf(b.priority) - TASK_PRIORITIES.indexOf(a.priority);
  });
  const activeInstanceIds = new Set(
    (activeWorkflowStepsResult.data ?? []).map((row) => row.instance_id)
  );

  const rawActivity: ActivityEntry[] = (recentActivityResult.data ?? []).map((row) => ({
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    actorId: row.actor_id,
    message: row.message,
    createdAt: row.created_at,
  }));
  const companyActivity = await filterActivityByCompany(rawActivity, profile.companyId);

  return {
    counts: {
      myOpenTasks: myOpenTasksResult.count ?? 0,
      pendingApprovals: pendingApprovalsResult.count ?? 0,
      myOpenRequests: myOpenRequestsResult.count ?? 0,
      activeWorkflows: activeInstanceIds.size,
    },
    myTasks: myTasks.map(toDashboardTask),
    recentActivity: companyActivity.slice(0, RECENT_ACTIVITY_DISPLAY_LIMIT),
    upcoming: bucketByDueDate(
      (dueDateTasksResult.data ?? []).map((row) => ({ dueDate: row.due_date }))
    ),
    unreadNotifications: notificationsResult.count ?? 0,
  };
}

// Same literal set as OPEN_TASK_STATUSES today, kept as a separate name because the two
// express different semantics (company-wide "active" here vs. a single user's "open" above)
// that happen to coincide currently but aren't guaranteed to stay in lockstep.
const ACTIVE_TASK_STATUSES: TaskStatus[] = OPEN_TASK_STATUSES;
const ACTIVE_OPERATIONS_LIMIT = 5;

export interface OperationProgress {
  id: string;
  title: string;
  completedTasks: number;
  totalTasks: number;
}

export interface DepartmentActivity {
  departmentId: string;
  name: string;
  openTasks: number;
  openRequests: number;
}

export interface CompanyOverview {
  totals: {
    employees: number;
    assets: number;
    openRequests: number;
    activeTasks: number;
  };
  attention: {
    criticalTasks: number;
    pendingApprovals: number;
    overdueRequests: number;
  };
  activeOperations: OperationProgress[];
  departmentActivity: DepartmentActivity[];
}

export async function getCompanyOverview(profile: Profile): Promise<CompanyOverview> {
  if (!canViewCompanyOverview(profile)) {
    throw new ForbiddenError("You cannot view the company overview");
  }

  const supabase = createSupabaseAdminClient();
  const overdueRequestCutoff = new Date(
    Date.now() - REQUEST_OVERDUE_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const [
    employeesResult,
    assetsResult,
    openRequestsResult,
    activeTasksResult,
    criticalTasksResult,
    pendingApprovalsResult,
    overdueRequestsResult,
    activeOperationsResult,
    departmentsResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("company_id", profile.companyId)
      .eq("status", "active"),
    supabase
      .from("assets")
      .select("id", { count: "exact", head: true })
      .eq("company_id", profile.companyId)
      .neq("status", "retired"),
    supabase
      .from("requests")
      .select("id", { count: "exact", head: true })
      .eq("company_id", profile.companyId)
      .in("status", OPEN_REQUEST_STATUSES),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("company_id", profile.companyId)
      .in("status", ACTIVE_TASK_STATUSES),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("company_id", profile.companyId)
      .in("status", ACTIVE_TASK_STATUSES)
      .eq("priority", "critical"),
    supabase
      .from("approvals")
      .select("id, requests!inner(company_id)", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("requests.company_id", profile.companyId),
    supabase
      .from("requests")
      .select("id", { count: "exact", head: true })
      .eq("company_id", profile.companyId)
      .in("status", OPEN_REQUEST_STATUSES)
      .lt("created_at", overdueRequestCutoff),
    supabase
      .from("operations")
      .select("id, title, department_id")
      .eq("company_id", profile.companyId)
      .in("status", ["planning", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(ACTIVE_OPERATIONS_LIMIT),
    supabase.from("departments").select("id, name").eq("company_id", profile.companyId),
  ]);

  if (employeesResult.error) throw employeesResult.error;
  if (assetsResult.error) throw assetsResult.error;
  if (openRequestsResult.error) throw openRequestsResult.error;
  if (activeTasksResult.error) throw activeTasksResult.error;
  if (criticalTasksResult.error) throw criticalTasksResult.error;
  if (pendingApprovalsResult.error) throw pendingApprovalsResult.error;
  if (overdueRequestsResult.error) throw overdueRequestsResult.error;
  if (activeOperationsResult.error) throw activeOperationsResult.error;
  if (departmentsResult.error) throw departmentsResult.error;

  const activeOperations: OperationProgress[] = await Promise.all(
    (activeOperationsResult.data ?? []).map(async (operation) => {
      const { data: tasksForOperation, error: tasksForOperationError } = await supabase
        .from("tasks")
        .select("status")
        .eq("related_operation_id", operation.id);
      if (tasksForOperationError) throw tasksForOperationError;
      const totalTasks = tasksForOperation?.length ?? 0;
      const completedTasks =
        tasksForOperation?.filter((task) => task.status === "completed").length ?? 0;
      return { id: operation.id, title: operation.title, completedTasks, totalTasks };
    })
  );

  const departmentActivity: DepartmentActivity[] = await Promise.all(
    (departmentsResult.data ?? []).map(async (department) => {
      const [openTasksResult, openRequestsForDeptResult] = await Promise.all([
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("company_id", profile.companyId)
          .eq("department_id", department.id)
          .in("status", ACTIVE_TASK_STATUSES),
        supabase
          .from("requests")
          .select("id", { count: "exact", head: true })
          .eq("company_id", profile.companyId)
          .eq("department_id", department.id)
          .in("status", OPEN_REQUEST_STATUSES),
      ]);
      if (openTasksResult.error) throw openTasksResult.error;
      if (openRequestsForDeptResult.error) throw openRequestsForDeptResult.error;
      return {
        departmentId: department.id,
        name: department.name,
        openTasks: openTasksResult.count ?? 0,
        openRequests: openRequestsForDeptResult.count ?? 0,
      };
    })
  );

  return {
    totals: {
      employees: employeesResult.count ?? 0,
      assets: assetsResult.count ?? 0,
      openRequests: openRequestsResult.count ?? 0,
      activeTasks: activeTasksResult.count ?? 0,
    },
    attention: {
      criticalTasks: criticalTasksResult.count ?? 0,
      pendingApprovals: pendingApprovalsResult.count ?? 0,
      overdueRequests: overdueRequestsResult.count ?? 0,
    },
    activeOperations,
    departmentActivity,
  };
}
