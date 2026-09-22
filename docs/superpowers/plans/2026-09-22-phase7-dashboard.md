# Phase 7 — Dashboard / Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder at `app/(app)/dashboard/page.tsx` with the real Overview — a personal section for every authenticated user and a company section for `operations_manager`/`admin` only — built from the shadcn `dashboard-01` block and aggregating data Phases 2–6 already produce. No new tables, columns or migrations.

**Architecture:** Server page resolves the profile and redirects if unauthenticated; a client `DashboardView` component fetches `/api/dashboard/personal` (always) and `/api/dashboard/company` (only when the profile is allowed to view it) via React Query, and listens on four company-scoped Realtime broadcast channels to invalidate those queries. Two new domain functions (`getPersonalOverview`, `getCompanyOverview`) do the aggregation, reusing existing domain modules and following the same `createSupabaseAdminClient()` + `Promise.all` shape as `getOperation`.

**Tech Stack:** Next.js App Router, Supabase (Postgres + Realtime), React Query, Zod, shadcn/ui (`dashboard-01` block, Base UI variant), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-22-phase7-dashboard-design.md`

## Global Constraints

- No new tables, columns or migrations (spec §1, §8).
- Company section gated to `operations_manager` and `admin` only, via `lib/domain/permissions.ts`'s existing `ELEVATED_ROLES` set (spec §2, §4) — not the wider `COMPANY_WIDE_VIEW_ROLES` set used elsewhere.
- Every mutation-free domain read still enforces authorization in the domain layer, never in the frontend (`docs/architecture.md` §5). `getCompanyOverview` throws `ForbiddenError` before querying anything.
- `activity_log` has no `company_id` column and is not getting one in this phase (spec §3) — company scoping for `recentActivity` happens via a local helper that cross-checks ids against each entity's own table.
- `requests` has no due-date column; "overdue" is defined as *open and created more than 7 days ago* (spec §3), via a named constant.
- `/dashboard` is a root of the authenticated app — no `BackLink` (`CLAUDE.md` §UI).
- Follow the repo's existing loading/error convention for list views — a plain `<p className="text-muted-foreground">Loading …</p>` / `<p className="text-red-600">Failed to load …</p>` pair keyed off React Query's `isLoading`/`error` (see `components/operations/operation-list-view.tsx:100-101`) — not the `skeleton` primitive the spec's UI section mentions in passing. This keeps the dashboard consistent with every other screen in the app; the `skeleton` component still gets installed for the later UI sweep, it's just not used here.

## Review Focus

- **Cross-company leakage in `recentActivity`.** `activity_log` has no `company_id`; a naive company-wide query without the id-filtering step in Task 3 would leak another company's activity onto the dashboard. Task 3's tests must include a second company's activity row and assert it never appears.
- **A user with no data yet.** A freshly signed-up employee with zero tasks, zero requests, zero approvals must get an overview with all-zero counts and empty lists, not a thrown error or `null`/`undefined` crash in the UI. Covered in Task 3 (domain: all-zero response) and Task 9 (component: renders zero-state without crashing).
- **Elevated role calling the personal endpoint.** `operations_manager`/`admin` still get a personal section — `getPersonalOverview` has no role check at all, so nothing gates it, but that "always works" claim needs a test, not just an absence of code. Covered in Task 4 (domain: `getPersonalOverview(opsManager)` resolves) and Task 9 (component: the `canViewCompany: true` case still renders "My Tasks", proving the personal query isn't skipped when the company one runs).
- **Non-elevated role hitting `/api/dashboard/company` directly** (not just failing to render the button). Must 403, not 500 or 200. This composes from two already-covered pieces rather than needing a new route-level test: Task 4's domain test asserts `getCompanyOverview` throws `ForbiddenError` for a non-elevated role, and `lib/api/error-response.test.ts` (pre-existing, unmodified by this plan) already asserts `toErrorResponse` maps `ForbiddenError` to 403 — the company route (Task 6) does nothing but call `toErrorResponse(error)` on whatever the domain layer throws, identically to every other route in this codebase.
- **Operation with zero linked tasks in `activeOperations`.** `completedTasks / totalTasks` with `totalTasks === 0` must not divide by zero in the UI (the existing operation detail page already guards this at `app/(app)/operations/[id]/page.tsx:47-50`; the dashboard's card must apply the same guard). Covered in Task 4 (domain: zero-task operation still lists with `totalTasks: 0`) and Task 10 (component: renders "0%" not `NaN%`).

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/domain/dashboard.ts` | New. `getPersonalOverview`, `getCompanyOverview`, and the private helpers they need (`filterActivityByCompany`, date-bucket math). |
| `lib/domain/dashboard.test.ts` | New. Integration tests against real Supabase. |
| `lib/domain/permissions.ts` | Modify. Add `canViewCompanyOverview`. |
| `lib/domain/permissions.test.ts` | Modify. Add its test block. |
| `app/api/dashboard/personal/route.ts` | New. `GET`. |
| `app/api/dashboard/company/route.ts` | New. `GET`. |
| `app/(app)/dashboard/page.tsx` | Modify. Server component, replaces the placeholder. |
| `components/dashboard/dashboard-view.tsx` | New. Client. Owns both queries + broadcast subscriptions. |
| `components/dashboard/dashboard-view.test.tsx` | New. |
| `components/dashboard/summary-cards.tsx` | New. |
| `components/dashboard/my-tasks-card.tsx` | New. |
| `components/dashboard/recent-activity-card.tsx` | New. |
| `components/dashboard/upcoming-card.tsx` | New. |
| `components/dashboard/company-section.tsx` | New. |
| `components/dashboard/active-operations-card.tsx` | New. |
| `components/ui/*.tsx` (several) | New, from the shadcn block — see Task 1. |
| `lib/utils.ts` | Deleted — see Task 1. |
| `package.json` / `pnpm-lock.yaml` | Modified by the block install — see Task 1. |

---

### Task 1: Pull the shadcn `dashboard-01` block and prune it to what this phase needs

This is a mechanical, investigated-in-advance task — every file it touches is already known. Do not run `npx shadcn add dashboard-01` "and see what happens"; follow the steps below, which already account for what the CLI does on this project (Base UI variant, `style: base-nova`, verified against the live registry on 2026-09-22).

**What the command does, so the deletions below aren't a surprise:**
- Writes a *second*, unrelated dashboard page at `app/dashboard/page.tsx` (outside the `(app)` route group this project actually uses) plus `app/dashboard/data.json`. Both get deleted — they are not our route.
- Adds `components/app-sidebar.tsx`, `components/chart-area-interactive.tsx`, `components/data-table.tsx`, `components/nav-documents.tsx`, `components/nav-main.tsx`, `components/nav-secondary.tsx`, `components/nav-user.tsx`, `components/section-cards.tsx`, `components/site-header.tsx`, `hooks/use-mobile.ts` and `components/ui/sidebar.tsx`. This project already has its own authenticated shell (`app/(app)/layout.tsx`) and doesn't want the block's sidebar/kanban-table demo — all of these get deleted. (`components/section-cards.tsx` is a fake-revenue demo card; Task 8 writes a real `components/dashboard/summary-cards.tsx` inspired by its layout, not this file.)
- Adds every other `components/ui/*.tsx` primitive the block depends on (`avatar`, `breadcrumb`, `chart`, `checkbox`, `drawer`, `dropdown-menu`, `select`, `separator`, `sheet`, `skeleton`, `sonner`, `tabs`, `toggle`, `toggle-group`, `tooltip`). These are kept even though this phase doesn't use most of them — they're exactly what the later UI-sweep backlog item (`docs/STATUS.md`) will need, and `chart` + `recharts` is what Phase 8's reports will need.
- **Overwrites** the 6 already-installed primitives (`button`, `input`, `label`, `card`, `table`, `badge`) with byte-identical content **except** each one's `cn` import changes from `import { cn } from "@/lib/utils"` to `import { cn } from "cn"` — the live shadcn registry now ships a standalone `cn` package instead of re-exporting it from the project's own `lib/utils.ts`. This is real (verified live, not assumed), and after it, `lib/utils.ts` has zero remaining importers, so it gets deleted in this task rather than left dead.
- Adds 7 npm dependencies. `recharts`, `sonner`, `next-themes` and `cn` are kept — `recharts`+`cn` because kept primitives need them (`chart.tsx`, every primitive respectively), `sonner`+`next-themes` because the kept `components/ui/sonner.tsx` needs them. `@dnd-kit/core`, `@dnd-kit/modifiers`, `@dnd-kit/sortable`, `@dnd-kit/utilities` and `@tanstack/react-table` are uninstalled — their only consumer was `components/data-table.tsx`, which this task deletes.

- [ ] **Step 1: Run the CLI**

```bash
npx shadcn@latest add dashboard-01 -y -o
```

Answer/flags: `-y` skips the initial confirmation, `-o` overwrites the 6 existing primitives without an interactive per-file prompt.

- [ ] **Step 2: Delete the stray route and the discarded composite components**

```bash
rm -rf app/dashboard
rm -f components/app-sidebar.tsx components/chart-area-interactive.tsx components/data-table.tsx \
      components/nav-documents.tsx components/nav-main.tsx components/nav-secondary.tsx \
      components/nav-user.tsx components/section-cards.tsx components/site-header.tsx \
      components/ui/sidebar.tsx
rm -rf hooks
```

- [ ] **Step 3: Uninstall the now-unused block dependencies**

```bash
npm uninstall @dnd-kit/core @dnd-kit/modifiers @dnd-kit/sortable @dnd-kit/utilities @tanstack/react-table
```

- [ ] **Step 4: Confirm `lib/utils.ts` has no remaining importers, then delete it**

```bash
grep -rl "lib/utils" --exclude-dir=node_modules . | grep -v node_modules
```

Expected output: only `components.json` (the `"utils": "@/lib/utils"` alias — harmless to leave; nothing resolves it anymore since every installed primitive now imports from the `cn` package directly) and this plan file itself. No `.ts`/`.tsx` source file should appear. If one does, stop and check what it imports from `lib/utils` before deleting — it may need updating instead.

```bash
rm lib/utils.ts
```

- [ ] **Step 5: Verify the app still builds and every existing test still passes**

```bash
npm run lint
npm run test:unit
```

Expected: lint clean, all existing unit tests pass unchanged (the 6 overwritten primitives are byte-identical apart from the `cn` import, so no component test's rendered output should change).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: pull shadcn dashboard-01 block, prune to app's needs

Installs the block, discards its sidebar/site-header/kanban data-table
(the app already has its own authenticated shell), and removes the
now-unused @dnd-kit/@tanstack/react-table dependencies that only the
discarded data-table needed. The overwrite of the 6 existing
primitives (button/input/label/card/table/badge) is content-identical
except each one's cn import now comes from the standalone cn package
instead of lib/utils.ts, which is deleted as a result — nothing else
imported it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `canViewCompanyOverview` permission

**Files:**
- Modify: `lib/domain/permissions.ts`
- Test: `lib/domain/permissions.test.ts`

**Interfaces:**
- Produces: `canViewCompanyOverview(profile: Profile): boolean` — `true` for `operations_manager`/`admin`, `false` otherwise.

- [ ] **Step 1: Write the failing test**

Add near the end of `lib/domain/permissions.test.ts` (alongside the existing `canCreateOperation`/`canManageOperation`/`canViewOperation` block, using the file's existing `makeProfile` helper):

```ts
describe("canViewCompanyOverview", () => {
  it("allows operations_manager and admin, denies every other role", () => {
    expect(canViewCompanyOverview(makeProfile({ role: "operations_manager" }))).toBe(true);
    expect(canViewCompanyOverview(makeProfile({ role: "admin" }))).toBe(true);
    expect(canViewCompanyOverview(makeProfile({ role: "employee" }))).toBe(false);
    expect(canViewCompanyOverview(makeProfile({ role: "manager" }))).toBe(false);
    expect(canViewCompanyOverview(makeProfile({ role: "it" }))).toBe(false);
    expect(canViewCompanyOverview(makeProfile({ role: "hr" }))).toBe(false);
  });
});
```

Add `canViewCompanyOverview` to the existing `import { ... } from "@/lib/domain/permissions"` block at the top of the file (keep the list alphabetical, matching the file's existing style).

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit -- lib/domain/permissions.test.ts
```

Expected: FAIL — `canViewCompanyOverview` is not exported.

- [ ] **Step 3: Implement**

In `lib/domain/permissions.ts`, add after `canViewOperation`/`canCommentOnOperation` (the existing `ELEVATED_ROLES` const is already defined near the top of the file, reuse it):

```ts
export function canViewCompanyOverview(profile: Profile): boolean {
  return ELEVATED_ROLES.has(profile.role);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:unit -- lib/domain/permissions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/permissions.ts lib/domain/permissions.test.ts
git commit -m "feat: add canViewCompanyOverview permission

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `getPersonalOverview` domain function

**Files:**
- Create: `lib/domain/dashboard.ts`
- Test: `lib/domain/dashboard.test.ts`

**Interfaces:**
- Consumes: `Profile` (`lib/domain/profiles.ts`), `createSupabaseAdminClient` (`lib/supabase/admin.ts`), `TaskStatus`/`TaskPriority` (`lib/domain/task-status.ts`), `TASK_COLUMNS`/`toTask` (`lib/domain/tasks.ts`), `ActivityEntry` (`lib/domain/activity.ts`).
- Produces:
  ```ts
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
    recentActivity: import("@/lib/domain/activity").ActivityEntry[];
    upcoming: {
      overdue: number;
      dueToday: number;
      dueThisWeek: number;
    };
    unreadNotifications: number;
  }

  export async function getPersonalOverview(profile: Profile): Promise<PersonalOverview>;
  ```
  Later tasks (4, 6) import `PersonalOverview` and `getPersonalOverview` by these exact names.

Register this file in `package.json`'s test scripts the same way every other domain test is: add `lib/domain/dashboard.test.ts` to `test:integration`'s argument list, and add `--exclude "lib/domain/dashboard.test.ts"` to `test:unit`'s exclude list (Step 6 below does this).

- [ ] **Step 1: Write the failing tests**

Create `lib/domain/dashboard.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile, type Profile } from "@/lib/domain/profiles";
import { getPersonalOverview } from "@/lib/domain/dashboard";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("getPersonalOverview", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  let otherCompanyId: string;
  const createdAuthUserIds: string[] = [];
  let me: Profile;
  let coworker: Profile;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (dashboard)", slug: "test-co-dashboard" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: otherCompany, error: otherCompanyError } = await supabase
      .from("companies")
      .upsert(
        { name: "Test Co (dashboard, other)", slug: "test-co-dashboard-other" },
        { onConflict: "slug" }
      )
      .select("id")
      .single();
    if (otherCompanyError) throw otherCompanyError;
    otherCompanyId = otherCompany.id;

    const { data: meAuthUser, error: meAuthError } = await supabase.auth.admin.createUser({
      email: `dashboard-test-me-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (meAuthError || !meAuthUser.user) throw meAuthError;
    createdAuthUserIds.push(meAuthUser.user.id);
    me = await createProfile({
      authUserId: meAuthUser.user.id,
      companyId,
      fullName: "Me",
      role: "employee",
    });

    const { data: coworkerAuthUser, error: coworkerAuthError } =
      await supabase.auth.admin.createUser({
        email: `dashboard-test-coworker-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
    if (coworkerAuthError || !coworkerAuthUser.user) throw coworkerAuthError;
    createdAuthUserIds.push(coworkerAuthUser.user.id);
    coworker = await createProfile({
      authUserId: coworkerAuthUser.user.id,
      companyId,
      fullName: "Coworker",
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

    const { error: activityDeleteError } = await supabase
      .from("activity_log")
      .delete()
      .in("actor_id", [me.id, coworker.id]);
    if (activityDeleteError) throw activityDeleteError;

    const { error: profilesDeleteError } = await supabase
      .from("profiles")
      .delete()
      .in("company_id", [companyId, otherCompanyId]);
    if (profilesDeleteError) throw profilesDeleteError;

    for (const authUserId of createdAuthUserIds) {
      await supabase.auth.admin.deleteUser(authUserId);
    }
  });

  it("returns all-zero counts and empty lists for a user with no data yet", async () => {
    const overview = await getPersonalOverview(coworker);
    expect(overview.counts).toEqual({
      myOpenTasks: 0,
      pendingApprovals: 0,
      myOpenRequests: 0,
      activeWorkflows: 0,
    });
    expect(overview.myTasks).toEqual([]);
    expect(overview.upcoming).toEqual({ overdue: 0, dueToday: 0, dueThisWeek: 0 });
    expect(overview.unreadNotifications).toBe(0);
  });

  it("counts only the caller's own open tasks, not a coworker's", async () => {
    const { error: myTaskError } = await supabase.from("tasks").insert({
      company_id: companyId,
      title: "My open task",
      status: "todo",
      priority: "medium",
      assignee_id: me.id,
      creator_id: me.id,
    });
    if (myTaskError) throw myTaskError;

    const { error: coworkerTaskError } = await supabase.from("tasks").insert({
      company_id: companyId,
      title: "Coworker's open task",
      status: "todo",
      priority: "medium",
      assignee_id: coworker.id,
      creator_id: coworker.id,
    });
    if (coworkerTaskError) throw coworkerTaskError;

    const overview = await getPersonalOverview(me);
    expect(overview.counts.myOpenTasks).toBe(1);
    expect(overview.myTasks).toHaveLength(1);
    expect(overview.myTasks[0].title).toBe("My open task");
  });

  it("buckets tasks into overdue / due today / due this week by due_date", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const today = new Date().toISOString();
    const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from("tasks").insert([
      {
        company_id: companyId,
        title: "Overdue task",
        status: "todo",
        priority: "medium",
        assignee_id: me.id,
        creator_id: me.id,
        due_date: yesterday,
      },
      {
        company_id: companyId,
        title: "Due today task",
        status: "todo",
        priority: "medium",
        assignee_id: me.id,
        creator_id: me.id,
        due_date: today,
      },
      {
        company_id: companyId,
        title: "Due this week task",
        status: "todo",
        priority: "medium",
        assignee_id: me.id,
        creator_id: me.id,
        due_date: inThreeDays,
      },
    ]);
    if (error) throw error;

    const overview = await getPersonalOverview(me);
    expect(overview.upcoming.overdue).toBe(1);
    expect(overview.upcoming.dueToday).toBe(1);
    expect(overview.upcoming.dueThisWeek).toBe(1);
  });

  it("recentActivity never includes another company's activity", async () => {
    const { data: otherCompanyTask, error: otherTaskError } = await supabase
      .from("tasks")
      .insert({
        company_id: otherCompanyId,
        title: "Other company task",
        status: "todo",
        priority: "medium",
      })
      .select("id")
      .single();
    if (otherTaskError) throw otherTaskError;

    const { error: otherActivityError } = await supabase.from("activity_log").insert({
      entity_type: "task",
      entity_id: otherCompanyTask.id,
      actor_id: null,
      message: "Activity from a different company",
    });
    if (otherActivityError) throw otherActivityError;

    const { data: myTask, error: myTaskError } = await supabase
      .from("tasks")
      .insert({
        company_id: companyId,
        title: "My company task for activity",
        status: "todo",
        priority: "medium",
        assignee_id: me.id,
        creator_id: me.id,
      })
      .select("id")
      .single();
    if (myTaskError) throw myTaskError;

    const { error: myActivityError } = await supabase.from("activity_log").insert({
      entity_type: "task",
      entity_id: myTask.id,
      actor_id: me.id,
      message: "Activity from my company",
    });
    if (myActivityError) throw myActivityError;

    const overview = await getPersonalOverview(me);
    const messages = overview.recentActivity.map((entry) => entry.message);
    expect(messages).toContain("Activity from my company");
    expect(messages).not.toContain("Activity from a different company");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:integration -- lib/domain/dashboard.test.ts
```

Expected: FAIL — `lib/domain/dashboard.ts` doesn't exist yet.

(If `SUPABASE_SERVICE_ROLE_KEY` isn't set in this environment, the suite is skipped rather than failed — confirm the env var is present before relying on this step; every other domain integration test in this repo depends on the same variable.)

- [ ] **Step 3: Implement `getPersonalOverview`**

Create `lib/domain/dashboard.ts`:

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/domain/profiles";
import type { ActivityEntry } from "@/lib/domain/activity";
import { TASK_COLUMNS, toTask, type Task } from "@/lib/domain/tasks";
import type { TaskPriority, TaskStatus } from "@/lib/domain/task-status";
import { canViewCompanyOverview } from "@/lib/domain/permissions";
import { ForbiddenError } from "@/lib/domain/errors";

const OPEN_TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "blocked"];
const OPEN_REQUEST_STATUSES = ["draft", "submitted", "under_review", "approved", "in_progress"];
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

function bucketByDueDate(tasks: Task[]): PersonalOverview["upcoming"] {
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

  const tableByType: Record<string, string> = {
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
      .select("id, tasks!inner(assignee_id, company_id), workflow_instances!inner(status)")
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
  if (recentActivityResult.error) throw recentActivityResult.error;
  if (notificationsResult.error) throw notificationsResult.error;

  const myTasks = myTasksResult.data.map(toTask);
  const activeInstanceIds = new Set(
    (activeWorkflowStepsResult.data ?? []).map(
      (row) => (row as unknown as { instance_id?: string }).instance_id
    )
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
    upcoming: bucketByDueDate(myTasks),
    unreadNotifications: notificationsResult.count ?? 0,
  };
}
```

A note on `activeWorkflowStepsResult`: the `.select(...)` there doesn't list `instance_id` explicitly because Supabase's PostgREST embed syntax used for the `.eq("tasks.assignee_id", ...)` filters returns the base table's own columns by default alongside the embeds — `workflow_instance_steps` rows already carry `instance_id` as a plain column. If Step 4's test run shows `activeWorkflows` always `0` despite a matching fixture, add `instance_id` to the front of that `.select(...)` string explicitly (`"id, instance_id, tasks!inner(...)"`) and re-run; don't guess silently, use the failing test as the signal.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:integration -- lib/domain/dashboard.test.ts
```

Expected: PASS. If the `activeWorkflows`-adjacent assertions aren't in this task's tests yet (they're added in Task 5 together with `pendingApprovals`' company-scoping test), it's fine if this task's four tests above are what's green here — Task 5 adds the remaining coverage for `counts.pendingApprovals` and `counts.activeWorkflows` once fixtures for those exist.

- [ ] **Step 5: Wire the new test file into the npm scripts**

Modify `package.json`: add `"lib/domain/dashboard.test.ts"` to the end of the `test:integration` script's argument list, and add `--exclude "lib/domain/dashboard.test.ts"` to the `test:unit` script's exclude list (same format as every other domain test already listed in both).

- [ ] **Step 6: Run the full unit suite to confirm the exclude took effect**

```bash
npm run test:unit
```

Expected: PASS, and the output does not include `lib/domain/dashboard.test.ts` among the files it ran.

- [ ] **Step 7: Commit**

```bash
git add lib/domain/dashboard.ts lib/domain/dashboard.test.ts package.json
git commit -m "feat: add getPersonalOverview dashboard aggregation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `getCompanyOverview` domain function

**Files:**
- Modify: `lib/domain/dashboard.ts`
- Test: `lib/domain/dashboard.test.ts`

**Interfaces:**
- Consumes: `canViewCompanyOverview` (`lib/domain/permissions.ts`, Task 2), `ForbiddenError` (`lib/domain/errors.ts`), `getOperation`'s progress shape convention (`lib/domain/operations.ts` — same `completedTasks`/`totalTasks` field names, not the function itself).
- Produces:
  ```ts
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

  export async function getCompanyOverview(profile: Profile): Promise<CompanyOverview>;
  ```
  Task 6's company route imports `getCompanyOverview` and `CompanyOverview` by these exact names. Task 10's `active-operations-card.tsx` imports `OperationProgress` by this exact name and these exact field names.

- [ ] **Step 1: Write the failing tests**

Add to `lib/domain/dashboard.test.ts`, in a second `describe` block below the first (reusing the same `beforeAll`/`afterAll` fixtures is awkward across two independent `describe`s in this codebase's existing style — instead, give this block its own company/profiles, matching how `operations.test.ts` and `requests.test.ts` each set up their own fixtures per top-level `describe`):

```ts
import { getCompanyOverview } from "@/lib/domain/dashboard";
import { ForbiddenError } from "@/lib/domain/errors";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("getCompanyOverview", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  const createdAuthUserIds: string[] = [];
  let opsManager: Profile;
  let employee: Profile;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert(
        { name: "Test Co (company overview)", slug: "test-co-company-overview" },
        { onConflict: "slug" }
      )
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: opsManagerAuthUser, error: opsManagerAuthError } =
      await supabase.auth.admin.createUser({
        email: `dashboard-test-ops-${crypto.randomUUID()}@example.com`,
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
        email: `dashboard-test-employee-${crypto.randomUUID()}@example.com`,
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

  it("throws ForbiddenError for every non-elevated role", async () => {
    await expect(getCompanyOverview(employee)).rejects.toThrow(ForbiddenError);
  });

  it("returns totals for an elevated role", async () => {
    const overview = await getCompanyOverview(opsManager);
    expect(overview.totals.employees).toBeGreaterThanOrEqual(2); // opsManager + employee
  });

  it("getPersonalOverview also works for an elevated role (no role check gates it)", async () => {
    const overview = await getPersonalOverview(opsManager);
    expect(overview.counts).toEqual({
      myOpenTasks: 0,
      pendingApprovals: 0,
      myOpenRequests: 0,
      activeWorkflows: 0,
    });
  });

  it("lists an operation with zero linked tasks as totalTasks: 0, not an error", async () => {
    const { data: operation, error: operationError } = await supabase
      .from("operations")
      .insert({
        company_id: companyId,
        title: "Empty operation",
        owner_id: opsManager.id,
        status: "in_progress",
        priority: "medium",
      })
      .select("id")
      .single();
    if (operationError) throw operationError;

    const overview = await getCompanyOverview(opsManager);
    const found = overview.activeOperations.find((op) => op.id === operation.id);
    expect(found).toBeDefined();
    expect(found?.totalTasks).toBe(0);
    expect(found?.completedTasks).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:integration -- lib/domain/dashboard.test.ts
```

Expected: FAIL — `getCompanyOverview` is not exported.

- [ ] **Step 3: Implement `getCompanyOverview`**

Append to `lib/domain/dashboard.ts` (add these imports to the top of the file alongside the existing ones: `import { ForbiddenError } from "@/lib/domain/errors";` was already imported in Task 3's version of the file):

```ts
const ACTIVE_TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "blocked"];
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:integration -- lib/domain/dashboard.test.ts
```

Expected: PASS, both `describe` blocks.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/dashboard.ts lib/domain/dashboard.test.ts
git commit -m "feat: add getCompanyOverview dashboard aggregation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Close the remaining Review Focus coverage (`pendingApprovals` and `activeWorkflows` scoping)

**Files:**
- Modify: `lib/domain/dashboard.test.ts`

**Interfaces:**
- Consumes: `getPersonalOverview` (Task 3), `getCompanyOverview` (Task 4), `decideApproval`-style direct `approvals` inserts (matching `lib/domain/requests.test.ts`'s existing pattern for creating an approval row without going through the full request-submission flow).

This task exists because Tasks 3 and 4 land `counts.pendingApprovals` and `counts.activeWorkflows` without a fixture that actually exercises them (there was nothing to attach an approval or a workflow step to until a request/operation existed in the same test file). Add the fixtures now, while the rest of the suite's shape is fresh.

- [ ] **Step 1: Write the failing tests**

Add to the `getPersonalOverview` describe block in `lib/domain/dashboard.test.ts`:

```ts
  it("counts only approvals pending for me, scoped to my company", async () => {
    const { data: request, error: requestError } = await supabase
      .from("requests")
      .insert({
        company_id: companyId,
        title: "Needs my approval",
        category: "general",
        status: "under_review",
        created_by: coworker.id,
      })
      .select("id")
      .single();
    if (requestError) throw requestError;

    const { error: approvalError } = await supabase.from("approvals").insert({
      request_id: request.id,
      approver_id: me.id,
      status: "pending",
    });
    if (approvalError) throw approvalError;

    const overview = await getPersonalOverview(me);
    expect(overview.counts.pendingApprovals).toBe(1);
  });
```

Add to the `getCompanyOverview` describe block in `lib/domain/dashboard.test.ts`:

```ts
  it("attention.pendingApprovals counts every pending approval in the company, not just one approver's", async () => {
    const { data: request, error: requestError } = await supabase
      .from("requests")
      .insert({
        company_id: companyId,
        title: "Company-wide pending approval",
        category: "general",
        status: "under_review",
        created_by: employee.id,
      })
      .select("id")
      .single();
    if (requestError) throw requestError;

    const { error: approvalError } = await supabase.from("approvals").insert({
      request_id: request.id,
      approver_id: opsManager.id,
      status: "pending",
    });
    if (approvalError) throw approvalError;

    const overview = await getCompanyOverview(opsManager);
    expect(overview.attention.pendingApprovals).toBeGreaterThanOrEqual(1);
  });
```

- [ ] **Step 2: Run tests to verify they fail or pass for the right reason**

```bash
npm run test:integration -- lib/domain/dashboard.test.ts
```

Expected: PASS if Tasks 3–4's `pendingApprovals` queries were already correct (the point of this task is coverage, not new behavior) — if either FAILS, it's telling you the `requests!inner(company_id)` embed filter from Task 3/4's implementation isn't scoping the way intended; fix the query there (the working reference is the `requests!inner(...)` pattern already used twice in `getPersonalOverview`/`getCompanyOverview` above) before moving on.

- [ ] **Step 3: Commit**

```bash
git add lib/domain/dashboard.test.ts
git commit -m "test: cover pendingApprovals scoping in both dashboard overviews

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: API routes

**Files:**
- Create: `app/api/dashboard/personal/route.ts`
- Create: `app/api/dashboard/company/route.ts`

**Interfaces:**
- Consumes: `getCurrentProfile` (`lib/auth/session.ts`), `getPersonalOverview`/`getCompanyOverview` (Tasks 3–4), `toErrorResponse` (`lib/api/error-response.ts`).
- Produces: `GET /api/dashboard/personal` → `{ overview: PersonalOverview }` (200) or `{ error }` (401). `GET /api/dashboard/company` → `{ overview: CompanyOverview }` (200), `{ error }` (401), or `{ error }` (403 via `toErrorResponse`'s existing `ForbiddenError` mapping). Task 9's `dashboard-view.tsx` fetches both by these exact paths and reads `body.overview`.

There's no route-level test file for these in this codebase's existing pattern (route handlers aren't unit-tested directly elsewhere — `app/api/operations/route.ts` has no sibling test file; coverage comes from the domain-layer tests plus, where it exists, a component test hitting a mocked `fetch`). This task's own verification is Step 3's manual check plus Task 9's component tests, which mock these exact routes.

- [ ] **Step 1: Create the personal route**

`app/api/dashboard/personal/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getPersonalOverview } from "@/lib/domain/dashboard";
import { toErrorResponse } from "@/lib/api/error-response";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const overview = await getPersonalOverview(profile);
    return NextResponse.json({ overview });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 2: Create the company route**

`app/api/dashboard/company/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getCompanyOverview } from "@/lib/domain/dashboard";
import { toErrorResponse } from "@/lib/api/error-response";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const overview = await getCompanyOverview(profile);
    return NextResponse.json({ overview });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 3: Manual verification against the dev server**

```bash
npm run dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/dashboard/personal
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/dashboard/company
kill %1
```

Expected: both return `401` (no session cookie in a bare `curl` call) — confirms the routes exist and the auth check runs before anything else, without needing a logged-in session in this shell.

- [ ] **Step 4: Commit**

```bash
git add app/api/dashboard/personal/route.ts app/api/dashboard/company/route.ts
git commit -m "feat: add /api/dashboard/personal and /api/dashboard/company routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: `useBroadcastListener` fan-out helper check

Skip this as a separate task — `useBroadcastListener` (`lib/realtime/use-broadcast-listener.ts`) already takes one channel name and one callback per call; `dashboard-view.tsx` in Task 9 calls it four times directly (`company:<id>:tasks`, `:requests`, `:operations`, `:workflows`), matching how every existing list view uses it once. No new abstraction needed — this note exists so the task numbering below doesn't imply a missing file.

---

### Task 8: `SummaryCards` and personal-section presentational components

**Files:**
- Create: `components/dashboard/summary-cards.tsx`
- Create: `components/dashboard/my-tasks-card.tsx`
- Create: `components/dashboard/recent-activity-card.tsx`
- Create: `components/dashboard/upcoming-card.tsx`

**Interfaces:**
- Consumes: `PersonalOverview`, `DashboardTask` (`lib/domain/dashboard.ts`, Task 3), `ActivityEntry` (`lib/domain/activity.ts`), `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardAction`/`CardFooter`/`CardContent` (`components/ui/card.tsx`), `Badge` (`components/ui/badge.tsx`).
- Produces: four presentational components, each taking its own slice of `PersonalOverview` as props — no fetching inside any of them (Task 9 owns the query). Exact props:
  ```ts
  function SummaryCards(props: { counts: PersonalOverview["counts"] }): JSX.Element;
  function MyTasksCard(props: { tasks: DashboardTask[] }): JSX.Element;
  function RecentActivityCard(props: { activity: ActivityEntry[] }): JSX.Element;
  function UpcomingCard(props: { upcoming: PersonalOverview["upcoming"] }): JSX.Element;
  ```
  Task 9 imports all four by these names and passes these exact prop shapes.

These are pure presentational components (props in, JSX out), so they're covered by Task 9's `dashboard-view.test.tsx` rendering the whole tree against a mocked fetch response, rather than by individual snapshot tests per card — matching how this codebase doesn't unit-test presentational subcomponents of `operation-list-view.tsx` separately either.

- [ ] **Step 1: `summary-cards.tsx`**

```tsx
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PersonalOverview } from "@/lib/domain/dashboard";

export function SummaryCards({ counts }: { counts: PersonalOverview["counts"] }) {
  const cards = [
    { label: "My Tasks", value: counts.myOpenTasks },
    { label: "Pending Approvals", value: counts.pendingApprovals },
    { label: "Open Requests", value: counts.myOpenRequests },
    { label: "Active Workflows", value: counts.activeWorkflows },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="@container/card">
          <CardHeader>
            <CardDescription>{card.label}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {card.value}
            </CardTitle>
            <CardAction />
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: `my-tasks-card.tsx`**

```tsx
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardTask } from "@/lib/domain/dashboard";

const PRIORITY_VARIANT: Record<DashboardTask["priority"], "default" | "outline" | "destructive"> = {
  low: "outline",
  medium: "outline",
  high: "default",
  critical: "destructive",
};

export function MyTasksCard({ tasks }: { tasks: DashboardTask[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>My Tasks</CardTitle>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 && (
          <p className="text-sm text-muted-foreground">No open tasks assigned to you.</p>
        )}
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-2 text-sm">
              <Link href={`/tasks/${task.id}`} className="hover:underline">
                {task.title}
              </Link>
              <div className="flex items-center gap-2">
                <Badge variant={PRIORITY_VARIANT[task.priority]}>{task.priority}</Badge>
                {task.dueDate && (
                  <span className="text-muted-foreground">
                    {new Date(task.dueDate).toLocaleDateString()}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: `recent-activity-card.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActivityEntry } from "@/lib/domain/activity";

export function RecentActivityCard({ activity }: { activity: ActivityEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {activity.length === 0 && (
          <p className="text-sm text-muted-foreground">No recent activity.</p>
        )}
        <ul className="flex flex-col gap-2">
          {activity.map((entry) => (
            <li key={entry.id} className="text-sm text-muted-foreground">
              {entry.message}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: `upcoming-card.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PersonalOverview } from "@/lib/domain/dashboard";

export function UpcomingCard({ upcoming }: { upcoming: PersonalOverview["upcoming"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1 text-sm">
          <li>{upcoming.overdue} tasks overdue</li>
          <li>{upcoming.dueToday} tasks due today</li>
          <li>{upcoming.dueThisWeek} tasks due this week</li>
        </ul>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors (these components aren't wired into a page yet, but they must type-check against `lib/domain/dashboard.ts`'s real exports).

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/summary-cards.tsx components/dashboard/my-tasks-card.tsx \
        components/dashboard/recent-activity-card.tsx components/dashboard/upcoming-card.tsx
git commit -m "feat: add dashboard personal-section presentational components

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: `DashboardView` (data fetching + Realtime) and wiring the page

**Files:**
- Create: `components/dashboard/dashboard-view.tsx`
- Create: `components/dashboard/dashboard-view.test.tsx`
- Modify: `app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `useQuery`/`useQueryClient` (`@tanstack/react-query`), `useBroadcastListener` (`lib/realtime/use-broadcast-listener.ts`), `SummaryCards`/`MyTasksCard`/`RecentActivityCard`/`UpcomingCard` (Task 8), `PersonalOverview`/`CompanyOverview` (Tasks 3–4), `getCurrentProfile` (`lib/auth/session.ts`), `canViewCompanyOverview` (Task 2).
- Produces: `DashboardView(props: { companyId: string; profileFullName: string; canViewCompany: boolean }): JSX.Element`, the default export of `app/(app)/dashboard/page.tsx`. Task 10 adds `CompanySection`/`ActiveOperationsCard` as children this component renders when `canViewCompany` is true — this task ships with an inline placeholder for that branch so the page works end-to-end before Task 10 lands, then Task 10 replaces the placeholder.

- [ ] **Step 1: Write the failing component test**

Create `components/dashboard/dashboard-view.test.tsx`, following `components/operations/operation-list-view.test.tsx`'s exact pattern (mock `@/lib/supabase/browser`, wrap in a fresh `QueryClientProvider` per test, stub `global.fetch`):

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => ({ on: () => ({ subscribe: vi.fn() }) }),
    removeChannel: vi.fn(),
  }),
}));

import { DashboardView } from "@/components/dashboard/dashboard-view";

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const emptyPersonalOverview = {
  counts: { myOpenTasks: 0, pendingApprovals: 0, myOpenRequests: 0, activeWorkflows: 0 },
  myTasks: [],
  recentActivity: [],
  upcoming: { overdue: 0, dueToday: 0, dueThisWeek: 0 },
  unreadNotifications: 0,
};

describe("DashboardView", () => {
  it("renders the personal section for a user with no data yet, without crashing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ overview: emptyPersonalOverview }),
      })
    );

    renderWithClient(
      <DashboardView companyId="company-1" profileFullName="Adrian" canViewCompany={false} />
    );

    expect(await screen.findByText("My Tasks")).toBeInTheDocument();
    expect(screen.getByText("No open tasks assigned to you.")).toBeInTheDocument();
  });

  it("does not fetch or render the company section when canViewCompany is false", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ overview: emptyPersonalOverview }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithClient(
      <DashboardView companyId="company-1" profileFullName="Adrian" canViewCompany={false} />
    );

    await screen.findByText("My Tasks");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/dashboard/personal");
  });

  it("fetches the company overview when canViewCompany is true", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/dashboard/personal") {
        return Promise.resolve({ ok: true, json: async () => ({ overview: emptyPersonalOverview }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          overview: {
            totals: { employees: 0, assets: 0, openRequests: 0, activeTasks: 0 },
            attention: { criticalTasks: 0, pendingApprovals: 0, overdueRequests: 0 },
            activeOperations: [],
            departmentActivity: [],
          },
        }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithClient(
      <DashboardView companyId="company-1" profileFullName="Adrian" canViewCompany={true} />
    );

    await screen.findByText("My Tasks");
    expect(fetchMock).toHaveBeenCalledWith("/api/dashboard/company");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit -- components/dashboard/dashboard-view.test.tsx
```

Expected: FAIL — `components/dashboard/dashboard-view.tsx` doesn't exist yet.

- [ ] **Step 3: Implement `dashboard-view.tsx`**

```tsx
"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBroadcastListener } from "@/lib/realtime/use-broadcast-listener";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { MyTasksCard } from "@/components/dashboard/my-tasks-card";
import { RecentActivityCard } from "@/components/dashboard/recent-activity-card";
import { UpcomingCard } from "@/components/dashboard/upcoming-card";
import type { CompanyOverview, PersonalOverview } from "@/lib/domain/dashboard";

async function fetchOverview<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}`);
  const body = await response.json();
  return body.overview as T;
}

export function DashboardView({
  companyId,
  profileFullName,
  canViewCompany,
}: {
  companyId: string;
  profileFullName: string;
  canViewCompany: boolean;
}) {
  const queryClient = useQueryClient();

  const personalQuery = useQuery({
    queryKey: ["dashboard", "personal"],
    queryFn: () => fetchOverview<PersonalOverview>("/api/dashboard/personal"),
  });

  const companyQuery = useQuery({
    queryKey: ["dashboard", "company"],
    queryFn: () => fetchOverview<CompanyOverview>("/api/dashboard/company"),
    enabled: canViewCompany,
  });

  function invalidateDashboard() {
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  useBroadcastListener(`company:${companyId}:tasks`, invalidateDashboard);
  useBroadcastListener(`company:${companyId}:requests`, invalidateDashboard);
  useBroadcastListener(`company:${companyId}:operations`, invalidateDashboard);
  useBroadcastListener(`company:${companyId}:workflows`, invalidateDashboard);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Good morning, {profileFullName}.</h1>
        <p className="text-muted-foreground">Here&apos;s what needs your attention.</p>
      </div>

      {personalQuery.isLoading && <p className="text-muted-foreground">Loading dashboard...</p>}
      {personalQuery.error && <p className="text-red-600">Failed to load your dashboard.</p>}

      {personalQuery.data && (
        <>
          <SummaryCards counts={personalQuery.data.counts} />
          <div className="grid grid-cols-1 gap-4 @2xl/main:grid-cols-2">
            <MyTasksCard tasks={personalQuery.data.myTasks} />
            <RecentActivityCard activity={personalQuery.data.recentActivity} />
          </div>
          <UpcomingCard upcoming={personalQuery.data.upcoming} />
        </>
      )}

      {canViewCompany && companyQuery.data && (
        <div>{/* Task 10 replaces this with <CompanySection overview={companyQuery.data} /> */}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:unit -- components/dashboard/dashboard-view.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Wire the page**

Replace the entire contents of `app/(app)/dashboard/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { canViewCompanyOverview } from "@/lib/domain/permissions";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  return (
    <DashboardView
      companyId={profile.companyId}
      profileFullName={profile.fullName}
      canViewCompany={canViewCompanyOverview(profile)}
    />
  );
}
```

No `BackLink` — `/dashboard` is a root of the authenticated app (`CLAUDE.md` §UI).

- [ ] **Step 6: Type-check and run the full unit suite**

```bash
npx tsc --noEmit
npm run test:unit
```

Expected: no type errors, all unit tests pass (including the pre-existing `app/(app)/layout.test.tsx` if it renders the dashboard route — check its output for any new failures).

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/dashboard-view.tsx components/dashboard/dashboard-view.test.tsx \
        "app/(app)/dashboard/page.tsx"
git commit -m "feat: wire the real dashboard page with personal-section data and Realtime

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Company section — `CompanySection`, `ActiveOperationsCard`, and wiring into `DashboardView`

**Files:**
- Create: `components/dashboard/company-section.tsx`
- Create: `components/dashboard/active-operations-card.tsx`
- Modify: `components/dashboard/dashboard-view.tsx`
- Modify: `components/dashboard/dashboard-view.test.tsx`

**Interfaces:**
- Consumes: `CompanyOverview`, `OperationProgress`, `DepartmentActivity` (`lib/domain/dashboard.ts`, Task 4).
- Produces:
  ```ts
  function CompanySection(props: { overview: CompanyOverview }): JSX.Element;
  function ActiveOperationsCard(props: { operations: OperationProgress[] }): JSX.Element;
  ```

- [ ] **Step 1: Extend the failing test**

Extend the third test in `components/dashboard/dashboard-view.test.tsx` ("fetches the company overview when canViewCompany is true") — replace its mocked company overview's `activeOperations` with a non-empty entry, and add an assertion:

```ts
            activeOperations: [
              { id: "op-1", title: "Vienna Office Relocation", completedTasks: 3, totalTasks: 4 },
            ],
```

and after the existing `expect(fetchMock).toHaveBeenCalledWith("/api/dashboard/company");` line, add:

```ts
    expect(await screen.findByText("Vienna Office Relocation")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit -- components/dashboard/dashboard-view.test.tsx
```

Expected: FAIL — the placeholder div from Task 9 renders nothing with that text.

- [ ] **Step 3: Implement `active-operations-card.tsx`**

```tsx
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OperationProgress } from "@/lib/domain/dashboard";

export function ActiveOperationsCard({ operations }: { operations: OperationProgress[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Operations</CardTitle>
      </CardHeader>
      <CardContent>
        {operations.length === 0 && (
          <p className="text-sm text-muted-foreground">No active operations.</p>
        )}
        <ul className="flex flex-col gap-3">
          {operations.map((operation) => {
            const percent =
              operation.totalTasks === 0
                ? 0
                : Math.round((operation.completedTasks / operation.totalTasks) * 100);
            return (
              <li key={operation.id} className="flex flex-col gap-1 text-sm">
                <div className="flex items-center justify-between">
                  <Link href={`/operations/${operation.id}`} className="hover:underline">
                    {operation.title}
                  </Link>
                  <span className="text-muted-foreground">{percent}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
```

(The progress bar here is a plain styled `div`, not the shadcn `progress` primitive Task 1 installed — this codebase has no existing consumer of that primitive to match against yet, and a two-`div` bar needs no extra dependency surface. The primitive stays available in `components/ui/progress.tsx`... actually it wasn't installed by `dashboard-01` at all per Task 1's investigation, so there's nothing to reconcile — this is simply the implementation.)

- [ ] **Step 4: Implement `company-section.tsx`**

```tsx
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ActiveOperationsCard } from "@/components/dashboard/active-operations-card";
import type { CompanyOverview } from "@/lib/domain/dashboard";

export function CompanySection({ overview }: { overview: CompanyOverview }) {
  const totalCards = [
    { label: "Employees", value: overview.totals.employees },
    { label: "Assets", value: overview.totals.assets },
    { label: "Open Requests", value: overview.totals.openRequests },
    { label: "Active Tasks", value: overview.totals.activeTasks },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Company Overview</h2>
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {totalCards.map((card) => (
          <Card key={card.label} className="@container/card">
            <CardHeader>
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                {card.value}
              </CardTitle>
              <CardAction />
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Attention Required</CardTitle>
        </CardHeader>
        <div className="px-6 pb-6 text-sm">
          <ul className="flex flex-col gap-1">
            <li>{overview.attention.criticalTasks} critical tasks</li>
            <li>{overview.attention.pendingApprovals} pending approvals</li>
            <li>{overview.attention.overdueRequests} overdue requests</li>
          </ul>
        </div>
      </Card>

      <ActiveOperationsCard operations={overview.activeOperations} />

      <Card>
        <CardHeader>
          <CardTitle>Department Activity</CardTitle>
        </CardHeader>
        <div className="px-6 pb-6">
          {overview.departmentActivity.length === 0 && (
            <p className="text-sm text-muted-foreground">No department data.</p>
          )}
          <ul className="flex flex-col gap-2 text-sm">
            {overview.departmentActivity.map((department) => (
              <li key={department.departmentId} className="flex items-center justify-between">
                <span>{department.name}</span>
                <span className="text-muted-foreground">
                  {department.openTasks} open tasks · {department.openRequests} open requests
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Wire `CompanySection` into `dashboard-view.tsx`**

In `components/dashboard/dashboard-view.tsx`, replace:

```tsx
      {canViewCompany && companyQuery.data && (
        <div>{/* Task 10 replaces this with <CompanySection overview={companyQuery.data} /> */}</div>
      )}
```

with:

```tsx
      {canViewCompany && companyQuery.data && <CompanySection overview={companyQuery.data} />}
```

and add the import at the top: `import { CompanySection } from "@/components/dashboard/company-section";`

- [ ] **Step 6: Run test to verify it passes**

```bash
npm run test:unit -- components/dashboard/dashboard-view.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Run the full unit suite and type-check**

```bash
npx tsc --noEmit
npm run test:unit
```

Expected: no errors, all unit tests pass.

- [ ] **Step 8: Commit**

```bash
git add components/dashboard/company-section.tsx components/dashboard/active-operations-card.tsx \
        components/dashboard/dashboard-view.tsx components/dashboard/dashboard-view.test.tsx
git commit -m "feat: add company section to the dashboard for operations_manager/admin

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Whole-branch verification

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

```bash
npm run test:unit
npm run test:integration
```

Expected: all pass. (`test:integration` needs `SUPABASE_SERVICE_ROLE_KEY` set — same requirement as every other domain test in this repo.)

- [ ] **Step 2: Lint and type-check**

```bash
npm run lint
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Manual smoke check**

```bash
npm run dev
```

Sign in as a seeded `employee` and confirm: My Tasks / Pending Approvals / Open Requests / Active Workflows cards render with real numbers, no company section appears. Sign in as a seeded `operations_manager` or `admin` and confirm the company section (totals, attention required, active operations with a progress bar, department activity) additionally appears.

- [ ] **Step 4: Update `docs/STATUS.md`**

Move the Phase 7 entry from **In Progress** to **Finished** (following the exact format of the other Finished entries — one-line description, spec/plan links, PR reference once the PR is open). This is the last step before requesting review per `CLAUDE.md`'s workflow section — leave it in **Review** (not yet Finished) until the branch actually merges, per `docs/STATUS.md`'s own header note ("An item only moves to Finished once its branch is merged into main").
