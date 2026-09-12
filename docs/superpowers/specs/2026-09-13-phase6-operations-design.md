# Phase 6 — Operations: Design Spec

**Status:** Approved for planning.

## Goal

The higher-level grouping object that ties tasks/requests/assets/employees together for larger initiatives (`idea.md` §14: "Operations represent larger ongoing activities or operational initiatives," e.g. "Vienna Office Relocation," "Production Line 3 Maintenance"). Operations are a thin coordination layer over entities that already exist independently — creating an operation does not spawn tasks or requests; it links ones that already exist (or get created normally and linked afterward).

This phase follows the established Phase 2–5 pattern: thin Route Handlers validate with Zod and delegate to a domain layer that is the sole authorization boundary and the sole place that talks to Supabase Postgres.

Three decisions made during brainstorming, narrower than the outline's original sketch (`docs/superpowers/plans/2026-08-26-remaining-phases-outline.md`):

1. **No join tables.** Each task/request/asset/profile links to at most one operation at a time via a direct nullable `related_operation_id` FK — the same one-to-many shape `tasks` already uses for `related_request_id`/`related_asset_id`/`related_workflow_instance_id` — rather than the outline's `operation_tasks`/`operation_requests`/`operation_assets`/`operation_employees` many-to-many join tables. "Link" = set the FK; "unlink" = null it out.
2. **Progress is tasks-only**: `getOperationProgress` is the completed/total ratio of the operation's linked tasks. Requests/assets/employees are informational links, not part of the percentage.
3. **Linking is bidirectional in the UI**: an "add existing X" picker lives on the operation detail page for each of the four entity types, *and* each of task/request/asset/employee detail pages gets a small "attach to operation" control. Both directions call the same generic link/unlink domain function and API route.

## Data Model

```sql
create type operation_status as enum ('planning', 'in_progress', 'on_hold', 'completed', 'cancelled');
create type operation_priority as enum ('low', 'medium', 'high', 'critical'); -- same values as task_priority, kept as its own type

create table operations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  title text not null,
  description text,
  owner_id uuid not null references profiles(id),
  department_id uuid references departments(id) on delete set null,
  status operation_status not null default 'planning',
  priority operation_priority not null default 'medium',
  start_date date,
  target_date date,
  created_at timestamptz not null default now()
);

create index operations_company_id_idx on operations(company_id);
create index operations_owner_id_idx on operations(owner_id);
create index operations_department_id_idx on operations(department_id);

alter table tasks add column related_operation_id uuid references operations(id) on delete set null;
alter table requests add column related_operation_id uuid references operations(id) on delete set null;
alter table assets add column related_operation_id uuid references operations(id) on delete set null;
alter table profiles add column related_operation_id uuid references operations(id) on delete set null;

create index tasks_related_operation_id_idx on tasks(related_operation_id);
create index requests_related_operation_id_idx on requests(related_operation_id);
create index assets_related_operation_id_idx on assets(related_operation_id);
create index profiles_related_operation_id_idx on profiles(related_operation_id);
```

`comments` and `activity_log` are already generic over `entity_type` (free text) — `"operation"` needs no schema change, just call sites in the domain layer, matching how every other entity type already logs activity and hosts comments.

## Permissions (`lib/domain/permissions.ts`)

```ts
export interface OperationLike {
  companyId: string;
}

export function canCreateOperation(profile: Profile): boolean {
  return profile.role === "operations_manager" || profile.role === "admin";
}

export function canManageOperation(profile: Profile, operation: OperationLike): boolean {
  if (profile.companyId !== operation.companyId) return false;
  return profile.role === "operations_manager" || profile.role === "admin";
}

export function canViewOperation(profile: Profile, operation: OperationLike): boolean {
  return profile.companyId === operation.companyId;
}
```

Company-wide visibility (`idea.md`: "company-wide operational visibility" is a stated pillar) — anyone in the company can view any operation. Only `operations_manager`/`admin` can create, edit, or link/unlink entities (`canManageOperation` gates the link/unlink action too, checked against the *operation's* company, not the entity being linked — the entity being linked is separately confirmed same-company by the link function itself, see below).

## Domain Layer (`lib/domain/operations.ts`)

```ts
export interface Operation {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  ownerId: string;
  departmentId: string | null;
  status: OperationStatus;
  priority: OperationPriority;
  startDate: string | null;
  targetDate: string | null;
  createdAt: string;
}

export interface OperationProgress {
  completedTasks: number;
  totalTasks: number;
}

export interface OperationDetail {
  operation: Operation;
  progress: OperationProgress;
  tasks: Task[];
  requests: Request[];
  assets: Asset[];
  employees: Profile[];
}

export async function createOperation(profile: Profile, input: CreateOperationInput): Promise<Operation>
export async function updateOperation(profile: Profile, operationId: string, input: UpdateOperationInput): Promise<Operation>
export async function getOperation(profile: Profile, operationId: string): Promise<OperationDetail>
export async function listOperations(profile: Profile, filters: OperationFilters): Promise<Operation[]>

export type LinkableEntityType = "task" | "request" | "asset" | "employee";

export async function linkEntity(
  profile: Profile,
  operationId: string,
  entityType: LinkableEntityType,
  entityId: string
): Promise<void>

export async function unlinkEntity(
  profile: Profile,
  operationId: string,
  entityType: LinkableEntityType,
  entityId: string
): Promise<void>
```

- `createOperation`: `canCreateOperation` check; `ownerId` defaults to `profile.id` when `input.ownerId` is omitted, otherwise must resolve to a profile in the same company (mirrors the `assignAsset` target-employee check added in Phase 5's post-review fix).
- `getOperation`: loads the operation (`canViewOperation`), then its linked tasks/requests/assets/employees (four `select ... where related_operation_id = ...` queries, company-scoped) and computes `progress` from the tasks list already fetched (no extra query).
- `linkEntity`/`unlinkEntity`: `canManageOperation` check against the operation; loads the target entity via its own domain module (`loadTaskOrThrow`/`loadRequestOrThrow`/`loadAssetOrThrow`/`getProfileById`), throws `NotFoundError` if it doesn't resolve to the same company as the operation, then writes `related_operation_id` (the operation's id, or `null` for unlink) directly via `createSupabaseAdminClient()` — logs activity on both the operation and the entity ("linked to operation X" / "operation Y linked this task"), broadcasts a change on the operation's channel.
- Every write logs activity and broadcasts, following the existing pattern (try/catch around `broadcastChange` so a broadcast failure never fails the request).

## Validation (`lib/validation/operations.ts`)

```ts
export const operationStatusSchema = z.enum(["planning", "in_progress", "on_hold", "completed", "cancelled"]);
export const operationPrioritySchema = z.enum(["low", "medium", "high", "critical"]);

export const createOperationSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  ownerId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  priority: operationPrioritySchema.optional(),
  startDate: z.string().date().optional(),
  targetDate: z.string().date().optional(),
});

export const updateOperationSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  ownerId: z.string().uuid().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  status: operationStatusSchema.optional(),
  priority: operationPrioritySchema.optional(),
  startDate: z.string().date().nullable().optional(),
  targetDate: z.string().date().nullable().optional(),
});

export const operationFiltersSchema = z.object({
  status: operationStatusSchema.optional(),
  departmentId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
});

export const linkEntitySchema = z.object({
  entityType: z.enum(["task", "request", "asset", "employee"]),
  entityId: z.string().uuid(),
});
```

## API Routes

- `GET /api/operations` — list, `operationFiltersSchema` query params. `POST /api/operations` — create.
- `GET /api/operations/[id]` — detail (`OperationDetail`). `PATCH /api/operations/[id]` — update.
- `POST /api/operations/[id]/link` — body `linkEntitySchema`. Used by both the operation page's "add existing X" picker and each entity detail page's "attach to operation" control (the latter already knows its own `entityType`/`entityId`; the user just picks which operation from a `GET /api/operations` list).
- `POST /api/operations/[id]/unlink` — same body shape.

## Frontend

- `/operations` — list page, shadcn table block, filters (status, department). `BackLink` not needed (this is one of the app's root sections, reached from the dashboard nav like `/tasks`/`/requests`).
- `/operations/new` — creation form (title, description, owner picker, department picker, priority, start/target date). `BackLink` → `/operations`.
- `/operations/[id]` — detail page. `BackLink` → `/operations`. Shows title/status/priority (editable inline if `canManageOperation`), progress bar (`completedTasks / totalTasks`), four sections (tasks/requests/assets/employees) each rendering its linked items plus a "+ Link existing" picker when the caller can manage; comments + activity feed (reusing the existing generic components from Phase 2).
- Task/Request/Asset/Employee detail pages each get a small "Operation" control: shows the linked operation (if any) as a link to `/operations/[id]`, plus a picker to attach/detach when the caller is `operations_manager`/`admin`. Four small, near-identical components (`TaskOperationControl`, etc.) rather than one generalized one — matches this codebase's existing preference for small per-entity components (e.g. `AssetAssignControl` vs `TaskAssetAssignmentForm` are separate today) over a shared abstraction fighting four slightly different contexts.

## Non-goals (deferred)

- The dashboard's "Active Operations" progress-bar widget (`idea.md`'s example dashboard) belongs to Phase 7 (Dashboard/Overview), which already owns the dashboard.
- No operation-level attachments — not listed among `idea.md` §14's Operation fields (title/description/owner/department/status/priority/dates/tasks/requests/employees/assets/comments/activity).
- No cascading behavior when an operation is deleted or completed (e.g. auto-unlinking or blocking linked-item edits) — deleting an operation isn't in scope for this phase (no delete endpoint); `on delete set null` on the four FK columns is the only cascade behavior, in case a future phase adds delete.

## Testing Plan

Standard Phase 2–5 shape: `lib/domain/operations.test.ts` (integration, `describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)`, real Supabase project, per-file company slug fixtures) covering create/update/list/get/link/unlink and their permission boundaries; `lib/validation/operations.test.ts` (unit); `lib/domain/permissions.test.ts` additions for the three new functions; route tests for the four new route files (six endpoint methods total) following the existing `route.test.ts` pattern; component tests for the new frontend pieces following the existing `*.test.tsx` pattern (React Testing Library, mocked fetch).
