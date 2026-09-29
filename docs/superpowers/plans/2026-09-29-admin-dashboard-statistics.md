# Admin Dashboard Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the app's first time-series chart — completed tasks and new requests per week — as a compact dashboard widget (6 weeks) and a fuller `/reports` section (12 weeks), backed by one shared domain function and one shared chart component, plus a demo-data seed script so the charts have something real to show.

**Architecture:** A new `getTaskRequestTrends(profile, weeks)` in `lib/domain/reports.ts` buckets `tasks.completed_at` and `requests.created_at` into Monday-start weekly buckets (zero-filled). The dashboard consumes it through the existing `getCompanyOverview`/`GET /api/dashboard/company` plumbing (no new route); `/reports` calls it directly server-side like its 4 existing sibling metrics. One new `TaskRequestTrendChart` component (recharts `LineChart`, first line/area-type chart in the codebase) renders the data in both places. A new `seedDemoActivity()` seeds ~14 weeks of backdated demo tasks/requests against AlpenTech Industries on the live hosted Supabase project, assigned to a handful of new non-Clerk-linked "ghost" profiles — run only after explicit human approval.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase Postgres (hosted, no local dev stack), recharts 3.8, shadcn/ui `chart.tsx` wrapper, vitest + `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-09-29-admin-dashboard-statistics-design.md`

## Global Constraints

- Weekly buckets only (Monday-start), never daily — per spec §2.
- Dashboard widget: fixed 6-week window. `/reports` section: fixed 12-week window. No range picker/selector in this plan — per spec §2 and §5.
- One shared `getTaskRequestTrends(profile: Profile, weeks: number)` function backs both call sites; one shared `TaskRequestTrendChart` component renders in both places — no duplicated query or chart code.
- No new API route for the dashboard — the new data rides the existing `GET /api/dashboard/company` response (`CompanyOverview.taskRequestTrends`) — per spec §2.
- Every week in the requested range appears in the output, zero-filled if empty; the current, in-progress week is included and not special-cased — per spec §2.
- Demo employees are never Clerk-linked and never trigger a real invitation — `createProfile` called directly with `authUserId: undefined` and no `invitedEmail` — per spec §2.
- The demo-seed script targets the live hosted Supabase project (`yqzcunssgvffischmwle`, "AlpenTech Industries") — it is written and reviewed here, but only ever run against that project after the human operator explicitly approves the run, matching this project's established precedent for any live-DB write outside normal app usage.
- `next build`, `tsc --noEmit`, and `pnpm lint` must stay clean by the final whole-branch verification task; per-task verification runs scoped tests, matching this project's established convention.

## Review Focus

- **Week-bucketing must place a timestamp near a week boundary in the correct Monday-start bucket, not the adjacent week.** Date-arithmetic off-by-one errors are the single likeliest bug in this plan — a task completed at 23:59 on a Sunday must land in that week, not the next one. Pinned in Task 1's own tests (boundary-timestamp cases), not deferred to a later task.
- **A week with zero activity must appear as `0`, not be missing from the array.** A person looking at the chart expects a continuous 6- or 12-point line; a silently-skipped empty week would either break the chart's x-axis or misrepresent a quiet week as "no data yet". Pinned in Task 1.
- **Trends must never include another company's tasks/requests.** Every sibling function in `lib/domain/reports.ts` scopes to `profile.companyId`; this one must too, and Task 1's own test proves a second company's data doesn't leak in — not just trust the `.eq("company_id", ...)` filter compiles. Pinned in Task 1.
- **A caller without `canViewCompanyOverview` must get the exact same `ForbiddenError` this file's other four functions already throw** — both directly (Task 1) and end-to-end through the dashboard (an `employee`-role viewer's `/api/dashboard/company` response must not carry trend data even though `getCompanyOverview` itself already 403s them before this field is ever computed) and through `/reports` (already redirects non-elevated roles before any fetch runs, per the existing page). Pinned in Task 1, re-confirmed structurally in Tasks 3 and 5 (no new bypass introduced).
- **Re-running the demo-seed script must not duplicate data.** A person re-running it by mistake (or a future agent re-running it not realizing it already ran) must not double the employee count or the weekly task/request counts — the whole point of the feature is a believable, stable-looking trend, not one that silently doubles every time someone re-triggers the script. Pinned in Task 6's own idempotency test.

---

### Task 1: Domain — `getTaskRequestTrends`

**Files:**
- Modify: `lib/domain/reports.ts`
- Modify: `lib/domain/reports.test.ts`

**Interfaces:**
- Consumes: `Profile` (`lib/domain/profiles.ts`), `canViewCompanyOverview` (`lib/domain/permissions.ts`), `ForbiddenError` (`lib/domain/errors.ts`) — all already imported in this file.
- Produces: `WeeklyTrend` type (`{ weekStart: string; completedTasks: number; newRequests: number }`) and `getTaskRequestTrends(profile: Profile, weeks: number): Promise<WeeklyTrend[]>` — Task 3 (dashboard) and Task 5 (`/reports` page) both import and call this exact function; Task 2 (chart component) imports the `WeeklyTrend` type.

- [ ] **Step 1: Write the failing tests**

In `lib/domain/reports.test.ts`, add a new `describe` block at the end of the file (after the existing `avgRequestCompletionTime / workflowCompletionRate` block), following the same fixture pattern as the file's other blocks:

```ts
describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("getTaskRequestTrends", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  let otherCompanyId: string;
  const createdAuthUserIds: string[] = [];
  let opsManager: Profile;
  let employee: Profile;

  function mondayStartOf(date: Date): string {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = d.getUTCDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (trends)", slug: "test-co-trends" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: otherCompany, error: otherCompanyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (trends, other)", slug: "test-co-trends-other" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (otherCompanyError) throw otherCompanyError;
    otherCompanyId = otherCompany.id;

    const { data: opsManagerAuthUser, error: opsManagerAuthError } =
      await supabase.auth.admin.createUser({
        email: `trends-test-ops-${crypto.randomUUID()}@example.com`,
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
        email: `trends-test-employee-${crypto.randomUUID()}@example.com`,
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
      .in("company_id", [companyId, otherCompanyId]);
    if (tasksDeleteError) throw tasksDeleteError;

    const { error: requestsDeleteError } = await supabase
      .from("requests")
      .delete()
      .in("company_id", [companyId, otherCompanyId]);
    if (requestsDeleteError) throw requestsDeleteError;

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
    await expect(getTaskRequestTrends(employee, 6)).rejects.toThrow(ForbiddenError);
  });

  it("returns exactly `weeks` buckets, zero-filled, ending with the current week", async () => {
    const result = await getTaskRequestTrends(opsManager, 6);
    expect(result).toHaveLength(6);
    expect(result[5].weekStart).toBe(mondayStartOf(new Date()));
    for (const bucket of result) {
      expect(bucket.completedTasks).toBeGreaterThanOrEqual(0);
      expect(bucket.newRequests).toBeGreaterThanOrEqual(0);
    }
  });

  it("counts a task completed today in the current week's bucket, and a request created today in the current week's bucket", async () => {
    const { error: taskError } = await supabase.from("tasks").insert({
      company_id: companyId,
      title: "Trend task",
      status: "completed",
      priority: "medium",
      completed_at: new Date().toISOString(),
    });
    if (taskError) throw taskError;

    const { error: requestError } = await supabase.from("requests").insert({
      company_id: companyId,
      title: "Trend request",
      category: "general",
      status: "submitted",
      created_at: new Date().toISOString(),
    });
    if (requestError) throw requestError;

    const result = await getTaskRequestTrends(opsManager, 6);
    const currentWeek = result[5];
    expect(currentWeek.completedTasks).toBeGreaterThanOrEqual(1);
    expect(currentWeek.newRequests).toBeGreaterThanOrEqual(1);
  });

  it("places a task completed at the very start of a week (Monday 00:00 UTC) in that week, not the previous one", async () => {
    const thisMonday = new Date(`${mondayStartOf(new Date())}T00:00:00.000Z`);
    const { error: taskError } = await supabase.from("tasks").insert({
      company_id: companyId,
      title: "Boundary task",
      status: "completed",
      priority: "medium",
      completed_at: thisMonday.toISOString(),
    });
    if (taskError) throw taskError;

    const result = await getTaskRequestTrends(opsManager, 6);
    expect(result[5].completedTasks).toBeGreaterThanOrEqual(1);
    // The previous week's bucket must NOT have picked this up.
    const previousWeekStart = new Date(thisMonday);
    previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);
    expect(result[4].weekStart).toBe(previousWeekStart.toISOString().slice(0, 10));
  });

  it("never counts another company's tasks or requests", async () => {
    const { error: taskError } = await supabase.from("tasks").insert({
      company_id: otherCompanyId,
      title: "Other company task",
      status: "completed",
      priority: "medium",
      completed_at: new Date().toISOString(),
    });
    if (taskError) throw taskError;

    const { error: requestError } = await supabase.from("requests").insert({
      company_id: otherCompanyId,
      title: "Other company request",
      category: "general",
      status: "submitted",
      created_at: new Date().toISOString(),
    });
    if (requestError) throw requestError;

    const beforeResult = await getTaskRequestTrends(opsManager, 6);
    const afterResult = await getTaskRequestTrends(opsManager, 6);
    expect(afterResult[5].completedTasks).toBe(beforeResult[5].completedTasks);
    expect(afterResult[5].newRequests).toBe(beforeResult[5].newRequests);
  });
});
```

Add the new imports this block needs at the top of `lib/domain/reports.test.ts`:

```ts
import { getTaskRequestTrends } from "@/lib/domain/reports";
```

(the file already imports `createSupabaseAdminClient`, `createProfile`, `Profile`, `ForbiddenError`, `afterAll`/`beforeAll`/`describe`/`expect`/`it` — reuse those, don't re-import.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run lib/domain/reports.test.ts`
Expected: FAIL — `getTaskRequestTrends` is not exported yet.

- [ ] **Step 3: Write the implementation**

In `lib/domain/reports.ts`, add near the top (after the existing `TaskStatistics` interface, before `requestsByDepartment`):

```ts
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
```

Note: `.gte("completed_at", ...)` on a nullable column already excludes `null` rows at the database level (Postgres/PostgREST comparisons against `null` are never true) — no separate not-null filter is needed, and no `status = 'completed'` filter is needed either, since `completed_at` is only ever set when a task transitions to `"completed"` and is never cleared afterward (per `updateTaskStatus` in `lib/domain/tasks.ts`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run lib/domain/reports.test.ts`
Expected: PASS (all tests in this file, including the 4 existing describe blocks — unaffected by this change).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/reports.ts lib/domain/reports.test.ts
git commit -m "$(cat <<'EOF'
feat: add getTaskRequestTrends for weekly task/request trend data

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `TaskRequestTrendChart` component

**Files:**
- Create: `components/reports/task-request-trend-chart.tsx`
- Create: `components/reports/task-request-trend-chart.test.tsx`

**Interfaces:**
- Consumes: `WeeklyTrend` (Task 1).
- Produces: `TaskRequestTrendChart({ data: WeeklyTrend[] })` — Task 4 (dashboard) and Task 5 (`/reports`) both render this component.

- [ ] **Step 1: Write the failing test**

Create `components/reports/task-request-trend-chart.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaskRequestTrendChart } from "@/components/reports/task-request-trend-chart";
import type { WeeklyTrend } from "@/lib/domain/reports";

const sampleData: WeeklyTrend[] = [
  { weekStart: "2026-08-31", completedTasks: 4, newRequests: 2 },
  { weekStart: "2026-09-07", completedTasks: 6, newRequests: 3 },
  { weekStart: "2026-09-14", completedTasks: 0, newRequests: 0 },
];

describe("TaskRequestTrendChart", () => {
  it("renders the card title", () => {
    render(<TaskRequestTrendChart data={sampleData} />);
    expect(screen.getByText("Tasks Completed & Requests Received, by Week")).toBeInTheDocument();
  });

  it("renders without crashing when every week is zero", () => {
    render(
      <TaskRequestTrendChart
        data={[{ weekStart: "2026-09-14", completedTasks: 0, newRequests: 0 }]}
      />
    );
    expect(screen.getByText("Tasks Completed & Requests Received, by Week")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run components/reports/task-request-trend-chart.test.tsx`
Expected: FAIL — the component file doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `components/reports/task-request-trend-chart.tsx`:

```tsx
"use client";

import { CartesianGrid, Line, LineChart, XAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { WeeklyTrend } from "@/lib/domain/reports";

const chartConfig = {
  completedTasks: { label: "Completed Tasks", color: "var(--chart-1)" },
  newRequests: { label: "New Requests", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function TaskRequestTrendChart({ data }: { data: WeeklyTrend[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tasks Completed &amp; Requests Received, by Week</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <LineChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="weekStart" tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              type="monotone"
              dataKey="completedTasks"
              stroke="var(--color-completedTasks)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="newRequests"
              stroke="var(--color-newRequests)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run components/reports/task-request-trend-chart.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add components/reports/task-request-trend-chart.tsx components/reports/task-request-trend-chart.test.tsx
git commit -m "$(cat <<'EOF'
feat: add TaskRequestTrendChart component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Dashboard domain integration — `CompanyOverview.taskRequestTrends`

**Files:**
- Modify: `lib/domain/dashboard.ts`
- Modify: `lib/domain/dashboard.test.ts`
- Modify: `components/dashboard/dashboard-view.test.tsx`

**Interfaces:**
- Consumes: `getTaskRequestTrends`, `WeeklyTrend` (Task 1).
- Produces: `CompanyOverview.taskRequestTrends: WeeklyTrend[]` — Task 4 (`CompanySection` component) reads this field.

- [ ] **Step 1: Write the failing test**

In `lib/domain/dashboard.test.ts`, add this test to the existing `describe.skipIf(...)("getCompanyOverview", ...)` block (after the last existing `it(...)` in that block, before its closing `});`):

```ts
  it("includes a 6-week taskRequestTrends array, most recent week last", async () => {
    const overview = await getCompanyOverview(opsManager);
    expect(overview.taskRequestTrends).toHaveLength(6);
    expect(overview.taskRequestTrends[5].weekStart >= overview.taskRequestTrends[0].weekStart).toBe(
      true
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/domain/dashboard.test.ts`
Expected: FAIL — `overview.taskRequestTrends` is `undefined`, `.toHaveLength(6)` fails.

- [ ] **Step 3: Write the implementation**

In `lib/domain/dashboard.ts`:

Add to the imports:

```ts
import { getTaskRequestTrends, type WeeklyTrend } from "@/lib/domain/reports";
```

Add `taskRequestTrends` to the `CompanyOverview` interface:

```ts
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
  taskRequestTrends: WeeklyTrend[];
}
```

In `getCompanyOverview`, after the existing `departmentActivity` computation (right before the function's final `return`), add:

```ts
  const taskRequestTrends = await getTaskRequestTrends(profile, 6);
```

And add it to the returned object:

```ts
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
    taskRequestTrends,
  };
```

`getTaskRequestTrends` re-checks `canViewCompanyOverview` internally — redundant with the check already at the top of `getCompanyOverview`, but matches this file's own established pattern of every reports-style function self-guarding rather than trusting a caller already checked. Not worth special-casing away.

- [ ] **Step 4: Fix the pre-existing `dashboard-view.test.tsx` fixtures**

`components/dashboard/dashboard-view.test.tsx` has two tests that hand-construct a full mocked `CompanyOverview` JSON response (`"fetches the company overview when canViewCompany is true"` and `"links company totals and department rows to their filtered list views"`). Both now need `taskRequestTrends: []` added alongside their existing `activeOperations`/`departmentActivity` fields, or `CompanySection`'s new chart (wired in Task 4) will receive `data: undefined` in these tests once Task 4 lands.

In the first fixture (inside `"fetches the company overview when canViewCompany is true"`):

```ts
            activeOperations: [
              { id: "op-1", title: "Vienna Office Relocation", completedTasks: 3, totalTasks: 4 },
            ],
            departmentActivity: [],
            taskRequestTrends: [],
```

In the second fixture (inside `"links company totals and department rows to their filtered list views"`):

```ts
            activeOperations: [],
            departmentActivity: [
              { departmentId: "dept-1", name: "IT", openTasks: 4, openRequests: 1 },
            ],
            taskRequestTrends: [],
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run lib/domain/dashboard.test.ts components/dashboard/dashboard-view.test.tsx`
Expected: PASS (all tests in both files).

- [ ] **Step 6: Commit**

```bash
git add lib/domain/dashboard.ts lib/domain/dashboard.test.ts components/dashboard/dashboard-view.test.tsx
git commit -m "$(cat <<'EOF'
feat: add taskRequestTrends to CompanyOverview

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wire `TaskRequestTrendChart` into the dashboard company section

**Files:**
- Modify: `components/dashboard/company-section.tsx`

**Interfaces:**
- Consumes: `TaskRequestTrendChart` (Task 2), `CompanyOverview.taskRequestTrends` (Task 3).

No new test file for this task — `components/dashboard/company-section.tsx` has no dedicated test file today (confirmed during planning: only `dashboard-view.tsx`-level and domain-level tests exist for this area), and this change is a single new line rendering an already-tested component (Task 2) with already-plumbed data (Task 3, which also updated `dashboard-view.test.tsx`'s fixtures so rendering `CompanySection` in that file's existing tests won't break). Matches this repo's established convention of not adding a dedicated test file solely to prove one more child component renders inside an existing, larger, indirectly-tested layout component.

- [ ] **Step 1: Add the import**

In `components/dashboard/company-section.tsx`, add:

```ts
import { TaskRequestTrendChart } from "@/components/reports/task-request-trend-chart";
```

- [ ] **Step 2: Render the chart**

In the same file, add the chart between the `ActiveOperationsCard` and the `Department Activity` `Card` (i.e., right after the `<ActiveOperationsCard operations={overview.activeOperations} />` line):

```tsx
      <TaskRequestTrendChart data={overview.taskRequestTrends} />
```

The full relevant section should read:

```tsx
      <ActiveOperationsCard operations={overview.activeOperations} />

      <TaskRequestTrendChart data={overview.taskRequestTrends} />

      <Card>
        <CardHeader>
          <CardTitle>Department Activity</CardTitle>
        </CardHeader>
```

- [ ] **Step 3: Run the existing dashboard component/integration tests**

Run: `pnpm vitest run components/dashboard`
Expected: PASS (nothing in this directory's existing tests exercises `CompanySection` directly today, per the note above — this step confirms the change didn't break anything that does depend on this file, e.g. `dashboard-view.test.tsx` if it renders `CompanySection`).

- [ ] **Step 4: Run the TypeScript compiler**

Run: `npx tsc --noEmit`
Expected: zero new errors (the one pre-existing, unrelated `app/layout.tsx(24,50)` error is expected and not yours to fix).

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/company-section.tsx
git commit -m "$(cat <<'EOF'
feat: show the task/request trend chart on the dashboard

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Wire the trend chart into `/reports`

**Files:**
- Modify: `app/(app)/reports/page.tsx`
- Modify: `app/(app)/reports/page.test.tsx`

**Interfaces:**
- Consumes: `getTaskRequestTrends` (Task 1), `TaskRequestTrendChart` (Task 2).

- [ ] **Step 1: Write the failing test**

In `app/(app)/reports/page.test.tsx`, add `getTaskRequestTrends` to the mocked `@/lib/domain/reports` module:

```ts
vi.mock("@/lib/domain/reports", () => ({
  requestsByDepartment: vi.fn().mockResolvedValue([]),
  avgRequestCompletionTime: vi.fn().mockResolvedValue([]),
  taskStatistics: vi.fn().mockResolvedValue({ open: 0, completed: 0, overdue: 0 }),
  workflowCompletionRate: vi.fn().mockResolvedValue([]),
  getTaskRequestTrends: vi.fn().mockResolvedValue([]),
}));
```

Add this new test inside the existing `describe("ReportsPage", ...)` block, after the `"renders the report sections for an operations_manager"` test:

```ts
  it("renders the task/request trend chart with 12 weeks of data", async () => {
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
      invitedEmail: null,
      status: "active",
    });
    const trends = Array.from({ length: 12 }, (_, i) => ({
      weekStart: `2026-0${(i % 9) + 1}-01`,
      completedTasks: i,
      newRequests: i + 1,
    }));
    const { getTaskRequestTrends } = await import("@/lib/domain/reports");
    vi.mocked(getTaskRequestTrends).mockResolvedValue(trends);

    const element = await ReportsPage();
    render(element);

    expect(screen.getByText("Tasks Completed & Requests Received, by Week")).toBeInTheDocument();
    expect(getTaskRequestTrends).toHaveBeenCalledWith(
      expect.objectContaining({ id: "profile-1" }),
      12
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run "app/(app)/reports/page.test.tsx"`
Expected: FAIL — `getTaskRequestTrends` is not called by the page yet, and the chart's title text isn't in the rendered output.

- [ ] **Step 3: Write the implementation**

In `app/(app)/reports/page.tsx`, update the imports:

```ts
import {
  avgRequestCompletionTime,
  getTaskRequestTrends,
  requestsByDepartment,
  taskStatistics,
  workflowCompletionRate,
} from "@/lib/domain/reports";
import { TaskRequestTrendChart } from "@/components/reports/task-request-trend-chart";
```

Add the new fetch to the existing `Promise.all`:

```ts
  const [
    requestsByDepartmentData,
    avgRequestCompletionTimeData,
    taskStatisticsData,
    workflowCompletionRateData,
    taskRequestTrendsData,
  ] = await Promise.all([
    requestsByDepartment(profile),
    avgRequestCompletionTime(profile),
    taskStatistics(profile),
    workflowCompletionRate(profile),
    getTaskRequestTrends(profile, 12),
  ]);
```

Render the new section (full width, above the existing two 2-column grids):

```tsx
  return (
    <div>
      <BackLink href="/dashboard" />
      <h1 className="text-2xl font-semibold mb-4 mt-2">Reports</h1>
      <div className="flex flex-col gap-4">
        <TaskRequestTrendChart data={taskRequestTrendsData} />
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run "app/(app)/reports/page.test.tsx"`
Expected: PASS (all tests in this file, including the pre-existing 4-section tests — unaffected by the new section).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/reports/page.tsx" "app/(app)/reports/page.test.tsx"
git commit -m "$(cat <<'EOF'
feat: add 12-week task/request trend section to /reports

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Demo-activity seed script

**Files:**
- Modify: `lib/domain/seed.ts`
- Create: `scripts/seed-demo-activity.ts`
- Create: `lib/domain/seed.demo-activity.test.ts`

**Interfaces:**
- Consumes: `createProfile` (`lib/domain/profiles.ts`), `createSupabaseAdminClient` (`lib/supabase/admin.ts`), `ALPENTECH_SLUG`/`ALPENTECH_DEPARTMENTS` (already exported from `lib/domain/seed.ts`), `TASK_PRIORITIES` (`lib/domain/task-status.ts`), `RequestCategory`/`RequestStatus` (`lib/domain/request-status.ts`), `Role` (`lib/validation/auth.ts`).
- Produces: `seedDemoActivity(companySlug?: string): Promise<{ employeesCreated: number; tasksCreated: number; requestsCreated: number }>` (defaults to `ALPENTECH_SLUG`) — invoked by `scripts/seed-demo-activity.ts` and, for real, by Task 7; not consumed by any other task in this plan.

**Context:** This task's own test must NOT touch the real "AlpenTech Industries" company — it proves the idempotency logic against an isolated test company, exactly like every other integration test in this repo (`lib/domain/reports.test.ts`, `lib/domain/dashboard.test.ts`, etc. all create their own `Test Co (...)` fixture rather than touching real seed data). `seedDemoActivity` therefore takes the target company's slug as a parameter, defaulting to `ALPENTECH_SLUG` so the real run (Task 7, only after explicit human approval — same precedent as the `profiles.invited_email` migration in the admin-user-management plan) doesn't need to pass anything. This task only writes and tests the code; it never runs `seedDemoActivity()` against the real project.

- [ ] **Step 1: Write the failing idempotency test**

Create `lib/domain/seed.demo-activity.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { seedDemoActivity, DEMO_EMPLOYEE_MARKER_PREFIX } from "@/lib/domain/seed";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("seedDemoActivity", () => {
  const supabase = createSupabaseAdminClient();
  const testSlug = "test-co-demo-activity";
  let companyId: string;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (demo activity)", slug: testSlug }, { onConflict: "slug" })
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;
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

    const { error: profilesDeleteError } = await supabase
      .from("profiles")
      .delete()
      .eq("company_id", companyId);
    if (profilesDeleteError) throw profilesDeleteError;
  });

  it("is idempotent: running it twice does not double the demo employee or task/request count", async () => {
    const first = await seedDemoActivity(testSlug);
    expect(first.employeesCreated).toBe(6);
    expect(first.tasksCreated).toBeGreaterThan(0);
    expect(first.requestsCreated).toBeGreaterThan(0);

    const second = await seedDemoActivity(testSlug);
    expect(second.employeesCreated).toBe(0); // second run finds the existing DEMO-* profiles, creates none
    expect(second.tasksCreated).toBe(0); // second run finds existing "[Demo]"-titled tasks, creates none
    expect(second.requestsCreated).toBe(0);

    const { data: demoProfiles, error: demoProfilesError } = await supabase
      .from("profiles")
      .select("id")
      .eq("company_id", companyId)
      .like("employee_number", `${DEMO_EMPLOYEE_MARKER_PREFIX}%`);
    if (demoProfilesError) throw demoProfilesError;
    // Exactly the employees created by the FIRST run — not double.
    expect(demoProfiles?.length).toBe(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/domain/seed.demo-activity.test.ts`
Expected: FAIL — `seedDemoActivity`/`DEMO_EMPLOYEE_MARKER_PREFIX` are not exported yet.

- [ ] **Step 3: Write the implementation**

In `lib/domain/seed.ts`, add these imports at the top (alongside the existing ones):

```ts
import { createProfile } from "@/lib/domain/profiles";
import { TASK_PRIORITIES } from "@/lib/domain/task-status";
import type { RequestCategory, RequestStatus } from "@/lib/domain/request-status";
import type { Role } from "@/lib/validation/auth";
```

Add this to the end of the file:

```ts
export const DEMO_EMPLOYEE_MARKER_PREFIX = "DEMO-";
const DEMO_WEEKS = 14;

interface DemoEmployeeSeed {
  employeeNumber: string;
  fullName: string;
  role: Role;
  department: string;
}

const DEMO_EMPLOYEES: DemoEmployeeSeed[] = [
  { employeeNumber: "DEMO-01", fullName: "Lena Fischer", role: "employee", department: "Engineering" },
  { employeeNumber: "DEMO-02", fullName: "Markus Weber", role: "employee", department: "Production" },
  { employeeNumber: "DEMO-03", fullName: "Sophie Gruber", role: "employee", department: "IT" },
  { employeeNumber: "DEMO-04", fullName: "Thomas Bauer", role: "manager", department: "Operations" },
  { employeeNumber: "DEMO-05", fullName: "Anna Hofer", role: "employee", department: "Sales" },
  { employeeNumber: "DEMO-06", fullName: "Paul Steiner", role: "employee", department: "Procurement" },
];

const DEMO_TASK_TITLES = [
  "Replace printer toner",
  "Update onboarding checklist",
  "Restock safety equipment",
  "Review supplier contract",
  "Fix conference room projector",
  "Audit software licenses",
  "Update department wiki page",
  "Prepare monthly status report",
];

const DEMO_REQUESTS: { title: string; category: RequestCategory }[] = [
  { title: "New laptop request", category: "equipment" },
  { title: "Software license renewal", category: "software" },
  { title: "VPN access request", category: "access" },
  { title: "Office chair replacement", category: "maintenance" },
  { title: "Office supplies order", category: "purchase" },
];

const DEMO_REQUEST_STATUSES: RequestStatus[] = [
  "submitted",
  "under_review",
  "approved",
  "in_progress",
  "completed",
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export async function seedDemoActivity(
  companySlug: string = ALPENTECH_SLUG
): Promise<{
  employeesCreated: number;
  tasksCreated: number;
  requestsCreated: number;
}> {
  const supabase = createSupabaseAdminClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .eq("slug", companySlug)
    .single();
  if (companyError) throw companyError;
  const companyId = company.id;

  const { data: existingDemoProfiles, error: existingDemoError } = await supabase
    .from("profiles")
    .select("id, department_id")
    .eq("company_id", companyId)
    .like("employee_number", `${DEMO_EMPLOYEE_MARKER_PREFIX}%`);
  if (existingDemoError) throw existingDemoError;

  const { data: departments, error: departmentsError } = await supabase
    .from("departments")
    .select("id, name")
    .eq("company_id", companyId);
  if (departmentsError) throw departmentsError;
  const departmentIdByName = new Map((departments ?? []).map((d) => [d.name, d.id]));

  let demoProfiles: { id: string; departmentId: string | null }[];
  let employeesCreated = 0;
  if ((existingDemoProfiles ?? []).length > 0) {
    demoProfiles = existingDemoProfiles!.map((p) => ({ id: p.id, departmentId: p.department_id }));
  } else {
    demoProfiles = [];
    for (const seed of DEMO_EMPLOYEES) {
      const profile = await createProfile({
        companyId,
        fullName: seed.fullName,
        role: seed.role,
        departmentId: departmentIdByName.get(seed.department) ?? null,
        employeeNumber: seed.employeeNumber,
      });
      demoProfiles.push({ id: profile.id, departmentId: profile.departmentId });
      employeesCreated += 1;
    }
  }

  const { count: existingDemoTaskCount, error: existingTasksError } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .like("title", "[Demo]%");
  if (existingTasksError) throw existingTasksError;

  if ((existingDemoTaskCount ?? 0) > 0) {
    return { employeesCreated, tasksCreated: 0, requestsCreated: 0 };
  }

  const now = new Date();
  const tasksToInsert: {
    company_id: string;
    title: string;
    status: "completed";
    priority: string;
    assignee_id: string;
    creator_id: string;
    department_id: string | null;
    completed_at: string;
    created_at: string;
  }[] = [];
  const requestsToInsert: {
    company_id: string;
    title: string;
    category: RequestCategory;
    status: RequestStatus;
    created_by: string;
    department_id: string | null;
    created_at: string;
  }[] = [];

  for (let weekOffset = DEMO_WEEKS - 1; weekOffset >= 0; weekOffset--) {
    const weekStart = new Date(now);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekOffset * 7);

    const completedTaskCount = randomInt(3, 8);
    for (let i = 0; i < completedTaskCount; i++) {
      const assignee = randomChoice(demoProfiles);
      const completedAt = new Date(weekStart);
      completedAt.setUTCDate(completedAt.getUTCDate() + randomInt(0, 6));
      const createdAt = new Date(completedAt);
      createdAt.setUTCDate(createdAt.getUTCDate() - randomInt(1, 5));

      tasksToInsert.push({
        company_id: companyId,
        title: `[Demo] ${randomChoice(DEMO_TASK_TITLES)}`,
        status: "completed",
        priority: randomChoice(TASK_PRIORITIES),
        assignee_id: assignee.id,
        creator_id: assignee.id,
        department_id: assignee.departmentId,
        completed_at: completedAt.toISOString(),
        created_at: createdAt.toISOString(),
      });
    }

    const newRequestCount = randomInt(2, 5);
    for (let i = 0; i < newRequestCount; i++) {
      const creator = randomChoice(demoProfiles);
      const createdAt = new Date(weekStart);
      createdAt.setUTCDate(createdAt.getUTCDate() + randomInt(0, 6));
      const { title, category } = randomChoice(DEMO_REQUESTS);

      requestsToInsert.push({
        company_id: companyId,
        title: `[Demo] ${title}`,
        category,
        status: randomChoice(DEMO_REQUEST_STATUSES),
        created_by: creator.id,
        department_id: creator.departmentId,
        created_at: createdAt.toISOString(),
      });
    }
  }

  const { error: tasksInsertError } = await supabase.from("tasks").insert(tasksToInsert);
  if (tasksInsertError) throw tasksInsertError;

  const { error: requestsInsertError } = await supabase.from("requests").insert(requestsToInsert);
  if (requestsInsertError) throw requestsInsertError;

  return {
    employeesCreated,
    tasksCreated: tasksToInsert.length,
    requestsCreated: requestsToInsert.length,
  };
}
```

Create `scripts/seed-demo-activity.ts`, matching `scripts/seed.ts`'s exact existing convention (`dotenv`'s `config` function loading `.env.local`, then-chained with `process.exit`, not top-level `await`):

```ts
import { config as loadEnv } from "dotenv";
import { seedDemoActivity } from "@/lib/domain/seed";

loadEnv({ path: ".env.local" });

seedDemoActivity()
  .then((result) => {
    console.log(
      `Demo activity seeded: ${result.employeesCreated} employees, ${result.tasksCreated} tasks, ${result.requestsCreated} requests created (0 for any of these means it had already run).`
    );
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/domain/seed.demo-activity.test.ts`
Expected: PASS. This test runs entirely against the isolated `test-co-demo-activity` fixture company created in `beforeAll` and torn down in `afterAll` — it never touches "AlpenTech Industries" or the real hosted project's actual demo data, so this step needs no special approval, same as any other gated integration test in this repo.

- [ ] **Step 5: Run the full unit+integration suite once**

Run: `pnpm test:unit && pnpm test:integration`
Expected: PASS (or the same pre-existing live-DB-latency flakiness pattern documented in prior plans' verification tasks — unrelated files timing out is not a regression from this task).

- [ ] **Step 6: Commit**

```bash
git add lib/domain/seed.ts scripts/seed-demo-activity.ts lib/domain/seed.demo-activity.test.ts
git commit -m "$(cat <<'EOF'
feat: add idempotent demo-activity seed for task/request trends

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Whole-branch verification

**Files:** none (verification only), plus `docs/STATUS.md`

- [ ] **Step 1: Run the full unit + integration test suite**

Run: `pnpm test:unit && pnpm test:integration`
Expected: PASS, 0 failures.

- [ ] **Step 2: Run the TypeScript compiler**

Run: `npx tsc --noEmit`
Expected: clean except the one pre-existing, unrelated `app/layout.tsx(24,50)` error — confirm it's still the *only* one.

- [ ] **Step 3: Run the linter**

Run: `pnpm lint`
Expected: no new errors beyond this repo's known pre-existing 3 (`components/notification-bell.tsx`, `hooks/use-mobile.ts`, `lib/realtime/use-broadcast-listener.ts`) — confirm the count and file list match exactly, not more.

- [ ] **Step 4: Run a production build**

Run: `pnpm build`
Expected: succeeds cleanly.

- [ ] **Step 5: Run the demo-activity seed against the real project — only after explicit human approval**

This is the one step in this plan that writes real data to the live hosted Supabase project outside of normal app usage. Stop here and get the human operator's explicit go-ahead before running it, per this plan's Global Constraints — do not run it unattended, and do not substitute a different environment or a test-only company for this step.

Once approved, run: `npx tsx scripts/seed-demo-activity.ts` (loads `.env.local`, same as `scripts/seed.ts`). Expected output: `Demo activity seeded: 6 employees, N tasks, M requests created` with `N` and `M` both greater than 0 on a first run (or all `0`s if it was already run before — that's success too, per Task 6's idempotency guarantee, not a failure to investigate).

- [ ] **Step 6: Confirm the demo data looks right**

Query the live hosted project (`yqzcunssgvffischmwle`) to confirm: "AlpenTech Industries" has 6 profiles with `employee_number` starting `DEMO-`, and `tasks`/`requests` both have rows with a `[Demo]`-prefixed `title` spread across roughly the last 14 weeks. Spot-check that calling `getTaskRequestTrends` for that company (e.g. via a scratch script, or by observing the dashboard/`/reports` pages once deployed) returns non-zero values for most recent weeks, not all zeros.

- [ ] **Step 7: Flag for human follow-up**

No manual browser click-through was possible in this environment (same limitation as every prior phase in this project) — a visual check of both the dashboard widget and the `/reports` section (chart renders sensibly, tooltip works, looks right in both light and dark mode) is worth doing post-merge, especially since this is the first line/time-series chart in the app (every prior chart is a bar chart).

- [ ] **Step 8: Update `docs/STATUS.md`**

Move the "Admin dashboard statistics" entry from In Progress to Review, following this file's existing entry format (see the most recent Finished/Review entries for the pattern: what changed, what review found, test/build status, the Step 7 human-follow-up flag, and a note that live demo data was seeded into AlpenTech Industries as part of this work, per Step 5).
