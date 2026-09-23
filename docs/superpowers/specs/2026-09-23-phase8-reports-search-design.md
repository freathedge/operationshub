# Phase 8 — Reports & Search — Design

Date: 2026-09-23
Outline section: `docs/superpowers/plans/2026-08-26-remaining-phases-outline.md` § Phase 8
Product source: `docs/idea.md` §17 (Reports) and §20 (Search and Filtering)
Architecture: `docs/architecture.md` §8 (Search), §9 (Reports)

---

## 1. Goal

Two independent features that ship together because the outline groups them as one phase: operational reports (idea.md §17) and global full-text search (idea.md §20). Neither depends on the other; they share a spec only because they're being built in the same branch.

**Reports**: four SQL-aggregation metrics from idea.md §17's list — `requestsByDepartment`, `avgRequestCompletionTime`, `taskStatistics`, `workflowCompletionRate` — rendered on a new `/reports` page with Recharts, visible only to `operations_manager`/`admin` (the same `canViewCompanyOverview` gate the dashboard's company section already uses).

**Search**: Postgres full-text search (`tsvector` + GIN index) across `profiles`, `tasks`, `requests`, `assets`, `operations`, and (index only, not a result type this phase — see §6) `workflow_templates`, wired into the sidebar's existing "Search" entry (currently an inert placeholder, `url: "#"`, left that way deliberately during the sidebar-shell phase for this phase to fill in) as a `⌘K` command-palette.

## 2. Decisions taken during brainstorming

**Reports gating: `operations_manager`/`admin` only**, reusing `canViewCompanyOverview` from `lib/domain/permissions.ts` (no new permission function). Reports show company-wide numbers; this matches the dashboard's company section's existing gate exactly.

**`avgRequestCompletionTime` has no source column to read from.** `requests` has neither `completed_at` nor `updated_at` — Phase 3 never needed one, and the outline's migration list for this phase is scoped to `tsvector` columns only, not new business columns. Rather than add one, completion time is derived from `activity_log`: every status transition already logs `"${profile.fullName} changed status from "${request.status}" to "${status}""` (`lib/domain/requests.ts`'s `transitionRequestStatus`). The metric finds, for each completed request, the `activity_log` row where `entity_type = 'request'`, `entity_id` matches, and `message LIKE '%to "completed"'`, and uses that row's `created_at` as the completion timestamp, averaged against the request's own `created_at`, grouped by `category` (matching idea.md §17's own example grouping — Equipment/Software/Access/Procurement — not by department). This is a deliberate, accepted tradeoff: a string match against a human-readable log message instead of a structured column, chosen because it needs no schema change and the message format is already stable (one call site, unchanged since Phase 3). A request with no such transition (still open, or was rejected) is simply excluded from the average — there's nothing to measure yet.

**`requestsByDepartment` counts open requests only** (`status` not in `completed`/`rejected` — the same open-status set the dashboard already uses), not an all-time total. idea.md §17's own example doesn't specify, but the framing — "help managers identify bottlenecks" — is about current load, not historical volume; an all-time count would just track company age.

**Search scoping matches each entity's existing list-view visibility, not a blanket company-wide match.** Checked directly: `listTasks` and `listRequests` both apply real role-based restriction beyond `company_id` for non-elevated roles (a plain `employee` only sees tasks/requests they created or are assigned to; a `manager` additionally sees their department's). `listAssets`, `listProfilesByCompany` (used by `listEmployees`), and `listWorkflowTemplates` are already company-wide with no further restriction — `canViewOperation` likewise has no restriction beyond `companyId` match. So `search()` reuses each table's own `list*` function's exact SQL predicate (the same `.or(...)` clauses, not the stricter single-record `canViewTask`/`canViewRequest`/`canViewAsset` functions, which check different things like an approval's specific approver — `listRequests` itself doesn't check that, and search matches `listRequests`, not `canViewRequest`). This was a deliberate check, not an assumption: without it, a plain employee searching "laptop" could see the title of a colleague's private task they'd never otherwise be shown.

**Search UI: the sidebar's existing "Search" secondary-nav entry becomes a real trigger**, opening a `CommandDialog` (shadcn's `command` + `dialog` primitives, wrapping `cmdk` — none of these three are installed yet; `command`'s own dependency list also pulls `textarea` and `input-group`, neither used by this phase but harmless to have, same precedent as every other "pull the block, keep what the CLI brings" decision in this project). A global `⌘K`/`Ctrl+K` listener opens it from anywhere in the app, not just by clicking the sidebar item. Results are grouped by type (`CommandGroup` per entity type) and clicking one navigates to that entity's existing detail page.

**No filtering-UI work in this phase.** idea.md §20 bundles "Search and Filtering" as one idea, but the filtering half (status/priority/department/assignee/date/location/category filters "available in major list views") is already substantially built — `task-list-view`/`request-list-view` already have status/priority/category/department-adjacent filters from Phases 2–3, and the dashboard-interactivity branch added URL-driven `assigneeId`/`departmentId` filtering on top. This phase is search only; a full filtering audit, if one's ever needed, is separate scope.

## 3. Reports — domain layer

`lib/domain/reports.ts`, four functions, each takes `(profile: Profile)` and internally checks `canViewCompanyOverview(profile)`, throwing `ForbiddenError` if not — matching `getCompanyOverview`'s existing pattern exactly (the check is the function's own first line, not left to the caller).

```ts
export interface DepartmentRequestCount {
  departmentId: string;
  departmentName: string;
  count: number;
}

export interface CategoryCompletionTime {
  category: RequestCategory;
  avgDays: number;
  sampleSize: number;
}

export interface TaskStatistics {
  open: number;
  completed: number;
  overdue: number;
}

export interface TemplateCompletionRate {
  templateId: string;
  templateName: string;
  completionRate: number; // 0-1
  totalInstances: number;
}

export async function requestsByDepartment(profile: Profile): Promise<DepartmentRequestCount[]>;
export async function avgRequestCompletionTime(profile: Profile): Promise<CategoryCompletionTime[]>;
export async function taskStatistics(profile: Profile): Promise<TaskStatistics>;
export async function workflowCompletionRate(profile: Profile): Promise<TemplateCompletionRate[]>;
```

- `requestsByDepartment`: `requests` grouped by `department_id`, `status` in the open set, joined to `departments` for the display name; a request with `department_id IS NULL` is excluded (nothing to group it under — this only happens for requests created without a department, which the creation form doesn't currently allow, so this is a defensive exclusion, not an expected case).
- `avgRequestCompletionTime`: per §2's derivation, grouped by `category`. `sampleSize` (how many completed requests contributed) travels with each row so the UI can show "based on N requests" rather than presenting a possibly-single-data-point average as if it were solid.
- `taskStatistics`: `open` = `status` in (`todo`, `in_progress`, `blocked`); `completed` = `status = 'completed'`; `overdue` = `due_date < now()` and `status` in the open set (an overdue task is also counted in `open` — the two aren't mutually exclusive, matching how the dashboard's own `upcoming.overdue` already works).
- `workflowCompletionRate`: per `workflow_templates` row, `completionRate = count(instances where status='completed') / count(all instances)`; a template with zero instances is excluded (a rate with no denominator isn't a rate).

## 4. Reports — API and frontend

`app/api/reports/route.ts` — one `GET`, no query params, returns all four metrics in one response body (`{ requestsByDepartment, avgRequestCompletionTime, taskStatistics, workflowCompletionRate }`). One endpoint, not four — the page loads all of them together, and `canViewCompanyOverview`'s check is identical for all four, so there's no reason to force four round-trips.

`app/(app)/reports/page.tsx` — Server Component, `redirect("/dashboard")` if `!canViewCompanyOverview(profile)` (not `/login`, since the user IS authenticated — they're just not allowed to see this specific page; redirecting to the app's root matches how an unauthorized-but-authenticated visit should behave, since there's no dedicated "forbidden" page anywhere else in this app either).

Chart components under `components/reports/`, each taking its slice of the API response as props (matching the dashboard's established pattern of presentational components that don't fetch their own data):
- `RequestsByDepartmentChart` — Recharts `BarChart` via `ChartContainer` (`components/ui/chart.tsx`, installed since Phase 7, unused until now), one bar per department.
- `AvgCompletionTimeChart` — same `BarChart` pattern, one bar per category, with the sample size shown as a caption under each bar (or a tooltip — implementer's call, not worth a spec-level decision).
- `TaskStatisticsCard` — three stat numbers (open/completed/overdue), not a chart — matches idea.md §17's own framing that this isn't meant to be BI software.
- `WorkflowCompletionCard` — a simple list, one row per template with its completion percentage.

## 5. Search — migration

New migration, generated `tsvector` columns (Postgres `GENERATED ALWAYS AS ... STORED`) plus a GIN index per table:

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

`'english'` matches the language config used both when generating each column and when the query side calls `websearch_to_tsquery('english', ...)` (§6) — a mismatch between the two configs would silently return zero matches.

## 6. Search — domain layer

`lib/domain/search.ts`:

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

A blank or whitespace-only `query` returns `[]` immediately, without querying anything — the command palette's empty state, not a "match everything" query.

Five queries run in `Promise.all` (matching `getCompanyOverview`'s existing fan-out pattern), each: `search_vector @@ websearch_to_tsquery('english', query)`, `.limit(5)`, plus the *exact* scoping predicate that table's own `list*` function already applies for this `profile` (per §2 — reusing `listTasks`'/`listRequests`' existing `.or(...)` branches for tasks/requests; a plain `.eq("company_id", ...)` for the other three, since their own list functions don't restrict further). Results map to `{ type, id, label, href }`:

| Type | `label` from | `href` |
|---|---|---|
| `task` | `title` | `/tasks/{id}` |
| `request` | `title` | `/requests/{id}` |
| `asset` | `name` | `/assets/{id}` |
| `employee` | `full_name` | `/employees/{id}` |
| `operation` | `title` | `/operations/{id}` |

**`workflow_templates` is not a search result type in this phase**, even though its `tsvector` column is still created per §5 (matching this project's established pattern of installing infrastructure ahead of its UI — `recharts`/`chart.tsx` since Phase 7, unused until this phase). Checked directly: `/workflows/[id]` is a *workflow instance* detail page, not a template's, and no page anywhere renders `/api/workflows/templates`'s data — templates are only ever consumed programmatically today (e.g. deciding which workflow to auto-start on a request approval). Building a template detail page has no other driver in this phase's scope; giving search a result type with nowhere to send the click would be worse than not having it. `SearchResultType` therefore has 5 members (`"task" | "request" | "asset" | "employee" | "operation"`), not 6, and `search()`'s `Promise.all` runs 5 queries, not 6.

## 7. Search — API and frontend

`app/api/search/route.ts` — `GET ?q=<query>`. No role gate beyond authentication (matches `listAssets`/`listProfilesByCompany`/`listWorkflowTemplates`'s own company-wide-by-default visibility — there's no "who can search" restriction beyond "who can use the app").

`components/search/command-search.tsx` — client component, rendered once in the app shell (likely `app/(app)/layout.tsx`, alongside `AppSidebar`, so the `⌘K` listener is always live regardless of which page is open). Uses shadcn's `CommandDialog` (open state controlled by both the sidebar's "Search" click and a global `keydown` listener for `⌘K`/`Ctrl+K`), debounces the typed query (300ms, matching no existing precedent in this codebase but a conventional value for a live-search box) before calling `/api/search`, groups results into a `CommandGroup` per `type`, and `router.push(result.href)` + closes the dialog on selection.

The sidebar's `navSecondary` "Search" item (`components/app-sidebar.tsx`) changes from a dead `url: "#"` link to a button that opens this dialog's state (owned by the new `command-search.tsx` component, not by `nav-secondary.tsx` itself — `NavSecondary` stays a dumb link-renderer per the sidebar-shell phase's own design; the Search item's `onClick` needs a different code path than a link, which is an implementation-time detail for the plan, not a spec-level architecture change).

## 8. Testing

Following this repo's existing split (`test:unit` / `test:integration`):

**Integration** (`lib/domain/reports.test.ts`, `lib/domain/search.test.ts`, real Supabase):
- Each report metric: real fixtures, assert the computed numbers; `ForbiddenError` for a non-elevated role on all four.
- `search()`: a query matching a task, request, asset, employee, and operation each return the right `type`/`href`; a non-elevated employee's search does NOT surface a colleague's private task or another department's request (the exact leak §2 checked for); an empty query returns `[]` without hitting the database in a way that would time out or return everything (assert `[]`, not just "doesn't crash").

**Component**: chart wrapper components (props render correctly, matching the dashboard chart components' existing test style), `command-search.tsx` (opens on `⌘K`, debounces, groups by type, navigates on select — mocking `fetch` and `next/navigation`'s `useRouter`, matching every other client-component test in this codebase).

## 9. Out of scope

- New filtering UI beyond what already exists (§2).
- A dedicated `/workflows/templates/[id]` detail page — resolved by the plan per §6's footnote, not mandated here.
- Any change to the 6 searchable tables' existing domain functions beyond adding the generated column (their `list*`/`create*`/`update*` functions are untouched — the new column is populated automatically by Postgres, nothing in the domain layer needs to write to it).
- Real-time search-index updates via Realtime broadcast — the generated column updates synchronously on every write already (it's a Postgres generated column, not a separately-maintained index needing an update job), so there's nothing to build here.
- Saved searches, search history, or any search personalization.
