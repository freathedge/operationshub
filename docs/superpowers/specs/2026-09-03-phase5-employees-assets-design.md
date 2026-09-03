# Phase 5 — Employees & Assets: Design Spec

**Status:** Approved for planning.

## Goal

Operational employee profiles and the company asset registry, closing the loop so the Equipment Request workflow (Phase 4) ends in a real assigned asset (`idea.md` §23), and so the Employee Onboarding workflow (seeded but unstartable in Phase 4) finally has a trigger (`idea.md` §12's "HR creates employee"). `idea.md` §15/§16: employees are the existing `profiles` viewed operationally (not a new table); assets are a new entity type.

This phase follows the Phase 2–4 pattern: thin Route Handlers validate with Zod and delegate to a domain layer that is the sole authorization boundary and the sole place that talks to Supabase Postgres.

Two decisions expand this phase beyond the outline's original bullet list (`docs/superpowers/plans/2026-08-26-remaining-phases-outline.md`), made explicitly during brainstorming:

1. **The Equipment workflow's "Asset Assigned" task actually creates and assigns a real asset** when completed, rather than IT doing that manually out-of-band.
2. **This phase also wires the Employee Onboarding trigger** ("HR creates employee"), which the Phase 4 spec explicitly deferred here ("once the Employee entity exists") even though it isn't in the Phase 5 outline bullets. Since profiles today only ever come from self-service signup, this requires a new employee-invite mechanism (§4).

## Data Model

### `profiles` extension

```sql
create type profile_status as enum ('active', 'inactive');

alter table profiles add column position_title text;
alter table profiles add column employee_number text;
alter table profiles add column location_id uuid references locations(id) on delete set null;
alter table profiles add column status profile_status not null default 'active';
alter table profiles add constraint profiles_employee_number_unique unique (company_id, employee_number);
```

Existing self-signup profiles get `position_title` / `employee_number` / `location_id` = `null` and `status` = `'active'` — no backfill needed. `employee_number` is nullable (existing profiles never get one unless HR/admin backfills it via `updateEmployee`); the unique constraint still holds since Postgres allows multiple `null`s in a unique index.

### `assets`

```sql
create type asset_status as enum ('available', 'assigned', 'maintenance', 'retired', 'lost');

create table assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  asset_code text not null,          -- auto-generated, e.g. "AST-00001"
  name text not null,                -- e.g. 'MacBook Pro 14"'
  category text not null,            -- free text: laptop, monitor, vehicle, tool, ... — not a closed enum, matching idea.md's open example list
  status asset_status not null default 'available',
  assigned_to uuid references profiles(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  location_id uuid references locations(id) on delete set null,
  purchase_info jsonb,
  warranty_info jsonb,
  created_at timestamptz not null default now(),

  unique (company_id, asset_code)
);

create index assets_company_id_idx on assets(company_id);
create index assets_assigned_to_idx on assets(assigned_to);
create index assets_department_id_idx on assets(department_id);
```

### `tasks` extension

```sql
alter table tasks add column related_asset_id uuid references assets(id);
```

Same generic cross-link pattern as `related_employee_id` / `related_request_id` / `related_workflow_instance_id`. Used by the asset detail page's "Report an issue" quick action (creates a plain task linked to the asset via the existing `createTask` input, extended with an optional `relatedAssetId`). **Not** auto-wired into the Maintenance workflow in this phase — maintenance requests have no structured field identifying *which* asset is broken (`idea.md` §13/§24's own example is a free-text "printer not working," not an asset picker), so there is no reliable data path from a maintenance request to a specific `assets` row yet. Left as a documented gap, not a blocker.

### `workflow_template_steps` extension

```sql
alter table workflow_template_steps add column creates_asset boolean not null default false;
```

Set `true` only on the Equipment Request template's "Asset Assigned" step (seed data update below). This is how the generic engine identifies *which* task-completion needs the asset-assignment form, without hardcoding template slugs or step titles in domain code — consistent with the engine's existing generality (`responsible_role` / `responsible_department_name` resolved by lookup, not branching).

### `workflow_instances` extension

```sql
alter table workflow_instances add column related_employee_id uuid references profiles(id);
```

Needed for `getEmployeeProfile`'s "active workflows" count (§ Domain Layer): Equipment/Maintenance instances are about their originating request's requester, but Employee Onboarding instances have `related_request_id = null` (per the Phase 4 spec) — there is no request to derive the subject employee from. `related_employee_id` makes "which employee is this workflow about" a single direct column for every workflow type, rather than a join through `requests` that silently misses onboarding. `startWorkflow`'s `context` gains an optional `employeeId`; when a `requestId` is given instead, `startWorkflow` loads that request's `created_by` and stores it as `related_employee_id` automatically — callers never have to pass both.

All four migrations follow the established convention: apply via `mcp__claude_ai_Supabase__apply_migration`, verify zero `anon`/`authenticated` grants, rename the local file to match the version `list_migrations` reports.

## Permissions (`lib/domain/permissions.ts` additions)

Derived from `idea.md` §21's per-role responsibilities:

```ts
const EMPLOYEE_MANAGER_ROLES = new Set(["hr", "admin"]);
// "HR: manage employee operational information", "initiate onboarding"

const ASSET_MANAGER_ROLES = new Set(["it", "operations_manager", "admin"]);
// "IT: manage relevant assets"; "Operations Manager: manage operations"

export function canCreateEmployee(profile: Profile): boolean {
  return EMPLOYEE_MANAGER_ROLES.has(profile.role);
}

export function canUpdateEmployee(profile: Profile): boolean {
  return EMPLOYEE_MANAGER_ROLES.has(profile.role);
}

export interface EmployeeLike {
  companyId: string;
  id: string;
  managerId: string | null;
}

export function canViewEmployeeProfile(profile: Profile, target: EmployeeLike): boolean {
  if (profile.companyId !== target.companyId) return false;
  if (COMPANY_WIDE_VIEW_ROLES.has(profile.role)) return true;
  if (profile.id === target.id) return true;
  return profile.id === target.managerId; // "Manager: view team members"
}

export interface AssetLike {
  companyId: string;
  assignedTo: string | null;
  departmentId: string | null;
}

export function canCreateAsset(profile: Profile): boolean {
  return ASSET_MANAGER_ROLES.has(profile.role);
}
export function canAssignAsset(profile: Profile): boolean {
  return ASSET_MANAGER_ROLES.has(profile.role);
}
export function canChangeAssetStatus(profile: Profile): boolean {
  return ASSET_MANAGER_ROLES.has(profile.role);
}

export function canViewAsset(profile: Profile, asset: AssetLike): boolean {
  if (profile.companyId !== asset.companyId) return false;
  if (COMPANY_WIDE_VIEW_ROLES.has(profile.role)) return true;
  if (profile.id === asset.assignedTo) return true;
  return profile.departmentId !== null && profile.departmentId === asset.departmentId;
}
```

No status-transition table for assets (unlike tasks/requests) — `available → assigned → maintenance → retired/lost` and back are all reachable directly by an asset manager; the lifecycle is simple enough that a transition graph is unwarranted (YAGNI).

Employee directory listing (`listEmployees`) stays visible to every authenticated profile — it only exposes fields already visible today via `/api/profiles?role=` (name, role, department) plus the new operational fields (position, status), so this is not a new visibility leak.

## Domain Layer

### `lib/domain/employees.ts`

```ts
export async function createEmployee(profile: Profile, input: CreateEmployeeInput): Promise<Employee>
```
1. `canCreateEmployee(profile)` → `ForbiddenError`.
2. `supabase.auth.admin.inviteUserByEmail(input.email)` via `createSupabaseAdminClient()` — creates the `auth.users` row and sends the invite email (email delivery already works today for signup confirmation, per Foundation phase). Throws (propagates the Supabase error) on failure — no profile is created, no orphan state.
3. `createProfile({ authUserId: invited.user.id, companyId: profile.companyId, fullName, role, departmentId, managerId, locationId, positionTitle, employeeNumber })` (extends the existing `createProfile` input with the three new optional fields).
4. `logActivity("profile", employee.id, profile.id, `${profile.fullName} added ${employee.fullName} as a new employee`)`.
5. If `input.startOnboarding` (default `true`): `startWorkflow(profile, "employee-onboarding", { employeeId: employee.id })` wrapped in try/catch (log and continue — same defensiveness as every other cross-module hook in this codebase; a broken onboarding template must never block employee creation).
6. `broadcastChange(profile.companyId, "employees", { type: "employee_created" })`.

```ts
export async function getEmployeeProfile(profile: Profile, employeeId: string): Promise<EmployeeProfile>
```
Loads the target profile (`NotFoundError` if missing or wrong company), checks `canViewEmployeeProfile`, then aggregates in parallel:
- open task count: `tasks` where `assignee_id = employeeId` and `status` not in `('completed','cancelled')`
- submitted request count: `requests` where `created_by = employeeId`
- active workflow count: `workflow_instances` where `related_employee_id = employeeId` and `status = 'in_progress'`
- assigned asset count: `assets` where `assigned_to = employeeId`
- activity timeline: `listActivity("profile", employeeId)`

Returns `{ profile: Employee, counts: { openTasks, requests, activeWorkflows, assets }, activity: ActivityEntry[] }`.

```ts
export async function updateEmployee(profile: Profile, employeeId: string, input: UpdateEmployeeInput): Promise<Employee>
```
`canUpdateEmployee` check; updates any of position/department/manager/location/status; logs activity (`"${profile.fullName} updated ${employee.fullName}'s profile"`); broadcasts.

```ts
export async function listEmployees(profile: Profile, filters: EmployeeFilters): Promise<Employee[]>
```
Company-scoped list, optional `departmentId`/`status` filters, no role gate (see Permissions above).

### `lib/domain/assets.ts`

```ts
export async function createAsset(profile: Profile, input: CreateAssetInput): Promise<Asset>
```
`canCreateAsset` check. Generates `asset_code` as `` `AST-${String(count + 1).padStart(5, "0")}` `` where `count` is `select count(*) from assets where company_id = ...` — a small, accepted race window under concurrent creates, matching the non-transactional tolerance already documented for `advanceWorkflow` in the Phase 4 spec. Inserts, logs activity, broadcasts.

```ts
export async function assignAsset(profile: Profile, assetId: string, targetEmployeeId: string): Promise<Asset>
export async function changeAssetStatus(profile: Profile, assetId: string, newStatus: AssetStatus): Promise<Asset>
export async function getAsset(profile: Profile, assetId: string): Promise<Asset>
export async function listAssets(profile: Profile, filters: AssetFilters): Promise<Asset[]>
```
Standard shape matching `tasks.ts`'s precedent — permission check, mutate, `logActivity`, `broadcastChange` (all broadcasts best-effort, try/catch + log).

```ts
export async function completeAssetAssignmentTask(
  profile: Profile,
  taskId: string,
  input: CreateAssetInput
): Promise<{ task: Task; asset: Asset }>
```
The Phase 4 wiring, called from the new route (§ API Routes):
1. `loadTaskOrThrow(taskId)`.
2. Look up the `workflow_instance_steps` row where `generated_task_id = taskId`, joined to its `workflow_template_steps` row. If none exists, or `creates_asset` is `false`, throw `UnprocessableRequestError("This task does not create an asset")`.
3. Load the `workflow_instances` row → its `related_request_id` → that `requests` row, to get the requester (`created_by`) and `department_id`.
4. `canChangeAssetStatus`-equivalent is not required here — asset creation piggybacks on the caller's existing permission to complete the task (`canChangeTaskStatus`, re-checked inside step 5's `updateTaskStatus` call), since this is "IT completing their assigned task," not a general asset-management action.
5. `createAsset(profile, { ...input, assignedTo: request.createdBy, departmentId: request.departmentId, status: "assigned" })`.
6. Call the **existing** `updateTaskStatus(profile, taskId, "completed")` — reusing Phase 2/4's status-transition validation, activity log, broadcast, and `advanceWorkflow` hook unchanged rather than duplicating any of it. If this throws (e.g. invalid transition), the asset row from step 5 is not rolled back — accepted, matches the codebase's existing non-transactional posture; an orphaned `assigned` asset with no completed task is a rare, manually-recoverable edge case, not a blocker.
7. Returns `{ task: updated, asset }`.

### `lib/domain/workflows.ts` (small extension, precedes new code)

`startWorkflow(profile, templateSlug, context: { requestId?: string; employeeId?: string })`: when inserting the `workflow_instances` row, sets `related_employee_id` to `context.employeeId ?? null`; if `context.requestId` is given and `context.employeeId` is not, loads that request's `created_by` first and uses it instead. No behavior change to the Phase 4 Equipment/Maintenance auto-start call sites (they keep passing only `{ requestId }`; `related_employee_id` is now populated for them automatically as a side effect).

### `lib/domain/profiles.ts` (small extension)

`createProfile`'s input gains three optional fields (`locationId`, `positionTitle`, `employeeNumber`); `Profile`/`toProfile` gain the four new columns (`positionTitle`, `employeeNumber`, `locationId`, `status`). No behavior change for existing callers (`complete-signup` route continues to omit the new fields, which default to `null`/`'active'`).

## Employee-Invite Flow (new territory)

No pre-create-account mechanism exists today — every profile currently comes from self-service signup (`/signup` → email confirmation → role picker → `POST /api/auth/complete-signup`). `createEmployee` (above) uses `supabase.auth.admin.inviteUserByEmail` to create the `auth.users` row and send a real invite email up front, then creates the profile immediately — avoiding any need to make `profiles.auth_user_id` nullable.

New page: `app/auth/accept-invite/page.tsx`. The invite email's link authenticates the browser session (Supabase sets it from the URL fragment on load, same mechanism as the existing `/auth/confirmed` page for signup confirmation); the page presents a "set your password" form calling `supabase.auth.updateUser({ password })`, then redirects to `/dashboard`.

After that, the employee logs in normally. `AppLayout`'s existing check —

```ts
const profile = await getProfileByAuthUserId(user.id);
if (!profile) redirect("/signup");
```

— already finds the profile HR pre-created, so the invited employee lands straight in the app. Today's `/signup` role-picker path is naturally skipped for invited users with **no code change** to that flow.

## Wiring: Equipment Workflow → Real Asset

`WORKFLOW_TEMPLATES` in `lib/domain/seed.ts`: the `equipment-request` template's "Asset Assigned" step (`order: 5`) gets `createsAsset: true`; `seedWorkflowTemplates` passes it through to the `creates_asset` column. All other steps across all three templates default to `false`.

Frontend: the task detail page, when loading a task, additionally fetches whether its workflow step `creates_asset` (extend the `GET /api/tasks/[id]` response with `workflowStep: { createsAsset: boolean } | null`, resolved via the same lookup as `completeAssetAssignmentTask` step 2). If `createsAsset` is `true` and the task isn't yet `completed`, render an inline "Assign Asset & Complete" form (category, name, purchase/warranty info optional) in place of the plain status control; submitting posts to `POST /api/tasks/[id]/complete-with-asset`.

## API Routes

- `GET /api/employees` — `listEmployees` (query: `departmentId`, `status`)
- `POST /api/employees` — `createEmployee`
- `GET /api/employees/[id]` — `getEmployeeProfile`
- `PATCH /api/employees/[id]` — `updateEmployee`
- `GET /api/assets` — `listAssets` (query: `category`, `status`, `departmentId`)
- `POST /api/assets` — `createAsset`
- `GET /api/assets/[id]` — `getAsset`
- `PATCH /api/assets/[id]` — body is `{ action: "assign", targetEmployeeId }` or `{ action: "changeStatus", status }` (discriminated union, mirroring how `/api/tasks/[id]`'s `patchTaskSchema` already discriminates status vs. assignment)
- `POST /api/tasks/[id]/complete-with-asset` — `completeAssetAssignmentTask`

All routes: `getCurrentProfile()` → 401 if absent → Zod-validate → domain call → `toErrorResponse` on failure. Same triple as every prior phase; no new error types needed (`ForbiddenError`, `NotFoundError`, `UnprocessableRequestError` cover every failure mode above).

## Frontend

- **Employee directory** (`app/(app)/employees/page.tsx`): table (name, position, department, status), filters (department/status). "+ New Employee" button, visible only to HR/admin, opens a form (name, email, role, department, manager, position, location, `startOnboarding` checkbox default checked).
- **Employee detail** (`app/(app)/employees/[id]/page.tsx`): `<BackLink href="/employees">`. Header (name, position, department, location, status), summary cards (open tasks / requests / assets / active workflows — `idea.md` §15's exact example), activity timeline. Edit action visible only to HR/admin.
- **Asset list** (`app/(app)/assets/page.tsx`): table (asset code, name, category, status, assigned-to), filters (category/status/department). "+ New Asset" visible only to asset managers.
- **Asset detail** (`app/(app)/assets/[id]/page.tsx`): `<BackLink href="/assets">`. Asset info, "Assign" action, "Change status" action, "Report an issue" quick action (creates a task with `relatedAssetId` set, via the existing task-creation form/endpoint), activity timeline.
- **Task detail page**: conditionally renders the "Assign Asset & Complete" form as described above.
- **`app/auth/accept-invite/page.tsx`**: password-set form for invited employees, as described above.

## Testing

Same convention as Phases 2–4:
- Unit tests (no DB): `permissions.test.ts` extended for the six new `canX` functions.
- Integration tests (`describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)`):
  - `employees.test.ts` — `createEmployee` (including the invite call and the onboarding-workflow auto-start), `getEmployeeProfile`'s aggregation, `updateEmployee`, `listEmployees` filters.
  - `assets.test.ts` — `createAsset`'s `asset_code` sequencing, `assignAsset`, `changeAssetStatus`, and `completeAssetAssignmentTask` end-to-end (submit an equipment request → approve → workflow runs through Procurement/Ordered/Delivered → complete "Asset Assigned" via the asset form → asset created and assigned → workflow instance completes → request status `completed`).
  - `seed.test.ts` extended for the `creates_asset` flag's idempotent upsert.
- `pnpm build` must pass after Supabase types are regenerated (new tables/columns).

## Open Items Deferred Beyond This Phase

- Maintenance workflow stays unlinked to a specific `assets` row (no asset-picker on the request form) — see Data Model note above.
- `asset_code` generation's small race window under concurrent creates (accepted, matches existing `advanceWorkflow` precedent).
- `profiles.status = 'inactive'` is a directory label only in this phase — it does not block login or revoke access.
- No employee self-service edit of their own operational fields — HR/admin only, per `idea.md` §21.
- `completeAssetAssignmentTask`'s asset-then-task-status sequence is non-transactional (same accepted tradeoff as `advanceWorkflow`).
