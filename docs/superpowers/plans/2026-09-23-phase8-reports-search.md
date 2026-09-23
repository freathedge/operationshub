# Phase 8 — Reports & Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four SQL-aggregation report metrics (`requestsByDepartment`, `avgRequestCompletionTime`, `taskStatistics`, `workflowCompletionRate`) on a new `/reports` page gated to `operations_manager`/`admin`, and Postgres full-text search across 5 entity types wired into the sidebar's already-placeholder "Search" entry as a `⌘K` command palette.

**Architecture:** Two independent feature tracks sharing one branch (Reports: Tasks 1-5; Search: Tasks 6-9) — neither depends on the other's code. Reports follows the exact `getCompanyOverview` pattern already established in `lib/domain/dashboard.ts` (permission check first, `Promise.all` fan-out, plain SQL aggregation). Search adds one migration (generated `tsvector` columns + GIN indexes, applied via the Supabase MCP tool — this project has no local CLI dev stack), one domain function reusing each entity's existing list-view visibility scoping, and a client-owned command palette.

**Tech Stack:** Next.js App Router, Supabase Postgres (full-text search), Recharts + shadcn `chart` primitive (installed since Phase 7, unused until now), shadcn `command`/`dialog` primitives (new this phase), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-23-phase8-reports-search-design.md`

## Global Constraints

- Reports are gated to `operations_manager`/`admin` only, via the existing `canViewCompanyOverview` function in `lib/domain/permissions.ts` — no new permission function (spec §2, §3).
- `avgRequestCompletionTime` has no source column — completion time is derived from `activity_log` rows matching `entity_type = 'request'` and `message LIKE '%to "completed"'`, not a new `requests` column (spec §2).
- `requestsByDepartment` counts only open requests (`status` not in `completed`/`rejected`), not an all-time total (spec §2).
- Search results are scoped by each entity's own `list*` function's exact existing visibility predicate — reused, not reimplemented, and never looser than what that entity's own list view already shows the caller (spec §2, §6).
- `workflow_templates` gets its `tsvector` column and GIN index (matching the outline's migration list) but is **not** a search result type this phase — no page exists to send a click to (spec §6). `SearchResultType` has exactly 5 members: `"task" | "request" | "asset" | "employee" | "operation"`.
- This project has no local Supabase CLI dev stack. Schema changes (DDL) are applied with the `mcp__claude_ai_Supabase__apply_migration` tool (`project_id`, `name`, `query`), not `supabase db push`. `project_id` = `yqzcunssgvffischmwle`. Use `mcp__claude_ai_Supabase__list_migrations` and `mcp__claude_ai_Supabase__list_tables` to verify, `mcp__claude_ai_Supabase__execute_sql` for verification queries, and `mcp__claude_ai_Supabase__generate_typescript_types` to refresh `lib/supabase/database.types.ts` after the migration lands.
- **Migration filenames must match the version `apply_migration` actually assigns.** The tool stamps its own timestamp on apply — after calling it, call `list_migrations` and rename the local file to `<version-from-list_migrations>_<name>.sql` before committing, exactly as every prior phase's migration task has done.

## Review Focus

- **A request stuck in `under_review`/`approved` forever, never reaching `completed`.** `avgRequestCompletionTime` must exclude it from the average (no completion timestamp exists to derive), not crash or silently produce `NaN`/`Infinity` from a division involving a missing row.
- **A workflow template with zero instances started against it.** `workflowCompletionRate` must exclude it (spec §3: "a rate with no denominator isn't a rate"), not divide by zero.
- **An employee searching for a colleague's task they're not assigned to or the creator of.** This is the exact leak spec §2 checked for — `search()` must not surface it, and a test must prove the negative (the result set does NOT contain it), not just that matching results DO appear for tasks the searcher can see.
- **An empty or whitespace-only search query.** Must return `[]` immediately without querying any table (spec §6) — not "match everything" (which `websearch_to_tsquery('')` could otherwise do unpredictably) and not a slow no-op round-trip to all 5 tables.
- **A non-elevated role directly hitting `/api/reports` or navigating to `/reports` by URL**, not just failing to see the nav link. Must 403 the API call and redirect the page — the nav item's absence is a UX hint, not the security boundary (matching this project's `docs/architecture.md` §5 principle that authorization lives in the domain layer, never the frontend alone).

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/domain/reports.ts` | New. Four report metric functions. |
| `lib/domain/reports.test.ts` | New. |
| `app/api/reports/route.ts` | New. `GET`, one response with all four metrics. |
| `components/reports/requests-by-department-chart.tsx` | New. Recharts bar chart. |
| `components/reports/avg-completion-time-chart.tsx` | New. Recharts bar chart. |
| `components/reports/task-statistics-card.tsx` | New. Plain stat card. |
| `components/reports/workflow-completion-card.tsx` | New. Plain list card. |
| `app/(app)/reports/page.tsx` | New. Server Component, gated, fetches and renders the four components. |
| `app/(app)/reports/page.test.tsx` | New. |
| `components/app-sidebar.tsx` | Modify. Adds "Reports" to the Home group, conditional on `canViewReports`; adds `CommandSearch` + local open-state for the Search item. |
| `components/app-sidebar.test.tsx` | Modify. |
| `app/(app)/layout.tsx` | Modify. Computes `canViewReports` via `canViewCompanyOverview` and passes it to `AppSidebar`. |
| `app/(app)/layout.test.tsx` | Modify. |
| `supabase/migrations/<version>_add_search_vectors.sql` | New. Generated `tsvector` columns + GIN indexes on 6 tables. |
| `lib/supabase/database.types.ts` | Modify (regenerated, not hand-edited). |
| `lib/domain/search.ts` | New. |
| `lib/domain/search.test.ts` | New. |
| `app/api/search/route.ts` | New. `GET ?q=`. |
| `components/nav-secondary.tsx` | Modify. Items can now carry an optional `onClick`, rendered as a button instead of a link. |
| `components/command-search.tsx` | New. Owns the dialog's open state, the `⌘K` listener, the debounced fetch, and navigation on select. |
| `components/command-search.test.tsx` | New. |

---

### Task 1: `requestsByDepartment` and `taskStatistics`

**Files:**
- Create: `lib/domain/reports.ts`
- Test: `lib/domain/reports.test.ts`

**Interfaces:**
- Consumes: `Profile` (`lib/domain/profiles.ts`), `canViewCompanyOverview` (`lib/domain/permissions.ts`), `ForbiddenError` (`lib/domain/errors.ts`), `createSupabaseAdminClient` (`lib/supabase/admin.ts`), `TaskStatus` (`lib/domain/task-status.ts`), `RequestStatus`/`RequestCategory` (`lib/domain/request-status.ts`).
- Produces:
  ```ts
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

  export async function requestsByDepartment(profile: Profile): Promise<DepartmentRequestCount[]>;
  export async function taskStatistics(profile: Profile): Promise<TaskStatistics>;
  ```
  Task 2 appends `avgRequestCompletionTime`/`workflowCompletionRate` to this same file and reuses this file's `OPEN_REQUEST_STATUSES`/`OPEN_TASK_STATUSES` constants — do not let Task 2's brief guess these names, they're defined here.

- [ ] **Step 1: Write the failing tests**

Create `lib/domain/reports.test.ts`, following `lib/domain/dashboard.test.ts`'s exact fixture-setup pattern (own company, own profiles, `describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)`):

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile, type Profile } from "@/lib/domain/profiles";
import { requestsByDepartment, taskStatistics } from "@/lib/domain/reports";
import { ForbiddenError } from "@/lib/domain/errors";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("requestsByDepartment / taskStatistics", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  let departmentId: string;
  const createdAuthUserIds: string[] = [];
  let opsManager: Profile;
  let employee: Profile;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (reports)", slug: "test-co-reports" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: department, error: departmentError } = await supabase
      .from("departments")
      .insert({ company_id: companyId, name: "IT" })
      .select("id")
      .single();
    if (departmentError) throw departmentError;
    departmentId = department.id;

    const { data: opsManagerAuthUser, error: opsManagerAuthError } =
      await supabase.auth.admin.createUser({
        email: `reports-test-ops-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
    if (opsManagerAuthError || !opsManagerAuthUser.user) throw opsManagerAuthError;
    createdAuthUserIds.push(opsManagerAuthUser.user.id);
    opsManager = await createProfile({
      authUserId: opsManagerAuthUser.user.id,
      companyId,
      fullName: "Ops Manager",
      role: "operations_manager",
    });

    const { data: employeeAuthUser, error: employeeAuthError } =
      await supabase.auth.admin.createUser({
        email: `reports-test-employee-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
    if (employeeAuthError || !employeeAuthUser.user) throw employeeAuthError;
    createdAuthUserIds.push(employeeAuthUser.user.id);
    employee = await createProfile({
      authUserId: employeeAuthUser.user.id,
      companyId,
      fullName: "Regular Employee",
      role: "employee",
    });
  });

  afterAll(async () => {
    const { error: tasksDeleteError } = await supabase
      .from("tasks")
      .delete()
      .eq("company_id", companyId);
    if (tasksDeleteError) throw tasksDeleteError;

    const { error: requestsDeleteError } = await supabase
      .from("requests")
      .delete()
      .eq("company_id", companyId);
    if (requestsDeleteError) throw requestsDeleteError;

    const { error: departmentsDeleteError } = await supabase
      .from("departments")
      .delete()
      .eq("company_id", companyId);
    if (departmentsDeleteError) throw departmentsDeleteError;

    const { error: profilesDeleteError } = await supabase
      .from("profiles")
      .delete()
      .eq("company_id", companyId);
    if (profilesDeleteError) throw profilesDeleteError;

    for (const authUserId of createdAuthUserIds) {
      await supabase.auth.admin.deleteUser(authUserId);
    }
  });

  it("throws ForbiddenError for a non-elevated role", async () => {
    await expect(requestsByDepartment(employee)).rejects.toThrow(ForbiddenError);
    await expect(taskStatistics(employee)).rejects.toThrow(ForbiddenError);
  });

  it("counts open requests grouped by department, excluding completed/rejected", async () => {
    const { error } = await supabase.from("requests").insert([
      { company_id: companyId, title: "Open 1", category: "equipment", status: "under_review", department_id: departmentId },
      { company_id: companyId, title: "Open 2", category: "equipment", status: "approved", department_id: departmentId },
      { company_id: companyId, title: "Completed", category: "equipment", status: "completed", department_id: departmentId },
      { company_id: companyId, title: "Rejected", category: "equipment", status: "rejected", department_id: departmentId },
    ]);
    if (error) throw error;

    const result = await requestsByDepartment(opsManager);
    const itRow = result.find((row) => row.departmentId === departmentId);
    expect(itRow).toBeDefined();
    expect(itRow?.count).toBe(2);
    expect(itRow?.departmentName).toBe("IT");
  });

  it("computes open/completed/overdue task counts", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from("tasks").insert([
      { company_id: companyId, title: "Open task", status: "todo", priority: "medium" },
      { company_id: companyId, title: "Completed task", status: "completed", priority: "medium" },
      { company_id: companyId, title: "Overdue task", status: "todo", priority: "medium", due_date: yesterday },
    ]);
    if (error) throw error;

    const result = await taskStatistics(opsManager);
    expect(result.open).toBeGreaterThanOrEqual(2); // "Open task" + "Overdue task" (overdue is also open)
    expect(result.completed).toBeGreaterThanOrEqual(1);
    expect(result.overdue).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:integration -- lib/domain/reports.test.ts
```

Expected: FAIL — `lib/domain/reports.ts` doesn't exist yet. (`SUPABASE_SERVICE_ROLE_KEY` must be set in `.env.local` for this to actually run rather than skip — confirm it's present before relying on this step, same requirement as every other integration test in this repo.)

- [ ] **Step 3: Implement**

Create `lib/domain/reports.ts`:

```ts
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
```

The `departments(name)` embed in `requestsByDepartment`'s select relies on the existing foreign key `requests.department_id -> departments.id` (already present since Phase 2) — Supabase's PostgREST resolves this automatically the same way `getOperation`'s embeds do elsewhere in this codebase.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:integration -- lib/domain/reports.test.ts
```

Expected: PASS.

- [ ] **Step 5: Wire the new test file into the npm scripts**

Modify `package.json`: add `"lib/domain/reports.test.ts"` to the end of `test:integration`'s argument list, and add `--exclude "lib/domain/reports.test.ts"` to `test:unit`'s exclude list — same pattern every other domain test file already follows there.

- [ ] **Step 6: Run the full unit suite to confirm the exclude took effect**

```bash
npm run test:unit
```

Expected: PASS, and the output's file list does not include `lib/domain/reports.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add lib/domain/reports.ts lib/domain/reports.test.ts package.json
git commit -m "feat: add requestsByDepartment and taskStatistics report metrics

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `avgRequestCompletionTime` and `workflowCompletionRate`

**Files:**
- Modify: `lib/domain/reports.ts`
- Modify: `lib/domain/reports.test.ts`

**Interfaces:**
- Consumes: `OPEN_TASK_STATUSES`, `OPEN_REQUEST_STATUSES` (Task 1, already in `lib/domain/reports.ts` — do not redeclare).
- Produces:
  ```ts
  export interface CategoryCompletionTime {
    category: string;
    avgDays: number;
    sampleSize: number;
  }

  export interface TemplateCompletionRate {
    templateId: string;
    templateName: string;
    completionRate: number; // 0-1
    totalInstances: number;
  }

  export async function avgRequestCompletionTime(profile: Profile): Promise<CategoryCompletionTime[]>;
  export async function workflowCompletionRate(profile: Profile): Promise<TemplateCompletionRate[]>;
  ```
  Task 3's `/api/reports` route imports and calls all four functions from this file by these exact names.

`avgRequestCompletionTime` needs two passes: first find every `requests` row with `status = 'completed'`, then for each one find the `activity_log` row that logged its transition to `completed` (per Global Constraints' string-match rule) and compute the day difference. This can't be done in a single Supabase query the way this codebase usually writes them (no cross-table computed join for a `LIKE` match against a polymorphic table) — do it in two round trips, matching the multi-step pattern `lib/domain/dashboard.ts`'s `filterActivityByCompany` already established for a similar "activity_log has no direct foreign structure for this" situation.

- [ ] **Step 1: Write the failing tests**

Add to `lib/domain/reports.test.ts`, in a second `describe` block below the first (own fixtures, matching how `lib/domain/dashboard.test.ts`'s `getPersonalOverview`/`getCompanyOverview` blocks are each self-contained):

```ts
import { avgRequestCompletionTime, workflowCompletionRate } from "@/lib/domain/reports";
import { transitionRequestStatus } from "@/lib/domain/requests";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("avgRequestCompletionTime / workflowCompletionRate", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  const createdAuthUserIds: string[] = [];
  let opsManager: Profile;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (reports completion)", slug: "test-co-reports-completion" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: opsManagerAuthUser, error: opsManagerAuthError } =
      await supabase.auth.admin.createUser({
        email: `reports-completion-test-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
    if (opsManagerAuthError || !opsManagerAuthUser.user) throw opsManagerAuthError;
    createdAuthUserIds.push(opsManagerAuthUser.user.id);
    opsManager = await createProfile({
      authUserId: opsManagerAuthUser.user.id,
      companyId,
      fullName: "Ops Manager Two",
      role: "operations_manager",
    });
  });

  afterAll(async () => {
    const { error: activityDeleteError } = await supabase
      .from("activity_log")
      .delete()
      .eq("actor_id", opsManager.id);
    if (activityDeleteError) throw activityDeleteError;

    const { error: requestsDeleteError } = await supabase
      .from("requests")
      .delete()
      .eq("company_id", companyId);
    if (requestsDeleteError) throw requestsDeleteError;

    const { error: workflowInstancesDeleteError } = await supabase
      .from("workflow_instances")
      .delete()
      .eq("company_id", companyId);
    if (workflowInstancesDeleteError) throw workflowInstancesDeleteError;

    const { error: workflowTemplatesDeleteError } = await supabase
      .from("workflow_templates")
      .delete()
      .eq("company_id", companyId);
    if (workflowTemplatesDeleteError) throw workflowTemplatesDeleteError;

    const { error: profilesDeleteError } = await supabase
      .from("profiles")
      .delete()
      .eq("company_id", companyId);
    if (profilesDeleteError) throw profilesDeleteError;

    for (const authUserId of createdAuthUserIds) {
      await supabase.auth.admin.deleteUser(authUserId);
    }
  });

  it("computes average completion time per category from activity_log, excluding requests never completed", async () => {
    const { data: completedRequest, error: completedRequestError } = await supabase
      .from("requests")
      .insert({
        company_id: companyId,
        title: "Completed equipment request",
        category: "equipment",
        status: "in_progress",
        created_by: opsManager.id,
      })
      .select("id")
      .single();
    if (completedRequestError) throw completedRequestError;

    await transitionRequestStatus(opsManager, completedRequest.id, "completed");

    const { error: openRequestError } = await supabase.from("requests").insert({
      company_id: companyId,
      title: "Still-open equipment request",
      category: "equipment",
      status: "under_review",
      created_by: opsManager.id,
    });
    if (openRequestError) throw openRequestError;

    const result = await avgRequestCompletionTime(opsManager);
    const equipmentRow = result.find((row) => row.category === "equipment");
    expect(equipmentRow).toBeDefined();
    expect(equipmentRow?.sampleSize).toBe(1);
    expect(equipmentRow?.avgDays).toBeGreaterThanOrEqual(0);
  });

  it("computes completion rate per template, excluding templates with zero instances", async () => {
    const { data: template, error: templateError } = await supabase
      .from("workflow_templates")
      .insert({ company_id: companyId, slug: "test-template", name: "Test Template" })
      .select("id")
      .single();
    if (templateError) throw templateError;

    const { error: instancesError } = await supabase.from("workflow_instances").insert([
      { company_id: companyId, template_id: template.id, status: "completed" },
      { company_id: companyId, template_id: template.id, status: "completed" },
      { company_id: companyId, template_id: template.id, status: "in_progress" },
    ]);
    if (instancesError) throw instancesError;

    const { data: emptyTemplate, error: emptyTemplateError } = await supabase
      .from("workflow_templates")
      .insert({ company_id: companyId, slug: "empty-template", name: "Empty Template" })
      .select("id")
      .single();
    if (emptyTemplateError) throw emptyTemplateError;

    const result = await workflowCompletionRate(opsManager);
    const testRow = result.find((row) => row.templateId === template.id);
    expect(testRow).toBeDefined();
    expect(testRow?.totalInstances).toBe(3);
    expect(testRow?.completionRate).toBeCloseTo(2 / 3, 5);
    expect(result.find((row) => row.templateId === emptyTemplate.id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:integration -- lib/domain/reports.test.ts
```

Expected: FAIL — `avgRequestCompletionTime`/`workflowCompletionRate` are not exported.

- [ ] **Step 3: Implement**

Append to `lib/domain/reports.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:integration -- lib/domain/reports.test.ts
```

Expected: PASS, both new tests plus the two from Task 1 (4 total, all passing).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/reports.ts lib/domain/reports.test.ts
git commit -m "feat: add avgRequestCompletionTime and workflowCompletionRate report metrics

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `/api/reports` route

**Files:**
- Create: `app/api/reports/route.ts`

**Interfaces:**
- Consumes: `requestsByDepartment`, `avgRequestCompletionTime`, `taskStatistics`, `workflowCompletionRate` (`lib/domain/reports.ts`, Tasks 1-2), `getCurrentProfile` (`lib/auth/session.ts`), `toErrorResponse` (`lib/api/error-response.ts`).
- Produces: `GET /api/reports` → `{ requestsByDepartment, avgRequestCompletionTime, taskStatistics, workflowCompletionRate }` (200), `{ error }` (401 unauthenticated), `{ error }` (403 via `toErrorResponse`'s existing `ForbiddenError` mapping). Task 5's Reports page fetches this route and reads each key by this exact name.

Follows the exact shape of every other `GET`-only route in this codebase (e.g. `app/api/dashboard/company/route.ts`) — resolve session, 401 if absent, `Promise.all` the four domain calls (all four share the identical `canViewCompanyOverview` check, so if the first one throws `ForbiddenError`, `Promise.all` rejects immediately and none of the others need to run to completion — `toErrorResponse` catches it the same way it catches any single domain error).

- [ ] **Step 1: Create the route**

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import {
  avgRequestCompletionTime,
  requestsByDepartment,
  taskStatistics,
  workflowCompletionRate,
} from "@/lib/domain/reports";
import { toErrorResponse } from "@/lib/api/error-response";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const [
      requestsByDepartmentResult,
      avgRequestCompletionTimeResult,
      taskStatisticsResult,
      workflowCompletionRateResult,
    ] = await Promise.all([
      requestsByDepartment(profile),
      avgRequestCompletionTime(profile),
      taskStatistics(profile),
      workflowCompletionRate(profile),
    ]);

    return NextResponse.json({
      requestsByDepartment: requestsByDepartmentResult,
      avgRequestCompletionTime: avgRequestCompletionTimeResult,
      taskStatistics: taskStatisticsResult,
      workflowCompletionRate: workflowCompletionRateResult,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 2: Manual verification against the dev server**

```bash
npm run dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/reports
kill %1
```

Expected: `401` (no session cookie in a bare `curl` call) — confirms the route exists and the auth check runs before any domain call.

- [ ] **Step 3: Commit**

```bash
git add app/api/reports/route.ts
git commit -m "feat: add GET /api/reports route

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Report chart/stat components

**Files:**
- Create: `components/reports/requests-by-department-chart.tsx`
- Create: `components/reports/avg-completion-time-chart.tsx`
- Create: `components/reports/task-statistics-card.tsx`
- Create: `components/reports/workflow-completion-card.tsx`

**Interfaces:**
- Consumes: `DepartmentRequestCount`, `CategoryCompletionTime`, `TaskStatistics`, `TemplateCompletionRate` (`lib/domain/reports.ts`, Tasks 1-2), `ChartContainer`/`ChartTooltip`/`ChartTooltipContent`/`type ChartConfig` (`components/ui/chart.tsx`, already installed since Phase 7 — this is the first task in the whole project to actually use it), `Card`/`CardHeader`/`CardTitle`/`CardContent` (`components/ui/card.tsx`).
- Produces: four presentational components, each taking its own metric array/object as props — no fetching (Task 5 owns that). Exact props:
  ```ts
  function RequestsByDepartmentChart(props: { data: DepartmentRequestCount[] }): JSX.Element;
  function AvgCompletionTimeChart(props: { data: CategoryCompletionTime[] }): JSX.Element;
  function TaskStatisticsCard(props: { data: TaskStatistics }): JSX.Element;
  function WorkflowCompletionCard(props: { data: TemplateCompletionRate[] }): JSX.Element;
  ```
  Task 5 imports all four by these names and passes these exact prop shapes.

This is a leaf-component task (no fetching, no page wiring), so it's covered later by Task 5's page-level component test rendering the whole tree with mocked fetch data — matching how the dashboard's own presentational components (Phase 7) were tested, rather than one test file per chart.

- [ ] **Step 1: `requests-by-department-chart.tsx`**

```tsx
"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { DepartmentRequestCount } from "@/lib/domain/reports";

const chartConfig = {
  count: { label: "Open Requests", color: "var(--primary)" },
} satisfies ChartConfig;

export function RequestsByDepartmentChart({ data }: { data: DepartmentRequestCount[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Requests by Department</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open requests.</p>
        ) : (
          <ChartContainer config={chartConfig}>
            <BarChart data={data}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="departmentName" tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={4} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: `avg-completion-time-chart.tsx`**

```tsx
"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { CategoryCompletionTime } from "@/lib/domain/reports";

const chartConfig = {
  avgDays: { label: "Avg. Days to Complete", color: "var(--primary)" },
} satisfies ChartConfig;

export function AvgCompletionTimeChart({ data }: { data: CategoryCompletionTime[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Average Request Completion Time</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No completed requests yet.</p>
        ) : (
          <>
            <ChartContainer config={chartConfig}>
              <BarChart data={data}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="category" tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="avgDays" fill="var(--color-avgDays)" radius={4} />
              </BarChart>
            </ChartContainer>
            <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
              {data.map((row) => (
                <li key={row.category}>
                  {row.category}: based on {row.sampleSize} request{row.sampleSize === 1 ? "" : "s"}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: `task-statistics-card.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TaskStatistics } from "@/lib/domain/reports";

export function TaskStatisticsCard({ data }: { data: TaskStatistics }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Task Statistics</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1 text-sm">
          <li>{data.open} open tasks</li>
          <li>{data.completed} completed tasks</li>
          <li>{data.overdue} overdue tasks</li>
        </ul>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: `workflow-completion-card.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TemplateCompletionRate } from "@/lib/domain/reports";

export function WorkflowCompletionCard({ data }: { data: TemplateCompletionRate[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Workflow Completion Rate</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No workflow activity yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {data.map((row) => (
              <li key={row.templateId} className="flex items-center justify-between">
                <span>{row.templateName}</span>
                <span className="text-muted-foreground">
                  {Math.round(row.completionRate * 100)}% ({row.totalInstances} instances)
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors (these components aren't wired into a page yet, but must type-check against `lib/domain/reports.ts`'s real exports and `components/ui/chart.tsx`'s real exports).

- [ ] **Step 6: Commit**

```bash
git add components/reports/
git commit -m "feat: add report chart and stat card components

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `/reports` page, sidebar nav item, and gating

**Files:**
- Create: `app/(app)/reports/page.tsx`
- Test: `app/(app)/reports/page.test.tsx`
- Modify: `components/app-sidebar.tsx`
- Modify: `components/app-sidebar.test.tsx`
- Modify: `app/(app)/layout.tsx`
- Modify: `app/(app)/layout.test.tsx`

**Interfaces:**
- Consumes: the four chart/card components (Task 4), `/api/reports` (Task 3), `canViewCompanyOverview` (`lib/domain/permissions.ts`).
- Produces: `AppSidebar`'s prop signature gains one field: `canViewReports: boolean` (alongside its existing `user: CurrentUserSummary`). `app/(app)/layout.tsx` computes this via `canViewCompanyOverview(profile)`, the same function it could already import (it's already imported nowhere in that file today — this task adds the import).

- [ ] **Step 1: Write the failing test for the page**

Following `app/(app)/settings/page.test.tsx`'s exact pattern for testing an async Server Component's redirect/render behavior:

Create `app/(app)/reports/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
}));

const getCurrentProfileMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: () => getCurrentProfileMock(),
}));

vi.mock("@/lib/domain/reports", () => ({
  requestsByDepartment: vi.fn().mockResolvedValue([]),
  avgRequestCompletionTime: vi.fn().mockResolvedValue([]),
  taskStatistics: vi.fn().mockResolvedValue({ open: 0, completed: 0, overdue: 0 }),
  workflowCompletionRate: vi.fn().mockResolvedValue([]),
}));

import ReportsPage from "@/app/(app)/reports/page";

beforeEach(() => {
  redirectMock.mockClear();
  getCurrentProfileMock.mockReset();
});

describe("ReportsPage", () => {
  it("redirects to /dashboard when the caller cannot view reports", async () => {
    getCurrentProfileMock.mockResolvedValue({
      id: "profile-1",
      authUserId: "auth-1",
      companyId: "company-1",
      fullName: "Regular Employee",
      role: "employee",
      departmentId: null,
      managerId: null,
      positionTitle: null,
      employeeNumber: null,
      locationId: null,
      relatedOperationId: null,
      status: "active",
    });

    await expect(ReportsPage()).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("redirects to /login when there is no authenticated profile", async () => {
    getCurrentProfileMock.mockResolvedValue(null);

    await expect(ReportsPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("renders the report sections for an operations_manager", async () => {
    getCurrentProfileMock.mockResolvedValue({
      id: "profile-1",
      authUserId: "auth-1",
      companyId: "company-1",
      fullName: "Ops Manager",
      role: "operations_manager",
      departmentId: null,
      managerId: null,
      positionTitle: null,
      employeeNumber: null,
      locationId: null,
      relatedOperationId: null,
      status: "active",
    });

    const element = await ReportsPage();
    expect(JSON.stringify(element)).toContain("Requests by Department");
    expect(JSON.stringify(element)).toContain("Task Statistics");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit -- "app/(app)/reports/page.test.tsx"
```

Expected: FAIL — `app/(app)/reports/page.tsx` doesn't exist yet.

- [ ] **Step 3: Implement the page**

Create `app/(app)/reports/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { canViewCompanyOverview } from "@/lib/domain/permissions";
import {
  avgRequestCompletionTime,
  requestsByDepartment,
  taskStatistics,
  workflowCompletionRate,
} from "@/lib/domain/reports";
import { BackLink } from "@/components/back-link";
import { RequestsByDepartmentChart } from "@/components/reports/requests-by-department-chart";
import { AvgCompletionTimeChart } from "@/components/reports/avg-completion-time-chart";
import { TaskStatisticsCard } from "@/components/reports/task-statistics-card";
import { WorkflowCompletionCard } from "@/components/reports/workflow-completion-card";

export default async function ReportsPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }
  if (!canViewCompanyOverview(profile)) {
    redirect("/dashboard");
  }

  const [
    requestsByDepartmentData,
    avgRequestCompletionTimeData,
    taskStatisticsData,
    workflowCompletionRateData,
  ] = await Promise.all([
    requestsByDepartment(profile),
    avgRequestCompletionTime(profile),
    taskStatistics(profile),
    workflowCompletionRate(profile),
  ]);

  return (
    <div>
      <BackLink href="/dashboard" />
      <h1 className="text-2xl font-semibold mb-4 mt-2">Reports</h1>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 @2xl/main:grid-cols-2">
          <RequestsByDepartmentChart data={requestsByDepartmentData} />
          <AvgCompletionTimeChart data={avgRequestCompletionTimeData} />
        </div>
        <div className="grid grid-cols-1 gap-4 @2xl/main:grid-cols-2">
          <TaskStatisticsCard data={taskStatisticsData} />
          <WorkflowCompletionCard data={workflowCompletionRateData} />
        </div>
      </div>
    </div>
  );
}
```

This page calls `lib/domain/reports.ts`'s functions directly (Server Component, same as every other page in this app that doesn't need client-side refetching) rather than fetching `/api/reports` over HTTP — matching how `app/(app)/dashboard/page.tsx` is the one exception that fetches its own API from a client component (because it needs Realtime-triggered refetching), while every other page in this app reads the domain layer directly server-side. `/api/reports` (Task 3) still exists for programmatic/future use, it's just not what this page itself calls.

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:unit -- "app/(app)/reports/page.test.tsx"
```

Expected: PASS.

- [ ] **Step 5: Add the Reports nav item, conditionally**

Read the current `components/app-sidebar.tsx` in full first (Tasks 1-9 of the sidebar-shell plan already shaped this file; don't assume its exact current content without checking). Change the `navGroups` array from a static module-level constant into a function of `canViewReports`, and add `AppSidebar`'s new prop:

Find the current `const navGroups: NavGroup[] = [...]` declaration and the `export function AppSidebar({ user, ...props }: ...)` signature. Replace them so that:

1. `navGroups` becomes a function:

```tsx
function buildNavGroups(canViewReports: boolean): NavGroup[] {
  const homeItems: NavGroup["items"] = [
    { title: "Dashboard", url: "/dashboard", icon: <LayoutDashboardIcon /> },
    { title: "Tasks", url: "/tasks", icon: <ListTodoIcon /> },
    { title: "Requests", url: "/requests", icon: <InboxIcon /> },
    { title: "Operations", url: "/operations", icon: <FolderKanbanIcon /> },
    { title: "Workflows", url: "/workflows", icon: <WorkflowIcon /> },
  ];
  if (canViewReports) {
    homeItems.push({ title: "Reports", url: "/reports", icon: <ChartBarIcon /> });
  }

  return [
    { label: "Home", items: homeItems },
    {
      label: "Resources",
      items: [
        { title: "Employees", url: "/employees", icon: <UsersIcon /> },
        { title: "Assets", url: "/assets", icon: <PackageIcon /> },
      ],
    },
  ];
}
```

(Keep whatever the current file's exact "Resources" item list is — read it first; the snippet above assumes it's unchanged from Employees/Assets, but confirm before replacing.)

2. Add `ChartBarIcon` to the existing `lucide-react` import line.

3. `AppSidebar`'s signature gains `canViewReports`:

```tsx
export function AppSidebar({
  user,
  canViewReports,
  ...props
}: { user: CurrentUserSummary; canViewReports: boolean } & React.ComponentProps<typeof Sidebar>) {
```

4. Inside the component body, call `buildNavGroups(canViewReports)` instead of referencing the old static `navGroups` constant, and pass the result to `<NavMain groups={...} />`.

- [ ] **Step 6: Wire `canViewReports` from the layout**

In `app/(app)/layout.tsx`, add the import:

```tsx
import { canViewCompanyOverview } from "@/lib/domain/permissions";
```

and change the `<AppSidebar ...>` call site to add `canViewReports={canViewCompanyOverview(profile)}` alongside the existing `user={...}` prop.

- [ ] **Step 7: Update `app-sidebar.test.tsx`**

Read the current file first. Every `render(<SidebarProvider><AppSidebar user={user} /></SidebarProvider>)` call site needs `canViewReports` added. Add two variants: pass `canViewReports={true}` to the existing tests (so "Reports" reliably appears in the "renders every Home and Resources nav item" test — add `"Reports"` to that test's loop array too), and add one new test:

```tsx
it("does not render Reports when canViewReports is false", () => {
  render(
    <SidebarProvider>
      <AppSidebar user={user} canViewReports={false} />
    </SidebarProvider>
  );
  expect(screen.queryByText("Reports")).not.toBeInTheDocument();
});
```

- [ ] **Step 8: Update `app/(app)/layout.test.tsx`**

Read the current file first (it mocks `@/lib/domain/profiles`'s `getProfileByAuthUserId` and asserts on the serialized element tree). No new mock is needed for `canViewCompanyOverview` — it's a pure function of the already-mocked `profile.role`, not a separate module call to intercept. Confirm the existing third test (the one asserting `'"role":"it"'` is present) still passes unchanged; if `canViewReports` being computed and passed as a new boolean prop to `AppSidebar` breaks anything about how that test's assertions locate content in the serialized tree, adjust the assertion to account for the new prop rather than removing coverage — but this is unlikely, since the test asserts on `profile.fullName`/`profile.role`, neither of which this task touches.

- [ ] **Step 9: Run the full unit suite, lint, and type-check**

```bash
npm run test:unit
npm run lint
npx tsc --noEmit
```

Expected: all clean. Lint should show only the 2 known pre-existing errors (`hooks/use-mobile.ts`, `lib/realtime/use-broadcast-listener.ts`) plus the existing warnings — nothing new from this task.

- [ ] **Step 10: Commit**

```bash
git add "app/(app)/reports/page.tsx" "app/(app)/reports/page.test.tsx" \
        components/app-sidebar.tsx components/app-sidebar.test.tsx \
        "app/(app)/layout.tsx" "app/(app)/layout.test.tsx"
git commit -m "feat: add /reports page, gated Reports nav item

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Search vectors migration

**Files:**
- Create: `supabase/migrations/<version>_add_search_vectors.sql`

**Interfaces:**
- Produces: `search_vector` (type `tsvector`) on `profiles`, `tasks`, `requests`, `assets`, `operations`, `workflow_templates`, each with a GIN index. Task 8's `search()` queries these columns by exact name `search_vector`.

This task applies a real schema change to the hosted Supabase project — follow the Global Constraints' MCP-tool workflow exactly, matching every prior phase's migration task precedent (most recently `docs/superpowers/plans/2026-09-13-phase6-operations.md`'s Tasks that added `operations`/`related_operation_id`).

- [ ] **Step 1: Apply the migration**

The exact SQL (from spec §5):

```sql
alter table profiles add column search_vector tsvector
  generated always as (to_tsvector('english', coalesce(full_name, ''))) stored;
create index profiles_search_vector_idx on profiles using gin(search_vector);

alter table tasks add column search_vector tsvector
  generated always as (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))) stored;
create index tasks_search_vector_idx on tasks using gin(search_vector);

alter table requests add column search_vector tsvector
  generated always as (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))) stored;
create index requests_search_vector_idx on requests using gin(search_vector);

alter table assets add column search_vector tsvector
  generated always as (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(category, ''))) stored;
create index assets_search_vector_idx on assets using gin(search_vector);

alter table operations add column search_vector tsvector
  generated always as (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))) stored;
create index operations_search_vector_idx on operations using gin(search_vector);

alter table workflow_templates add column search_vector tsvector
  generated always as (to_tsvector('english', coalesce(name, ''))) stored;
create index workflow_templates_search_vector_idx on workflow_templates using gin(search_vector);
```

Call `mcp__claude_ai_Supabase__apply_migration` with `project_id: "yqzcunssgvffischmwle"`, `name: "add_search_vectors"`, `query` set to the exact SQL above.

- [ ] **Step 2: Verify live**

`mcp__claude_ai_Supabase__execute_sql` with `project_id: "yqzcunssgvffischmwle"`:

```sql
select table_name, column_name from information_schema.columns
where column_name = 'search_vector'
order by table_name;
```

Expected: 6 rows — `assets`, `operations`, `profiles`, `requests`, `tasks`, `workflow_templates`.

```sql
select indexname, tablename from pg_indexes
where indexname like '%search_vector_idx'
order by tablename;
```

Expected: 6 rows, one GIN index per table.

- [ ] **Step 3: Rename the local migration file**

Call `mcp__claude_ai_Supabase__list_migrations` with `project_id: "yqzcunssgvffischmwle"`. Find the version the tool assigned to `add_search_vectors` (the most recent entry). Create the local file at `supabase/migrations/<that-version>_add_search_vectors.sql` with the exact SQL from Step 1.

- [ ] **Step 4: Regenerate TypeScript types**

Call `mcp__claude_ai_Supabase__generate_typescript_types` with `project_id: "yqzcunssgvffischmwle"`. Overwrite `lib/supabase/database.types.ts` with the tool's `types` field verbatim (the whole file — this is a generated file, never hand-edited).

- [ ] **Step 5: Confirm nothing broke**

```bash
npm run test:unit
npx tsc --noEmit
```

Expected: all passing, clean (the regenerated types file should be a superset of before — adding a column doesn't remove any existing type any other domain module relies on).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/ lib/supabase/database.types.ts
git commit -m "feat: add generated search_vector columns and GIN indexes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: `search()` domain function

**Files:**
- Create: `lib/domain/search.ts`
- Test: `lib/domain/search.test.ts`

**Interfaces:**
- Consumes: `search_vector` columns (Task 6), the existing `listTasks`/`listRequests` scoping logic (read `lib/domain/tasks.ts`/`lib/domain/requests.ts` directly before writing this task's query construction — do not guess the `.or(...)` predicate strings, copy them from the real, current source).
- Produces:
  ```ts
  export type SearchResultType = "task" | "request" | "asset" | "employee" | "operation";

  export interface SearchResult {
    type: SearchResultType;
    id: string;
    label: string;
    href: string;
  }

  export async function search(profile: Profile, query: string): Promise<SearchResult[]>;
  ```
  Task 8's `/api/search` route imports and calls this by this exact name and shape.

Before writing the implementation, re-read `lib/domain/tasks.ts`'s `listTasks` and `lib/domain/requests.ts`'s `listRequests` in full — their exact `.or(...)` scoping strings for non-`COMPANY_WIDE_VIEW_ROLES` callers are what this task's task/request queries must reuse verbatim (same column names, same logic), per this plan's Global Constraints and the spec's own explicit leak-check (§2, §6). Do not paraphrase them from memory or from this brief — read the live files.

- [ ] **Step 1: Write the failing tests**

Create `lib/domain/search.test.ts`, following `lib/domain/dashboard.test.ts`'s fixture pattern:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile, type Profile } from "@/lib/domain/profiles";
import { search } from "@/lib/domain/search";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("search", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  const createdAuthUserIds: string[] = [];
  let opsManager: Profile;
  let employeeA: Profile;
  let employeeB: Profile;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (search)", slug: "test-co-search" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: opsManagerAuthUser, error: opsManagerAuthError } =
      await supabase.auth.admin.createUser({
        email: `search-test-ops-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
    if (opsManagerAuthError || !opsManagerAuthUser.user) throw opsManagerAuthError;
    createdAuthUserIds.push(opsManagerAuthUser.user.id);
    opsManager = await createProfile({
      authUserId: opsManagerAuthUser.user.id,
      companyId,
      fullName: "Ops Manager",
      role: "operations_manager",
    });

    const { data: employeeAAuthUser, error: employeeAAuthError } =
      await supabase.auth.admin.createUser({
        email: `search-test-employee-a-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
    if (employeeAAuthError || !employeeAAuthUser.user) throw employeeAAuthError;
    createdAuthUserIds.push(employeeAAuthUser.user.id);
    employeeA = await createProfile({
      authUserId: employeeAAuthUser.user.id,
      companyId,
      fullName: "Employee Searcher",
      role: "employee",
    });

    const { data: employeeBAuthUser, error: employeeBAuthError } =
      await supabase.auth.admin.createUser({
        email: `search-test-employee-b-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
    if (employeeBAuthError || !employeeBAuthUser.user) throw employeeBAuthError;
    createdAuthUserIds.push(employeeBAuthUser.user.id);
    employeeB = await createProfile({
      authUserId: employeeBAuthUser.user.id,
      companyId,
      fullName: "Employee Owner",
      role: "employee",
    });
  });

  afterAll(async () => {
    const { error: tasksDeleteError } = await supabase
      .from("tasks")
      .delete()
      .eq("company_id", companyId);
    if (tasksDeleteError) throw tasksDeleteError;

    const { error: requestsDeleteError } = await supabase
      .from("requests")
      .delete()
      .eq("company_id", companyId);
    if (requestsDeleteError) throw requestsDeleteError;

    const { error: assetsDeleteError } = await supabase
      .from("assets")
      .delete()
      .eq("company_id", companyId);
    if (assetsDeleteError) throw assetsDeleteError;

    const { error: operationsDeleteError } = await supabase
      .from("operations")
      .delete()
      .eq("company_id", companyId);
    if (operationsDeleteError) throw operationsDeleteError;

    const { error: profilesDeleteError } = await supabase
      .from("profiles")
      .delete()
      .eq("company_id", companyId);
    if (profilesDeleteError) throw profilesDeleteError;

    for (const authUserId of createdAuthUserIds) {
      await supabase.auth.admin.deleteUser(authUserId);
    }
  });

  it("returns [] immediately for an empty or whitespace-only query", async () => {
    expect(await search(opsManager, "")).toEqual([]);
    expect(await search(opsManager, "   ")).toEqual([]);
  });

  it("finds a matching task, request, asset, employee, and operation", async () => {
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        company_id: companyId,
        title: "Fix the searchable printer",
        status: "todo",
        priority: "medium",
        assignee_id: opsManager.id,
        creator_id: opsManager.id,
      })
      .select("id")
      .single();
    if (taskError) throw taskError;

    const { data: request, error: requestError } = await supabase
      .from("requests")
      .insert({
        company_id: companyId,
        title: "Searchable request title",
        category: "general",
        status: "draft",
        created_by: opsManager.id,
      })
      .select("id")
      .single();
    if (requestError) throw requestError;

    const { data: asset, error: assetError } = await supabase
      .from("assets")
      .insert({ company_id: companyId, asset_code: "SEARCH-1", name: "Searchable Laptop", category: "hardware" })
      .select("id")
      .single();
    if (assetError) throw assetError;

    const { data: operation, error: operationError } = await supabase
      .from("operations")
      .insert({
        company_id: companyId,
        title: "Searchable Operation",
        owner_id: opsManager.id,
        status: "planning",
        priority: "medium",
      })
      .select("id")
      .single();
    if (operationError) throw operationError;

    const results = await search(opsManager, "searchable");
    expect(results.some((r) => r.type === "task" && r.id === task.id)).toBe(true);
    expect(results.some((r) => r.type === "request" && r.id === request.id)).toBe(true);
    expect(results.some((r) => r.type === "asset" && r.id === asset.id)).toBe(true);
    expect(results.some((r) => r.type === "operation" && r.id === operation.id)).toBe(true);
    expect(results.some((r) => r.id === opsManager.id)).toBe(true); // "Ops Manager" doesn't match "searchable" — see next test for a real employee match
  });

  it("finds a matching employee by name", async () => {
    const results = await search(opsManager, "Employee Searcher");
    expect(results.some((r) => r.type === "employee" && r.id === employeeA.id)).toBe(true);
  });

  it("does not surface a task the searching employee cannot otherwise see", async () => {
    const { error } = await supabase.from("tasks").insert({
      company_id: companyId,
      title: "Private unreachable task",
      status: "todo",
      priority: "medium",
      assignee_id: employeeB.id,
      creator_id: employeeB.id,
    });
    if (error) throw error;

    const results = await search(employeeA, "unreachable");
    expect(results.some((r) => r.type === "task")).toBe(false);
  });

  it("does not surface a request the searching employee cannot otherwise see", async () => {
    const { error } = await supabase.from("requests").insert({
      company_id: companyId,
      title: "Private unreachable request",
      category: "general",
      status: "draft",
      created_by: employeeB.id,
    });
    if (error) throw error;

    const results = await search(employeeA, "unreachable");
    expect(results.some((r) => r.type === "request")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:integration -- lib/domain/search.test.ts
```

Expected: FAIL — `lib/domain/search.ts` doesn't exist yet.

- [ ] **Step 3: Implement**

Read `lib/domain/tasks.ts`'s `listTasks` and `lib/domain/requests.ts`'s `listRequests` first (Global Constraints). Their scoping shape (as of this plan's writing — confirm against the live file, it's this task's job to copy it accurately, not this brief's):

```ts
// tasks: if (!COMPANY_WIDE_VIEW_ROLES.has(profile.role)) {
//   manager: .or(`assignee_id.eq.${id},creator_id.eq.${id},department_id.eq.${deptId}`)
//   other:   .or(`assignee_id.eq.${id},creator_id.eq.${id}`)
// }
// requests: if (!COMPANY_WIDE_VIEW_ROLES.has(profile.role)) {
//   manager: .or(`created_by.eq.${id},department_id.eq.${deptId}`)
//   other:   .eq("created_by", id)
// }
```

Create `lib/domain/search.ts`:

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/domain/profiles";

const RESULT_LIMIT_PER_TYPE = 5;
const COMPANY_WIDE_VIEW_ROLES = new Set(["operations_manager", "it", "hr", "admin"]);

export type SearchResultType = "task" | "request" | "asset" | "employee" | "operation";

export interface SearchResult {
  type: SearchResultType;
  id: string;
  label: string;
  href: string;
}

export async function search(profile: Profile, query: string): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const supabase = createSupabaseAdminClient();

  let tasksQuery = supabase
    .from("tasks")
    .select("id, title")
    .eq("company_id", profile.companyId)
    .textSearch("search_vector", trimmed, { type: "websearch", config: "english" })
    .limit(RESULT_LIMIT_PER_TYPE);
  if (!COMPANY_WIDE_VIEW_ROLES.has(profile.role)) {
    tasksQuery =
      profile.role === "manager" && profile.departmentId
        ? tasksQuery.or(
            `assignee_id.eq.${profile.id},creator_id.eq.${profile.id},department_id.eq.${profile.departmentId}`
          )
        : tasksQuery.or(`assignee_id.eq.${profile.id},creator_id.eq.${profile.id}`);
  }

  let requestsQuery = supabase
    .from("requests")
    .select("id, title")
    .eq("company_id", profile.companyId)
    .textSearch("search_vector", trimmed, { type: "websearch", config: "english" })
    .limit(RESULT_LIMIT_PER_TYPE);
  if (!COMPANY_WIDE_VIEW_ROLES.has(profile.role)) {
    requestsQuery =
      profile.role === "manager" && profile.departmentId
        ? requestsQuery.or(`created_by.eq.${profile.id},department_id.eq.${profile.departmentId}`)
        : requestsQuery.eq("created_by", profile.id);
  }

  const assetsQuery = supabase
    .from("assets")
    .select("id, name")
    .eq("company_id", profile.companyId)
    .textSearch("search_vector", trimmed, { type: "websearch", config: "english" })
    .limit(RESULT_LIMIT_PER_TYPE);

  const employeesQuery = supabase
    .from("profiles")
    .select("id, full_name")
    .eq("company_id", profile.companyId)
    .textSearch("search_vector", trimmed, { type: "websearch", config: "english" })
    .limit(RESULT_LIMIT_PER_TYPE);

  const operationsQuery = supabase
    .from("operations")
    .select("id, title")
    .eq("company_id", profile.companyId)
    .textSearch("search_vector", trimmed, { type: "websearch", config: "english" })
    .limit(RESULT_LIMIT_PER_TYPE);

  const [tasksResult, requestsResult, assetsResult, employeesResult, operationsResult] =
    await Promise.all([tasksQuery, requestsQuery, assetsQuery, employeesQuery, operationsQuery]);

  if (tasksResult.error) throw tasksResult.error;
  if (requestsResult.error) throw requestsResult.error;
  if (assetsResult.error) throw assetsResult.error;
  if (employeesResult.error) throw employeesResult.error;
  if (operationsResult.error) throw operationsResult.error;

  const results: SearchResult[] = [
    ...(tasksResult.data ?? []).map((row) => ({
      type: "task" as const,
      id: row.id,
      label: row.title,
      href: `/tasks/${row.id}`,
    })),
    ...(requestsResult.data ?? []).map((row) => ({
      type: "request" as const,
      id: row.id,
      label: row.title,
      href: `/requests/${row.id}`,
    })),
    ...(assetsResult.data ?? []).map((row) => ({
      type: "asset" as const,
      id: row.id,
      label: row.name,
      href: `/assets/${row.id}`,
    })),
    ...(employeesResult.data ?? []).map((row) => ({
      type: "employee" as const,
      id: row.id,
      label: row.full_name,
      href: `/employees/${row.id}`,
    })),
    ...(operationsResult.data ?? []).map((row) => ({
      type: "operation" as const,
      id: row.id,
      label: row.title,
      href: `/operations/${row.id}`,
    })),
  ];

  return results;
}
```

`COMPANY_WIDE_VIEW_ROLES` is re-declared here as a module-local copy (it's a private, unexported `const` in `lib/domain/permissions.ts` today — check this is still true before assuming it, since re-declaring it here only works if the literal set of role names hasn't drifted since this plan was written).

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:integration -- lib/domain/search.test.ts
```

Expected: PASS, all 5 tests. If the leak tests (the last two) fail, that's the signal this task's `.or(...)` predicates don't actually match what `listTasks`/`listRequests` do — go re-read those files again rather than adjusting the test to tolerate the leak.

- [ ] **Step 5: Wire the new test file into the npm scripts**

Same pattern as every other domain test: add `"lib/domain/search.test.ts"` to `test:integration`'s list and `--exclude "lib/domain/search.test.ts"` to `test:unit`'s exclude list in `package.json`.

- [ ] **Step 6: Run the full unit suite**

```bash
npm run test:unit
```

Expected: PASS, `lib/domain/search.test.ts` correctly excluded.

- [ ] **Step 7: Commit**

```bash
git add lib/domain/search.ts lib/domain/search.test.ts package.json
git commit -m "feat: add search() domain function with per-entity visibility scoping

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: `/api/search` route

**Files:**
- Create: `app/api/search/route.ts`

**Interfaces:**
- Consumes: `search` (`lib/domain/search.ts`, Task 7), `getCurrentProfile`, `toErrorResponse`.
- Produces: `GET /api/search?q=<query>` → `{ results: SearchResult[] }` (200), `{ error }` (401). Task 9's `command-search.tsx` fetches this exact path/shape.

- [ ] **Step 1: Create the route**

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { search } from "@/lib/domain/search";
import { toErrorResponse } from "@/lib/api/error-response";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";

  try {
    const results = await search(profile, query);
    return NextResponse.json({ results });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 2: Manual verification**

```bash
npm run dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/search?q=test"
kill %1
```

Expected: `401`.

- [ ] **Step 3: Commit**

```bash
git add app/api/search/route.ts
git commit -m "feat: add GET /api/search route

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Command palette UI

**Files:**
- Modify: `components/nav-secondary.tsx`
- Create: `components/command-search.tsx`
- Test: `components/command-search.test.tsx`
- Modify: `components/app-sidebar.tsx`
- Modify: `components/app-sidebar.test.tsx`

**Interfaces:**
- Consumes: `/api/search` (Task 8), `SearchResult`/`SearchResultType` (`lib/domain/search.ts`, Task 7), shadcn `command`/`dialog` primitives (pulled fresh in Step 1 below).
- Produces: `CommandSearch(props: { open: boolean; onOpenChange: (open: boolean) => void }): JSX.Element`. `AppSidebar` owns a local `useState` for this and renders `CommandSearch` as a sibling of `<Sidebar>` in its own returned tree (not nested inside `app/(app)/layout.tsx` as a separate top-level component — `AppSidebar` is already always-mounted on every authenticated page, so it's the natural owner of both the Search nav button's click and the `⌘K` listener).

- [ ] **Step 1: Pull the shadcn `command` primitive**

```bash
npx shadcn@latest add command -y
```

Verify what landed: `components/ui/command.tsx`, `components/ui/dialog.tsx`, `components/ui/input-group.tsx`, `components/ui/textarea.tsx` (new), plus the `cmdk` dependency (confirmed via a dry-run before this plan was written — `button.tsx`/`input.tsx` come back unchanged, no overwrite risk). `input-group.tsx`/`textarea.tsx` aren't used by this task; leave them installed (matching this project's established "keep what the CLI brings, useful for later" precedent from every prior shadcn-block-pulling task).

- [ ] **Step 2: Adapt `nav-secondary.tsx` to support an `onClick` item**

Read the current file first (unchanged since the sidebar-shell phase — confirm before editing). Add an optional `onClick` field to the item type, and branch the render:

```tsx
export function NavSecondary({
  items,
  ...props
}: {
  items: {
    title: string
    url: string
    icon: React.ReactNode
    onClick?: () => void
  }[]
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              {item.onClick ? (
                <SidebarMenuButton onClick={item.onClick}>
                  {item.icon}
                  <span>{item.title}</span>
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton render={<a href={item.url} />}>
                  {item.icon}
                  <span>{item.title}</span>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
```

- [ ] **Step 3: Write the failing test for `CommandSearch`**

Create `components/command-search.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandSearch } from "@/components/command-search";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe("CommandSearch", () => {
  it("does not render dialog content when closed", () => {
    render(<CommandSearch open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
  });

  it("fetches and groups results by type when the query changes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { type: "task", id: "task-1", label: "Fix the printer", href: "/tasks/task-1" },
          { type: "employee", id: "emp-1", label: "Sarah Employee", href: "/employees/emp-1" },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CommandSearch open={true} onOpenChange={vi.fn()} />);
    const input = screen.getByPlaceholderText(/search/i);
    await userEvent.type(input, "printer");

    expect(await screen.findByText("Fix the printer")).toBeInTheDocument();
    expect(screen.getByText("Sarah Employee")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/search?q=printer"));
  });

  it("navigates and closes on selecting a result", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ type: "task", id: "task-1", label: "Fix the printer", href: "/tasks/task-1" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onOpenChange = vi.fn();

    render(<CommandSearch open={true} onOpenChange={onOpenChange} />);
    const input = screen.getByPlaceholderText(/search/i);
    await userEvent.type(input, "printer");
    await userEvent.click(await screen.findByText("Fix the printer"));

    expect(pushMock).toHaveBeenCalledWith("/tasks/task-1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npm run test:unit -- components/command-search.test.tsx
```

Expected: FAIL — `components/command-search.tsx` doesn't exist yet.

- [ ] **Step 5: Implement `CommandSearch`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { SearchResult, SearchResultType } from "@/lib/domain/search";

const TYPE_LABELS: Record<SearchResultType, string> = {
  task: "Tasks",
  request: "Requests",
  asset: "Assets",
  employee: "Employees",
  operation: "Operations",
};

export function CommandSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        onOpenChange(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    const timeoutId = setTimeout(async () => {
      const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
      if (!response.ok) return;
      const body = await response.json();
      setResults(body.results as SearchResult[]);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [query]);

  function handleSelect(result: SearchResult) {
    router.push(result.href);
    onOpenChange(false);
    setQuery("");
  }

  const groups = new Map<SearchResultType, SearchResult[]>();
  for (const result of results) {
    const existing = groups.get(result.type) ?? [];
    existing.push(result);
    groups.set(result.type, existing);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search tasks, requests, assets..." value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {Array.from(groups.entries()).map(([type, items]) => (
          <CommandGroup key={type} heading={TYPE_LABELS[type]}>
            {items.map((item) => (
              <CommandItem key={item.id} onSelect={() => handleSelect(item)}>
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
```

`CommandInput`'s exact prop names (`value`/`onValueChange` vs. something else) and `CommandDialog`'s exact prop names (`open`/`onOpenChange`) come from the shadcn `command.tsx` file Step 1 just pulled — read that file before writing this component if anything here doesn't compile; `cmdk`'s `Command.Input`/`Command.Dialog` (which `command.tsx` wraps) use this `value`/`onValueChange`/`open`/`onOpenChange` convention as of the version this project's `add command` pull resolves to, but confirm against the actual installed file rather than assuming.

- [ ] **Step 6: Run test to verify it passes**

```bash
npm run test:unit -- components/command-search.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Wire `CommandSearch` into `AppSidebar`**

Read the current `components/app-sidebar.tsx` (as it stands after Task 5's edits). Add:

```tsx
import { useState } from "react"
import { CommandSearch } from "@/components/command-search"
```

Inside the `AppSidebar` function body, add:

```tsx
const [searchOpen, setSearchOpen] = useState(false)
```

Find the `navSecondary` data (currently a module-level array with a `{ title: "Search", url: "#", icon: <SearchIcon /> }` entry per the sidebar-shell phase). Move it inside the component (or keep it module-level and merge the `onClick` in when passing to `NavSecondary` — either compiles; module-level is simpler if `navSecondary` doesn't need `canViewReports` or other props) so the Search entry becomes:

```tsx
{ title: "Search", url: "#", icon: <SearchIcon />, onClick: () => setSearchOpen(true) }
```

Finally, wrap the component's returned JSX so `CommandSearch` renders as a sibling of `<Sidebar>`:

```tsx
return (
  <>
    <Sidebar collapsible="offcanvas" {...props}>
      {/* ...unchanged existing content... */}
    </Sidebar>
    <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
  </>
)
```

- [ ] **Step 8: Add a test confirming the Search nav item opens the dialog**

Add to `components/app-sidebar.test.tsx`:

```tsx
it("opens the command search dialog when the Search nav item is clicked", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) })
  );
  const { default: userEvent } = await import("@testing-library/user-event");

  render(
    <SidebarProvider>
      <AppSidebar user={user} canViewReports={true} />
    </SidebarProvider>
  );

  await userEvent.click(screen.getByText("Search"));
  expect(await screen.findByPlaceholderText(/search/i)).toBeInTheDocument();
});
```

(`@testing-library/user-event` is already a dependency of this project, used elsewhere — the dynamic `import()` here just avoids adding a new top-level import to a file that hasn't needed one before; a regular top-level `import userEvent from "@testing-library/user-event"` works identically and is preferred if this file's existing import style makes that cleaner — check the file's current imports first.)

- [ ] **Step 9: Run the full unit suite, lint, and type-check**

```bash
npm run test:unit
npm run lint
npx tsc --noEmit
```

Expected: all clean, same 2-error/5-warning lint baseline.

- [ ] **Step 10: Commit**

```bash
git add components/nav-secondary.tsx components/command-search.tsx components/command-search.test.tsx \
        components/app-sidebar.tsx components/app-sidebar.test.tsx components/ui/command.tsx \
        components/ui/dialog.tsx components/ui/input-group.tsx components/ui/textarea.tsx package.json
git commit -m "feat: wire the sidebar Search entry to a cmd-k command palette

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Whole-branch verification and STATUS.md update

**Files:** `docs/STATUS.md` (modify), no other files.

- [ ] **Step 1: Full test suite**

```bash
npm run test:unit
npm run test:integration
```

Expected: all passing (`test:integration` needs `SUPABASE_SERVICE_ROLE_KEY` set).

- [ ] **Step 2: Lint and type-check**

```bash
npm run lint
npx tsc --noEmit
```

Expected: clean except the 2 known pre-existing errors.

- [ ] **Step 3: Production build**

```bash
npm run build
```

Expected: succeeds with no warnings. This is the check that has caught real build-only bugs in every recent phase (a missing Next.js-generated type, a missing Suspense boundary) that `tsc` alone missed — run it for real, don't skip it because `tsc` was already clean.

- [ ] **Step 4: Manual smoke check**

If a browser or browser-automation tool is available in this environment, sign in as a seeded `operations_manager` and confirm: `/reports` renders all four sections with real numbers, the Reports nav item is visible; sign in as a seeded `employee` and confirm `/reports` redirects to `/dashboard` and no Reports nav item appears; press `⌘K`/`Ctrl+K` from any page and confirm the search dialog opens, typing a known task/request/asset/employee/operation name surfaces it grouped correctly, and selecting a result navigates there. **If no such tool is available**, say so explicitly and flag it as a required pre-merge action — matching every prior phase in this project's own precedent for this exact situation.

- [ ] **Step 5: Update `docs/STATUS.md`**

Move this branch's entry from **In Progress** to **Review**, following the existing file's format (one-line description, spec/plan links). Leave it in **Review**, not **Finished**, until the branch actually merges, per the file's own header rule.
