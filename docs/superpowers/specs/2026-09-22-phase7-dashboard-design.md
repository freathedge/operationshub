# Phase 7 — Dashboard / Overview — Design

Date: 2026-09-22
Outline section: `docs/superpowers/plans/2026-08-26-remaining-phases-outline.md` § Phase 7
Product source: `docs/idea.md` §6 and §29
Architecture: `docs/architecture.md`

---

## 1. Goal

Replace the Foundation-phase placeholder at `app/(app)/dashboard/page.tsx` with the real Overview. The dashboard aggregates data that Phases 2–6 already produce; it adds no tables, no columns and no migrations.

Two sections:

- **Personal section** — visible to every authenticated user. What the signed-in user has to handle.
- **Company section** — visible only to `operations_manager` and `admin`. Company-wide totals and attention-required counts.

This is also the first page that subscribes to several Realtime broadcast channels at once, because it aggregates entities owned by several domain modules.

## 2. Decisions taken during brainstorming

**Company-section gating: `operations_manager` and `admin` only.** The existing `ELEVATED_ROLES` set in `lib/domain/permissions.ts`, not the wider `COMPANY_WIDE_VIEW_ROLES` set. `it` and `hr` keep company-wide *list* access to tasks and requests (unchanged), but they do not get the aggregated company overview. Consequence, accepted deliberately: the employee/asset totals from idea.md §29 live in the company section, so an ordinary employee never sees them.

**UI from a shadcn/ui block.** Per `CLAUDE.md` §UI, the dashboard is built from `dashboard-01` rather than composed from primitives. A separate, later piece of work ("UI sweep", already in `docs/STATUS.md`'s backlog) brings the Phase 2–6 screens onto shadcn; it is explicitly **not** part of this phase.

**Data flow: server page → client view → React Query → two API routes.** Same shape as every list screen from Phases 2–6 (see `app/(app)/operations/page.tsx` + `components/operations/operation-list-view.tsx`). Rejected alternatives: a pure server component with `revalidate` (no Realtime, contradicts the outline and Phase 9), and a single combined `/api/dashboard` endpoint (the two halves have different authorization, so a 403 on one must not fail the other).

## 3. Domain layer — `lib/domain/dashboard.ts`

A new module with two read-only functions. It writes nothing: no `activity_log` entry, no broadcast, no notification. The "validate → domain → route" triple from Phase 2 applies to mutations; these are queries, so they only have the authorization half.

Both use `createSupabaseAdminClient()` and issue their sub-queries through a single `Promise.all`, matching `getOperation` in `lib/domain/operations.ts`. Counts use Supabase's `{ count: "exact", head: true }` so no rows travel for a number.

### `getPersonalOverview(profile: Profile): Promise<PersonalOverview>`

No capability check beyond an authenticated profile — every user sees their own overview. Every query is scoped by `company_id = profile.companyId` **and** by the user, so cross-company leakage is impossible even if a profile is malformed.

```ts
interface PersonalOverview {
  counts: {
    myOpenTasks: number;        // tasks.assignee_id = me, status not in (completed, cancelled)
    pendingApprovals: number;   // approvals.approver_id = me, status = pending
    myOpenRequests: number;     // requests.created_by = me, status not in (completed, rejected)
    activeWorkflows: number;    // see below
  };
  myTasks: DashboardTask[];     // max 5, open, ordered by due_date asc nulls last, then priority
  recentActivity: ActivityEntry[]; // max 8, company-wide, newest first
  upcoming: {
    overdue: number;            // my open tasks with due_date < today
    dueToday: number;
    dueThisWeek: number;        // due_date within the next 7 days, today excluded
  };
  unreadNotifications: number;
}

interface DashboardTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
}
```

`activeWorkflows` means *workflow instances with status `running` that have at least one non-completed step whose generated task is assigned to me*. That is the narrowest reading of idea.md §6's "active workflows involving them" that is computable from the Phase 4 schema without a new column. It is derived by selecting the running instances' ids from `workflow_instance_steps` joined to `tasks` on `generated_task_id`.

**`recentActivity` and the missing company scope on `activity_log`.** `activity_log` (migration `20260827135756_create_activity_log.sql`) has no `company_id` column — every existing caller scopes it by `entity_type` + `entity_id` for one already-authorized entity, so this never mattered before. The dashboard is the first caller that needs a company-wide slice, and every `entity_type` value in use today (`task`, `request`, `asset`, `profile`, `operation` — confirmed by grepping every `logActivity(` call site) belongs to a table that already carries `company_id`. Rather than add a column for one read (out of scope per §1), `getPersonalOverview` does this in `dashboard.ts`:

1. Select the most recent ~30 `activity_log` rows across the whole table, newest first (generous over-fetch, no `entity_type` filter).
2. Group their `entity_id`s by `entity_type`.
3. For each `entity_type` present, look up which of those ids belong to `profile.companyId` — `task`/`request`/`asset`/`operation` via `select id from <table> where id in (...) and company_id = ...`; `profile` via `select id from profiles where id in (...) and company_id = ...`.
4. Filter the original 30 rows down to the ids confirmed in-company, keep the first 8.

This is a small, dashboard-local helper (`filterActivityByCompany`), not a change to `lib/domain/activity.ts` — `listActivity`'s existing contract (activity for one already-authorized entity) is untouched and every other caller keeps using it as-is.

"This week" is computed in the domain layer against the server's current date, as plain ISO date strings — no timezone library, consistent with the rest of the codebase.

### `getCompanyOverview(profile: Profile): Promise<CompanyOverview>`

First line: `if (!canViewCompanyOverview(profile)) throw new ForbiddenError("You cannot view the company overview")`.

```ts
interface CompanyOverview {
  totals: {
    employees: number;      // profiles, status = active
    assets: number;         // assets, status != retired
    openRequests: number;   // requests, status not in (completed, rejected)
    activeTasks: number;    // tasks, status in (todo, in_progress, blocked)
  };
  attention: {
    criticalTasks: number;  // open tasks, priority = critical
    pendingApprovals: number; // approvals, status = pending, company-wide
    overdueRequests: number;  // open requests whose linked workflow or due date has passed — see note
  };
  activeOperations: OperationProgress[]; // max 5, status in (planning, in_progress), newest first
  departmentActivity: DepartmentActivity[]; // one row per department
}

interface OperationProgress {
  id: string;
  title: string;
  completedTasks: number;
  totalTasks: number;
}

interface DepartmentActivity {
  departmentId: string;
  name: string;
  openTasks: number;
  openRequests: number;
}
```

`OperationProgress` uses the same `completedTasks / totalTasks` ratio that `getOperation` already returns, so the dashboard and the operation detail page cannot disagree. The percentage is formatted in the UI, not stored.

**`overdueRequests` caveat:** `requests` has no `due_date` column today. Rather than add one (that would be a migration, which this phase rules out), "overdue" means *a request still open that was created more than 7 days ago*. The threshold is a named constant in `dashboard.ts` with a comment pointing at this paragraph. If a real due date is wanted later, it belongs to a request-scoped change, not to the dashboard.

## 4. Permissions — `lib/domain/permissions.ts`

One addition:

```ts
export function canViewCompanyOverview(profile: Profile): boolean {
  return ELEVATED_ROLES.has(profile.role);
}
```

It is used twice: in `getCompanyOverview` (the real gate) and in the dashboard page (to decide whether the client component even asks for the company data). The page-level use is a rendering hint; the domain-layer check is the security boundary, per `docs/architecture.md` §5.

## 5. API routes

- `app/api/dashboard/personal/route.ts` — `GET`. Resolves the session, loads the profile, returns `{ overview }`.
- `app/api/dashboard/company/route.ts` — `GET`. Same, returns `{ overview }`; a `ForbiddenError` from the domain layer maps to 403 through the existing `lib/api/error-response.ts` helper.

Both follow the existing handler shape exactly: no session → 401 before any domain call; unknown errors → the shared 500 mapping. No request body, no Zod schema, since neither route takes input. Query parameters are not accepted — the overview is not filterable in this phase.

## 6. Frontend

### Block import

`npx shadcn@latest add dashboard-01`. `components.json` declares `style: base-nova` and `@base-ui/react` is the installed primitive library, so the CLI pulls the Base UI variant automatically (shadcn changelog 2026-02).

From what the block installs, the app keeps the section-card group and the chart primitive; the block's own sidebar and site header are discarded, because `app/(app)/layout.tsx` already provides the authenticated shell, and its data-table is not used. Missing primitives that the block pulls in (`chart`, `separator`, `skeleton`, `progress`, plus whatever the block depends on) stay in `components/ui/` — they are the same primitives the later UI sweep will need.

### Components

`app/(app)/dashboard/page.tsx` stays a server component: resolves the profile, redirects to `/login` when absent, and renders `<DashboardView profile={...} canViewCompany={canViewCompanyOverview(profile)} />`. No `BackLink` — `/dashboard` is a root of the authenticated area (`CLAUDE.md` §UI).

Under `components/dashboard/`:

| File | Responsibility |
|---|---|
| `dashboard-view.tsx` | Client. Owns both React Query calls, the broadcast subscriptions, and the greeting. Renders the sections. |
| `summary-cards.tsx` | The four personal counters (My Tasks, Pending Approvals, Open Requests, Active Workflows). |
| `my-tasks-card.tsx` | The task list with priority badge and due date. |
| `recent-activity-card.tsx` | The activity feed. |
| `upcoming-card.tsx` | Overdue / due today / due this week. |
| `company-section.tsx` | Totals + attention-required + department activity. Rendered only when `canViewCompany`. |
| `active-operations-card.tsx` | Operations with a progress bar, linking to `/operations/[id]`. |

Each presentational component takes its slice of the fetched data as props and does no fetching of its own, so each can be tested with plain objects.

Loading state uses the `skeleton` primitive; an error state renders an inline message, matching how the existing list views handle a failed query.

### Realtime

`dashboard-view.tsx` calls `useBroadcastListener` once per channel:

- `company:<companyId>:tasks`
- `company:<companyId>:requests`
- `company:<companyId>:operations`
- `company:<companyId>:workflows`

Each handler invalidates the `["dashboard"]` query key prefix, which refetches whichever of the two queries is mounted. Assets and employees are deliberately not subscribed: they only affect two company-section totals, and adding two more always-open channels for that is not worth it. A page refresh or any other event picks the new numbers up.

## 7. Testing

Following the repo's existing split (`npm run test:unit` vs `npm run test:integration`):

**Unit**
- `lib/domain/permissions.test.ts` — extend with `canViewCompanyOverview`: true for `operations_manager` and `admin`, false for `employee`, `manager`, `it`, `hr`.
- `components/dashboard/dashboard-view.test.tsx` — renders the personal section; renders the company section only when `canViewCompany` is true; shows the error state on a failed query. Query client and fetch are mocked, as in the existing component tests.

**Integration** (`lib/domain/dashboard.test.ts`, real Supabase, added to the `test:integration` script list and excluded from `test:unit`)
- `getPersonalOverview` counts only the caller's own tasks/requests/approvals, and not another user's.
- Company scoping: rows belonging to a second company never appear in either overview.
- `upcoming` buckets a task due yesterday, one due today and one due in three days into `overdue`, `dueToday` and `dueThisWeek` respectively.
- `getCompanyOverview` throws `ForbiddenError` for `employee`, `manager`, `it` and `hr`, and returns data for `operations_manager` and `admin`.
- `activeOperations` progress matches what `getOperation` reports for the same operation.

Each integration test creates and tears down its own fixtures, like the other domain tests.

## 8. Out of scope

- No new tables, columns or migrations.
- No notification bell — that is Phase 9.
- No charts over time series and no report metrics — that is Phase 8. The `chart` primitive lands with the block but the dashboard ships without a time-series chart in this phase.
- No per-user dashboard configuration. idea.md §6's "configurable according to the user's role" is satisfied by the role-based company section, not by user-editable widgets.
- No rework of the Phase 2–6 screens (the separate UI sweep).
