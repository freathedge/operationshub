# Phase 5 — Employees & Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operational employee profiles and a company asset registry. Completing the Equipment Request workflow's final task creates and assigns a real `assets` row (closing `idea.md` §23's end-to-end scenario); a new HR/admin "create employee" action provisions a real login via Supabase's invite-by-email and starts the Employee Onboarding workflow (closing the trigger the Phase 4 spec deferred here).

**Architecture:** `lib/domain/employees.ts` and `lib/domain/assets.ts` are new domain modules following the exact Phase 2–4 conventions (`snake_case` rows mapped to `camelCase` domain objects, service-role Supabase client, `ForbiddenError`/`NotFoundError`/`UnprocessableRequestError`). `profiles.ts` gains four operational columns plus `updateProfile`/`listProfilesByCompany` (employees.ts stays a thin permission+orchestration layer over the table `profiles.ts` already owns). `workflows.ts` (Phase 4) gets two small extensions: `startWorkflow`'s `context` gains an optional `employeeId`, and a new `findWorkflowStepByTaskId` helper lets `assets.ts` detect "does completing this task create an asset" without any workflow-specific branching in `tasks.ts`. No new infrastructure — same Realtime broadcast helper, same REST-route-as-authorization-boundary pattern, same server-component-fetches-directly-from-domain pattern the task/request/workflow detail pages already use.

**Tech Stack:** Everything from Foundation/Phase 2–4 — no new dependencies. Uses `supabase.auth.admin.inviteUserByEmail`, already-available on the existing service-role admin client.

**Spec:** `docs/superpowers/specs/2026-09-03-phase5-employees-assets-design.md`

## Global Constraints

- REST API (Next.js Route Handlers) is the sole authorization boundary. RLS stays disabled on every table; the service-role key is used server-side only (`lib/domain/**`), never shipped to the browser.
- Hosted Supabase project, no local Docker/CLI dev stack. `project_id` = `yqzcunssgvffischmwle`. Schema changes (DDL) are applied with `mcp__claude_ai_Supabase__apply_migration` (`project_id`, `name`, `query`). Use `mcp__claude_ai_Supabase__list_migrations` and `mcp__claude_ai_Supabase__list_tables` to verify, and `mcp__claude_ai_Supabase__execute_sql` for verification queries.
- Verify after every migration: `select table_name, grantee from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated');` filtered to the changed table must return zero rows.
- **Migration filenames must match the version `apply_migration` actually assigns.** After calling `apply_migration`, call `list_migrations` and rename the local file to `<version-from-list_migrations>_<name>.sql` before committing.
- Regenerate `lib/supabase/database.types.ts` after all five Phase 5 migrations land (Task 6), before any later task that types against the new tables/columns.
- Test/domain-object convention: DB rows are `snake_case`; domain objects are `camelCase` via a private `toX(row)` mapper and an `X_COLUMNS` column-list constant per file — follow `lib/domain/tasks.ts`/`lib/domain/requests.ts` exactly.
- Integration tests hitting the live Supabase project use `describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)`. **Every new integration test file must be added to both the `--exclude` list in `test:unit` and the file list in `test:integration` in `package.json`, in the task that introduces it.**
- Component tests (`*.test.tsx`) run under `// @vitest-environment jsdom` via plain `vitest run` (`pnpm test`) — they are not part of `test:integration` and need no `package.json` change.
- **Ownership convention carried into this phase:** each domain file is the only place that runs Supabase queries against the table it owns. `employees.ts` never writes to `profiles` directly — it calls `profiles.ts`'s exported `createProfile`/`updateProfile`/`listProfilesByCompany`/`getProfileById`. `assets.ts` owns `assets` exclusively.
- **Permission-check-before-side-effect:** `completeAssetAssignmentTask` (Task 16) must verify `canChangeTaskStatus` itself, *before* creating the asset — creating the asset first and only then discovering (via `updateTaskStatus`'s own check) that the caller can't complete the task would leave a real asset row behind from an unauthorized call. Task 16 spells out the exact ordering.
- **Task-status-machine interaction:** a workflow-generated task starts in status `todo` (`generateStepEntity` in `workflows.ts`). `TASK_STATUS_TRANSITIONS.todo` only allows `in_progress`/`cancelled` — there is no direct `todo → completed` path. So the asset-assignment form (Task 32) only replaces the "Move to completed" action once the task is already `in_progress`; while `todo`, the normal `TaskStatusControl` (move to `in_progress`/`cancelled`) stays as-is. Task 32's `TaskStatusControl` change is additive (a new optional prop, default `false`) — no existing caller changes behavior.
- Every task ends with a commit. Commit messages use the `feat:`/`fix:`/`chore:`/`test:`/`docs:` conventional prefix matching the task's nature.
- This plan runs inside its own git worktree/branch (`worktree-phase5-employees-assets-plan`), not on `main`.
- Package manager: pnpm (v10.x). Node.js v22+. TypeScript strict mode throughout.

---

## Task 1: Migration — `profiles` operational fields

**Files:**
- Create: `supabase/migrations/<timestamp>_add_profiles_operational_fields.sql`

**Interfaces:**
- Consumes: `profiles` (Foundation), `locations` (Foundation).
- Produces: enum `profile_status` (`active|inactive`); `profiles.position_title text`, `profiles.employee_number text`, `profiles.location_id uuid references locations(id)`, `profiles.status profile_status not null default 'active'`, unique `(company_id, employee_number)`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/<YYYYMMDDHHMMSS>_add_profiles_operational_fields.sql` (current UTC timestamp, later than the last existing migration `20260828182108_add_tasks_related_workflow_instance_id.sql`) with:

```sql
create type profile_status as enum ('active', 'inactive');

alter table profiles add column position_title text;
alter table profiles add column employee_number text;
alter table profiles add column location_id uuid references locations(id) on delete set null;
alter table profiles add column status profile_status not null default 'active';
alter table profiles add constraint profiles_employee_number_unique unique (company_id, employee_number);

create index profiles_location_id_idx on profiles(location_id);
```

`employee_number` is nullable — Postgres unique indexes allow multiple `null`s, so existing profiles (which never get one unless backfilled) don't collide.

- [ ] **Step 2: Apply the migration**

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id: "yqzcunssgvffischmwle"`, `name: "add_profiles_operational_fields"`, `query` set to the exact SQL from Step 1.

- [ ] **Step 3: Verify**

`mcp__claude_ai_Supabase__execute_sql`:
```sql
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
and column_name in ('position_title', 'employee_number', 'location_id', 'status');
```
Expected: four rows.

```sql
select table_name, grantee from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'profiles' and grantee in ('anon','authenticated');
```
Expected: zero rows (unchanged from Foundation — `alter table` doesn't grant anything new).

- [ ] **Step 4: Rename the local file**

`mcp__claude_ai_Supabase__list_migrations` → rename to `supabase/migrations/<version>_add_profiles_operational_fields.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add operational fields to profiles"
```

---

## Task 2: Migration — `assets` table

**Files:**
- Create: `supabase/migrations/<timestamp>_create_assets.sql`

**Interfaces:**
- Consumes: `companies`, `profiles`, `departments`, `locations` (all Foundation).
- Produces: enum `asset_status` (`available|assigned|maintenance|retired|lost`); table `assets(id, company_id, asset_code, name, category, status, assigned_to, department_id, location_id, purchase_info, warranty_info, created_at)`, unique `(company_id, asset_code)`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/<YYYYMMDDHHMMSS>_create_assets.sql` (timestamp later than Task 1's) with:

```sql
create type asset_status as enum ('available', 'assigned', 'maintenance', 'retired', 'lost');

create table assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  asset_code text not null,
  name text not null,
  category text not null,
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

`category` is free text (laptop, monitor, vehicle, tool, ...) — not a closed enum, matching `idea.md`'s open example list.

- [ ] **Step 2: Apply the migration**

`mcp__claude_ai_Supabase__apply_migration`, `name: "create_assets"`, `query` from Step 1.

- [ ] **Step 3: Verify**

`mcp__claude_ai_Supabase__list_tables` (`project_id: "yqzcunssgvffischmwle"`, `schemas: ["public"]`) → expect `assets`.

```sql
select table_name, grantee from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'assets' and grantee in ('anon','authenticated');
```
Expected: zero rows.

- [ ] **Step 4: Rename the local file**

`list_migrations` → rename to `<version>_create_assets.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add assets table"
```

---

## Task 3: Migration — `tasks.related_asset_id` column

**Files:**
- Create: `supabase/migrations/<timestamp>_add_tasks_related_asset_id.sql`

**Interfaces:**
- Consumes: `tasks` (Phase 2), `assets` (Task 2).
- Produces: `tasks.related_asset_id uuid references assets(id)`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/<YYYYMMDDHHMMSS>_add_tasks_related_asset_id.sql` (timestamp later than Task 2's) with:

```sql
alter table tasks add column related_asset_id uuid references assets(id);

create index tasks_related_asset_id_idx on tasks(related_asset_id);
```

- [ ] **Step 2: Apply the migration**

`mcp__claude_ai_Supabase__apply_migration`, `name: "add_tasks_related_asset_id"`, `query` from Step 1.

- [ ] **Step 3: Verify**

```sql
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'tasks' and column_name = 'related_asset_id';
```
Expected: one row, `data_type = 'uuid'`.

- [ ] **Step 4: Rename the local file**

`list_migrations` → rename to `<version>_add_tasks_related_asset_id.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add tasks.related_asset_id column"
```

---

## Task 4: Migration — `workflow_template_steps.creates_asset` column

**Files:**
- Create: `supabase/migrations/<timestamp>_add_workflow_template_steps_creates_asset.sql`

**Interfaces:**
- Consumes: `workflow_template_steps` (Phase 4).
- Produces: `workflow_template_steps.creates_asset boolean not null default false`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/<YYYYMMDDHHMMSS>_add_workflow_template_steps_creates_asset.sql` (timestamp later than Task 3's) with:

```sql
alter table workflow_template_steps add column creates_asset boolean not null default false;
```

Set `true` only on the Equipment Request template's "Asset Assigned" step (Task 18) — this is how the engine identifies which task-completion needs the asset-assignment form, without hardcoding template slugs or step titles in domain code.

- [ ] **Step 2: Apply the migration**

`mcp__claude_ai_Supabase__apply_migration`, `name: "add_workflow_template_steps_creates_asset"`, `query` from Step 1.

- [ ] **Step 3: Verify**

```sql
select column_name, data_type, column_default from information_schema.columns
where table_schema = 'public' and table_name = 'workflow_template_steps' and column_name = 'creates_asset';
```
Expected: one row, `data_type = 'boolean'`, `column_default = 'false'`.

- [ ] **Step 4: Rename the local file**

`list_migrations` → rename to `<version>_add_workflow_template_steps_creates_asset.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add workflow_template_steps.creates_asset column"
```

---

## Task 5: Migration — `workflow_instances.related_employee_id` column

**Files:**
- Create: `supabase/migrations/<timestamp>_add_workflow_instances_related_employee_id.sql`

**Interfaces:**
- Consumes: `workflow_instances` (Phase 4), `profiles` (Foundation).
- Produces: `workflow_instances.related_employee_id uuid references profiles(id)`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/<YYYYMMDDHHMMSS>_add_workflow_instances_related_employee_id.sql` (timestamp later than Task 4's) with:

```sql
alter table workflow_instances add column related_employee_id uuid references profiles(id);

create index workflow_instances_related_employee_id_idx on workflow_instances(related_employee_id);
```

Needed because Employee Onboarding instances have `related_request_id = null` (per the Phase 4 spec) — there is no request to derive "which employee is this workflow about" from. `related_employee_id` makes that a single direct column for every workflow type (Task 9 populates it for all three templates, not just onboarding).

- [ ] **Step 2: Apply the migration**

`mcp__claude_ai_Supabase__apply_migration`, `name: "add_workflow_instances_related_employee_id"`, `query` from Step 1.

- [ ] **Step 3: Verify**

```sql
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'workflow_instances' and column_name = 'related_employee_id';
```
Expected: one row, `data_type = 'uuid'`.

- [ ] **Step 4: Rename the local file**

`list_migrations` → rename to `<version>_add_workflow_instances_related_employee_id.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add workflow_instances.related_employee_id column"
```

---

## Task 6: Regenerate Supabase types

**Files:**
- Modify: `lib/supabase/database.types.ts`

**Interfaces:**
- Produces: `Database["public"]["Tables"]` including `assets`, `profiles` with its four new columns, `workflow_template_steps` with `creates_asset`, `workflow_instances` with `related_employee_id`, and `tasks` with `related_asset_id`, matching Tasks 1–5.

- [ ] **Step 1: Regenerate the database types**

Call `mcp__claude_ai_Supabase__generate_typescript_types` with `project_id: "yqzcunssgvffischmwle"`. Overwrite `lib/supabase/database.types.ts` with the tool's `types` field verbatim.

- [ ] **Step 2: Verify the project builds**

Run: `pnpm build`
Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/database.types.ts
git commit -m "chore: regenerate Supabase types for Phase 5 tables"
```

---

## Task 7: `profiles.ts` — extend `Profile` with operational fields

**Files:**
- Modify: `lib/domain/profiles.ts`, `lib/domain/profiles.test.ts`, `lib/domain/permissions.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ProfileStatus` type + `PROFILE_STATUSES` array; `Profile` gains `positionTitle: string | null`, `employeeNumber: string | null`, `locationId: string | null`, `status: ProfileStatus`; `createProfile`'s input gains optional `locationId`, `positionTitle`, `employeeNumber`. Consumed by every later task in this plan.

- [ ] **Step 1: Write the failing test**

Add to `lib/domain/profiles.test.ts`, inside the existing `describe.skipIf(...)(...)` block, right after the `"creates a profile and retrieves it by auth user id"` test:

```ts
    it("creates a profile with operational fields and defaults status to active", async () => {
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: `profile-test-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
      if (authError || !authUser.user) throw authError;
      createdAuthUserIds.push(authUser.user.id);

      const created = await createProfile({
        authUserId: authUser.user.id,
        companyId,
        fullName: "Operational Employee",
        role: "employee",
        positionTitle: "Software Engineer",
        employeeNumber: `EMP-${crypto.randomUUID().slice(0, 8)}`,
      });

      expect(created.positionTitle).toBe("Software Engineer");
      expect(created.employeeNumber).not.toBeNull();
      expect(created.locationId).toBeNull();
      expect(created.status).toBe("active");
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration lib/domain/profiles.test.ts`
Expected: FAIL — TypeScript error, `createProfile`'s input type has no `positionTitle`/`employeeNumber` properties.

- [ ] **Step 3: Extend `lib/domain/profiles.ts`**

Change the top of the file from:

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/validation/auth";

export interface Profile {
  id: string;
  authUserId: string;
  companyId: string;
  fullName: string;
  role: Role;
  departmentId: string | null;
  managerId: string | null;
}

interface ProfileRow {
  id: string;
  auth_user_id: string;
  company_id: string;
  full_name: string;
  role: Role;
  department_id: string | null;
  manager_id: string | null;
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    companyId: row.company_id,
    fullName: row.full_name,
    role: row.role,
    departmentId: row.department_id,
    managerId: row.manager_id,
  };
}

const PROFILE_COLUMNS =
  "id, auth_user_id, company_id, full_name, role, department_id, manager_id";
```

to:

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/validation/auth";

export type ProfileStatus = "active" | "inactive";
export const PROFILE_STATUSES: ProfileStatus[] = ["active", "inactive"];

export interface Profile {
  id: string;
  authUserId: string;
  companyId: string;
  fullName: string;
  role: Role;
  departmentId: string | null;
  managerId: string | null;
  positionTitle: string | null;
  employeeNumber: string | null;
  locationId: string | null;
  status: ProfileStatus;
}

interface ProfileRow {
  id: string;
  auth_user_id: string;
  company_id: string;
  full_name: string;
  role: Role;
  department_id: string | null;
  manager_id: string | null;
  position_title: string | null;
  employee_number: string | null;
  location_id: string | null;
  status: ProfileStatus;
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    companyId: row.company_id,
    fullName: row.full_name,
    role: row.role,
    departmentId: row.department_id,
    managerId: row.manager_id,
    positionTitle: row.position_title,
    employeeNumber: row.employee_number,
    locationId: row.location_id,
    status: row.status,
  };
}

const PROFILE_COLUMNS =
  "id, auth_user_id, company_id, full_name, role, department_id, manager_id, position_title, employee_number, location_id, status";
```

Change `createProfile` from:

```ts
export async function createProfile(input: {
  authUserId: string;
  companyId: string;
  fullName: string;
  role: Role;
  departmentId?: string | null;
  managerId?: string | null;
}): Promise<Profile> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .insert({
      auth_user_id: input.authUserId,
      company_id: input.companyId,
      full_name: input.fullName,
      role: input.role,
      department_id: input.departmentId ?? null,
      manager_id: input.managerId ?? null,
    })
    .select(PROFILE_COLUMNS)
    .single();

  if (error) throw error;
  return toProfile(data);
}
```

to:

```ts
export async function createProfile(input: {
  authUserId: string;
  companyId: string;
  fullName: string;
  role: Role;
  departmentId?: string | null;
  managerId?: string | null;
  locationId?: string | null;
  positionTitle?: string | null;
  employeeNumber?: string | null;
}): Promise<Profile> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .insert({
      auth_user_id: input.authUserId,
      company_id: input.companyId,
      full_name: input.fullName,
      role: input.role,
      department_id: input.departmentId ?? null,
      manager_id: input.managerId ?? null,
      location_id: input.locationId ?? null,
      position_title: input.positionTitle ?? null,
      employee_number: input.employeeNumber ?? null,
    })
    .select(PROFILE_COLUMNS)
    .single();

  if (error) throw error;
  return toProfile(data);
}
```

- [ ] **Step 4: Fix `lib/domain/permissions.test.ts`'s `makeProfile` helper**

`Profile` now requires four more fields, so the hand-built test fixture must supply them. Change:

```ts
function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "profile-1",
    authUserId: "auth-1",
    companyId: "company-1",
    fullName: "Test User",
    role: "employee",
    departmentId: null,
    managerId: null,
    ...overrides,
  };
}
```

to:

```ts
function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "profile-1",
    authUserId: "auth-1",
    companyId: "company-1",
    fullName: "Test User",
    role: "employee",
    departmentId: null,
    managerId: null,
    positionTitle: null,
    employeeNumber: null,
    locationId: null,
    status: "active",
    ...overrides,
  };
}
```

- [ ] **Step 5: Fix every other hand-built `Profile` test fixture**

`Profile` now requires four more fields everywhere it's constructed as a literal, not just in `permissions.test.ts`. `pnpm build` type-checks the whole project (tests included, per `tsconfig.json`'s `include`), and every file below mocks a real domain function (`getCurrentProfile`, `getProfileByAuthUserId`, or `createProfile`) via `vi.mock(module, () => ({ fn: vi.fn() }))` + `vi.mocked(fn).mockResolvedValue(literal)` — TypeScript resolves `fn`'s type from the real module, so `literal` must satisfy `Profile | null`, not the pre-Task-7 shape.

In each file listed below, find the `const PROFILE = { ... }` object (or, for `complete-signup/route.test.ts`, its two separate inline `.mockResolvedValue({ ... })` object literals) and insert these four lines immediately after the existing `managerId: null,` line, matching that line's exact indentation:

```ts
  positionTitle: null,
  employeeNumber: null,
  locationId: null,
  status: "active" as const,
```

Files to fix (one `PROFILE` object each, except where noted):

- `app/api/approvals/[id]/decide/route.test.ts`
- `app/api/approvals/[id]/reassign/route.test.ts`
- `app/api/auth/complete-signup/route.test.ts` (**two** object literals: the `createProfile` mock around line 54, and the `getProfileByAuthUserId` mock around line 74)
- `app/api/profiles/route.test.ts`
- `app/api/requests/[id]/attachments/route.test.ts`
- `app/api/requests/[id]/comments/route.test.ts`
- `app/api/requests/[id]/route.test.ts`
- `app/api/requests/route.test.ts`
- `app/api/tasks/[id]/attachments/route.test.ts`
- `app/api/tasks/[id]/comments/route.test.ts`
- `app/api/tasks/[id]/route.test.ts`
- `app/api/tasks/route.test.ts`
- `app/api/workflows/instances/[id]/route.test.ts`
- `app/api/workflows/templates/route.test.ts`

(`app/(app)/layout.test.tsx` and `lib/auth/session.test.ts` mock their profile-returning functions with a bare untyped `vi.fn()` rather than `vi.mocked(realImport)`, so TypeScript doesn't check their mock-resolved literals against `Profile` — leave those two files as they are.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test:integration lib/domain/profiles.test.ts`
Expected: PASS (7 tests — 6 existing plus 1 new).

Run: `pnpm test lib/domain/permissions.test.ts`
Expected: PASS, same count as before (fixture change only, no new tests yet).

Run: `pnpm build`
Expected: no type errors — this is the step that actually proves Step 5's fourteen fixes were complete; if any file was missed, `next build`'s project-wide type check will name it.

- [ ] **Step 7: Commit**

```bash
git add lib/domain/profiles.ts lib/domain/profiles.test.ts lib/domain/permissions.test.ts \
  "app/api/approvals/[id]/decide/route.test.ts" "app/api/approvals/[id]/reassign/route.test.ts" \
  app/api/auth/complete-signup/route.test.ts app/api/profiles/route.test.ts \
  "app/api/requests/[id]/attachments/route.test.ts" "app/api/requests/[id]/comments/route.test.ts" \
  "app/api/requests/[id]/route.test.ts" app/api/requests/route.test.ts \
  "app/api/tasks/[id]/attachments/route.test.ts" "app/api/tasks/[id]/comments/route.test.ts" \
  "app/api/tasks/[id]/route.test.ts" app/api/tasks/route.test.ts \
  "app/api/workflows/instances/[id]/route.test.ts" app/api/workflows/templates/route.test.ts
git commit -m "feat: extend Profile with operational fields"
```

---

## Task 8: Permissions — employee and asset management

**Files:**
- Modify: `lib/domain/permissions.ts`, `lib/domain/permissions.test.ts`

**Interfaces:**
- Consumes: `Profile`, `COMPANY_WIDE_VIEW_ROLES` (already in this file).
- Produces: `EmployeeLike`, `AssetLike` interfaces; `canCreateEmployee`, `canUpdateEmployee`, `canViewEmployeeProfile`, `canCreateAsset`, `canAssignAsset`, `canChangeAssetStatus`, `canViewAsset` — consumed by `lib/domain/employees.ts` (Tasks 13–14) and `lib/domain/assets.ts` (Tasks 15–16).

- [ ] **Step 1: Write the failing tests**

Update the import at the top of `lib/domain/permissions.test.ts`:

```ts
import {
  canAssignAsset,
  canAssignTask,
  canChangeAssetStatus,
  canChangeTaskStatus,
  canCommentOnRequest,
  canCreateAsset,
  canCreateEmployee,
  canCreateRequest,
  canCreateTask,
  canDecideApproval,
  canDeleteTask,
  canReassignApproval,
  canTransitionRequestStatus,
  canUpdateEmployee,
  canUploadRequestAttachment,
  canViewAsset,
  canViewEmployeeProfile,
  canViewRequest,
  canViewTask,
  canViewWorkflowInstance,
} from "@/lib/domain/permissions";
```

Append at the end of the file:

```ts
describe("canCreateEmployee / canUpdateEmployee", () => {
  it("allows hr and admin, denies everyone else", () => {
    expect(canCreateEmployee(makeProfile({ role: "hr" }))).toBe(true);
    expect(canCreateEmployee(makeProfile({ role: "admin" }))).toBe(true);
    expect(canCreateEmployee(makeProfile({ role: "operations_manager" }))).toBe(false);
    expect(canCreateEmployee(makeProfile({ role: "employee" }))).toBe(false);

    expect(canUpdateEmployee(makeProfile({ role: "hr" }))).toBe(true);
    expect(canUpdateEmployee(makeProfile({ role: "employee" }))).toBe(false);
  });
});

describe("canViewEmployeeProfile", () => {
  it("denies a profile from a different company", () => {
    const profile = makeProfile({ companyId: "other-company" });
    expect(
      canViewEmployeeProfile(profile, { companyId: "company-1", id: "target-1", managerId: null })
    ).toBe(false);
  });

  it("allows company-wide view roles, the profile itself, and its manager", () => {
    const opsManager = makeProfile({ id: "someone-else", role: "operations_manager" });
    expect(
      canViewEmployeeProfile(opsManager, { companyId: "company-1", id: "target-1", managerId: null })
    ).toBe(true);

    const self = makeProfile({ id: "target-1" });
    expect(
      canViewEmployeeProfile(self, { companyId: "company-1", id: "target-1", managerId: null })
    ).toBe(true);

    const manager = makeProfile({ id: "manager-1" });
    expect(
      canViewEmployeeProfile(manager, {
        companyId: "company-1",
        id: "target-1",
        managerId: "manager-1",
      })
    ).toBe(true);

    const stranger = makeProfile({ id: "stranger-1" });
    expect(
      canViewEmployeeProfile(stranger, { companyId: "company-1", id: "target-1", managerId: null })
    ).toBe(false);
  });
});

describe("canCreateAsset / canAssignAsset / canChangeAssetStatus", () => {
  it("allows it, operations_manager, and admin, denies everyone else", () => {
    expect(canCreateAsset(makeProfile({ role: "it" }))).toBe(true);
    expect(canCreateAsset(makeProfile({ role: "operations_manager" }))).toBe(true);
    expect(canCreateAsset(makeProfile({ role: "admin" }))).toBe(true);
    expect(canCreateAsset(makeProfile({ role: "hr" }))).toBe(false);
    expect(canCreateAsset(makeProfile({ role: "employee" }))).toBe(false);

    expect(canAssignAsset(makeProfile({ role: "it" }))).toBe(true);
    expect(canAssignAsset(makeProfile({ role: "employee" }))).toBe(false);

    expect(canChangeAssetStatus(makeProfile({ role: "it" }))).toBe(true);
    expect(canChangeAssetStatus(makeProfile({ role: "employee" }))).toBe(false);
  });
});

describe("canViewAsset", () => {
  it("denies a profile from a different company", () => {
    const profile = makeProfile({ companyId: "other-company" });
    expect(
      canViewAsset(profile, { companyId: "company-1", assignedTo: null, departmentId: null })
    ).toBe(false);
  });

  it("allows company-wide view roles, the assigned employee, and same-department profiles", () => {
    const it = makeProfile({ id: "someone-else", role: "it" });
    expect(
      canViewAsset(it, { companyId: "company-1", assignedTo: null, departmentId: null })
    ).toBe(true);

    const assignee = makeProfile({ id: "assignee-1" });
    expect(
      canViewAsset(assignee, { companyId: "company-1", assignedTo: "assignee-1", departmentId: null })
    ).toBe(true);

    const departmentPeer = makeProfile({ id: "peer-1", departmentId: "dept-1" });
    expect(
      canViewAsset(departmentPeer, {
        companyId: "company-1",
        assignedTo: "someone-else",
        departmentId: "dept-1",
      })
    ).toBe(true);

    const stranger = makeProfile({ id: "stranger-1" });
    expect(
      canViewAsset(stranger, { companyId: "company-1", assignedTo: "someone-else", departmentId: "dept-1" })
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/domain/permissions.test.ts`
Expected: FAIL — none of the seven new functions are exported yet.

- [ ] **Step 3: Add the permission functions to `lib/domain/permissions.ts`**

Append to the end of the file:

```ts
const EMPLOYEE_MANAGER_ROLES = new Set(["hr", "admin"]);
const ASSET_MANAGER_ROLES = new Set(["it", "operations_manager", "admin"]);

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
  return profile.id === target.managerId;
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test lib/domain/permissions.test.ts`
Expected: PASS (58 tests — 41 existing from Phase 4 plus 17 new: 2 + 4 + 6 + 5 across the four new `describe` blocks — count exactly against what Step 1 added if this differs, the important thing is zero failures).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/permissions.ts lib/domain/permissions.test.ts
git commit -m "feat: add employee and asset permission functions"
```

---

## Task 9: `workflows.ts` — `related_employee_id` and `findWorkflowStepByTaskId`

**Files:**
- Modify: `lib/domain/workflows.ts`, `lib/domain/workflows.test.ts`

**Interfaces:**
- Consumes: everything already in `workflows.ts`.
- Produces: `WorkflowInstance.relatedEmployeeId: string | null`; `startWorkflow`'s `context` gains optional `employeeId`; `WorkflowStepForTask` type + `findWorkflowStepByTaskId(taskId): Promise<WorkflowStepForTask | null>` — consumed by `lib/domain/assets.ts` (Task 16) and the task detail page (Task 32). No change to `lib/domain/approvals.ts`'s existing `startWorkflow(profile, template.slug, { requestId: request.id })` call site — `related_employee_id` is now derived automatically for it.

- [ ] **Step 1: Write the failing tests**

The current `lib/domain/workflows.test.ts` (as it landed via Phase 4) has one outer `describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("workflow engine", () => { ... })` with shared `beforeAll`/`afterAll` fixtures (`companyId`, `departmentId`, `employee`, `itProfile`, `supabase`, the `task-only-test`/`approval-first-test` templates), containing two nested plain `describe` blocks: `describe("startWorkflow", () => { ... })` (currently four tests, ending with `"does not strand a dead-link instance..."`) and `describe("advanceWorkflow / getWorkflowProgress / finders", () => { ... })`.

Add the following two tests inside the existing nested `describe("startWorkflow", () => { ... })` block, after its last test (`"does not strand a dead-link instance..."`) and before that `describe`'s own closing `});` (line 276 as of Phase 4):

```ts
  it("derives related_employee_id from the request's creator when only requestId is given", async () => {
    const request = await createRequest(employee, { title: "New monitor", category: "equipment" });

    const instance = await startWorkflow(employee, "approval-first-test", {
      requestId: request.id,
    });

    const { data: instanceRow, error } = await supabase
      .from("workflow_instances")
      .select("related_employee_id")
      .eq("id", instance.id)
      .single();
    if (error) throw error;
    expect(instanceRow.related_employee_id).toBe(employee.id);
  });

  it("uses employeeId directly when given, with no request involved", async () => {
    const instance = await startWorkflow(employee, "task-only-test", { employeeId: employee.id });

    const { data: instanceRow, error } = await supabase
      .from("workflow_instances")
      .select("related_employee_id, related_request_id")
      .eq("id", instance.id)
      .single();
    if (error) throw error;
    expect(instanceRow.related_employee_id).toBe(employee.id);
    expect(instanceRow.related_request_id).toBeNull();
  });
```

(These two `it`s are direct children of the existing nested `describe("startWorkflow", ...)` block — same indentation level as its other `it`s, not a new block.)

Separately, add a new top-level `describe` block at the very end of the file (after the outer `"workflow engine"` describe's own closing `});`, i.e. after today's final line 435) — self-contained setup, matching the existing convention of one isolated fixture per `describe`:

```ts
describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("findWorkflowStepByTaskId", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  const createdAuthUserIds: string[] = [];
  let employee: Profile;
  let templateId: string;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert(
        { name: "Test Co (find-step)", slug: "test-co-find-step" },
        { onConflict: "slug" }
      )
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: `find-step-test-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (authError || !authUser.user) throw authError;
    createdAuthUserIds.push(authUser.user.id);
    employee = await createProfile({
      authUserId: authUser.user.id,
      companyId,
      fullName: "Employee (find-step)",
      role: "employee",
    });

    const { data: department, error: departmentError } = await supabase
      .from("departments")
      .upsert(
        { company_id: companyId, name: "Ops (find-step)" },
        { onConflict: "company_id,name" }
      )
      .select("id")
      .single();
    if (departmentError) throw departmentError;

    const { data: template, error: templateError } = await supabase
      .from("workflow_templates")
      .insert({ company_id: companyId, slug: "asset-step-test", name: "Asset Step Test" })
      .select("id")
      .single();
    if (templateError) throw templateError;
    templateId = template.id;

    const { error: stepsError } = await supabase.from("workflow_template_steps").insert([
      {
        template_id: templateId,
        step_order: 1,
        step_type: "task",
        title: "Creates an asset",
        responsible_department_name: "Ops (find-step)",
        creates_asset: true,
      },
      {
        template_id: templateId,
        step_order: 2,
        step_type: "task",
        title: "Does not create an asset",
        responsible_department_name: "Ops (find-step)",
        creates_asset: false,
      },
    ]);
    if (stepsError) throw stepsError;

    void department;
  });

  afterAll(async () => {
    await supabase.from("workflow_instances").delete().eq("company_id", companyId);
    await supabase.from("workflow_template_steps").delete().eq("template_id", templateId);
    await supabase.from("workflow_templates").delete().eq("id", templateId);
    await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
    for (const id of createdAuthUserIds) {
      await supabase.auth.admin.deleteUser(id);
    }
    await supabase.from("companies").delete().eq("slug", "test-co-find-step");
  });

  it("returns null when the task has no workflow step", async () => {
    const result = await findWorkflowStepByTaskId(crypto.randomUUID());
    expect(result).toBeNull();
  });

  it("reports createsAsset true for the asset-creating step, false for the other", async () => {
    const instance = await startWorkflow(employee, "asset-step-test", {});

    const { data: firstStep, error } = await supabase
      .from("workflow_instance_steps")
      .select("generated_task_id")
      .eq("instance_id", instance.id)
      .eq("step_order", 1)
      .single();
    if (error) throw error;

    const result = await findWorkflowStepByTaskId(firstStep.generated_task_id!);
    expect(result?.createsAsset).toBe(true);
    expect(result?.relatedRequestId).toBeNull();
  });
});
```

`lib/domain/workflows.test.ts` already imports `createProfile` from `@/lib/domain/profiles` (added by Phase 4) — no change needed there.

Change the existing `@/lib/domain/workflows` import from:

```ts
import {
  advanceWorkflow,
  findWorkflowStepByApprovalId,
  findWorkflowTemplateByTriggerCategory,
  getWorkflowInstanceForRequest,
  getWorkflowProgress,
  listWorkflowTemplates,
  startWorkflow,
} from "@/lib/domain/workflows";
```

to:

```ts
import {
  advanceWorkflow,
  findWorkflowStepByApprovalId,
  findWorkflowStepByTaskId,
  findWorkflowTemplateByTriggerCategory,
  getWorkflowInstanceForRequest,
  getWorkflowProgress,
  listWorkflowTemplates,
  startWorkflow,
} from "@/lib/domain/workflows";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:integration lib/domain/workflows.test.ts`
Expected: FAIL — `findWorkflowStepByTaskId` is not exported; `related_employee_id` column exists (Task 5) but `startWorkflow` never sets it, so the two new assertions in the `startWorkflow` describe block also fail.

- [ ] **Step 3: Extend `lib/domain/workflows.ts`**

Change the `WorkflowInstance` interface and its row/mapper/columns from:

```ts
export interface WorkflowInstance {
  id: string;
  companyId: string;
  templateId: string;
  relatedRequestId: string | null;
  status: "in_progress" | "completed";
  createdAt: string;
}

interface WorkflowInstanceRow {
  id: string;
  company_id: string;
  template_id: string;
  related_request_id: string | null;
  status: "in_progress" | "completed";
  created_at: string;
}

function toWorkflowInstance(row: WorkflowInstanceRow): WorkflowInstance {
  return {
    id: row.id,
    companyId: row.company_id,
    templateId: row.template_id,
    relatedRequestId: row.related_request_id,
    status: row.status,
    createdAt: row.created_at,
  };
}

const WORKFLOW_INSTANCE_COLUMNS =
  "id, company_id, template_id, related_request_id, status, created_at";
```

to:

```ts
export interface WorkflowInstance {
  id: string;
  companyId: string;
  templateId: string;
  relatedRequestId: string | null;
  relatedEmployeeId: string | null;
  status: "in_progress" | "completed";
  createdAt: string;
}

interface WorkflowInstanceRow {
  id: string;
  company_id: string;
  template_id: string;
  related_request_id: string | null;
  related_employee_id: string | null;
  status: "in_progress" | "completed";
  created_at: string;
}

function toWorkflowInstance(row: WorkflowInstanceRow): WorkflowInstance {
  return {
    id: row.id,
    companyId: row.company_id,
    templateId: row.template_id,
    relatedRequestId: row.related_request_id,
    relatedEmployeeId: row.related_employee_id,
    status: row.status,
    createdAt: row.created_at,
  };
}

const WORKFLOW_INSTANCE_COLUMNS =
  "id, company_id, template_id, related_request_id, related_employee_id, status, created_at";
```

Change `startWorkflow`'s signature and instance-insert block from:

```ts
export async function startWorkflow(
  profile: Profile,
  templateSlug: string,
  context: { requestId?: string }
): Promise<WorkflowInstance> {
  const template = await loadTemplateBySlug(profile.companyId, templateSlug);
  const templateSteps = await loadTemplateSteps(template.id);
  if (templateSteps.length === 0) {
    throw new UnprocessableRequestError(`Workflow template "${templateSlug}" has no steps`);
  }

  const supabase = createSupabaseAdminClient();
  const { data: instanceRow, error: instanceError } = await supabase
    .from("workflow_instances")
    .insert({
      company_id: profile.companyId,
      template_id: template.id,
      related_request_id: context.requestId ?? null,
      status: "in_progress",
    })
    .select(WORKFLOW_INSTANCE_COLUMNS)
    .single();
  if (instanceError) throw instanceError;
  const instance = toWorkflowInstance(instanceRow);
```

to:

```ts
export async function startWorkflow(
  profile: Profile,
  templateSlug: string,
  context: { requestId?: string; employeeId?: string }
): Promise<WorkflowInstance> {
  const template = await loadTemplateBySlug(profile.companyId, templateSlug);
  const templateSteps = await loadTemplateSteps(template.id);
  if (templateSteps.length === 0) {
    throw new UnprocessableRequestError(`Workflow template "${templateSlug}" has no steps`);
  }

  const supabase = createSupabaseAdminClient();

  let relatedEmployeeId = context.employeeId ?? null;
  if (!relatedEmployeeId && context.requestId) {
    const { data: requestRow, error: requestLookupError } = await supabase
      .from("requests")
      .select("created_by")
      .eq("id", context.requestId)
      .maybeSingle();
    if (requestLookupError) throw requestLookupError;
    relatedEmployeeId = requestRow?.created_by ?? null;
  }

  const { data: instanceRow, error: instanceError } = await supabase
    .from("workflow_instances")
    .insert({
      company_id: profile.companyId,
      template_id: template.id,
      related_request_id: context.requestId ?? null,
      related_employee_id: relatedEmployeeId,
      status: "in_progress",
    })
    .select(WORKFLOW_INSTANCE_COLUMNS)
    .single();
  if (instanceError) throw instanceError;
  const instance = toWorkflowInstance(instanceRow);
```

Append two new exports at the end of the file:

```ts
export interface WorkflowStepForTask {
  step: WorkflowInstanceStep;
  createsAsset: boolean;
  relatedRequestId: string | null;
}

export async function findWorkflowStepByTaskId(
  taskId: string
): Promise<WorkflowStepForTask | null> {
  const supabase = createSupabaseAdminClient();
  const { data: stepRow, error: stepError } = await supabase
    .from("workflow_instance_steps")
    .select(WORKFLOW_INSTANCE_STEP_COLUMNS)
    .eq("generated_task_id", taskId)
    .maybeSingle();
  if (stepError) throw stepError;
  if (!stepRow) return null;
  const step = toWorkflowInstanceStep(stepRow);

  const { data: templateStepRow, error: templateStepError } = await supabase
    .from("workflow_template_steps")
    .select("creates_asset")
    .eq("id", step.templateStepId)
    .maybeSingle();
  if (templateStepError) throw templateStepError;

  const instance = await loadInstanceOrThrow(step.instanceId);

  return {
    step,
    createsAsset: templateStepRow?.creates_asset ?? false,
    relatedRequestId: instance.relatedRequestId,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:integration lib/domain/workflows.test.ts`
Expected: PASS (existing tests plus 4 new: 2 in the `startWorkflow` block, 2 in the new `findWorkflowStepByTaskId` block).

Run: `pnpm build`
Expected: no type errors (confirms `getWorkflowProgress`/`WorkflowProgress` and everything spreading `WorkflowInstance` still compile with the new field).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/workflows.ts lib/domain/workflows.test.ts
git commit -m "feat: add related_employee_id and findWorkflowStepByTaskId to the workflow engine"
```

---

## Task 10: `lib/domain/departments.ts` and `lib/domain/locations.ts`

**Files:**
- Create: `lib/domain/departments.ts`, `lib/domain/departments.test.ts`, `lib/domain/locations.ts`, `lib/domain/locations.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `createSupabaseAdminClient` (Foundation).
- Produces: `Department { id, name }` + `listDepartments(companyId): Promise<Department[]>`; `Location { id, name }` + `listLocations(companyId): Promise<Location[]>` — consumed by the employee/asset creation forms (Tasks 25, 28) to populate dropdowns. No existing page in this codebase lists departments or locations yet — task/request forms don't have department pickers — so this is genuinely new, not a refactor.

- [ ] **Step 1: Write the failing tests**

Create `lib/domain/departments.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listDepartments } from "@/lib/domain/departments";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("listDepartments", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;

  afterAll(async () => {
    await supabase.from("companies").delete().eq("slug", "test-co-departments");
  });

  it("lists a company's departments alphabetically", async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert(
        { name: "Test Co (departments)", slug: "test-co-departments" },
        { onConflict: "slug" }
      )
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { error: departmentsError } = await supabase
      .from("departments")
      .upsert(
        [
          { company_id: companyId, name: "Zeta" },
          { company_id: companyId, name: "Alpha" },
        ],
        { onConflict: "company_id,name" }
      );
    if (departmentsError) throw departmentsError;

    const departments = await listDepartments(companyId);
    expect(departments.map((d) => d.name)).toEqual(["Alpha", "Zeta"]);
  });
});
```

Create `lib/domain/locations.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listLocations } from "@/lib/domain/locations";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("listLocations", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;

  afterAll(async () => {
    await supabase.from("companies").delete().eq("slug", "test-co-locations");
  });

  it("lists a company's locations alphabetically", async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert(
        { name: "Test Co (locations)", slug: "test-co-locations" },
        { onConflict: "slug" }
      )
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { error: locationsError } = await supabase
      .from("locations")
      .upsert(
        [
          { company_id: companyId, name: "Vienna" },
          { company_id: companyId, name: "Graz" },
        ],
        { onConflict: "company_id,name" }
      );
    if (locationsError) throw locationsError;

    const locations = await listLocations(companyId);
    expect(locations.map((l) => l.name)).toEqual(["Graz", "Vienna"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:integration lib/domain/departments.test.ts lib/domain/locations.test.ts`
Expected: FAIL — neither module exists.

- [ ] **Step 3: Implement both modules**

Create `lib/domain/departments.ts`:

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface Department {
  id: string;
  name: string;
}

export async function listDepartments(companyId: string): Promise<Department[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("departments")
    .select("id, name")
    .eq("company_id", companyId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
```

Create `lib/domain/locations.ts`:

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface Location {
  id: string;
  name: string;
}

export async function listLocations(companyId: string): Promise<Location[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("locations")
    .select("id, name")
    .eq("company_id", companyId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
```

- [ ] **Step 4: Wire the new test files into `package.json`**

In the `test:unit` script, add `--exclude "lib/domain/departments.test.ts" --exclude "lib/domain/locations.test.ts"` (anywhere in the existing `--exclude` chain).

In the `test:integration` script, add `lib/domain/departments.test.ts lib/domain/locations.test.ts` to the space-separated file list.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test:integration lib/domain/departments.test.ts lib/domain/locations.test.ts`
Expected: PASS (1 test each).

- [ ] **Step 6: Commit**

```bash
git add lib/domain/departments.ts lib/domain/departments.test.ts lib/domain/locations.ts lib/domain/locations.test.ts package.json
git commit -m "feat: add listDepartments and listLocations"
```

---

## Task 11: `lib/validation/employees.ts`

**Files:**
- Create: `lib/validation/employees.ts`, `lib/validation/employees.test.ts`

**Interfaces:**
- Consumes: `roleSchema` (`@/lib/validation/auth`); `PROFILE_STATUSES`, `type ProfileStatus` (`@/lib/domain/profiles`, Task 7).
- Produces: `createEmployeeSchema`/`CreateEmployeeInput`, `updateEmployeeSchema`/`UpdateEmployeeInput`, `employeeFiltersSchema`/`EmployeeFilters` — consumed by `lib/domain/employees.ts` (Tasks 13–14) and the `/api/employees*` routes (Tasks 19–20).

- [ ] **Step 1: Write the failing test**

Create `lib/validation/employees.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createEmployeeSchema, updateEmployeeSchema } from "@/lib/validation/employees";

describe("createEmployeeSchema", () => {
  it("requires a valid email, a name, and a role", () => {
    const result = createEmployeeSchema.safeParse({
      email: "not-an-email",
      fullName: "",
      role: "employee",
    });
    expect(result.success).toBe(false);
  });

  it("accepts the minimal valid shape and defaults are left to the domain layer", () => {
    const result = createEmployeeSchema.safeParse({
      email: "new.hire@example.com",
      fullName: "New Hire",
      role: "employee",
    });
    expect(result.success).toBe(true);
  });

  it("accepts every optional operational field", () => {
    const result = createEmployeeSchema.safeParse({
      email: "new.hire@example.com",
      fullName: "New Hire",
      role: "employee",
      departmentId: "11111111-1111-1111-1111-111111111111",
      managerId: "22222222-2222-2222-2222-222222222222",
      locationId: "33333333-3333-3333-3333-333333333333",
      positionTitle: "Software Engineer",
      employeeNumber: "EMP-00042",
      startOnboarding: false,
    });
    expect(result.success).toBe(true);
  });
});

describe("updateEmployeeSchema", () => {
  it("rejects an invalid status", () => {
    const result = updateEmployeeSchema.safeParse({ status: "on_leave" });
    expect(result.success).toBe(false);
  });

  it("accepts a partial update", () => {
    const result = updateEmployeeSchema.safeParse({ status: "inactive" });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test lib/validation/employees.test.ts`
Expected: FAIL — `@/lib/validation/employees` cannot be found.

- [ ] **Step 3: Implement `lib/validation/employees.ts`**

```ts
import { z } from "zod";
import { roleSchema } from "@/lib/validation/auth";
import { PROFILE_STATUSES, type ProfileStatus } from "@/lib/domain/profiles";

export const profileStatusSchema = z.enum(PROFILE_STATUSES as [ProfileStatus, ...ProfileStatus[]]);

export const createEmployeeSchema = z.object({
  email: z.string().email("Enter a valid email"),
  fullName: z.string().min(1, "Name is required").max(200),
  role: roleSchema,
  departmentId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  positionTitle: z.string().max(200).optional(),
  employeeNumber: z.string().max(50).optional(),
  startOnboarding: z.boolean().optional(),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object({
  positionTitle: z.string().max(200).optional(),
  employeeNumber: z.string().max(50).optional(),
  departmentId: z.string().uuid().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  status: profileStatusSchema.optional(),
});
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export const employeeFiltersSchema = z.object({
  departmentId: z.string().uuid().optional(),
  status: profileStatusSchema.optional(),
});
export type EmployeeFilters = z.infer<typeof employeeFiltersSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test lib/validation/employees.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/validation/employees.ts lib/validation/employees.test.ts
git commit -m "feat: add employee validation schemas"
```

---

## Task 12: `lib/domain/asset-status.ts` and `lib/validation/assets.ts`

**Files:**
- Create: `lib/domain/asset-status.ts`, `lib/validation/assets.ts`, `lib/validation/assets.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `AssetStatus` type + `ASSET_STATUSES` array (`lib/domain/asset-status.ts`, no transition table — any status is directly reachable by an asset manager per the design spec, so there is no `getValidNextStatuses`-style logic to unit test, unlike `task-status.ts`/`request-status.ts`); `createAssetSchema`/`CreateAssetInput`, `patchAssetSchema`/`PatchAssetInput`, `assetFiltersSchema`/`AssetFilters` — consumed by `lib/domain/assets.ts` (Tasks 15–16) and the `/api/assets*` routes (Tasks 21–22).

- [ ] **Step 1: Create `lib/domain/asset-status.ts`**

```ts
export type AssetStatus = "available" | "assigned" | "maintenance" | "retired" | "lost";

export const ASSET_STATUSES: AssetStatus[] = [
  "available",
  "assigned",
  "maintenance",
  "retired",
  "lost",
];
```

- [ ] **Step 2: Write the failing test for the validation schemas**

Create `lib/validation/assets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createAssetSchema, patchAssetSchema } from "@/lib/validation/assets";

describe("createAssetSchema", () => {
  it("requires a name and category", () => {
    const result = createAssetSchema.safeParse({ name: "", category: "" });
    expect(result.success).toBe(false);
  });

  it("accepts the minimal valid shape", () => {
    const result = createAssetSchema.safeParse({ name: "MacBook Pro 14\"", category: "laptop" });
    expect(result.success).toBe(true);
  });
});

describe("patchAssetSchema", () => {
  it("accepts an assign action", () => {
    const result = patchAssetSchema.safeParse({
      action: "assign",
      targetEmployeeId: "11111111-1111-1111-1111-111111111111",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a changeStatus action", () => {
    const result = patchAssetSchema.safeParse({ action: "changeStatus", status: "maintenance" });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown action", () => {
    const result = patchAssetSchema.safeParse({ action: "retire" });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test lib/validation/assets.test.ts`
Expected: FAIL — `@/lib/validation/assets` cannot be found.

- [ ] **Step 4: Implement `lib/validation/assets.ts`**

```ts
import { z } from "zod";
import { ASSET_STATUSES, type AssetStatus } from "@/lib/domain/asset-status";

export const assetStatusSchema = z.enum(ASSET_STATUSES as [AssetStatus, ...AssetStatus[]]);

export const createAssetSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  category: z.string().min(1, "Category is required").max(100),
  departmentId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  purchaseInfo: z.record(z.string(), z.unknown()).optional(),
  warrantyInfo: z.record(z.string(), z.unknown()).optional(),
});
export type CreateAssetInput = z.infer<typeof createAssetSchema>;

export const patchAssetSchema = z.union([
  z.object({ action: z.literal("assign"), targetEmployeeId: z.string().uuid() }),
  z.object({ action: z.literal("changeStatus"), status: assetStatusSchema }),
]);
export type PatchAssetInput = z.infer<typeof patchAssetSchema>;

export const assetFiltersSchema = z.object({
  category: z.string().optional(),
  status: assetStatusSchema.optional(),
  departmentId: z.string().uuid().optional(),
});
export type AssetFilters = z.infer<typeof assetFiltersSchema>;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test lib/validation/assets.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/domain/asset-status.ts lib/validation/assets.ts lib/validation/assets.test.ts
git commit -m "feat: add asset status type and validation schemas"
```

---

## Task 13: `lib/domain/employees.ts` — `createEmployee` (invite flow)

**Files:**
- Create: `lib/domain/employees.ts`, `lib/domain/employees.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `Profile`, `createProfile` (`@/lib/domain/profiles`); `logActivity` (`@/lib/domain/activity`); `broadcastChange` (`@/lib/realtime/broadcast`); `startWorkflow` (`@/lib/domain/workflows`, Task 9); `canCreateEmployee` (`@/lib/domain/permissions`, Task 8); `ForbiddenError` (`@/lib/domain/errors`); `CreateEmployeeInput` (`@/lib/validation/employees`, Task 11).
- Produces: `type Employee = Profile`; `createEmployee(profile, input): Promise<Employee>` — consumed by `/api/employees` (Task 19).

`createEmployee` is the only place in this codebase that calls `supabase.auth.admin.inviteUserByEmail` — no pre-create-account mechanism exists today (every other profile comes from self-service signup via `/api/auth/complete-signup`).

- [ ] **Step 1: Write the failing test**

Create `lib/domain/employees.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile, getProfileByAuthUserId, type Profile } from "@/lib/domain/profiles";
import { createEmployee } from "@/lib/domain/employees";
import { ForbiddenError } from "@/lib/domain/errors";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("createEmployee", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  const createdAuthUserIds: string[] = [];
  let hrProfile: Profile;
  let employeeProfile: Profile;

  afterAll(async () => {
    await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
    for (const id of createdAuthUserIds) {
      await supabase.auth.admin.deleteUser(id);
    }
    await supabase.from("companies").delete().eq("slug", "test-co-create-employee");
  });

  it("rejects a caller without hr/admin", async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert(
        { name: "Test Co (create-employee)", slug: "test-co-create-employee" },
        { onConflict: "slug" }
      )
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: `create-employee-test-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (authError || !authUser.user) throw authError;
    createdAuthUserIds.push(authUser.user.id);
    employeeProfile = await createProfile({
      authUserId: authUser.user.id,
      companyId,
      fullName: "Not HR",
      role: "employee",
    });

    await expect(
      createEmployee(employeeProfile, {
        email: `new-hire-${crypto.randomUUID()}@example.com`,
        fullName: "New Hire",
        role: "employee",
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("invites the employee, creates their profile, and starts onboarding by default", async () => {
    const { data: hrAuthUser, error: hrAuthError } = await supabase.auth.admin.createUser({
      email: `create-employee-hr-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (hrAuthError || !hrAuthUser.user) throw hrAuthError;
    createdAuthUserIds.push(hrAuthUser.user.id);
    hrProfile = await createProfile({
      authUserId: hrAuthUser.user.id,
      companyId,
      fullName: "HR Person",
      role: "hr",
    });

    const newHireEmail = `new-hire-${crypto.randomUUID()}@example.com`;
    const employee = await createEmployee(hrProfile, {
      email: newHireEmail,
      fullName: "New Hire",
      role: "employee",
      positionTitle: "Support Specialist",
    });
    createdAuthUserIds.push(employee.authUserId);

    expect(employee.fullName).toBe("New Hire");
    expect(employee.positionTitle).toBe("Support Specialist");

    const fetched = await getProfileByAuthUserId(employee.authUserId);
    expect(fetched?.id).toBe(employee.id);

    const { data: instances, error: instancesError } = await supabase
      .from("workflow_instances")
      .select("id, related_employee_id")
      .eq("related_employee_id", employee.id);
    if (instancesError) throw instancesError;
    expect(instances).toHaveLength(1);
  });

  it("does not start onboarding when startOnboarding is false", async () => {
    const newHireEmail = `new-hire-no-onboarding-${crypto.randomUUID()}@example.com`;
    const employee = await createEmployee(hrProfile, {
      email: newHireEmail,
      fullName: "No Onboarding Hire",
      role: "employee",
      startOnboarding: false,
    });
    createdAuthUserIds.push(employee.authUserId);

    const { data: instances, error: instancesError } = await supabase
      .from("workflow_instances")
      .select("id")
      .eq("related_employee_id", employee.id);
    if (instancesError) throw instancesError;
    expect(instances).toHaveLength(0);
  });
});
```

Note: the second test asserts against `employee-onboarding` actually starting — this requires that template to exist for `companyId`. Since this is a fresh test company (not the seeded AlpenTech company), `startWorkflow` would throw `NotFoundError` for a missing template. `createEmployee` wraps the `startWorkflow` call in try/catch and only logs the error (per the design spec — "a broken onboarding template must never block employee creation"), so `createEmployee` itself won't throw, but the workflow-instance assertion would then fail (0 instances, not 1). Seed the template in this test's setup before the second test runs: add to the test file, right after the `companyId` is created in the first test — instead, move template seeding into a `beforeAll` so both tests can rely on it existing. Replace the file's `describe` opening with:

```ts
describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("createEmployee", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  const createdAuthUserIds: string[] = [];
  let hrProfile: Profile;
  let employeeProfile: Profile;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert(
        { name: "Test Co (create-employee)", slug: "test-co-create-employee" },
        { onConflict: "slug" }
      )
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: department, error: departmentError } = await supabase
      .from("departments")
      .upsert(
        { company_id: companyId, name: "IT (create-employee)" },
        { onConflict: "company_id,name" }
      )
      .select("id")
      .single();
    if (departmentError) throw departmentError;

    const { data: template, error: templateError } = await supabase
      .from("workflow_templates")
      .upsert(
        { company_id: companyId, slug: "employee-onboarding", name: "Employee Onboarding" },
        { onConflict: "company_id,slug" }
      )
      .select("id")
      .single();
    if (templateError) throw templateError;

    const { error: stepError } = await supabase.from("workflow_template_steps").upsert(
      {
        template_id: template.id,
        step_order: 1,
        step_type: "task",
        title: "Create company account",
        responsible_department_name: "IT (create-employee)",
      },
      { onConflict: "template_id,step_order" }
    );
    if (stepError) throw stepError;
  });

  afterAll(async () => {
```

(everything else in the `afterAll`/tests stays as written above — this replaces only the top of the `describe` block, adding the `beforeAll` and removing the inline company-creation code from inside the first `it`, which becomes just the auth-user + profile + `createEmployee` assertion.) Update the first test to remove its now-duplicate company-creation block:

```ts
  it("rejects a caller without hr/admin", async () => {
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: `create-employee-test-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (authError || !authUser.user) throw authError;
    createdAuthUserIds.push(authUser.user.id);
    employeeProfile = await createProfile({
      authUserId: authUser.user.id,
      companyId,
      fullName: "Not HR",
      role: "employee",
    });

    await expect(
      createEmployee(employeeProfile, {
        email: `new-hire-${crypto.randomUUID()}@example.com`,
        fullName: "New Hire",
        role: "employee",
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
```

Add `beforeAll` to the imports at the top of the file:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration lib/domain/employees.test.ts`
Expected: FAIL — `@/lib/domain/employees` cannot be found.

- [ ] **Step 3: Implement `lib/domain/employees.ts`**

```ts
import { createProfile, type Profile } from "@/lib/domain/profiles";
import { logActivity } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import { startWorkflow } from "@/lib/domain/workflows";
import { canCreateEmployee } from "@/lib/domain/permissions";
import { ForbiddenError } from "@/lib/domain/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CreateEmployeeInput } from "@/lib/validation/employees";

export type Employee = Profile;

export async function createEmployee(
  profile: Profile,
  input: CreateEmployeeInput
): Promise<Employee> {
  if (!canCreateEmployee(profile)) {
    throw new ForbiddenError("You cannot create employees");
  }

  const supabase = createSupabaseAdminClient();
  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    input.email
  );
  if (inviteError || !invited.user) {
    throw inviteError ?? new Error("Failed to invite employee");
  }

  const employee = await createProfile({
    authUserId: invited.user.id,
    companyId: profile.companyId,
    fullName: input.fullName,
    role: input.role,
    departmentId: input.departmentId ?? null,
    managerId: input.managerId ?? null,
    locationId: input.locationId ?? null,
    positionTitle: input.positionTitle ?? null,
    employeeNumber: input.employeeNumber ?? null,
  });

  await logActivity(
    "profile",
    employee.id,
    profile.id,
    `${profile.fullName} added ${employee.fullName} as a new employee`
  );

  if (input.startOnboarding ?? true) {
    try {
      await startWorkflow(profile, "employee-onboarding", { employeeId: employee.id });
    } catch (workflowError) {
      console.error("startWorkflow failed:", workflowError);
    }
  }

  try {
    await broadcastChange(profile.companyId, "employees", { type: "employee_created" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }

  return employee;
}
```

- [ ] **Step 4: Wire the new test file into `package.json`**

`test:unit`: add `--exclude "lib/domain/employees.test.ts"`.
`test:integration`: add `lib/domain/employees.test.ts` to the file list.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test:integration lib/domain/employees.test.ts`
Expected: PASS (3 tests).

Run: `pnpm build`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/employees.ts lib/domain/employees.test.ts package.json
git commit -m "feat: add createEmployee with invite-by-email"
```

---

## Task 14: `employees.ts` — `getEmployeeProfile`, `updateEmployee`, `listEmployees`

**Files:**
- Modify: `lib/domain/profiles.ts`, `lib/domain/profiles.test.ts`, `lib/domain/employees.ts`, `lib/domain/employees.test.ts`

**Interfaces:**
- Consumes: `getProfileById` (`profiles.ts`); `listActivity`, `type ActivityEntry` (`@/lib/domain/activity`); `canViewEmployeeProfile`, `canUpdateEmployee` (`permissions.ts`, Task 8); `NotFoundError` (`errors.ts`); `EmployeeFilters`, `UpdateEmployeeInput` (`validation/employees.ts`, Task 11).
- Produces: `profiles.ts` gains `updateProfile(id, updates): Promise<Profile>` and `listProfilesByCompany(companyId, filters): Promise<Profile[]>`; `employees.ts` gains `EmployeeCounts`, `EmployeeProfile` types, `getEmployeeProfile(profile, employeeId): Promise<EmployeeProfile>`, `updateEmployee(profile, employeeId, input): Promise<Employee>`, `listEmployees(profile, filters): Promise<Employee[]>` — consumed by `/api/employees*` (Tasks 19–20) and the employee directory/detail pages (Tasks 26–27).

- [ ] **Step 1: Write the failing tests**

Add to `lib/domain/profiles.test.ts`, a new `describe` block after the existing one (same file, new top-level block, so it needs its own `import` additions — add `updateProfile` and `listProfilesByCompany` to the existing import from `@/lib/domain/profiles`):

```ts
describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)(
  "updateProfile / listProfilesByCompany",
  () => {
    const supabase = createSupabaseAdminClient();
    let companyId: string;
    const createdAuthUserIds: string[] = [];

    beforeAll(async () => {
      const { data, error } = await supabase
        .from("companies")
        .upsert(
          { name: "Test Co (profiles-2)", slug: "test-co-profiles-2" },
          { onConflict: "slug" }
        )
        .select("id")
        .single();
      if (error) throw error;
      companyId = data.id;
    });

    afterAll(async () => {
      await supabase.from("companies").delete().eq("slug", "test-co-profiles-2");
    });

    afterEach(async () => {
      if (createdAuthUserIds.length === 0) return;
      await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
      for (const id of createdAuthUserIds) {
        await supabase.auth.admin.deleteUser(id);
      }
      createdAuthUserIds.length = 0;
    });

    it("updates operational fields on a profile", async () => {
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: `profile-test-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
      if (authError || !authUser.user) throw authError;
      createdAuthUserIds.push(authUser.user.id);
      const created = await createProfile({
        authUserId: authUser.user.id,
        companyId,
        fullName: "Updatable Employee",
        role: "employee",
      });

      const updated = await updateProfile(created.id, {
        positionTitle: "Senior Engineer",
        status: "inactive",
      });
      expect(updated.positionTitle).toBe("Senior Engineer");
      expect(updated.status).toBe("inactive");
      expect(updated.fullName).toBe("Updatable Employee");
    });

    it("lists profiles for a company, optionally filtered by department and status", async () => {
      const { data: department, error: departmentError } = await supabase
        .from("departments")
        .upsert(
          { company_id: companyId, name: "Filtering Dept" },
          { onConflict: "company_id,name" }
        )
        .select("id")
        .single();
      if (departmentError) throw departmentError;

      const { data: authUserA, error: authErrorA } = await supabase.auth.admin.createUser({
        email: `profile-test-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
      if (authErrorA || !authUserA.user) throw authErrorA;
      createdAuthUserIds.push(authUserA.user.id);
      const inDept = await createProfile({
        authUserId: authUserA.user.id,
        companyId,
        fullName: "In Dept",
        role: "employee",
        departmentId: department.id,
      });

      const { data: authUserB, error: authErrorB } = await supabase.auth.admin.createUser({
        email: `profile-test-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
      if (authErrorB || !authUserB.user) throw authErrorB;
      createdAuthUserIds.push(authUserB.user.id);
      await createProfile({
        authUserId: authUserB.user.id,
        companyId,
        fullName: "Out Of Dept",
        role: "employee",
      });

      const inDeptResults = await listProfilesByCompany(companyId, { departmentId: department.id });
      expect(inDeptResults.map((p) => p.id)).toEqual([inDept.id]);

      const all = await listProfilesByCompany(companyId, {});
      expect(all.length).toBeGreaterThanOrEqual(2);
    });
  }
);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:integration lib/domain/profiles.test.ts`
Expected: FAIL — `updateProfile`/`listProfilesByCompany` are not exported.

- [ ] **Step 3: Add `updateProfile` and `listProfilesByCompany` to `lib/domain/profiles.ts`**

Append to the end of the file:

```ts
export async function updateProfile(
  id: string,
  updates: {
    positionTitle?: string | null;
    employeeNumber?: string | null;
    departmentId?: string | null;
    managerId?: string | null;
    locationId?: string | null;
    status?: ProfileStatus;
  }
): Promise<Profile> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({
      ...(updates.positionTitle !== undefined && { position_title: updates.positionTitle }),
      ...(updates.employeeNumber !== undefined && { employee_number: updates.employeeNumber }),
      ...(updates.departmentId !== undefined && { department_id: updates.departmentId }),
      ...(updates.managerId !== undefined && { manager_id: updates.managerId }),
      ...(updates.locationId !== undefined && { location_id: updates.locationId }),
      ...(updates.status !== undefined && { status: updates.status }),
    })
    .eq("id", id)
    .select(PROFILE_COLUMNS)
    .single();
  if (error) throw error;
  return toProfile(data);
}

export async function listProfilesByCompany(
  companyId: string,
  filters: { departmentId?: string; status?: ProfileStatus }
): Promise<Profile[]> {
  const supabase = createSupabaseAdminClient();
  let query = supabase.from("profiles").select(PROFILE_COLUMNS).eq("company_id", companyId);
  if (filters.departmentId) query = query.eq("department_id", filters.departmentId);
  if (filters.status) query = query.eq("status", filters.status);
  const { data, error } = await query.order("full_name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toProfile);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:integration lib/domain/profiles.test.ts`
Expected: PASS (9 tests — 7 existing plus 2 new).

- [ ] **Step 5: Write the failing tests for `employees.ts`**

Add to `lib/domain/employees.test.ts`, a new `describe` block at the end of the file:

```ts
describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)(
  "getEmployeeProfile / updateEmployee / listEmployees",
  () => {
    const supabase = createSupabaseAdminClient();
    let companyId: string;
    const createdAuthUserIds: string[] = [];
    let hr: Profile;
    let target: Profile;

    beforeAll(async () => {
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .upsert(
          { name: "Test Co (employee-profile)", slug: "test-co-employee-profile" },
          { onConflict: "slug" }
        )
        .select("id")
        .single();
      if (companyError) throw companyError;
      companyId = company.id;

      const { data: hrAuthUser, error: hrAuthError } = await supabase.auth.admin.createUser({
        email: `employee-profile-hr-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
      if (hrAuthError || !hrAuthUser.user) throw hrAuthError;
      createdAuthUserIds.push(hrAuthUser.user.id);
      hr = await createProfile({ authUserId: hrAuthUser.user.id, companyId, fullName: "HR", role: "hr" });

      const { data: targetAuthUser, error: targetAuthError } = await supabase.auth.admin.createUser({
        email: `employee-profile-target-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
      if (targetAuthError || !targetAuthUser.user) throw targetAuthError;
      createdAuthUserIds.push(targetAuthUser.user.id);
      target = await createProfile({
        authUserId: targetAuthUser.user.id,
        companyId,
        fullName: "Target Employee",
        role: "employee",
      });

      const { error: taskError } = await supabase.from("tasks").insert({
        company_id: companyId,
        title: "Open task for target",
        status: "todo",
        assignee_id: target.id,
      });
      if (taskError) throw taskError;
    });

    afterAll(async () => {
      await supabase.from("tasks").delete().eq("company_id", companyId);
      await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
      for (const id of createdAuthUserIds) {
        await supabase.auth.admin.deleteUser(id);
      }
      await supabase.from("companies").delete().eq("slug", "test-co-employee-profile");
    });

    it("aggregates open task count and returns the profile and activity", async () => {
      const result = await getEmployeeProfile(hr, target.id);
      expect(result.profile.id).toBe(target.id);
      expect(result.counts.openTasks).toBe(1);
      expect(result.counts.requests).toBe(0);
      expect(result.counts.assets).toBe(0);
      expect(Array.isArray(result.activity)).toBe(true);
    });

    it("denies a stranger from viewing the profile", async () => {
      const { data: strangerAuthUser, error: strangerAuthError } = await supabase.auth.admin.createUser({
        email: `employee-profile-stranger-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
      if (strangerAuthError || !strangerAuthUser.user) throw strangerAuthError;
      createdAuthUserIds.push(strangerAuthUser.user.id);
      const stranger = await createProfile({
        authUserId: strangerAuthUser.user.id,
        companyId,
        fullName: "Stranger",
        role: "employee",
      });

      await expect(getEmployeeProfile(stranger, target.id)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("updates an employee and logs activity", async () => {
      const updated = await updateEmployee(hr, target.id, { positionTitle: "Support Lead" });
      expect(updated.positionTitle).toBe("Support Lead");

      const { activity } = await getEmployeeProfile(hr, target.id);
      expect(activity.some((entry) => entry.message.includes("updated"))).toBe(true);
    });

    it("lists employees for the company", async () => {
      const employees = await listEmployees(hr, {});
      expect(employees.some((e) => e.id === target.id)).toBe(true);
    });
  }
);
```

Update the imports at the top of `lib/domain/employees.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile, getProfileByAuthUserId, type Profile } from "@/lib/domain/profiles";
import { createEmployee, getEmployeeProfile, listEmployees, updateEmployee } from "@/lib/domain/employees";
import { ForbiddenError } from "@/lib/domain/errors";
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `pnpm test:integration lib/domain/employees.test.ts`
Expected: FAIL — `getEmployeeProfile`/`updateEmployee`/`listEmployees` are not exported.

- [ ] **Step 7: Implement the three functions in `lib/domain/employees.ts`**

Change the top-of-file imports from:

```ts
import { createProfile, type Profile } from "@/lib/domain/profiles";
import { logActivity } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import { startWorkflow } from "@/lib/domain/workflows";
import { canCreateEmployee } from "@/lib/domain/permissions";
import { ForbiddenError } from "@/lib/domain/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CreateEmployeeInput } from "@/lib/validation/employees";
```

to:

```ts
import {
  createProfile,
  getProfileById,
  listProfilesByCompany,
  updateProfile,
  type Profile,
} from "@/lib/domain/profiles";
import { logActivity, listActivity, type ActivityEntry } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import { startWorkflow } from "@/lib/domain/workflows";
import { canCreateEmployee, canUpdateEmployee, canViewEmployeeProfile } from "@/lib/domain/permissions";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CreateEmployeeInput, EmployeeFilters, UpdateEmployeeInput } from "@/lib/validation/employees";
```

Append to the end of the file:

```ts
export interface EmployeeCounts {
  openTasks: number;
  requests: number;
  activeWorkflows: number;
  assets: number;
}

export interface EmployeeProfile {
  profile: Employee;
  counts: EmployeeCounts;
  activity: ActivityEntry[];
}

export async function getEmployeeProfile(
  profile: Profile,
  employeeId: string
): Promise<EmployeeProfile> {
  const target = await getProfileById(employeeId);
  if (!target || target.companyId !== profile.companyId) {
    throw new NotFoundError("Employee not found");
  }
  if (!canViewEmployeeProfile(profile, target)) {
    throw new ForbiddenError("You cannot view this employee");
  }

  const supabase = createSupabaseAdminClient();
  const [openTasksResult, requestsResult, workflowsResult, assetsResult, activity] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("assignee_id", employeeId)
        .not("status", "in", "(completed,cancelled)"),
      supabase
        .from("requests")
        .select("id", { count: "exact", head: true })
        .eq("created_by", employeeId),
      supabase
        .from("workflow_instances")
        .select("id", { count: "exact", head: true })
        .eq("related_employee_id", employeeId)
        .eq("status", "in_progress"),
      supabase
        .from("assets")
        .select("id", { count: "exact", head: true })
        .eq("assigned_to", employeeId),
      listActivity("profile", employeeId),
    ]);

  if (openTasksResult.error) throw openTasksResult.error;
  if (requestsResult.error) throw requestsResult.error;
  if (workflowsResult.error) throw workflowsResult.error;
  if (assetsResult.error) throw assetsResult.error;

  return {
    profile: target,
    counts: {
      openTasks: openTasksResult.count ?? 0,
      requests: requestsResult.count ?? 0,
      activeWorkflows: workflowsResult.count ?? 0,
      assets: assetsResult.count ?? 0,
    },
    activity,
  };
}

export async function updateEmployee(
  profile: Profile,
  employeeId: string,
  input: UpdateEmployeeInput
): Promise<Employee> {
  if (!canUpdateEmployee(profile)) {
    throw new ForbiddenError("You cannot update employees");
  }
  const target = await getProfileById(employeeId);
  if (!target || target.companyId !== profile.companyId) {
    throw new NotFoundError("Employee not found");
  }

  const updated = await updateProfile(employeeId, input);
  await logActivity(
    "profile",
    employeeId,
    profile.id,
    `${profile.fullName} updated ${target.fullName}'s profile`
  );
  try {
    await broadcastChange(profile.companyId, "employees", { type: "employee_updated" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }
  return updated;
}

export async function listEmployees(profile: Profile, filters: EmployeeFilters): Promise<Employee[]> {
  return listProfilesByCompany(profile.companyId, filters);
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm test:integration lib/domain/employees.test.ts`
Expected: PASS (7 tests — 3 existing plus 4 new).

Run: `pnpm build`
Expected: no type errors.

- [ ] **Step 9: Commit**

```bash
git add lib/domain/profiles.ts lib/domain/profiles.test.ts lib/domain/employees.ts lib/domain/employees.test.ts
git commit -m "feat: add getEmployeeProfile, updateEmployee, and listEmployees"
```

---

## Task 15: `lib/domain/assets.ts` — `createAsset`, `getAsset`, `listAssets`, `assignAsset`, `changeAssetStatus`

**Files:**
- Create: `lib/domain/assets.ts`, `lib/domain/assets.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `Profile` (`profiles.ts`); `logActivity` (`activity.ts`); `broadcastChange` (`realtime/broadcast.ts`); `canCreateAsset`, `canAssignAsset`, `canChangeAssetStatus`, `canViewAsset` (`permissions.ts`, Task 8); `ForbiddenError`, `NotFoundError` (`errors.ts`); `AssetStatus` (`asset-status.ts`, Task 12); `CreateAssetInput`, `AssetFilters` (`validation/assets.ts`, Task 12).
- Produces: `Asset` type; `insertAsset` (private helper, no permission check — reused by Task 16); `createAsset`, `loadAssetOrThrow`, `getAsset`, `listAssets`, `assignAsset`, `changeAssetStatus` — consumed by `/api/assets*` (Tasks 21–22) and Task 16.

- [ ] **Step 1: Write the failing tests**

Create `lib/domain/assets.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile, type Profile } from "@/lib/domain/profiles";
import {
  assignAsset,
  changeAssetStatus,
  createAsset,
  getAsset,
  listAssets,
} from "@/lib/domain/assets";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("assets", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  const createdAuthUserIds: string[] = [];
  let itProfile: Profile;
  let employeeProfile: Profile;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (assets)", slug: "test-co-assets" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: itAuthUser, error: itAuthError } = await supabase.auth.admin.createUser({
      email: `assets-test-it-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (itAuthError || !itAuthUser.user) throw itAuthError;
    createdAuthUserIds.push(itAuthUser.user.id);
    itProfile = await createProfile({ authUserId: itAuthUser.user.id, companyId, fullName: "IT Person", role: "it" });

    const { data: employeeAuthUser, error: employeeAuthError } = await supabase.auth.admin.createUser({
      email: `assets-test-employee-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (employeeAuthError || !employeeAuthUser.user) throw employeeAuthError;
    createdAuthUserIds.push(employeeAuthUser.user.id);
    employeeProfile = await createProfile({
      authUserId: employeeAuthUser.user.id,
      companyId,
      fullName: "Regular Employee",
      role: "employee",
    });
  });

  afterAll(async () => {
    await supabase.from("assets").delete().eq("company_id", companyId);
    await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
    for (const id of createdAuthUserIds) {
      await supabase.auth.admin.deleteUser(id);
    }
    await supabase.from("companies").delete().eq("slug", "test-co-assets");
  });

  it("rejects asset creation from a non-asset-manager role", async () => {
    await expect(
      createAsset(employeeProfile, { name: "Rejected Laptop", category: "laptop" })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("creates an asset with a sequential asset code", async () => {
    const first = await createAsset(itProfile, { name: "Laptop One", category: "laptop" });
    const second = await createAsset(itProfile, { name: "Laptop Two", category: "laptop" });

    expect(first.assetCode).toMatch(/^AST-\d{5}$/);
    expect(second.assetCode).not.toBe(first.assetCode);
    expect(first.status).toBe("available");
  });

  it("gets and lists assets, filtered by category", async () => {
    await createAsset(itProfile, { name: "Standing Desk", category: "furniture" });

    const fetched = await getAsset(itProfile, (await listAssets(itProfile, { category: "furniture" }))[0].id);
    expect(fetched.category).toBe("furniture");

    const laptops = await listAssets(itProfile, { category: "laptop" });
    expect(laptops.every((a) => a.category === "laptop")).toBe(true);
    expect(laptops.length).toBeGreaterThanOrEqual(2);
  });

  it("throws NotFoundError for an unknown asset id", async () => {
    await expect(getAsset(itProfile, crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("assigns an asset to an employee, setting status to assigned", async () => {
    const asset = await createAsset(itProfile, { name: "Assignable Laptop", category: "laptop" });
    const assigned = await assignAsset(itProfile, asset.id, employeeProfile.id);
    expect(assigned.assignedTo).toBe(employeeProfile.id);
    expect(assigned.status).toBe("assigned");
  });

  it("changes an asset's status", async () => {
    const asset = await createAsset(itProfile, { name: "Broken Laptop", category: "laptop" });
    const updated = await changeAssetStatus(itProfile, asset.id, "maintenance");
    expect(updated.status).toBe("maintenance");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:integration lib/domain/assets.test.ts`
Expected: FAIL — `@/lib/domain/assets` cannot be found.

- [ ] **Step 3: Implement `lib/domain/assets.ts`**

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/domain/profiles";
import { logActivity } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import {
  canAssignAsset,
  canChangeAssetStatus,
  canCreateAsset,
  canViewAsset,
} from "@/lib/domain/permissions";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import type { AssetStatus } from "@/lib/domain/asset-status";
import type { AssetFilters, CreateAssetInput } from "@/lib/validation/assets";

export interface Asset {
  id: string;
  companyId: string;
  assetCode: string;
  name: string;
  category: string;
  status: AssetStatus;
  assignedTo: string | null;
  departmentId: string | null;
  locationId: string | null;
  purchaseInfo: Record<string, unknown> | null;
  warrantyInfo: Record<string, unknown> | null;
  createdAt: string;
}

interface AssetRow {
  id: string;
  company_id: string;
  asset_code: string;
  name: string;
  category: string;
  status: AssetStatus;
  assigned_to: string | null;
  department_id: string | null;
  location_id: string | null;
  purchase_info: Record<string, unknown> | null;
  warranty_info: Record<string, unknown> | null;
  created_at: string;
}

function toAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    companyId: row.company_id,
    assetCode: row.asset_code,
    name: row.name,
    category: row.category,
    status: row.status,
    assignedTo: row.assigned_to,
    departmentId: row.department_id,
    locationId: row.location_id,
    purchaseInfo: row.purchase_info,
    warrantyInfo: row.warranty_info,
    createdAt: row.created_at,
  };
}

const ASSET_COLUMNS =
  "id, company_id, asset_code, name, category, status, assigned_to, department_id, location_id, purchase_info, warranty_info, created_at";

async function generateAssetCode(companyId: string): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const { count, error } = await supabase
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);
  if (error) throw error;
  return `AST-${String((count ?? 0) + 1).padStart(5, "0")}`;
}

interface InsertAssetInput {
  name: string;
  category: string;
  status?: AssetStatus;
  assignedTo?: string | null;
  departmentId?: string | null;
  locationId?: string | null;
  purchaseInfo?: Record<string, unknown> | null;
  warrantyInfo?: Record<string, unknown> | null;
}

async function insertAsset(companyId: string, input: InsertAssetInput): Promise<Asset> {
  const assetCode = await generateAssetCode(companyId);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("assets")
    .insert({
      company_id: companyId,
      asset_code: assetCode,
      name: input.name,
      category: input.category,
      status: input.status ?? "available",
      assigned_to: input.assignedTo ?? null,
      department_id: input.departmentId ?? null,
      location_id: input.locationId ?? null,
      purchase_info: input.purchaseInfo ?? null,
      warranty_info: input.warrantyInfo ?? null,
    })
    .select(ASSET_COLUMNS)
    .single();
  if (error) throw error;
  return toAsset(data);
}

export async function createAsset(profile: Profile, input: CreateAssetInput): Promise<Asset> {
  if (!canCreateAsset(profile)) {
    throw new ForbiddenError("You cannot create assets");
  }

  const asset = await insertAsset(profile.companyId, input);
  await logActivity("asset", asset.id, profile.id, `${profile.fullName} created this asset`);
  try {
    await broadcastChange(profile.companyId, "assets", { type: "asset_created" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }
  return asset;
}

export async function loadAssetOrThrow(assetId: string): Promise<Asset> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("assets")
    .select(ASSET_COLUMNS)
    .eq("id", assetId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError("Asset not found");
  return toAsset(data);
}

export async function getAsset(profile: Profile, assetId: string): Promise<Asset> {
  const asset = await loadAssetOrThrow(assetId);
  if (!canViewAsset(profile, asset)) {
    throw new ForbiddenError("You cannot view this asset");
  }
  return asset;
}

export async function listAssets(profile: Profile, filters: AssetFilters): Promise<Asset[]> {
  const supabase = createSupabaseAdminClient();
  let query = supabase.from("assets").select(ASSET_COLUMNS).eq("company_id", profile.companyId);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.departmentId) query = query.eq("department_id", filters.departmentId);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toAsset);
}

export async function assignAsset(
  profile: Profile,
  assetId: string,
  targetEmployeeId: string
): Promise<Asset> {
  await loadAssetOrThrow(assetId);
  if (!canAssignAsset(profile)) {
    throw new ForbiddenError("You cannot assign assets");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("assets")
    .update({ assigned_to: targetEmployeeId, status: "assigned" })
    .eq("id", assetId)
    .select(ASSET_COLUMNS)
    .single();
  if (error) throw error;

  const updated = toAsset(data);
  await logActivity("asset", updated.id, profile.id, `${profile.fullName} assigned this asset`);
  try {
    await broadcastChange(profile.companyId, "assets", { type: "asset_updated" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }
  return updated;
}

export async function changeAssetStatus(
  profile: Profile,
  assetId: string,
  newStatus: AssetStatus
): Promise<Asset> {
  const asset = await loadAssetOrThrow(assetId);
  if (!canChangeAssetStatus(profile)) {
    throw new ForbiddenError("You cannot change this asset's status");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("assets")
    .update({ status: newStatus })
    .eq("id", assetId)
    .select(ASSET_COLUMNS)
    .single();
  if (error) throw error;

  const updated = toAsset(data);
  await logActivity(
    "asset",
    updated.id,
    profile.id,
    `${profile.fullName} changed status from "${asset.status}" to "${newStatus}"`
  );
  try {
    await broadcastChange(profile.companyId, "assets", { type: "asset_updated" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }
  return updated;
}
```

- [ ] **Step 4: Wire the new test file into `package.json`**

`test:unit`: add `--exclude "lib/domain/assets.test.ts"`.
`test:integration`: add `lib/domain/assets.test.ts` to the file list.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test:integration lib/domain/assets.test.ts`
Expected: PASS (7 tests).

Run: `pnpm build`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/assets.ts lib/domain/assets.test.ts package.json
git commit -m "feat: add asset registry domain layer"
```

---

## Task 16: `assets.ts` — `completeAssetAssignmentTask`

**Files:**
- Modify: `lib/domain/assets.ts`, `lib/domain/assets.test.ts`

**Interfaces:**
- Consumes: `loadTaskOrThrow`, `updateTaskStatus`, `type Task` (`@/lib/domain/tasks`); `getProfileById` (`@/lib/domain/profiles`); `canChangeTaskStatus` (`@/lib/domain/permissions`); `findWorkflowStepByTaskId` (`@/lib/domain/workflows`, Task 9); `loadRequestOrThrow` (`@/lib/domain/requests`); `UnprocessableRequestError` (`@/lib/domain/errors`); `insertAsset` (private, Task 15).
- Produces: `completeAssetAssignmentTask(profile, taskId, input): Promise<{ task: Task; asset: Asset }>` — consumed by `/api/tasks/[id]/complete-with-asset` (Task 23).

**Ordering matters here** (see Global Constraints): the caller's permission to complete the task is checked *before* the asset is created, using the exact same `canChangeTaskStatus` check `updateTaskStatus` will re-run later — so an unauthorized call never leaves a stray `assets` row behind.

- [ ] **Step 1: Write the failing tests**

Add to `lib/domain/assets.test.ts`, a new `describe` block at the end of the file:

```ts
describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("completeAssetAssignmentTask", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  let departmentId: string;
  const createdAuthUserIds: string[] = [];
  let itProfile: Profile;
  let requesterProfile: Profile;
  let request: { id: string; createdBy: string | null; departmentId: string | null };

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert(
        { name: "Test Co (complete-asset)", slug: "test-co-complete-asset" },
        { onConflict: "slug" }
      )
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: department, error: departmentError } = await supabase
      .from("departments")
      .upsert(
        { company_id: companyId, name: "IT (complete-asset)" },
        { onConflict: "company_id,name" }
      )
      .select("id")
      .single();
    if (departmentError) throw departmentError;
    departmentId = department.id;

    const { data: itAuthUser, error: itAuthError } = await supabase.auth.admin.createUser({
      email: `complete-asset-it-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (itAuthError || !itAuthUser.user) throw itAuthError;
    createdAuthUserIds.push(itAuthUser.user.id);
    itProfile = await createProfile({
      authUserId: itAuthUser.user.id,
      companyId,
      fullName: "IT Person (complete-asset)",
      role: "it",
      departmentId,
    });

    const { data: requesterAuthUser, error: requesterAuthError } = await supabase.auth.admin.createUser({
      email: `complete-asset-requester-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (requesterAuthError || !requesterAuthUser.user) throw requesterAuthError;
    createdAuthUserIds.push(requesterAuthUser.user.id);
    requesterProfile = await createProfile({
      authUserId: requesterAuthUser.user.id,
      companyId,
      fullName: "Requester (complete-asset)",
      role: "employee",
    });

    const createdRequest = await createRequest(requesterProfile, {
      title: "New laptop",
      category: "equipment",
    });
    request = createdRequest;

    const { data: template, error: templateError } = await supabase
      .from("workflow_templates")
      .insert({ company_id: companyId, slug: "asset-assignment-test", name: "Asset Assignment Test" })
      .select("id")
      .single();
    if (templateError) throw templateError;

    const { error: stepError } = await supabase.from("workflow_template_steps").insert({
      template_id: template.id,
      step_order: 1,
      step_type: "task",
      title: "Asset Assigned",
      responsible_department_name: "IT (complete-asset)",
      creates_asset: true,
    });
    if (stepError) throw stepError;
  });

  afterAll(async () => {
    await supabase.from("assets").delete().eq("company_id", companyId);
    await supabase.from("workflow_instances").delete().eq("company_id", companyId);
    await supabase.from("requests").delete().eq("company_id", companyId);
    await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
    for (const id of createdAuthUserIds) {
      await supabase.auth.admin.deleteUser(id);
    }
    await supabase.from("companies").delete().eq("slug", "test-co-complete-asset");
  });

  it("throws UnprocessableRequestError for a task that isn't an asset-creating step", async () => {
    const { data: plainTask, error: plainTaskError } = await supabase
      .from("tasks")
      .insert({ company_id: companyId, title: "Plain task", status: "todo", creator_id: itProfile.id })
      .select("id")
      .single();
    if (plainTaskError) throw plainTaskError;

    await expect(
      completeAssetAssignmentTask(itProfile, plainTask.id, { name: "N/A", category: "n/a" })
    ).rejects.toBeInstanceOf(UnprocessableRequestError);
  });

  it("creates and assigns the asset, completes the task, and advances the workflow to completed", async () => {
    const instance = await startWorkflow(itProfile, "asset-assignment-test", {
      requestId: request.id,
    });
    const { data: stepRow, error: stepRowError } = await supabase
      .from("workflow_instance_steps")
      .select("generated_task_id")
      .eq("instance_id", instance.id)
      .eq("step_order", 1)
      .single();
    if (stepRowError) throw stepRowError;
    const taskId = stepRow.generated_task_id as string;

    await updateTaskStatus(itProfile, taskId, "in_progress");

    const { task, asset } = await completeAssetAssignmentTask(itProfile, taskId, {
      name: "New Laptop",
      category: "laptop",
    });

    expect(task.status).toBe("completed");
    expect(asset.assignedTo).toBe(requesterProfile.id);
    expect(asset.status).toBe("assigned");
    expect(asset.departmentId).toBe(request.departmentId);

    const { data: updatedInstance, error: updatedInstanceError } = await supabase
      .from("workflow_instances")
      .select("status")
      .eq("id", instance.id)
      .single();
    if (updatedInstanceError) throw updatedInstanceError;
    expect(updatedInstance.status).toBe("completed");
  });

  it("rejects a caller who cannot complete the task, without creating an asset", async () => {
    const instance = await startWorkflow(itProfile, "asset-assignment-test", {
      requestId: request.id,
    });
    const { data: stepRow, error: stepRowError } = await supabase
      .from("workflow_instance_steps")
      .select("generated_task_id")
      .eq("instance_id", instance.id)
      .eq("step_order", 1)
      .single();
    if (stepRowError) throw stepRowError;
    const taskId = stepRow.generated_task_id as string;
    await updateTaskStatus(itProfile, taskId, "in_progress");

    const { count: assetCountBefore } = await supabase
      .from("assets")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);

    await expect(
      completeAssetAssignmentTask(requesterProfile, taskId, { name: "Should Not Exist", category: "laptop" })
    ).rejects.toBeInstanceOf(ForbiddenError);

    const { count: assetCountAfter } = await supabase
      .from("assets")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);
    expect(assetCountAfter).toBe(assetCountBefore);
  });
});
```

Update the imports at the top of `lib/domain/assets.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile, type Profile } from "@/lib/domain/profiles";
import { createRequest } from "@/lib/domain/requests";
import { startWorkflow } from "@/lib/domain/workflows";
import { updateTaskStatus } from "@/lib/domain/tasks";
import {
  assignAsset,
  changeAssetStatus,
  completeAssetAssignmentTask,
  createAsset,
  getAsset,
  listAssets,
} from "@/lib/domain/assets";
import { ForbiddenError, NotFoundError, UnprocessableRequestError } from "@/lib/domain/errors";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:integration lib/domain/assets.test.ts`
Expected: FAIL — `completeAssetAssignmentTask` is not exported.

- [ ] **Step 3: Implement `completeAssetAssignmentTask` in `lib/domain/assets.ts`**

Change the top-of-file imports from:

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/domain/profiles";
import { logActivity } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import {
  canAssignAsset,
  canChangeAssetStatus,
  canCreateAsset,
  canViewAsset,
} from "@/lib/domain/permissions";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import type { AssetStatus } from "@/lib/domain/asset-status";
import type { AssetFilters, CreateAssetInput } from "@/lib/validation/assets";
```

to:

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getProfileById, type Profile } from "@/lib/domain/profiles";
import { logActivity } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import {
  canAssignAsset,
  canChangeAssetStatus,
  canChangeTaskStatus,
  canCreateAsset,
  canViewAsset,
} from "@/lib/domain/permissions";
import { ForbiddenError, NotFoundError, UnprocessableRequestError } from "@/lib/domain/errors";
import type { AssetStatus } from "@/lib/domain/asset-status";
import type { AssetFilters, CreateAssetInput } from "@/lib/validation/assets";
import { loadTaskOrThrow, updateTaskStatus, type Task } from "@/lib/domain/tasks";
import { findWorkflowStepByTaskId } from "@/lib/domain/workflows";
import { loadRequestOrThrow } from "@/lib/domain/requests";
```

Append to the end of the file:

```ts
export async function completeAssetAssignmentTask(
  profile: Profile,
  taskId: string,
  input: CreateAssetInput
): Promise<{ task: Task; asset: Asset }> {
  const task = await loadTaskOrThrow(taskId);
  const assignee = task.assigneeId ? await getProfileById(task.assigneeId) : null;
  if (!canChangeTaskStatus(profile, task, assignee)) {
    throw new ForbiddenError("You cannot complete this task");
  }

  const workflowStep = await findWorkflowStepByTaskId(taskId);
  if (!workflowStep || !workflowStep.createsAsset) {
    throw new UnprocessableRequestError("This task does not create an asset");
  }
  if (!workflowStep.relatedRequestId) {
    throw new UnprocessableRequestError("This workflow instance has no related request");
  }

  const request = await loadRequestOrThrow(workflowStep.relatedRequestId);

  const asset = await insertAsset(profile.companyId, {
    name: input.name,
    category: input.category,
    status: "assigned",
    assignedTo: request.createdBy,
    departmentId: request.departmentId,
    purchaseInfo: input.purchaseInfo ?? null,
    warrantyInfo: input.warrantyInfo ?? null,
  });
  await logActivity(
    "asset",
    asset.id,
    profile.id,
    `${profile.fullName} created this asset and assigned it via workflow`
  );
  try {
    await broadcastChange(profile.companyId, "assets", { type: "asset_created" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }

  const updatedTask = await updateTaskStatus(profile, taskId, "completed");

  return { task: updatedTask, asset };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:integration lib/domain/assets.test.ts`
Expected: PASS (10 tests — 7 existing plus 3 new).

Run: `pnpm build`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/assets.ts lib/domain/assets.test.ts
git commit -m "feat: add completeAssetAssignmentTask"
```

---

## Task 17: `tasks.ts` — `relatedAssetId`

**Files:**
- Modify: `lib/validation/tasks.ts`, `lib/domain/tasks.ts`, `lib/domain/tasks.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `createTaskSchema`/`CreateTaskInput` gains optional `relatedAssetId`; `Task` gains `relatedAssetId: string | null`; `createTask` passes it through — consumed by the asset detail page's "Report an issue" quick action (Task 31).

- [ ] **Step 1: Write the failing test**

Add to `lib/domain/tasks.test.ts`'s `createTask` describe block (wherever `relatedEmployeeId` is already tested, or as a new `it` alongside the existing `createTask` tests):

```ts
    it("creates a task with a related asset", async () => {
      const { data: asset, error: assetError } = await supabase
        .from("assets")
        .insert({ company_id: companyId, asset_code: "AST-TASKS-TEST", name: "Test Asset", category: "laptop" })
        .select("id")
        .single();
      if (assetError) throw assetError;

      const task = await createTask(employee, { title: "Fix asset", relatedAssetId: asset.id });
      expect(task.relatedAssetId).toBe(asset.id);

      await supabase.from("tasks").delete().eq("id", task.id);
      await supabase.from("assets").delete().eq("id", asset.id);
    });
```

Adjust the exact variable names (`supabase`, `companyId`, `employee`) to match whatever this file's existing `createTask` tests already use — follow the file's established fixture, don't introduce a second one.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration lib/domain/tasks.test.ts`
Expected: FAIL — TypeScript error, `relatedAssetId` doesn't exist on `CreateTaskInput`, and/or `task.relatedAssetId` is `undefined`.

- [ ] **Step 3: Extend `lib/validation/tasks.ts`**

Change:

```ts
export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(5000).optional(),
  priority: taskPrioritySchema.optional(),
  departmentId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  relatedEmployeeId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
});
```

to:

```ts
export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(5000).optional(),
  priority: taskPrioritySchema.optional(),
  departmentId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  relatedEmployeeId: z.string().uuid().optional(),
  relatedAssetId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
});
```

- [ ] **Step 4: Extend `lib/domain/tasks.ts`**

Change the `Task` interface, `TaskRow` interface, `toTask`, and `TASK_COLUMNS` (each adding a `relatedAssetId`/`related_asset_id` entry in the same position as `relatedEmployeeId`/`related_employee_id`):

```ts
export interface Task {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  creatorId: string | null;
  departmentId: string | null;
  relatedEmployeeId: string | null;
  relatedAssetId: string | null;
  relatedWorkflowInstanceId: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
}
```

```ts
interface TaskRow {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  creator_id: string | null;
  department_id: string | null;
  related_employee_id: string | null;
  related_asset_id: string | null;
  related_workflow_instance_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
}
```

```ts
function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    companyId: row.company_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assigneeId: row.assignee_id,
    creatorId: row.creator_id,
    departmentId: row.department_id,
    relatedEmployeeId: row.related_employee_id,
    relatedAssetId: row.related_asset_id,
    relatedWorkflowInstanceId: row.related_workflow_instance_id,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

const TASK_COLUMNS =
  "id, company_id, title, description, status, priority, assignee_id, creator_id, department_id, related_employee_id, related_asset_id, related_workflow_instance_id, due_date, completed_at, created_at";
```

Change `createTask`'s insert from:

```ts
    .insert({
      company_id: profile.companyId,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? "medium",
      assignee_id: input.assigneeId ?? null,
      creator_id: profile.id,
      department_id: input.departmentId ?? null,
      related_employee_id: input.relatedEmployeeId ?? null,
      due_date: input.dueDate ?? null,
    })
```

to:

```ts
    .insert({
      company_id: profile.companyId,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? "medium",
      assignee_id: input.assigneeId ?? null,
      creator_id: profile.id,
      department_id: input.departmentId ?? null,
      related_employee_id: input.relatedEmployeeId ?? null,
      related_asset_id: input.relatedAssetId ?? null,
      due_date: input.dueDate ?? null,
    })
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test:integration lib/domain/tasks.test.ts`
Expected: PASS (existing count plus 1).

Run: `pnpm build`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/validation/tasks.ts lib/domain/tasks.ts lib/domain/tasks.test.ts
git commit -m "feat: add tasks.relatedAssetId"
```

---

## Task 18: Seed — mark the Equipment Request's "Asset Assigned" step `creates_asset`

**Files:**
- Modify: `lib/domain/seed.ts`, `lib/domain/seed.test.ts`

**Interfaces:**
- Consumes: `WORKFLOW_TEMPLATES` (Phase 4).
- Produces: the `equipment-request` template's step 5 ("Asset Assigned") now upserts with `creates_asset: true`; every other step across all three templates stays `false`.

- [ ] **Step 1: Write the failing test**

Add to `lib/domain/seed.test.ts`'s existing `"seeds the three workflow templates..."` test, after the existing `equipmentSteps` assertions:

```ts
    expect(equipmentSteps?.[4]).toMatchObject({ title: "Asset Assigned" });

    const { data: assetStep, error: assetStepError } = await supabase
      .from("workflow_template_steps")
      .select("creates_asset")
      .eq("template_id", equipmentTemplate.id)
      .eq("step_order", 5)
      .single();
    if (assetStepError) throw assetStepError;
    expect(assetStep.creates_asset).toBe(true);

    const { data: otherSteps, error: otherStepsError } = await supabase
      .from("workflow_template_steps")
      .select("creates_asset")
      .eq("template_id", equipmentTemplate.id)
      .neq("step_order", 5);
    if (otherStepsError) throw otherStepsError;
    expect(otherSteps?.every((s) => s.creates_asset === false)).toBe(true);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration lib/domain/seed.test.ts`
Expected: FAIL — `creates_asset` is `false` for step 5 (the column defaults to `false` and `seedWorkflowTemplates` doesn't set it yet).

- [ ] **Step 3: Update `lib/domain/seed.ts`**

Change the `WorkflowTemplateStepSeed` interface from:

```ts
interface WorkflowTemplateStepSeed {
  order: number;
  type: "task" | "approval";
  title: string;
  description: string | null;
  responsibleRole: Role | null;
  responsibleDepartmentName: string | null;
}
```

to:

```ts
interface WorkflowTemplateStepSeed {
  order: number;
  type: "task" | "approval";
  title: string;
  description: string | null;
  responsibleRole: Role | null;
  responsibleDepartmentName: string | null;
  createsAsset?: boolean;
}
```

Change the Equipment Request template's "Asset Assigned" step entry from:

```ts
      {
        order: 5,
        type: "task",
        title: "Asset Assigned",
        description: null,
        responsibleRole: null,
        responsibleDepartmentName: "IT",
      },
```

to:

```ts
      {
        order: 5,
        type: "task",
        title: "Asset Assigned",
        description: null,
        responsibleRole: null,
        responsibleDepartmentName: "IT",
        createsAsset: true,
      },
```

Change `seedWorkflowTemplates`'s step upsert from:

```ts
    const { error: stepsError } = await supabase.from("workflow_template_steps").upsert(
      template.steps.map((step) => ({
        template_id: templateRow.id,
        step_order: step.order,
        step_type: step.type,
        title: step.title,
        description: step.description,
        responsible_role: step.responsibleRole,
        responsible_department_name: step.responsibleDepartmentName,
      })),
      { onConflict: "template_id,step_order" }
    );
```

to:

```ts
    const { error: stepsError } = await supabase.from("workflow_template_steps").upsert(
      template.steps.map((step) => ({
        template_id: templateRow.id,
        step_order: step.order,
        step_type: step.type,
        title: step.title,
        description: step.description,
        responsible_role: step.responsibleRole,
        responsible_department_name: step.responsibleDepartmentName,
        creates_asset: step.createsAsset ?? false,
      })),
      { onConflict: "template_id,step_order" }
    );
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:integration lib/domain/seed.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/seed.ts lib/domain/seed.test.ts
git commit -m "feat: mark the equipment workflow's Asset Assigned step as creates_asset"
```

---

## Task 19: `GET /api/employees`, `POST /api/employees`

**Files:**
- Create: `app/api/employees/route.ts`, `app/api/employees/route.test.ts`

**Interfaces:**
- Consumes: `getCurrentProfile` (`@/lib/auth/session`); `createEmployee`, `listEmployees` (`@/lib/domain/employees`); `createEmployeeSchema`, `employeeFiltersSchema` (`@/lib/validation/employees`); `toErrorResponse` (`@/lib/api/error-response`).
- Produces: `GET`/`POST` route handlers, following the exact shape of `app/api/tasks/route.ts`.

- [ ] **Step 1: Write the failing tests**

Create `app/api/employees/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/employees", () => ({
  createEmployee: vi.fn(),
  listEmployees: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { createEmployee, listEmployees } from "@/lib/domain/employees";
import { GET, POST } from "@/app/api/employees/route";
import { ForbiddenError } from "@/lib/domain/errors";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "HR Person",
  role: "hr" as const,
  departmentId: null,
  managerId: null,
  positionTitle: null,
  employeeNumber: null,
  locationId: null,
  status: "active" as const,
};

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(createEmployee).mockReset();
  vi.mocked(listEmployees).mockReset();
});

describe("GET /api/employees", () => {
  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/employees"));
    expect(response.status).toBe(401);
  });

  it("returns employees scoped by the caller's filters", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(listEmployees).mockResolvedValue([]);

    const response = await GET(new Request("http://localhost/api/employees?status=active"));
    expect(response.status).toBe(200);
    expect(listEmployees).toHaveBeenCalledWith(PROFILE, { status: "active" });
  });

  it("returns 400 for an invalid filter value", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await GET(new Request("http://localhost/api/employees?status=on_leave"));
    expect(response.status).toBe(400);
  });
});

describe("POST /api/employees", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost/api/employees", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await POST(jsonRequest({ email: "x@example.com", fullName: "X", role: "employee" }));
    expect(response.status).toBe(401);
  });

  it("creates an employee", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(createEmployee).mockResolvedValue({ id: "employee-1" } as never);

    const response = await POST(
      jsonRequest({ email: "new.hire@example.com", fullName: "New Hire", role: "employee" })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.employee.id).toBe("employee-1");
  });

  it("returns 400 for an invalid body", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(jsonRequest({ email: "not-an-email", fullName: "", role: "employee" }));
    expect(response.status).toBe(400);
  });

  it("maps a ForbiddenError from the domain layer to 403", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(createEmployee).mockRejectedValue(new ForbiddenError("no"));

    const response = await POST(
      jsonRequest({ email: "new.hire@example.com", fullName: "New Hire", role: "employee" })
    );
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test app/api/employees/route.test.ts`
Expected: FAIL — `@/app/api/employees/route` cannot be found.

- [ ] **Step 3: Implement `app/api/employees/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { createEmployee, listEmployees } from "@/lib/domain/employees";
import { createEmployeeSchema, employeeFiltersSchema } from "@/lib/validation/employees";
import { toErrorResponse } from "@/lib/api/error-response";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = employeeFiltersSchema.safeParse({
    departmentId: url.searchParams.get("departmentId") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const employees = await listEmployees(profile, parsed.data);
    return NextResponse.json({ employees });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createEmployeeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const employee = await createEmployee(profile, parsed.data);
    return NextResponse.json({ employee }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test app/api/employees/route.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/employees/route.ts app/api/employees/route.test.ts
git commit -m "feat: add GET and POST /api/employees routes"
```

---

## Task 20: `GET /api/employees/[id]`, `PATCH /api/employees/[id]`

**Files:**
- Create: `app/api/employees/[id]/route.ts`, `app/api/employees/[id]/route.test.ts`

**Interfaces:**
- Consumes: `getEmployeeProfile`, `updateEmployee` (`@/lib/domain/employees`); `updateEmployeeSchema` (`@/lib/validation/employees`).
- Produces: `GET`/`PATCH` route handlers, following the exact shape of `app/api/tasks/[id]/route.ts`.

- [ ] **Step 1: Write the failing tests**

Create `app/api/employees/[id]/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/employees", () => ({
  getEmployeeProfile: vi.fn(),
  updateEmployee: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { getEmployeeProfile, updateEmployee } from "@/lib/domain/employees";
import { GET, PATCH } from "@/app/api/employees/[id]/route";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "HR Person",
  role: "hr" as const,
  departmentId: null,
  managerId: null,
  positionTitle: null,
  employeeNumber: null,
  locationId: null,
  status: "active" as const,
};

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(getEmployeeProfile).mockReset();
  vi.mocked(updateEmployee).mockReset();
});

describe("GET /api/employees/[id]", () => {
  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost"), params("employee-1"));
    expect(response.status).toBe(401);
  });

  it("returns the employee profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getEmployeeProfile).mockResolvedValue({ profile: { id: "employee-1" } } as never);

    const response = await GET(new Request("http://localhost"), params("employee-1"));
    expect(response.status).toBe(200);
  });

  it("maps a NotFoundError to 404", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getEmployeeProfile).mockRejectedValue(new NotFoundError("no"));

    const response = await GET(new Request("http://localhost"), params("missing"));
    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/employees/[id]", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await PATCH(jsonRequest({ status: "inactive" }), params("employee-1"));
    expect(response.status).toBe(401);
  });

  it("updates the employee", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(updateEmployee).mockResolvedValue({ id: "employee-1", status: "inactive" } as never);

    const response = await PATCH(jsonRequest({ status: "inactive" }), params("employee-1"));
    expect(response.status).toBe(200);
    expect(updateEmployee).toHaveBeenCalledWith(PROFILE, "employee-1", { status: "inactive" });
  });

  it("returns 400 for an invalid body", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await PATCH(jsonRequest({ status: "on_leave" }), params("employee-1"));
    expect(response.status).toBe(400);
  });

  it("maps a ForbiddenError to 403", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(updateEmployee).mockRejectedValue(new ForbiddenError("no"));

    const response = await PATCH(jsonRequest({ status: "inactive" }), params("employee-1"));
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test "app/api/employees/[id]/route.test.ts"`
Expected: FAIL — the route file doesn't exist.

- [ ] **Step 3: Implement `app/api/employees/[id]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getEmployeeProfile, updateEmployee } from "@/lib/domain/employees";
import { updateEmployeeSchema } from "@/lib/validation/employees";
import { toErrorResponse } from "@/lib/api/error-response";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const employeeProfile = await getEmployeeProfile(profile, id);
    return NextResponse.json(employeeProfile);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = updateEmployeeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const employee = await updateEmployee(profile, id, parsed.data);
    return NextResponse.json({ employee });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test "app/api/employees/[id]/route.test.ts"`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/api/employees/[id]/route.ts" "app/api/employees/[id]/route.test.ts"
git commit -m "feat: add GET and PATCH /api/employees/[id] routes"
```

---

## Task 21: `GET /api/assets`, `POST /api/assets`

**Files:**
- Create: `app/api/assets/route.ts`, `app/api/assets/route.test.ts`

**Interfaces:**
- Consumes: `createAsset`, `listAssets` (`@/lib/domain/assets`); `createAssetSchema`, `assetFiltersSchema` (`@/lib/validation/assets`).
- Produces: `GET`/`POST` route handlers, following the exact shape of `app/api/tasks/route.ts`.

- [ ] **Step 1: Write the failing tests**

Create `app/api/assets/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/assets", () => ({
  createAsset: vi.fn(),
  listAssets: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { createAsset, listAssets } from "@/lib/domain/assets";
import { GET, POST } from "@/app/api/assets/route";
import { ForbiddenError } from "@/lib/domain/errors";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "IT Person",
  role: "it" as const,
  departmentId: null,
  managerId: null,
  positionTitle: null,
  employeeNumber: null,
  locationId: null,
  status: "active" as const,
};

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(createAsset).mockReset();
  vi.mocked(listAssets).mockReset();
});

describe("GET /api/assets", () => {
  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/assets"));
    expect(response.status).toBe(401);
  });

  it("returns assets scoped by the caller's filters", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(listAssets).mockResolvedValue([]);

    const response = await GET(new Request("http://localhost/api/assets?category=laptop"));
    expect(response.status).toBe(200);
    expect(listAssets).toHaveBeenCalledWith(PROFILE, { category: "laptop" });
  });

  it("returns 400 for an invalid filter value", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await GET(new Request("http://localhost/api/assets?status=broken"));
    expect(response.status).toBe(400);
  });
});

describe("POST /api/assets", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost/api/assets", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await POST(jsonRequest({ name: "x", category: "laptop" }));
    expect(response.status).toBe(401);
  });

  it("creates an asset", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(createAsset).mockResolvedValue({ id: "asset-1" } as never);

    const response = await POST(jsonRequest({ name: "MacBook Pro", category: "laptop" }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.asset.id).toBe("asset-1");
  });

  it("returns 400 for an invalid body", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(jsonRequest({ name: "", category: "" }));
    expect(response.status).toBe(400);
  });

  it("maps a ForbiddenError from the domain layer to 403", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(createAsset).mockRejectedValue(new ForbiddenError("no"));

    const response = await POST(jsonRequest({ name: "MacBook Pro", category: "laptop" }));
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test app/api/assets/route.test.ts`
Expected: FAIL — `@/app/api/assets/route` cannot be found.

- [ ] **Step 3: Implement `app/api/assets/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { createAsset, listAssets } from "@/lib/domain/assets";
import { createAssetSchema, assetFiltersSchema } from "@/lib/validation/assets";
import { toErrorResponse } from "@/lib/api/error-response";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = assetFiltersSchema.safeParse({
    category: url.searchParams.get("category") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    departmentId: url.searchParams.get("departmentId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const assets = await listAssets(profile, parsed.data);
    return NextResponse.json({ assets });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createAssetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const asset = await createAsset(profile, parsed.data);
    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test app/api/assets/route.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/assets/route.ts app/api/assets/route.test.ts
git commit -m "feat: add GET and POST /api/assets routes"
```

---

## Task 22: `GET /api/assets/[id]`, `PATCH /api/assets/[id]`

**Files:**
- Create: `app/api/assets/[id]/route.ts`, `app/api/assets/[id]/route.test.ts`

**Interfaces:**
- Consumes: `getAsset`, `assignAsset`, `changeAssetStatus` (`@/lib/domain/assets`); `patchAssetSchema` (`@/lib/validation/assets`).
- Produces: `GET`/`PATCH` route handlers. `PATCH`'s body discriminates on `action` (`"assign"` or `"changeStatus"`), mirroring how `patchTaskSchema` discriminates status vs. assignment in `app/api/tasks/[id]/route.ts`.

- [ ] **Step 1: Write the failing tests**

Create `app/api/assets/[id]/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/assets", () => ({
  getAsset: vi.fn(),
  assignAsset: vi.fn(),
  changeAssetStatus: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { getAsset, assignAsset, changeAssetStatus } from "@/lib/domain/assets";
import { GET, PATCH } from "@/app/api/assets/[id]/route";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "IT Person",
  role: "it" as const,
  departmentId: null,
  managerId: null,
  positionTitle: null,
  employeeNumber: null,
  locationId: null,
  status: "active" as const,
};

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(getAsset).mockReset();
  vi.mocked(assignAsset).mockReset();
  vi.mocked(changeAssetStatus).mockReset();
});

describe("GET /api/assets/[id]", () => {
  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost"), params("asset-1"));
    expect(response.status).toBe(401);
  });

  it("returns the asset", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getAsset).mockResolvedValue({ id: "asset-1" } as never);

    const response = await GET(new Request("http://localhost"), params("asset-1"));
    expect(response.status).toBe(200);
  });

  it("maps a NotFoundError to 404", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getAsset).mockRejectedValue(new NotFoundError("no"));

    const response = await GET(new Request("http://localhost"), params("missing"));
    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/assets/[id]", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await PATCH(
      jsonRequest({ action: "changeStatus", status: "maintenance" }),
      params("asset-1")
    );
    expect(response.status).toBe(401);
  });

  it("assigns the asset when action is assign", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(assignAsset).mockResolvedValue({ id: "asset-1", assignedTo: "employee-1" } as never);

    const response = await PATCH(
      jsonRequest({ action: "assign", targetEmployeeId: "11111111-1111-1111-1111-111111111111" }),
      params("asset-1")
    );
    expect(response.status).toBe(200);
    expect(assignAsset).toHaveBeenCalledWith(
      PROFILE,
      "asset-1",
      "11111111-1111-1111-1111-111111111111"
    );
  });

  it("changes the asset's status when action is changeStatus", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(changeAssetStatus).mockResolvedValue({ id: "asset-1", status: "maintenance" } as never);

    const response = await PATCH(
      jsonRequest({ action: "changeStatus", status: "maintenance" }),
      params("asset-1")
    );
    expect(response.status).toBe(200);
    expect(changeAssetStatus).toHaveBeenCalledWith(PROFILE, "asset-1", "maintenance");
  });

  it("returns 400 for an invalid body", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await PATCH(jsonRequest({ action: "retire" }), params("asset-1"));
    expect(response.status).toBe(400);
  });

  it("maps a ForbiddenError to 403", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(changeAssetStatus).mockRejectedValue(new ForbiddenError("no"));

    const response = await PATCH(
      jsonRequest({ action: "changeStatus", status: "maintenance" }),
      params("asset-1")
    );
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test "app/api/assets/[id]/route.test.ts"`
Expected: FAIL — the route file doesn't exist.

- [ ] **Step 3: Implement `app/api/assets/[id]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { assignAsset, changeAssetStatus, getAsset } from "@/lib/domain/assets";
import { patchAssetSchema } from "@/lib/validation/assets";
import { toErrorResponse } from "@/lib/api/error-response";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const asset = await getAsset(profile, id);
    return NextResponse.json({ asset });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = patchAssetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const asset =
      parsed.data.action === "assign"
        ? await assignAsset(profile, id, parsed.data.targetEmployeeId)
        : await changeAssetStatus(profile, id, parsed.data.status);
    return NextResponse.json({ asset });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test "app/api/assets/[id]/route.test.ts"`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/api/assets/[id]/route.ts" "app/api/assets/[id]/route.test.ts"
git commit -m "feat: add GET and PATCH /api/assets/[id] routes"
```

---

## Task 23: `POST /api/tasks/[id]/complete-with-asset`

**Files:**
- Create: `app/api/tasks/[id]/complete-with-asset/route.ts`, `app/api/tasks/[id]/complete-with-asset/route.test.ts`

**Interfaces:**
- Consumes: `completeAssetAssignmentTask` (`@/lib/domain/assets`, Task 16); `createAssetSchema` (`@/lib/validation/assets`).
- Produces: `POST` route handler — consumed by the task detail page's asset-assignment form (Task 32).

- [ ] **Step 1: Write the failing test**

Create `app/api/tasks/[id]/complete-with-asset/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/assets", () => ({
  completeAssetAssignmentTask: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { completeAssetAssignmentTask } from "@/lib/domain/assets";
import { POST } from "@/app/api/tasks/[id]/complete-with-asset/route";
import { ForbiddenError, UnprocessableRequestError } from "@/lib/domain/errors";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "IT Person",
  role: "it" as const,
  departmentId: null,
  managerId: null,
  positionTitle: null,
  employeeNumber: null,
  locationId: null,
  status: "active" as const,
};

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(completeAssetAssignmentTask).mockReset();
});

describe("POST /api/tasks/[id]/complete-with-asset", () => {
  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await POST(
      jsonRequest({ name: "Laptop", category: "laptop" }),
      params("task-1")
    );
    expect(response.status).toBe(401);
  });

  it("completes the task and creates the asset", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(completeAssetAssignmentTask).mockResolvedValue({
      task: { id: "task-1", status: "completed" },
      asset: { id: "asset-1" },
    } as never);

    const response = await POST(
      jsonRequest({ name: "Laptop", category: "laptop" }),
      params("task-1")
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.asset.id).toBe("asset-1");
    expect(body.task.status).toBe("completed");
  });

  it("returns 400 for an invalid body", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(jsonRequest({ name: "", category: "" }), params("task-1"));
    expect(response.status).toBe(400);
  });

  it("maps an UnprocessableRequestError to 422", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(completeAssetAssignmentTask).mockRejectedValue(
      new UnprocessableRequestError("no")
    );

    const response = await POST(
      jsonRequest({ name: "Laptop", category: "laptop" }),
      params("task-1")
    );
    expect(response.status).toBe(422);
  });

  it("maps a ForbiddenError to 403", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(completeAssetAssignmentTask).mockRejectedValue(new ForbiddenError("no"));

    const response = await POST(
      jsonRequest({ name: "Laptop", category: "laptop" }),
      params("task-1")
    );
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test "app/api/tasks/[id]/complete-with-asset/route.test.ts"`
Expected: FAIL — the route file doesn't exist.

- [ ] **Step 3: Implement `app/api/tasks/[id]/complete-with-asset/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { completeAssetAssignmentTask } from "@/lib/domain/assets";
import { createAssetSchema } from "@/lib/validation/assets";
import { toErrorResponse } from "@/lib/api/error-response";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createAssetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { task, asset } = await completeAssetAssignmentTask(profile, id, parsed.data);
    return NextResponse.json({ task, asset });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test "app/api/tasks/[id]/complete-with-asset/route.test.ts"`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/api/tasks/[id]/complete-with-asset/route.ts" "app/api/tasks/[id]/complete-with-asset/route.test.ts"
git commit -m "feat: add POST /api/tasks/[id]/complete-with-asset route"
```

---

## Task 24: Invite acceptance — `/auth/accept-invite`

**Files:**
- Create: `components/auth/accept-invite-form.tsx`, `components/auth/accept-invite-form.test.tsx`, `app/auth/accept-invite/page.tsx`

**Interfaces:**
- Consumes: `createSupabaseBrowserClient` (`@/lib/supabase/browser`).
- Produces: `AcceptInviteForm` component; `/auth/accept-invite` page. No new API route — `supabase.auth.updateUser` is called directly from the browser, same as `LoginForm`'s `signInWithPassword` call.

The Supabase invite email's link authenticates the browser session on load (same mechanism `/auth/confirmed` already relies on for signup confirmation), so this page only needs to detect that a session exists and then let the person set a password.

- [ ] **Step 1: Write the failing test**

Create `components/auth/accept-invite-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

const updateUserMock = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { updateUser: updateUserMock },
  }),
}));

import { AcceptInviteForm } from "@/components/auth/accept-invite-form";

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  updateUserMock.mockReset();
});

describe("AcceptInviteForm", () => {
  it("shows an error when the passwords don't match", async () => {
    render(<AcceptInviteForm />);
    await userEvent.type(screen.getByLabelText(/^password$/i), "password123");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "different123");
    await userEvent.click(screen.getByRole("button", { name: /set password/i }));

    expect(await screen.findByText("Passwords do not match")).toBeInTheDocument();
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("sets the password and redirects to the dashboard", async () => {
    updateUserMock.mockResolvedValue({ error: null });
    render(<AcceptInviteForm />);

    await userEvent.type(screen.getByLabelText(/^password$/i), "password123");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /set password/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/dashboard"));
    expect(updateUserMock).toHaveBeenCalledWith({ password: "password123" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test components/auth/accept-invite-form.test.tsx`
Expected: FAIL — `@/components/auth/accept-invite-form` cannot be found.

- [ ] **Step 3: Implement `components/auth/accept-invite-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const acceptInviteFormSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type AcceptInviteFormValues = z.infer<typeof acceptInviteFormSchema>;

export function AcceptInviteForm() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AcceptInviteFormValues>({ resolver: zodResolver(acceptInviteFormSchema) });

  async function onSubmit(values: AcceptInviteFormValues) {
    setSubmitError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      setSubmitError(error.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 max-w-sm">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" {...register("password")} />
        {errors.password && <p className="text-sm text-red-600">{errors.password.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input id="confirmPassword" type="password" {...register("confirmPassword")} />
        {errors.confirmPassword && (
          <p className="text-sm text-red-600">{errors.confirmPassword.message}</p>
        )}
      </div>

      {submitError && <p className="text-sm text-red-600">{submitError}</p>}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Setting password..." : "Set password and continue"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test components/auth/accept-invite-form.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Create `app/auth/accept-invite/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";

export default function AcceptInvitePage() {
  const [status, setStatus] = useState<"checking" | "ready" | "error">("checking");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setStatus(session ? "ready" : "error");
    });
  }, []);

  if (status === "checking") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-muted-foreground">Confirming your invite...</p>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">Invite link invalid or expired</h1>
        <p className="max-w-sm text-muted-foreground">
          Ask whoever invited you to send a new invite, or log in if you already set a password.
        </p>
        <Link href="/login" className="text-sm underline underline-offset-4">
          Back to login
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Welcome</h1>
        <p className="max-w-sm text-muted-foreground">
          Set a password to finish setting up your account.
        </p>
      </div>
      <AcceptInviteForm />
    </main>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add components/auth/accept-invite-form.tsx components/auth/accept-invite-form.test.tsx app/auth/accept-invite/page.tsx
git commit -m "feat: add invite acceptance page"
```

---

## Task 25: Employee creation — `EmployeeForm` and `/employees/new`

**Files:**
- Create: `components/employees/employee-form.tsx`, `components/employees/employee-form.test.tsx`, `app/(app)/employees/new/page.tsx`

**Interfaces:**
- Consumes: `createEmployeeSchema`, `CreateEmployeeInput` (`@/lib/validation/employees`); `Department` (`@/lib/domain/departments`); `Location` (`@/lib/domain/locations`); the existing `GET /api/profiles?role=` endpoint (for the manager picker — no new route needed, same as `RequestReassignControl`'s peer picker); `canCreateEmployee` (`@/lib/domain/permissions`).
- Produces: `EmployeeForm` component; `/employees/new` page, guarded by `canCreateEmployee` (`notFound()` for anyone else, mirroring how detail pages already `notFound()` on `ForbiddenError`).

**Watch for:** a `<select>`'s "no selection" option always submits as the empty string `""`, but `createEmployeeSchema`'s `departmentId`/`managerId`/`locationId` are `z.string().uuid().optional()` — `""` fails `.uuid()` and would otherwise block submission with a client-side validation error, or (if the schema were loosened instead) reach the domain layer as `""` and crash Postgres's `uuid` column with a raw type error. Fixed here with `register(field, { setValueAs: (v) => v || undefined })`, which react-hook-form runs before Zod validation.

- [ ] **Step 1: Write the failing test**

Create `components/employees/employee-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { EmployeeForm } from "@/components/employees/employee-form";

beforeEach(() => {
  pushMock.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (url.startsWith("/api/profiles")) {
        return Promise.resolve({ ok: true, json: async () => ({ profiles: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ employee: { id: "employee-1" } }) });
    })
  );
});

describe("EmployeeForm", () => {
  it("shows validation errors when submitted empty", async () => {
    render(<EmployeeForm departments={[]} locations={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /create employee/i }));

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
  });

  it("creates an employee without a department/location/manager and redirects", async () => {
    render(<EmployeeForm departments={[]} locations={[]} />);

    await userEvent.type(screen.getByLabelText(/full name/i), "New Hire");
    await userEvent.type(screen.getByLabelText(/^email$/i), "new.hire@example.com");
    await userEvent.click(screen.getByRole("button", { name: /create employee/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/employees/employee-1"));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test components/employees/employee-form.test.tsx`
Expected: FAIL — `@/components/employees/employee-form` cannot be found.

- [ ] **Step 3: Implement `components/employees/employee-form.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createEmployeeSchema, type CreateEmployeeInput } from "@/lib/validation/employees";
import type { Department } from "@/lib/domain/departments";
import type { Location } from "@/lib/domain/locations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ROLE_OPTIONS: { value: CreateEmployeeInput["role"]; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "operations_manager", label: "Operations Manager" },
  { value: "it", label: "IT" },
  { value: "hr", label: "HR" },
  { value: "admin", label: "Admin" },
];

interface ManagerOption {
  id: string;
  fullName: string;
}

export function EmployeeForm({
  departments,
  locations,
}: {
  departments: Department[];
  locations: Location[];
}) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateEmployeeInput>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: { role: "employee", startOnboarding: true },
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profiles?role=manager").then(async (response) => {
      if (cancelled || !response.ok) return;
      const body = await response.json();
      setManagers(body.profiles);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(values: CreateEmployeeInput) {
    setSubmitError(null);
    const response = await fetch("/api/employees", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      const body = await response.json();
      setSubmitError(typeof body.error === "string" ? body.error : "Failed to create employee");
      return;
    }

    const { employee } = await response.json();
    router.push(`/employees/${employee.id}`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 max-w-lg">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" {...register("fullName")} />
        {errors.fullName && <p className="text-sm text-red-600">{errors.fullName.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" {...register("email")} />
        {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="role">Role</Label>
        <select
          id="role"
          {...register("role")}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="positionTitle">Position</Label>
        <Input id="positionTitle" {...register("positionTitle", { setValueAs: (v) => v || undefined })} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="employeeNumber">Employee number</Label>
        <Input
          id="employeeNumber"
          {...register("employeeNumber", { setValueAs: (v) => v || undefined })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="departmentId">Department</Label>
        <select
          id="departmentId"
          {...register("departmentId", { setValueAs: (v) => v || undefined })}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">No department</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="locationId">Location</Label>
        <select
          id="locationId"
          {...register("locationId", { setValueAs: (v) => v || undefined })}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">No location</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="managerId">Manager</Label>
        <select
          id="managerId"
          {...register("managerId", { setValueAs: (v) => v || undefined })}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">No manager</option>
          {managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.fullName}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <input id="startOnboarding" type="checkbox" defaultChecked {...register("startOnboarding")} />
        <Label htmlFor="startOnboarding">Start onboarding workflow</Label>
      </div>

      {submitError && <p className="text-sm text-red-600">{submitError}</p>}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating..." : "Create employee"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test components/employees/employee-form.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Create `app/(app)/employees/new/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { canCreateEmployee } from "@/lib/domain/permissions";
import { listDepartments } from "@/lib/domain/departments";
import { listLocations } from "@/lib/domain/locations";
import { BackLink } from "@/components/back-link";
import { EmployeeForm } from "@/components/employees/employee-form";

export default async function NewEmployeePage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }
  if (!canCreateEmployee(profile)) {
    notFound();
  }

  const [departments, locations] = await Promise.all([
    listDepartments(profile.companyId),
    listLocations(profile.companyId),
  ]);

  return (
    <div>
      <BackLink href="/employees" />
      <h1 className="text-2xl font-semibold mb-4 mt-2">New employee</h1>
      <EmployeeForm departments={departments} locations={locations} />
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add components/employees/employee-form.tsx components/employees/employee-form.test.tsx "app/(app)/employees/new/page.tsx"
git commit -m "feat: add employee creation form and page"
```

---

## Task 26: Employee directory — `EmployeeListView` and `/employees`

**Files:**
- Create: `components/employees/employee-list-view.tsx`, `components/employees/employee-list-view.test.tsx`, `app/(app)/employees/page.tsx`

**Interfaces:**
- Consumes: `GET /api/employees` (Task 19); `useBroadcastListener` (`@/lib/realtime/use-broadcast-listener`).
- Produces: `EmployeeListView` component — table (name, position, department, status) with status filter, "+ New Employee" shown only when `canCreate` is true. Follows `components/tasks/task-list-view.tsx` exactly.

- [ ] **Step 1: Write the failing test**

Create `components/employees/employee-list-view.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => ({ on: () => ({ subscribe: vi.fn() }) }),
    removeChannel: vi.fn(),
  }),
}));

import { EmployeeListView } from "@/components/employees/employee-list-view";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        employees: [
          { id: "employee-1", fullName: "Ada Lovelace", positionTitle: "Engineer", departmentId: null, status: "active" },
        ],
      }),
    })
  );
});

describe("EmployeeListView", () => {
  it("renders the fetched employees", async () => {
    render(<EmployeeListView companyId="company-1" canCreate={false} />);
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /new employee/i })).not.toBeInTheDocument();
  });

  it("shows the new employee link when canCreate is true", async () => {
    render(<EmployeeListView companyId="company-1" canCreate={true} />);
    await waitFor(() => screen.getByRole("link", { name: /new employee/i }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test components/employees/employee-list-view.test.tsx`
Expected: FAIL — `@/components/employees/employee-list-view` cannot be found.

- [ ] **Step 3: Implement `components/employees/employee-list-view.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBroadcastListener } from "@/lib/realtime/use-broadcast-listener";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface EmployeeListItem {
  id: string;
  fullName: string;
  positionTitle: string | null;
  departmentId: string | null;
  status: "active" | "inactive";
}

const STATUS_OPTIONS = ["active", "inactive"];

export function EmployeeListView({
  companyId,
  canCreate,
}: {
  companyId: string;
  canCreate: boolean;
}) {
  const [status, setStatus] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["employees", { status }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      const response = await fetch(`/api/employees?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load employees");
      const body = await response.json();
      return body.employees as EmployeeListItem[];
    },
  });

  useBroadcastListener(`company:${companyId}:employees`, () => {
    queryClient.invalidateQueries({ queryKey: ["employees"] });
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </option>
          ))}
        </select>
        {canCreate && (
          <Button render={<Link href="/employees/new" />} nativeButton={false}>
            New employee
          </Button>
        )}
      </div>

      {isLoading && <p className="text-muted-foreground">Loading employees...</p>}
      {error && <p className="text-red-600">Failed to load employees.</p>}

      {data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((employee) => (
              <TableRow key={employee.id}>
                <TableCell>
                  <Link href={`/employees/${employee.id}`} className="hover:underline">
                    {employee.fullName}
                  </Link>
                </TableCell>
                <TableCell>{employee.positionTitle ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline">{employee.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No employees found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test components/employees/employee-list-view.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Create `app/(app)/employees/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { canCreateEmployee } from "@/lib/domain/permissions";
import { BackLink } from "@/components/back-link";
import { EmployeeListView } from "@/components/employees/employee-list-view";

export default async function EmployeesPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  return (
    <div>
      <BackLink href="/dashboard" />
      <h1 className="text-2xl font-semibold mb-4 mt-2">Employees</h1>
      <EmployeeListView companyId={profile.companyId} canCreate={canCreateEmployee(profile)} />
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add components/employees/employee-list-view.tsx components/employees/employee-list-view.test.tsx "app/(app)/employees/page.tsx"
git commit -m "feat: add employee directory page"
```

---

## Task 27: Employee detail page

**Files:**
- Create: `app/(app)/employees/[id]/page.tsx`

**Interfaces:**
- Consumes: `getEmployeeProfile` (`@/lib/domain/employees`, Task 14).
- Produces: `/employees/[id]` page — no dedicated test file, matching this codebase's convention that server-component detail pages (`app/(app)/tasks/[id]/page.tsx`, `app/(app)/workflows/[id]/page.tsx`) aren't unit tested; only the client components they render are.

- [ ] **Step 1: Create `app/(app)/employees/[id]/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { getEmployeeProfile } from "@/lib/domain/employees";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import { BackLink } from "@/components/back-link";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const { id } = await params;

  let result;
  try {
    result = await getEmployeeProfile(profile, id);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      notFound();
    }
    throw error;
  }

  const { profile: employee, counts, activity } = result;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <BackLink href="/employees" />

      <div>
        <h1 className="text-2xl font-semibold">{employee.fullName}</h1>
        <p className="text-muted-foreground">
          {employee.positionTitle ?? "No position set"}
          {" · "}
          {employee.status}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-md border p-4">
          <p className="text-sm text-muted-foreground">Open tasks</p>
          <p className="text-2xl font-semibold">{counts.openTasks}</p>
        </div>
        <div className="rounded-md border p-4">
          <p className="text-sm text-muted-foreground">Requests</p>
          <p className="text-2xl font-semibold">{counts.requests}</p>
        </div>
        <div className="rounded-md border p-4">
          <p className="text-sm text-muted-foreground">Active workflows</p>
          <p className="text-2xl font-semibold">{counts.activeWorkflows}</p>
        </div>
        <div className="rounded-md border p-4">
          <p className="text-sm text-muted-foreground">Assets</p>
          <p className="text-2xl font-semibold">{counts.assets}</p>
        </div>
      </div>

      <section>
        <h2 className="text-lg font-medium mb-2">Activity</h2>
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {activity.map((entry) => (
            <li key={entry.id}>{entry.message}</li>
          ))}
          {activity.length === 0 && <li>No activity yet.</li>}
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(app)/employees/[id]/page.tsx"
git commit -m "feat: add employee detail page"
```

---

## Task 28: Asset creation — `AssetForm` and `/assets/new`

**Files:**
- Create: `components/assets/asset-form.tsx`, `components/assets/asset-form.test.tsx`, `app/(app)/assets/new/page.tsx`

**Interfaces:**
- Consumes: `createAssetSchema`, `CreateAssetInput` (`@/lib/validation/assets`); `Department` (`@/lib/domain/departments`); `Location` (`@/lib/domain/locations`); `canCreateAsset` (`@/lib/domain/permissions`).
- Produces: `AssetForm` component; `/assets/new` page, guarded by `canCreateAsset`. `purchaseInfo`/`warrantyInfo` (free-form `jsonb`) are intentionally left out of this form — no UI need for them yet, and `createAssetSchema` already makes them optional, so `assets.ts`'s `createAsset` still works unchanged when they're absent.

- [ ] **Step 1: Write the failing test**

Create `components/assets/asset-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { AssetForm } from "@/components/assets/asset-form";

beforeEach(() => {
  pushMock.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ asset: { id: "asset-1" } }),
    })
  );
});

describe("AssetForm", () => {
  it("shows a validation error when submitted empty", async () => {
    render(<AssetForm departments={[]} locations={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /create asset/i }));

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
  });

  it("creates an asset and redirects to its detail page", async () => {
    render(<AssetForm departments={[]} locations={[]} />);

    await userEvent.type(screen.getByLabelText(/name/i), "MacBook Pro 14");
    await userEvent.type(screen.getByLabelText(/category/i), "laptop");
    await userEvent.click(screen.getByRole("button", { name: /create asset/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/assets/asset-1"));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test components/assets/asset-form.test.tsx`
Expected: FAIL — `@/components/assets/asset-form` cannot be found.

- [ ] **Step 3: Implement `components/assets/asset-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createAssetSchema, type CreateAssetInput } from "@/lib/validation/assets";
import type { Department } from "@/lib/domain/departments";
import type { Location } from "@/lib/domain/locations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AssetForm({
  departments,
  locations,
}: {
  departments: Department[];
  locations: Location[];
}) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateAssetInput>({ resolver: zodResolver(createAssetSchema) });

  async function onSubmit(values: CreateAssetInput) {
    setSubmitError(null);
    const response = await fetch("/api/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      const body = await response.json();
      setSubmitError(typeof body.error === "string" ? body.error : "Failed to create asset");
      return;
    }

    const { asset } = await response.json();
    router.push(`/assets/${asset.id}`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 max-w-lg">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...register("name")} />
        {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category">Category</Label>
        <Input id="category" {...register("category")} placeholder="laptop, monitor, vehicle, ..." />
        {errors.category && <p className="text-sm text-red-600">{errors.category.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="departmentId">Department</Label>
        <select
          id="departmentId"
          {...register("departmentId", { setValueAs: (v) => v || undefined })}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">No department</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="locationId">Location</Label>
        <select
          id="locationId"
          {...register("locationId", { setValueAs: (v) => v || undefined })}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">No location</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </div>

      {submitError && <p className="text-sm text-red-600">{submitError}</p>}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating..." : "Create asset"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test components/assets/asset-form.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Create `app/(app)/assets/new/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { canCreateAsset } from "@/lib/domain/permissions";
import { listDepartments } from "@/lib/domain/departments";
import { listLocations } from "@/lib/domain/locations";
import { BackLink } from "@/components/back-link";
import { AssetForm } from "@/components/assets/asset-form";

export default async function NewAssetPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }
  if (!canCreateAsset(profile)) {
    notFound();
  }

  const [departments, locations] = await Promise.all([
    listDepartments(profile.companyId),
    listLocations(profile.companyId),
  ]);

  return (
    <div>
      <BackLink href="/assets" />
      <h1 className="text-2xl font-semibold mb-4 mt-2">New asset</h1>
      <AssetForm departments={departments} locations={locations} />
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add components/assets/asset-form.tsx components/assets/asset-form.test.tsx "app/(app)/assets/new/page.tsx"
git commit -m "feat: add asset creation form and page"
```

---

## Task 29: Asset list — `AssetListView` and `/assets`

**Files:**
- Create: `components/assets/asset-list-view.tsx`, `components/assets/asset-list-view.test.tsx`, `app/(app)/assets/page.tsx`

**Interfaces:**
- Consumes: `GET /api/assets` (Task 21); `useBroadcastListener`.
- Produces: `AssetListView` — table (asset code, name, category, status, assigned-to), status filter, "+ New Asset" shown only when `canCreate` is true. Follows `components/tasks/task-list-view.tsx` exactly.

- [ ] **Step 1: Write the failing test**

Create `components/assets/asset-list-view.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => ({ on: () => ({ subscribe: vi.fn() }) }),
    removeChannel: vi.fn(),
  }),
}));

import { AssetListView } from "@/components/assets/asset-list-view";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        assets: [
          { id: "asset-1", assetCode: "AST-00001", name: "MacBook Pro", category: "laptop", status: "available", assignedTo: null },
        ],
      }),
    })
  );
});

describe("AssetListView", () => {
  it("renders the fetched assets", async () => {
    render(<AssetListView companyId="company-1" canCreate={false} />);
    expect(await screen.findByText("AST-00001")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /new asset/i })).not.toBeInTheDocument();
  });

  it("shows the new asset link when canCreate is true", async () => {
    render(<AssetListView companyId="company-1" canCreate={true} />);
    await waitFor(() => screen.getByRole("link", { name: /new asset/i }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test components/assets/asset-list-view.test.tsx`
Expected: FAIL — `@/components/assets/asset-list-view` cannot be found.

- [ ] **Step 3: Implement `components/assets/asset-list-view.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBroadcastListener } from "@/lib/realtime/use-broadcast-listener";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AssetListItem {
  id: string;
  assetCode: string;
  name: string;
  category: string;
  status: string;
  assignedTo: string | null;
}

const STATUS_OPTIONS = ["available", "assigned", "maintenance", "retired", "lost"];

export function AssetListView({
  companyId,
  canCreate,
}: {
  companyId: string;
  canCreate: boolean;
}) {
  const [status, setStatus] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["assets", { status }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      const response = await fetch(`/api/assets?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load assets");
      const body = await response.json();
      return body.assets as AssetListItem[];
    },
  });

  useBroadcastListener(`company:${companyId}:assets`, () => {
    queryClient.invalidateQueries({ queryKey: ["assets"] });
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </option>
          ))}
        </select>
        {canCreate && (
          <Button render={<Link href="/assets/new" />} nativeButton={false}>
            New asset
          </Button>
        )}
      </div>

      {isLoading && <p className="text-muted-foreground">Loading assets...</p>}
      {error && <p className="text-red-600">Failed to load assets.</p>}

      {data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((asset) => (
              <TableRow key={asset.id}>
                <TableCell>
                  <Link href={`/assets/${asset.id}`} className="hover:underline">
                    {asset.assetCode}
                  </Link>
                </TableCell>
                <TableCell>{asset.name}</TableCell>
                <TableCell>{asset.category}</TableCell>
                <TableCell>
                  <Badge variant="outline">{asset.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No assets found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test components/assets/asset-list-view.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Create `app/(app)/assets/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { canCreateAsset } from "@/lib/domain/permissions";
import { BackLink } from "@/components/back-link";
import { AssetListView } from "@/components/assets/asset-list-view";

export default async function AssetsPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  return (
    <div>
      <BackLink href="/dashboard" />
      <h1 className="text-2xl font-semibold mb-4 mt-2">Assets</h1>
      <AssetListView companyId={profile.companyId} canCreate={canCreateAsset(profile)} />
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add components/assets/asset-list-view.tsx components/assets/asset-list-view.test.tsx "app/(app)/assets/page.tsx"
git commit -m "feat: add asset list page"
```

---

## Task 30: Asset detail page — assign and change-status controls

**Files:**
- Create: `components/assets/asset-assign-control.tsx`, `components/assets/asset-assign-control.test.tsx`, `components/assets/asset-status-control.tsx`, `components/assets/asset-status-control.test.tsx`, `app/(app)/assets/[id]/page.tsx`

**Interfaces:**
- Consumes: `PATCH /api/assets/[id]` (Task 22); the existing `GET /api/employees` (Task 19, for the assign picker — reuses the directory endpoint rather than a new one); `getAsset` (`@/lib/domain/assets`); `canAssignAsset`, `canChangeAssetStatus` (`@/lib/domain/permissions`).
- Produces: `AssetAssignControl`, `AssetStatusControl` components; `/assets/[id]` page.

- [ ] **Step 1: Write the failing tests**

Create `components/assets/asset-assign-control.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { AssetAssignControl } from "@/components/assets/asset-assign-control";

beforeEach(() => {
  refreshMock.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (url.startsWith("/api/employees")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ employees: [{ id: "employee-1", fullName: "Ada Lovelace" }] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    })
  );
});

describe("AssetAssignControl", () => {
  it("assigns the selected employee and refreshes", async () => {
    render(<AssetAssignControl assetId="asset-1" />);

    const select = await screen.findByLabelText(/assign to/i);
    await userEvent.selectOptions(select, "employee-1");
    await userEvent.click(screen.getByRole("button", { name: /^assign$/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/assets/asset-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ action: "assign", targetEmployeeId: "employee-1" }),
      })
    );
  });
});
```

Create `components/assets/asset-status-control.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { AssetStatusControl } from "@/components/assets/asset-status-control";

beforeEach(() => {
  refreshMock.mockReset();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});

describe("AssetStatusControl", () => {
  it("offers every status except the current one", () => {
    render(<AssetStatusControl assetId="asset-1" currentStatus="available" />);
    expect(screen.getByRole("button", { name: /move to assigned/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /move to maintenance/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /move to available/i })).not.toBeInTheDocument();
  });

  it("submits the chosen status and refreshes", async () => {
    render(<AssetStatusControl assetId="asset-1" currentStatus="available" />);

    await userEvent.click(screen.getByRole("button", { name: /move to maintenance/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/assets/asset-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ action: "changeStatus", status: "maintenance" }),
      })
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test components/assets/asset-assign-control.test.tsx components/assets/asset-status-control.test.tsx`
Expected: FAIL — neither component exists.

- [ ] **Step 3: Implement `components/assets/asset-assign-control.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface EmployeeOption {
  id: string;
  fullName: string;
}

export function AssetAssignControl({ assetId }: { assetId: string }) {
  const router = useRouter();
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/employees").then(async (response) => {
      if (cancelled || !response.ok) return;
      const body = await response.json();
      setEmployees(body.employees);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function assign() {
    if (!selectedId) return;
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/assets/${assetId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "assign", targetEmployeeId: selectedId }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to assign asset");
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="assign-to">Assign to</Label>
      <div className="flex gap-2">
        <select
          id="assign-to"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">Select an employee</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.fullName}
            </option>
          ))}
        </select>
        <Button variant="outline" disabled={isSubmitting || !selectedId} onClick={assign}>
          Assign
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Implement `components/assets/asset-status-control.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ASSET_STATUSES, type AssetStatus } from "@/lib/domain/asset-status";
import { Button } from "@/components/ui/button";

export function AssetStatusControl({
  assetId,
  currentStatus,
}: {
  assetId: string;
  currentStatus: AssetStatus;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function changeStatus(nextStatus: AssetStatus) {
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/assets/${assetId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "changeStatus", status: nextStatus }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to update status");
      return;
    }

    router.refresh();
  }

  const otherStatuses = ASSET_STATUSES.filter((status) => status !== currentStatus);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        Status: <span className="font-medium">{currentStatus}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {otherStatuses.map((nextStatus) => (
          <Button
            key={nextStatus}
            variant="outline"
            disabled={isSubmitting}
            onClick={() => changeStatus(nextStatus)}
          >
            Move to {nextStatus}
          </Button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test components/assets/asset-assign-control.test.tsx components/assets/asset-status-control.test.tsx`
Expected: PASS (1 + 2 tests).

- [ ] **Step 6: Create `app/(app)/assets/[id]/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { getAsset } from "@/lib/domain/assets";
import { listActivity } from "@/lib/domain/activity";
import { canAssignAsset, canChangeAssetStatus } from "@/lib/domain/permissions";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import { BackLink } from "@/components/back-link";
import { AssetAssignControl } from "@/components/assets/asset-assign-control";
import { AssetStatusControl } from "@/components/assets/asset-status-control";

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const { id } = await params;

  let asset;
  try {
    asset = await getAsset(profile, id);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      notFound();
    }
    throw error;
  }

  const activity = await listActivity("asset", asset.id);

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <BackLink href="/assets" />

      <div>
        <h1 className="text-2xl font-semibold">{asset.name}</h1>
        <p className="text-muted-foreground">
          {asset.assetCode} · {asset.category}
        </p>
      </div>

      {canAssignAsset(profile) && <AssetAssignControl assetId={asset.id} />}
      {canChangeAssetStatus(profile) && (
        <AssetStatusControl assetId={asset.id} currentStatus={asset.status} />
      )}

      <section>
        <h2 className="text-lg font-medium mb-2">Activity</h2>
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {activity.map((entry) => (
            <li key={entry.id}>{entry.message}</li>
          ))}
          {activity.length === 0 && <li>No activity yet.</li>}
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add components/assets/asset-assign-control.tsx components/assets/asset-assign-control.test.tsx \
  components/assets/asset-status-control.tsx components/assets/asset-status-control.test.tsx \
  "app/(app)/assets/[id]/page.tsx"
git commit -m "feat: add asset detail page with assign and status controls"
```

---

## Task 31: Asset detail — "Report an issue" quick action

**Files:**
- Create: `components/assets/asset-report-issue-form.tsx`, `components/assets/asset-report-issue-form.test.tsx`
- Modify: `app/(app)/assets/[id]/page.tsx`

**Interfaces:**
- Consumes: the existing `POST /api/tasks` (Phase 2, extended with `relatedAssetId` in Task 17).
- Produces: `AssetReportIssueForm` — creates a plain task linked to the asset via `related_asset_id`, giving `tasks.related_asset_id` (added in Task 3) its first real UI usage.

- [ ] **Step 1: Write the failing test**

Create `components/assets/asset-report-issue-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { AssetReportIssueForm } from "@/components/assets/asset-report-issue-form";

beforeEach(() => {
  refreshMock.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ task: { id: "task-1" } }) })
  );
});

describe("AssetReportIssueForm", () => {
  it("creates a task linked to the asset and refreshes", async () => {
    render(<AssetReportIssueForm assetId="asset-1" />);

    await userEvent.type(screen.getByLabelText(/describe the issue/i), "Screen is cracked");
    await userEvent.click(screen.getByRole("button", { name: /report issue/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/tasks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "Screen is cracked", relatedAssetId: "asset-1" }),
      })
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test components/assets/asset-report-issue-form.test.tsx`
Expected: FAIL — `@/components/assets/asset-report-issue-form` cannot be found.

- [ ] **Step 3: Implement `components/assets/asset-report-issue-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AssetReportIssueForm({ assetId }: { assetId: string }) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!description.trim()) return;
    setIsSubmitting(true);
    setError(null);
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: description, relatedAssetId: assetId }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to report issue");
      return;
    }

    setDescription("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="issue-description">Describe the issue</Label>
      <div className="flex gap-2">
        <Input
          id="issue-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <Button variant="outline" disabled={isSubmitting || !description.trim()} onClick={submit}>
          Report issue
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test components/assets/asset-report-issue-form.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Wire it into `app/(app)/assets/[id]/page.tsx`**

Add the import:

```tsx
import { AssetReportIssueForm } from "@/components/assets/asset-report-issue-form";
```

Add the component right after the `<AssetStatusControl>` block (still before the `<section>` for Activity):

```tsx
      <AssetReportIssueForm assetId={asset.id} />
```

- [ ] **Step 6: Commit**

```bash
git add components/assets/asset-report-issue-form.tsx components/assets/asset-report-issue-form.test.tsx "app/(app)/assets/[id]/page.tsx"
git commit -m "feat: add report-an-issue quick action to the asset detail page"
```

---

## Task 32: Task detail page — asset-assignment form for the Equipment workflow's final step

**Files:**
- Create: `components/tasks/task-asset-assignment-form.tsx`, `components/tasks/task-asset-assignment-form.test.tsx`
- Modify: `components/tasks/task-status-control.tsx`, `components/tasks/task-status-control.test.tsx`, `app/(app)/tasks/[id]/page.tsx`

**Interfaces:**
- Consumes: `POST /api/tasks/[id]/complete-with-asset` (Task 23); `findWorkflowStepByTaskId` (`@/lib/domain/workflows`, Task 9).
- Produces: `TaskAssetAssignmentForm` component; `TaskStatusControl` gains an optional `hideCompletedTransition?: boolean` prop (default `false`, so every existing caller is unaffected); the task detail page conditionally renders the new form.

**Why this needs a status-control change, not just a new form alongside it:** a workflow-generated task starts `todo`, and `TASK_STATUS_TRANSITIONS.todo` only allows `in_progress`/`cancelled` — there's no direct `todo → completed` path (Global Constraints). So while the task is `todo`, the normal `TaskStatusControl` still needs to offer "Move to in_progress"/"Move to cancelled". Only once the task is `in_progress` — and its workflow step `creates_asset` — does the "Move to completed" button get replaced by the asset-assignment form; "Move to blocked"/"Move to cancelled" stay available from `TaskStatusControl` unchanged.

- [ ] **Step 1: Write the failing test for `TaskAssetAssignmentForm`**

Create `components/tasks/task-asset-assignment-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { TaskAssetAssignmentForm } from "@/components/tasks/task-asset-assignment-form";

beforeEach(() => {
  refreshMock.mockReset();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});

describe("TaskAssetAssignmentForm", () => {
  it("shows a validation error when submitted empty", async () => {
    render(<TaskAssetAssignmentForm taskId="task-1" />);
    await userEvent.click(screen.getByRole("button", { name: /assign asset & complete/i }));

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
  });

  it("submits the asset details and refreshes", async () => {
    render(<TaskAssetAssignmentForm taskId="task-1" />);

    await userEvent.type(screen.getByLabelText(/name/i), "New Laptop");
    await userEvent.type(screen.getByLabelText(/category/i), "laptop");
    await userEvent.click(screen.getByRole("button", { name: /assign asset & complete/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/tasks/task-1/complete-with-asset",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "New Laptop", category: "laptop" }),
      })
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test components/tasks/task-asset-assignment-form.test.tsx`
Expected: FAIL — `@/components/tasks/task-asset-assignment-form` cannot be found.

- [ ] **Step 3: Implement `components/tasks/task-asset-assignment-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createAssetSchema, type CreateAssetInput } from "@/lib/validation/assets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TaskAssetAssignmentForm({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateAssetInput>({ resolver: zodResolver(createAssetSchema) });

  async function onSubmit(values: CreateAssetInput) {
    setSubmitError(null);
    const response = await fetch(`/api/tasks/${taskId}/complete-with-asset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: values.name, category: values.category }),
    });

    if (!response.ok) {
      const body = await response.json();
      setSubmitError(typeof body.error === "string" ? body.error : "Failed to complete task");
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3 rounded-md border p-4">
      <p className="text-sm font-medium">Assign the asset to complete this step</p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="asset-name">Name</Label>
        <Input id="asset-name" {...register("name")} />
        {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="asset-category">Category</Label>
        <Input id="asset-category" {...register("category")} placeholder="laptop, monitor, ..." />
        {errors.category && <p className="text-sm text-red-600">{errors.category.message}</p>}
      </div>

      {submitError && <p className="text-sm text-red-600">{submitError}</p>}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Assigning..." : "Assign Asset & Complete"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test components/tasks/task-asset-assignment-form.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing test for `TaskStatusControl`'s new prop**

Add to `components/tasks/task-status-control.test.tsx`, inside the `describe("TaskStatusControl", ...)` block:

```tsx
  it("hides the completed transition when hideCompletedTransition is true", () => {
    render(
      <TaskStatusControl taskId="task-1" currentStatus="in_progress" hideCompletedTransition />
    );

    expect(screen.queryByRole("button", { name: /move to completed/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /move to blocked/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /move to cancelled/i })).toBeInTheDocument();
  });
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm test components/tasks/task-status-control.test.tsx`
Expected: FAIL — TypeScript error, `hideCompletedTransition` isn't a valid prop yet.

- [ ] **Step 7: Add the prop to `components/tasks/task-status-control.tsx`**

Change:

```tsx
export function TaskStatusControl({
  taskId,
  currentStatus,
}: {
  taskId: string;
  currentStatus: TaskStatus;
}) {
```

to:

```tsx
export function TaskStatusControl({
  taskId,
  currentStatus,
  hideCompletedTransition = false,
}: {
  taskId: string;
  currentStatus: TaskStatus;
  hideCompletedTransition?: boolean;
}) {
```

Change:

```tsx
  const nextStatuses = getValidNextStatuses(currentStatus);
```

to:

```tsx
  const nextStatuses = getValidNextStatuses(currentStatus).filter(
    (status) => !(hideCompletedTransition && status === "completed")
  );
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm test components/tasks/task-status-control.test.tsx`
Expected: PASS (4 tests — 3 existing plus 1 new).

- [ ] **Step 9: Wire both into `app/(app)/tasks/[id]/page.tsx`**

Change the imports from:

```tsx
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { getTask } from "@/lib/domain/tasks";
import { listComments } from "@/lib/domain/comments";
import { listActivity } from "@/lib/domain/activity";
import { createSignedDownloadUrl, listAttachments } from "@/lib/domain/attachments";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import { BackLink } from "@/components/back-link";
import { TaskRealtimeRefresh } from "@/components/tasks/task-realtime-refresh";
import { TaskStatusControl } from "@/components/tasks/task-status-control";
import { TaskComments } from "@/components/tasks/task-comments";
import { TaskAttachments } from "@/components/tasks/task-attachments";
```

to:

```tsx
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { getTask } from "@/lib/domain/tasks";
import { listComments } from "@/lib/domain/comments";
import { listActivity } from "@/lib/domain/activity";
import { createSignedDownloadUrl, listAttachments } from "@/lib/domain/attachments";
import { findWorkflowStepByTaskId } from "@/lib/domain/workflows";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import { BackLink } from "@/components/back-link";
import { TaskRealtimeRefresh } from "@/components/tasks/task-realtime-refresh";
import { TaskStatusControl } from "@/components/tasks/task-status-control";
import { TaskAssetAssignmentForm } from "@/components/tasks/task-asset-assignment-form";
import { TaskComments } from "@/components/tasks/task-comments";
import { TaskAttachments } from "@/components/tasks/task-attachments";
```

Change the body from (right after the `attachmentsWithUrls` block, before the `return`):

```tsx
  const attachmentsWithUrls = await Promise.all(
    attachments.map(async (attachment) => ({
      ...attachment,
      downloadUrl: await createSignedDownloadUrl(attachment.storagePath),
    }))
  );

  return (
```

to:

```tsx
  const attachmentsWithUrls = await Promise.all(
    attachments.map(async (attachment) => ({
      ...attachment,
      downloadUrl: await createSignedDownloadUrl(attachment.storagePath),
    }))
  );

  const workflowStep = task.relatedWorkflowInstanceId
    ? await findWorkflowStepByTaskId(task.id)
    : null;
  const showAssetForm = Boolean(workflowStep?.createsAsset) && task.status !== "completed";

  return (
```

Change:

```tsx
      <TaskStatusControl taskId={task.id} currentStatus={task.status} />
```

to:

```tsx
      <TaskStatusControl
        taskId={task.id}
        currentStatus={task.status}
        hideCompletedTransition={showAssetForm}
      />
      {showAssetForm && <TaskAssetAssignmentForm taskId={task.id} />}
```

- [ ] **Step 10: Run the full test suite and build to verify nothing broke**

Run: `pnpm test`
Expected: PASS across the whole suite.

Run: `pnpm build`
Expected: no type errors.

- [ ] **Step 11: Commit**

```bash
git add components/tasks/task-asset-assignment-form.tsx components/tasks/task-asset-assignment-form.test.tsx \
  components/tasks/task-status-control.tsx components/tasks/task-status-control.test.tsx \
  "app/(app)/tasks/[id]/page.tsx"
git commit -m "feat: wire the asset-assignment form into the task detail page"
```

---

## Task 33: Full verification and status board update

**Files:**
- Modify: `docs/STATUS.md`

**Interfaces:** none — this task only verifies and documents.

- [ ] **Step 1: Run the full unit suite**

Run: `pnpm test:unit`
Expected: PASS, zero failures.

- [ ] **Step 2: Run the full integration suite**

Run: `pnpm test:integration`
Expected: PASS, zero failures. (Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`; if it's absent every integration `describe` block is skipped rather than failing — confirm the skip count matches the number of integration test files, not a silent all-skip from a missing env var you expected to be set.)

- [ ] **Step 3: Run the production build**

Run: `pnpm build`
Expected: build completes with no type errors and no route errors.

- [ ] **Step 4: Run the seed script against the live project**

Run: `pnpm seed`
Expected: completes without error — confirms `seedWorkflowTemplates`'s `creates_asset` column addition (Task 18) doesn't break the existing seed flow.

- [ ] **Step 5: Update `docs/STATUS.md`**

Move the Phase 5 entry from **Backlog** to **In Progress** (this plan is about to execute; a later, separate step — outside this plan, part of `finishing-a-development-branch` — moves it to **Review** and then **Finished** once merged, matching how Phases 3 and 4 were tracked).

Change:

```markdown
## Backlog

Not started yet. See `docs/superpowers/plans/2026-08-26-remaining-phases-outline.md` for the full breakdown of each.

- **Phase 5 — Employees & Assets**: operational employee profiles, asset registry.
```

to:

```markdown
## Backlog

Not started yet. See `docs/superpowers/plans/2026-08-26-remaining-phases-outline.md` for the full breakdown of each.
```

Change:

```markdown
## In Progress

_(nothing right now)_
```

to:

```markdown
## In Progress

- **Phase 5 — Employees & Assets**: operational employee profiles, asset registry; completing the Equipment workflow's final task now creates and assigns a real asset; HR/admin can invite a new employee, which starts the Employee Onboarding workflow. Spec: `docs/superpowers/specs/2026-09-03-phase5-employees-assets-design.md`. Plan: `docs/superpowers/plans/2026-09-03-phase5-employees-assets.md`.
```

- [ ] **Step 6: Commit**

```bash
git add docs/STATUS.md
git commit -m "docs: move phase 5 to in progress on the status board"
```

---

## Final Step: Request Code Review

After all tasks are complete and all tests pass, use the **superpowers:requesting-code-review** skill to get a full review of the branch before merging, then **superpowers:finishing-a-development-branch** to merge it into `main` (per this repo's `CLAUDE.md` — no direct commits to `main` for implementation work, and the branch only merges after a clean review cycle).
