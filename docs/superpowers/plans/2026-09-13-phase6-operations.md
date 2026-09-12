# Phase 6 — Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The higher-level grouping object that ties tasks/requests/assets/employees together for larger initiatives (`idea.md` §14). Creating an operation links entities that already exist; it never spawns new ones.

**Architecture:** A new `lib/domain/operations.ts` module follows the exact Phase 2–5 conventions (`snake_case` rows mapped to `camelCase` domain objects via a private `toX`/`X_COLUMNS` pair, service-role Supabase client, `ForbiddenError`/`NotFoundError`). Linking is a direct nullable `related_operation_id` FK added to `tasks`/`requests`/`assets`/`profiles` — no join tables — so each of those four domain files gains one small exported setter (`setTaskOperation`, etc.) that `operations.ts` calls after loading and company-checking the target entity via each file's existing `loadXOrThrow`/`getProfileById`. Linking is bidirectional in the UI: a generic `OperationLinkPicker` component (parameterized by entity type) lives on the operation detail page for all four entity types, and each of the four entity detail pages gets its own small, near-identical `XOperationControl` component.

**Tech Stack:** Everything from Foundation/Phase 2–5 — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-13-phase6-operations-design.md`

## Global Constraints

- REST API (Next.js Route Handlers) is the sole authorization boundary. RLS stays disabled on every table; the service-role key is used server-side only (`lib/domain/**`), never shipped to the browser.
- Hosted Supabase project, no local Docker/CLI dev stack. `project_id` = `yqzcunssgvffischmwle`. Schema changes (DDL) are applied with `mcp__claude_ai_Supabase__apply_migration` (`project_id`, `name`, `query`). Use `mcp__claude_ai_Supabase__list_migrations` and `mcp__claude_ai_Supabase__list_tables` to verify, and `mcp__claude_ai_Supabase__execute_sql` for verification queries.
- Verify after every migration: `select table_name, grantee from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated');` filtered to the changed table must return zero rows.
- **Migration filenames must match the version `apply_migration` actually assigns.** After calling `apply_migration`, call `list_migrations` and rename the local file to `<version-from-list_migrations>_<name>.sql` before committing.
- Regenerate `lib/supabase/database.types.ts` after both Phase 6 migrations land (Task 3), before any later task that types against `operations` or the new `related_operation_id` columns.
- Test/domain-object convention: DB rows are `snake_case`; domain objects are `camelCase` via a private `toX(row)` mapper and an `X_COLUMNS` column-list constant per file — follow `lib/domain/tasks.ts`/`lib/domain/requests.ts` exactly.
- Integration tests hitting the live Supabase project use `describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)`. **The one new integration test file (`lib/domain/operations.test.ts`) must be added to both the `--exclude` list in `test:unit` and the file list in `test:integration` in `package.json`, in the task that introduces it.** Modifications to already-listed integration files (`tasks.test.ts`, `requests.test.ts`, `assets.test.ts`, `profiles.test.ts`) need no `package.json` change.
- Component tests (`*.test.tsx`) run under `// @vitest-environment jsdom` via plain `vitest run` (`pnpm test`) — not part of `test:integration`, no `package.json` change needed. Route tests (`*.test.ts` under `app/api/`) fully mock the domain layer with `vi.mock` — also plain `vitest run`, not integration.
- **Ownership convention carried into this phase:** each domain file is the only place that runs Supabase queries against the table it owns. `operations.ts` never writes to `tasks`/`requests`/`assets`/`profiles` directly — it calls each file's exported `setTaskOperation`/`setRequestOperation`/`setAssetOperation`/`updateProfile`. To read those tables for `getOperation`'s detail composition, `operations.ts` reuses each file's exported `TASK_COLUMNS`/`toTask`, `REQUEST_COLUMNS`/`toRequest`, `ASSET_COLUMNS`/`toAsset`, `PROFILE_COLUMNS`/`toProfile` (all four gain an `export` keyword as part of this phase — they exist today but are private) rather than each file's `listX`, because `listX` applies that entity's own *visibility* scoping (e.g. `listTasks` hides tasks not assigned to the caller for non-elevated roles) — inappropriate here, since an operation's linked-items list is a curated view already gated once by `canViewOperation` at the operation level, not a second visibility filter.
- **Unlink must verify current linkage, not just null the FK.** `unlinkEntity(profile, operationId, entityType, entityId)` loads the target entity first and throws `NotFoundError` unless that entity's `relatedOperationId` currently equals `operationId` — otherwise a caller who can manage operation A could pass an `entityId` actually linked to unrelated operation B and silently unlink it from B via A's endpoint.
- Every task ends with a commit. Commit messages use the `feat:`/`fix:`/`chore:`/`test:`/`docs:` conventional prefix matching the task's nature.
- This plan runs inside its own git worktree/branch, not on `main`.
- Package manager: pnpm (v10.x). Node.js v22+. TypeScript strict mode throughout.
- **Sandbox note:** this environment's `vitest run` occasionally needs `--testTimeout=60000 --hookTimeout=60000` overrides on integration files (network latency to the hosted Supabase project can exceed the 10s default), and a prior run's `beforeAll`/`afterAll` timeout can leave orphaned `companies`/`workflow_templates` rows that collide with the next run's fixtures (`duplicate key value violates unique constraint`). If a fresh run fails only on setup with a duplicate-key error on a company slug this plan's own fixtures created, delete that company (cascades) and retry once before treating it as a real failure.

---

## Task 1: Migration — `operations` table

**Files:**
- Create: `supabase/migrations/<timestamp>_create_operations.sql`

**Interfaces:**
- Consumes: `companies`, `profiles`, `departments` (all Foundation).
- Produces: enums `operation_status` (`planning|in_progress|on_hold|completed|cancelled`), `operation_priority` (`low|medium|high|critical`); table `operations(id, company_id, title, description, owner_id, department_id, status, priority, start_date, target_date, created_at)`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/<YYYYMMDDHHMMSS>_create_operations.sql` (current UTC timestamp, later than the last existing migration) with:

```sql
create type operation_status as enum ('planning', 'in_progress', 'on_hold', 'completed', 'cancelled');
create type operation_priority as enum ('low', 'medium', 'high', 'critical');

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
```

- [ ] **Step 2: Apply the migration**

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id: "yqzcunssgvffischmwle"`, `name: "create_operations"`, `query` set to the exact SQL from Step 1.

- [ ] **Step 3: Verify**

`mcp__claude_ai_Supabase__execute_sql`:
```sql
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'operations'
order by ordinal_position;
```
Expected: 11 rows (`id`, `company_id`, `title`, `description`, `owner_id`, `department_id`, `status`, `priority`, `start_date`, `target_date`, `created_at`).

```sql
select table_name, grantee from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'operations' and grantee in ('anon','authenticated');
```
Expected: zero rows.

- [ ] **Step 4: Rename the local file**

`mcp__claude_ai_Supabase__list_migrations` → rename to `supabase/migrations/<version>_create_operations.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add operations table"
```

---

## Task 2: Migration — `related_operation_id` on tasks/requests/assets/profiles

**Files:**
- Create: `supabase/migrations/<timestamp>_add_related_operation_id.sql`

**Interfaces:**
- Consumes: `operations` (Task 1), `tasks`/`requests`/`assets`/`profiles` (Foundation/Phase 2/Phase 3/Phase 5).
- Produces: `tasks.related_operation_id`, `requests.related_operation_id`, `assets.related_operation_id`, `profiles.related_operation_id` — all nullable `uuid references operations(id) on delete set null`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/<YYYYMMDDHHMMSS>_add_related_operation_id.sql` (timestamp later than Task 1's) with:

```sql
alter table tasks add column related_operation_id uuid references operations(id) on delete set null;
alter table requests add column related_operation_id uuid references operations(id) on delete set null;
alter table assets add column related_operation_id uuid references operations(id) on delete set null;
alter table profiles add column related_operation_id uuid references operations(id) on delete set null;

create index tasks_related_operation_id_idx on tasks(related_operation_id);
create index requests_related_operation_id_idx on requests(related_operation_id);
create index assets_related_operation_id_idx on assets(related_operation_id);
create index profiles_related_operation_id_idx on profiles(related_operation_id);
```

- [ ] **Step 2: Apply the migration**

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id: "yqzcunssgvffischmwle"`, `name: "add_related_operation_id"`, `query` set to the exact SQL from Step 1.

- [ ] **Step 3: Verify**

`mcp__claude_ai_Supabase__execute_sql`:
```sql
select table_name, column_name from information_schema.columns
where table_schema = 'public' and column_name = 'related_operation_id'
order by table_name;
```
Expected: 4 rows (`assets`, `profiles`, `requests`, `tasks`).

- [ ] **Step 4: Rename the local file**

`mcp__claude_ai_Supabase__list_migrations` → rename to `supabase/migrations/<version>_add_related_operation_id.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add related_operation_id to tasks, requests, assets, and profiles"
```

---

## Task 3: Regenerate Supabase types

**Files:**
- Modify: `lib/supabase/database.types.ts`

**Interfaces:**
- Produces: `Database["public"]["Tables"]["operations"]`, and `tasks`/`requests`/`assets`/`profiles` each with `related_operation_id`, matching Tasks 1–2.

- [ ] **Step 1: Regenerate the database types**

Call `mcp__claude_ai_Supabase__generate_typescript_types` with `project_id: "yqzcunssgvffischmwle"`. Overwrite `lib/supabase/database.types.ts` with the tool's `types` field verbatim.

- [ ] **Step 2: Verify the project builds**

Run: `pnpm build`
Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/database.types.ts
git commit -m "chore: regenerate Supabase types for Phase 6 tables"
```

---

## Task 4: `lib/domain/operation-status.ts` and `lib/validation/operations.ts`

**Files:**
- Create: `lib/domain/operation-status.ts`, `lib/validation/operations.ts`, `lib/validation/operations.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `OperationStatus`, `OperationPriority` types + `OPERATION_STATUSES`, `OPERATION_PRIORITIES` arrays (`operation-status.ts`); `createOperationSchema`/`CreateOperationInput`, `updateOperationSchema`/`UpdateOperationInput`, `operationFiltersSchema`/`OperationFilters`, `linkActionSchema`/`LinkActionInput` (`validation/operations.ts`) — consumed by `lib/domain/operations.ts` (Tasks 10–12) and the `/api/operations*` routes (Tasks 13–15).

- [ ] **Step 1: Write the failing test**

Create `lib/validation/operations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createOperationSchema,
  linkActionSchema,
  updateOperationSchema,
} from "@/lib/validation/operations";

describe("createOperationSchema", () => {
  it("requires a title", () => {
    expect(createOperationSchema.safeParse({ title: "" }).success).toBe(false);
  });

  it("accepts the minimal valid shape", () => {
    expect(createOperationSchema.safeParse({ title: "Vienna Office Relocation" }).success).toBe(
      true
    );
  });

  it("accepts every optional field", () => {
    const result = createOperationSchema.safeParse({
      title: "Vienna Office Relocation",
      description: "Move to the new building",
      ownerId: "11111111-1111-4111-8111-111111111111",
      departmentId: "22222222-2222-4222-8222-222222222222",
      priority: "high",
      startDate: "2026-10-01",
      targetDate: "2026-12-01",
    });
    expect(result.success).toBe(true);
  });
});

describe("updateOperationSchema", () => {
  it("rejects an invalid status", () => {
    expect(updateOperationSchema.safeParse({ status: "archived" }).success).toBe(false);
  });

  it("accepts a partial update", () => {
    expect(updateOperationSchema.safeParse({ status: "on_hold" }).success).toBe(true);
  });

  it("accepts nulling out a nullable field", () => {
    expect(updateOperationSchema.safeParse({ departmentId: null }).success).toBe(true);
  });
});

describe("linkActionSchema", () => {
  it("accepts a link action", () => {
    const result = linkActionSchema.safeParse({
      action: "link",
      entityType: "task",
      entityId: "11111111-1111-4111-8111-111111111111",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an unlink action", () => {
    const result = linkActionSchema.safeParse({
      action: "unlink",
      entityType: "employee",
      entityId: "11111111-1111-4111-8111-111111111111",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown entity type", () => {
    const result = linkActionSchema.safeParse({
      action: "link",
      entityType: "invoice",
      entityId: "11111111-1111-4111-8111-111111111111",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test lib/validation/operations.test.ts`
Expected: FAIL — `@/lib/validation/operations` cannot be found.

- [ ] **Step 3: Implement `lib/domain/operation-status.ts`**

```ts
export type OperationStatus = "planning" | "in_progress" | "on_hold" | "completed" | "cancelled";
export type OperationPriority = "low" | "medium" | "high" | "critical";

export const OPERATION_STATUSES: OperationStatus[] = [
  "planning",
  "in_progress",
  "on_hold",
  "completed",
  "cancelled",
];

export const OPERATION_PRIORITIES: OperationPriority[] = ["low", "medium", "high", "critical"];
```

- [ ] **Step 4: Implement `lib/validation/operations.ts`**

```ts
import { z } from "zod";
import {
  OPERATION_PRIORITIES,
  OPERATION_STATUSES,
  type OperationPriority,
  type OperationStatus,
} from "@/lib/domain/operation-status";

export const operationStatusSchema = z.enum(
  OPERATION_STATUSES as [OperationStatus, ...OperationStatus[]]
);
export const operationPrioritySchema = z.enum(
  OPERATION_PRIORITIES as [OperationPriority, ...OperationPriority[]]
);

export const createOperationSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(5000).optional(),
  ownerId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  priority: operationPrioritySchema.optional(),
  startDate: z.string().date().optional(),
  targetDate: z.string().date().optional(),
});
export type CreateOperationInput = z.infer<typeof createOperationSchema>;

export const updateOperationSchema = z.object({
  title: z.string().min(1, "Title is required").max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  ownerId: z.string().uuid().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  status: operationStatusSchema.optional(),
  priority: operationPrioritySchema.optional(),
  startDate: z.string().date().nullable().optional(),
  targetDate: z.string().date().nullable().optional(),
});
export type UpdateOperationInput = z.infer<typeof updateOperationSchema>;

export const operationFiltersSchema = z.object({
  status: operationStatusSchema.optional(),
  departmentId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
});
export type OperationFilters = z.infer<typeof operationFiltersSchema>;

const linkableEntityTypeSchema = z.enum(["task", "request", "asset", "employee"]);

export const linkActionSchema = z.union([
  z.object({
    action: z.literal("link"),
    entityType: linkableEntityTypeSchema,
    entityId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("unlink"),
    entityType: linkableEntityTypeSchema,
    entityId: z.string().uuid(),
  }),
]);
export type LinkActionInput = z.infer<typeof linkActionSchema>;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test lib/validation/operations.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/domain/operation-status.ts lib/validation/operations.ts lib/validation/operations.test.ts
git commit -m "feat: add operation status/priority types and validation schemas"
```

---

## Task 5: `permissions.ts` — operation permissions

**Files:**
- Modify: `lib/domain/permissions.ts`, `lib/domain/permissions.test.ts`

**Interfaces:**
- Consumes: `Profile` (existing), `ELEVATED_ROLES` (existing private constant in this file).
- Produces: `OperationLike`, `canCreateOperation(profile)`, `canManageOperation(profile, operation)`, `canViewOperation(profile, operation)`, `canCommentOnOperation` (alias of `canViewOperation`) — consumed by `lib/domain/operations.ts` (Tasks 10–12) and the `/api/operations*` routes/pages (Tasks 13–16, 21–25).

- [ ] **Step 1: Write the failing test**

Add to the end of `lib/domain/permissions.test.ts`:

```ts
describe("canCreateOperation / canManageOperation / canViewOperation", () => {
  it("allows operations_manager and admin to create, denies everyone else", () => {
    expect(canCreateOperation(makeProfile({ role: "operations_manager" }))).toBe(true);
    expect(canCreateOperation(makeProfile({ role: "admin" }))).toBe(true);
    expect(canCreateOperation(makeProfile({ role: "hr" }))).toBe(false);
    expect(canCreateOperation(makeProfile({ role: "employee" }))).toBe(false);
  });

  it("canManageOperation checks company scope before role", () => {
    const operation = { companyId: "company-1" };
    expect(canManageOperation(makeProfile({ role: "admin" }), operation)).toBe(true);
    expect(
      canManageOperation(makeProfile({ role: "admin", companyId: "other-company" }), operation)
    ).toBe(false);
    expect(canManageOperation(makeProfile({ role: "employee" }), operation)).toBe(false);
  });

  it("canViewOperation allows anyone in the same company", () => {
    const operation = { companyId: "company-1" };
    expect(canViewOperation(makeProfile({ role: "employee" }), operation)).toBe(true);
    expect(
      canViewOperation(makeProfile({ role: "employee", companyId: "other-company" }), operation)
    ).toBe(false);
  });
});
```

Add the three new names to the existing `import { ... } from "@/lib/domain/permissions"` block at the top of the file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test lib/domain/permissions.test.ts`
Expected: FAIL — `canCreateOperation` etc. are not exported.

- [ ] **Step 3: Implement the permissions**

Append to `lib/domain/permissions.ts` (reuses the file's existing private `ELEVATED_ROLES` constant, already defined near the top as `const ELEVATED_ROLES = new Set(["operations_manager", "admin"]);`):

```ts
export interface OperationLike {
  companyId: string;
}

export function canCreateOperation(profile: Profile): boolean {
  return ELEVATED_ROLES.has(profile.role);
}

export function canManageOperation(profile: Profile, operation: OperationLike): boolean {
  if (profile.companyId !== operation.companyId) return false;
  return ELEVATED_ROLES.has(profile.role);
}

export function canViewOperation(profile: Profile, operation: OperationLike): boolean {
  return profile.companyId === operation.companyId;
}

export const canCommentOnOperation = canViewOperation;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test lib/domain/permissions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/permissions.ts lib/domain/permissions.test.ts
git commit -m "feat: add operation permissions"
```

---

## Task 6: `tasks.ts` — `relatedOperationId` and `setTaskOperation`

**Files:**
- Modify: `lib/domain/tasks.ts`, `lib/domain/tasks.test.ts`

**Interfaces:**
- Consumes: everything already in `tasks.ts`.
- Produces: `Task.relatedOperationId: string | null`; `export`ed `TASK_COLUMNS` and `toTask` (currently private); `setTaskOperation(taskId, operationId): Promise<Task>` — all consumed by `lib/domain/operations.ts` (Tasks 10–12).

- [ ] **Step 1: Write the failing test**

Add to `lib/domain/tasks.test.ts` (inside the existing top-level `describe.skipIf(...)("tasks", () => { ... })` block that already has `companyId`/a created task fixture available — add as a new `it` alongside the others, not a new `describe`):

```ts
  it("sets and clears a task's related operation", async () => {
    const task = await createTask(profile, { title: "Linkable task" });
    expect(task.relatedOperationId).toBeNull();

    const linked = await setTaskOperation(task.id, "11111111-1111-4111-8111-111111111111");
    expect(linked.relatedOperationId).toBe("11111111-1111-4111-8111-111111111111");

    const unlinked = await setTaskOperation(task.id, null);
    expect(unlinked.relatedOperationId).toBeNull();
  });
```

Add `setTaskOperation` to the existing `import { ... } from "@/lib/domain/tasks"` block at the top of the test file. (This test doesn't create a real `operations` row — the FK is nullable and the test only exercises `tasks.ts`'s own write path, not referential integrity, so any well-formed UUID works here without needing an `operations` fixture.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration lib/domain/tasks.test.ts`
Expected: FAIL — `setTaskOperation` is not exported; `relatedOperationId` is `undefined` on the returned task.

- [ ] **Step 3: Extend `lib/domain/tasks.ts`**

Change the `Task` interface, `TaskRow`, `toTask`, and `TASK_COLUMNS` to add the new field, and export the previously-private `TASK_COLUMNS`/`toTask`:

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
  relatedOperationId: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
}

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
  related_operation_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
}

export function toTask(row: TaskRow): Task {
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
    relatedOperationId: row.related_operation_id,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export const TASK_COLUMNS =
  "id, company_id, title, description, status, priority, assignee_id, creator_id, department_id, related_employee_id, related_asset_id, related_workflow_instance_id, related_operation_id, due_date, completed_at, created_at";
```

Append at the end of the file:

```ts
export async function setTaskOperation(
  taskId: string,
  operationId: string | null
): Promise<Task> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ related_operation_id: operationId })
    .eq("id", taskId)
    .select(TASK_COLUMNS)
    .single();
  if (error) throw error;
  return toTask(data);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:integration lib/domain/tasks.test.ts`
Expected: PASS (all existing tests plus the new one).

- [ ] **Step 5: Type-check the whole project to catch any other reader of `Task`'s old shape**

Run: `npx tsc --noEmit`
Expected: no errors. `Task` gained a new required field, so any hand-written `Task`-shaped object literal elsewhere in the codebase (most likely in a route or component test's mock fixture, e.g. `app/api/tasks/**/*.test.ts`) will now fail to type-check with a "Property 'relatedOperationId' is missing" error. If any appear, add `relatedOperationId: null` to each broken literal and re-run until clean — this is the same category of fix Phase 5 needed for `components/workflows/workflow-stepper.test.tsx` when `WorkflowInstance` gained `relatedEmployeeId`.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/tasks.ts lib/domain/tasks.test.ts
# plus any test fixture files touched in Step 5
git commit -m "feat: add relatedOperationId and setTaskOperation to tasks"
```

---

## Task 7: `requests.ts` — `relatedOperationId` and `setRequestOperation`

**Files:**
- Modify: `lib/domain/requests.ts`, `lib/domain/requests.test.ts`

**Interfaces:**
- Consumes: everything already in `requests.ts`.
- Produces: `Request.relatedOperationId: string | null`; `export`ed `REQUEST_COLUMNS` and `toRequest`; `setRequestOperation(requestId, operationId): Promise<Request>` — all consumed by `lib/domain/operations.ts` (Tasks 10–12).

- [ ] **Step 1: Write the failing test**

Add to `lib/domain/requests.test.ts` (inside an existing `describe.skipIf(...)` block with a `profile`/company fixture already available, as a new `it`):

```ts
  it("sets and clears a request's related operation", async () => {
    const request = await createRequest(profile, { title: "Linkable request", category: "equipment" });
    expect(request.relatedOperationId).toBeNull();

    const linked = await setRequestOperation(request.id, "11111111-1111-4111-8111-111111111111");
    expect(linked.relatedOperationId).toBe("11111111-1111-4111-8111-111111111111");

    const unlinked = await setRequestOperation(request.id, null);
    expect(unlinked.relatedOperationId).toBeNull();
  });
```

Add `setRequestOperation` to the existing `import { ... } from "@/lib/domain/requests"` block.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration lib/domain/requests.test.ts`
Expected: FAIL — `setRequestOperation` is not exported.

- [ ] **Step 3: Extend `lib/domain/requests.ts`**

Change the `Request` interface, `RequestRow`, `toRequest`, and `REQUEST_COLUMNS`:

```ts
export interface Request {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  category: RequestCategory;
  status: RequestStatus;
  createdBy: string | null;
  departmentId: string | null;
  relatedOperationId: string | null;
  createdAt: string;
}

interface RequestRow {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  category: RequestCategory;
  status: RequestStatus;
  created_by: string | null;
  department_id: string | null;
  related_operation_id: string | null;
  created_at: string;
}

export function toRequest(row: RequestRow): Request {
  return {
    id: row.id,
    companyId: row.company_id,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    createdBy: row.created_by,
    departmentId: row.department_id,
    relatedOperationId: row.related_operation_id,
    createdAt: row.created_at,
  };
}

export const REQUEST_COLUMNS =
  "id, company_id, title, description, category, status, created_by, department_id, related_operation_id, created_at";
```

Append at the end of the file:

```ts
export async function setRequestOperation(
  requestId: string,
  operationId: string | null
): Promise<Request> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("requests")
    .update({ related_operation_id: operationId })
    .eq("id", requestId)
    .select(REQUEST_COLUMNS)
    .single();
  if (error) throw error;
  return toRequest(data);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:integration lib/domain/requests.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check the whole project to catch any other reader of `Request`'s old shape**

Run: `npx tsc --noEmit`
Expected: no errors. `Request` gained a new required field, so any hand-written `Request`-shaped object literal elsewhere (most likely a route or component test mock fixture) will now fail with a "Property 'relatedOperationId' is missing" error. Fix each by adding `relatedOperationId: null` and re-run until clean.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/requests.ts lib/domain/requests.test.ts
# plus any test fixture files touched in Step 5
git commit -m "feat: add relatedOperationId and setRequestOperation to requests"
```

---

## Task 8: `assets.ts` — `relatedOperationId` and `setAssetOperation`

**Files:**
- Modify: `lib/domain/assets.ts`, `lib/domain/assets.test.ts`

**Interfaces:**
- Consumes: everything already in `assets.ts`.
- Produces: `Asset.relatedOperationId: string | null`; `export`ed `ASSET_COLUMNS` and `toAsset`; `setAssetOperation(assetId, operationId): Promise<Asset>` — all consumed by `lib/domain/operations.ts` (Tasks 10–12).

- [ ] **Step 1: Write the failing test**

Add to `lib/domain/assets.test.ts`, inside the top-level `describe.skipIf(...)("assets", () => { ... })` block, as a new `it`:

```ts
  it("sets and clears an asset's related operation", async () => {
    const asset = await createAsset(itProfile, { name: "Linkable Laptop", category: "laptop" });
    expect(asset.relatedOperationId).toBeNull();

    const linked = await setAssetOperation(asset.id, "11111111-1111-4111-8111-111111111111");
    expect(linked.relatedOperationId).toBe("11111111-1111-4111-8111-111111111111");

    const unlinked = await setAssetOperation(asset.id, null);
    expect(unlinked.relatedOperationId).toBeNull();
  });
```

Add `setAssetOperation` to the existing `import { ... } from "@/lib/domain/assets"` block.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration lib/domain/assets.test.ts`
Expected: FAIL — `setAssetOperation` is not exported.

- [ ] **Step 3: Extend `lib/domain/assets.ts`**

Change the `Asset` interface, `AssetRow`, `toAsset`, and `ASSET_COLUMNS`:

```ts
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
  relatedOperationId: string | null;
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
  related_operation_id: string | null;
  purchase_info: Json | null;
  warranty_info: Json | null;
  created_at: string;
}

export function toAsset(row: AssetRow): Asset {
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
    relatedOperationId: row.related_operation_id,
    purchaseInfo: row.purchase_info as Record<string, unknown> | null,
    warrantyInfo: row.warranty_info as Record<string, unknown> | null,
    createdAt: row.created_at,
  };
}

export const ASSET_COLUMNS =
  "id, company_id, asset_code, name, category, status, assigned_to, department_id, location_id, related_operation_id, purchase_info, warranty_info, created_at";
```

Append at the end of the file:

```ts
export async function setAssetOperation(
  assetId: string,
  operationId: string | null
): Promise<Asset> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("assets")
    .update({ related_operation_id: operationId })
    .eq("id", assetId)
    .select(ASSET_COLUMNS)
    .single();
  if (error) throw error;
  return toAsset(data);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:integration lib/domain/assets.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check the whole project to catch any other reader of `Asset`'s old shape**

Run: `npx tsc --noEmit`
Expected: no errors. `Asset` gained a new required field, so any hand-written `Asset`-shaped object literal elsewhere (most likely a route or component test mock fixture) will now fail with a "Property 'relatedOperationId' is missing" error. Fix each by adding `relatedOperationId: null` and re-run until clean.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/assets.ts lib/domain/assets.test.ts
# plus any test fixture files touched in Step 5
git commit -m "feat: add relatedOperationId and setAssetOperation to assets"
```

---

## Task 9: `profiles.ts` — `relatedOperationId`

**Files:**
- Modify: `lib/domain/profiles.ts`, `lib/domain/profiles.test.ts`

**Interfaces:**
- Consumes: everything already in `profiles.ts`.
- Produces: `Profile.relatedOperationId: string | null`; `export`ed `PROFILE_COLUMNS` and `toProfile`; `updateProfile`'s `updates` param gains `relatedOperationId?: string | null` — all consumed by `lib/domain/operations.ts` (Tasks 10–12).

- [ ] **Step 1: Write the failing test**

Add to `lib/domain/profiles.test.ts`, inside an existing `describe.skipIf(...)` block that has a created profile fixture, as a new `it`:

```ts
  it("sets and clears a profile's related operation via updateProfile", async () => {
    const linked = await updateProfile(profile.id, {
      relatedOperationId: "11111111-1111-4111-8111-111111111111",
    });
    expect(linked.relatedOperationId).toBe("11111111-1111-4111-8111-111111111111");

    const unlinked = await updateProfile(profile.id, { relatedOperationId: null });
    expect(unlinked.relatedOperationId).toBeNull();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration lib/domain/profiles.test.ts`
Expected: FAIL — `relatedOperationId` is `undefined` on the returned profile (the `updateProfile` call silently no-ops the unknown field today).

- [ ] **Step 3: Extend `lib/domain/profiles.ts`**

Change the `Profile` interface, `ProfileRow`, `toProfile`, `PROFILE_COLUMNS`, and `updateProfile`:

```ts
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
  relatedOperationId: string | null;
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
  related_operation_id: string | null;
  status: ProfileStatus;
}

export function toProfile(row: ProfileRow): Profile {
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
    relatedOperationId: row.related_operation_id,
    status: row.status,
  };
}

export const PROFILE_COLUMNS =
  "id, auth_user_id, company_id, full_name, role, department_id, manager_id, position_title, employee_number, location_id, related_operation_id, status";
```

Change `updateProfile`:

```ts
export async function updateProfile(
  id: string,
  updates: {
    positionTitle?: string | null;
    employeeNumber?: string | null;
    departmentId?: string | null;
    managerId?: string | null;
    locationId?: string | null;
    relatedOperationId?: string | null;
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
      ...(updates.relatedOperationId !== undefined && {
        related_operation_id: updates.relatedOperationId,
      }),
      ...(updates.status !== undefined && { status: updates.status }),
    })
    .eq("id", id)
    .select(PROFILE_COLUMNS)
    .single();
  if (error) throw error;
  return toProfile(data);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:integration lib/domain/profiles.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check the whole project to catch any other reader of `Profile`'s old shape**

Run: `npx tsc --noEmit`
Expected: no errors. `Profile` is the most widely mocked type in this codebase — nearly every `app/api/**/*.test.ts` route test defines a hand-written `PROFILE` constant of this shape, and each one will now fail with a "Property 'relatedOperationId' is missing" error. Fix each by adding `relatedOperationId: null` to its `PROFILE` literal and re-run until clean. This is a mechanical, repetitive fix (the same one line added to many files) — expect a longer list of files than in Tasks 6–8.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/profiles.ts lib/domain/profiles.test.ts
# plus every test fixture file touched in Step 5
git commit -m "feat: add relatedOperationId to profiles"
```

---

## Task 10: `lib/domain/operations.ts` — `createOperation`, `loadOperationOrThrow`, `getOperation`

**Files:**
- Create: `lib/domain/operations.ts`, `lib/domain/operations.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `canCreateOperation`/`canViewOperation` (Task 5); `getProfileById` (`profiles.ts`); `TASK_COLUMNS`/`toTask` (`tasks.ts`, Task 6); `REQUEST_COLUMNS`/`toRequest` (`requests.ts`, Task 7); `ASSET_COLUMNS`/`toAsset` (`assets.ts`, Task 8); `PROFILE_COLUMNS`/`toProfile` (`profiles.ts`, Task 9); `CreateOperationInput` (Task 4).
- Produces: `Operation`, `OperationProgress`, `OperationDetail` types; `createOperation(profile, input)`, `loadOperationOrThrow(operationId)`, `getOperation(profile, operationId)` — consumed by Tasks 11–12 and the API routes/pages in Tasks 13–16, 21–25.

- [ ] **Step 1: Write the failing tests**

Create `lib/domain/operations.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile, type Profile } from "@/lib/domain/profiles";
import { createTask } from "@/lib/domain/tasks";
import { createOperation, getOperation } from "@/lib/domain/operations";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("createOperation / getOperation", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  const createdAuthUserIds: string[] = [];
  let opsManagerProfile: Profile;
  let employeeProfile: Profile;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (operations)", slug: "test-co-operations" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: opsManagerAuthUser, error: opsManagerAuthError } =
      await supabase.auth.admin.createUser({
        email: `operations-test-manager-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
    if (opsManagerAuthError || !opsManagerAuthUser.user) throw opsManagerAuthError;
    createdAuthUserIds.push(opsManagerAuthUser.user.id);
    opsManagerProfile = await createProfile({
      authUserId: opsManagerAuthUser.user.id,
      companyId,
      fullName: "Ops Manager",
      role: "operations_manager",
    });

    const { data: employeeAuthUser, error: employeeAuthError } =
      await supabase.auth.admin.createUser({
        email: `operations-test-employee-${crypto.randomUUID()}@example.com`,
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
    await supabase.from("tasks").delete().eq("company_id", companyId);
    await supabase.from("operations").delete().eq("company_id", companyId);
    await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
    for (const id of createdAuthUserIds) {
      await supabase.auth.admin.deleteUser(id);
    }
    await supabase.from("companies").delete().eq("slug", "test-co-operations");
  });

  it("rejects operation creation from a non-elevated role", async () => {
    await expect(
      createOperation(employeeProfile, { title: "Rejected Operation" })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("creates an operation, defaulting owner to the creator", async () => {
    const operation = await createOperation(opsManagerProfile, { title: "Vienna Office Relocation" });
    expect(operation.ownerId).toBe(opsManagerProfile.id);
    expect(operation.status).toBe("planning");
    expect(operation.priority).toBe("medium");
  });

  it("creates an operation with an explicit owner in the same company", async () => {
    const operation = await createOperation(opsManagerProfile, {
      title: "Production Line 3 Maintenance",
      ownerId: employeeProfile.id,
      priority: "high",
    });
    expect(operation.ownerId).toBe(employeeProfile.id);
    expect(operation.priority).toBe("high");
  });

  it("rejects an owner from a different company", async () => {
    const { data: otherCompany, error: otherCompanyError } = await supabase
      .from("companies")
      .upsert({ name: "Other Co", slug: "test-co-operations-other" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (otherCompanyError) throw otherCompanyError;

    const { data: otherAuthUser, error: otherAuthError } = await supabase.auth.admin.createUser({
      email: `operations-test-other-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (otherAuthError || !otherAuthUser.user) throw otherAuthError;
    const otherProfile = await createProfile({
      authUserId: otherAuthUser.user.id,
      companyId: otherCompany.id,
      fullName: "Other Company Employee",
      role: "employee",
    });

    await expect(
      createOperation(opsManagerProfile, { title: "Cross-company", ownerId: otherProfile.id })
    ).rejects.toBeInstanceOf(NotFoundError);

    await supabase.auth.admin.deleteUser(otherAuthUser.user.id);
    await supabase.from("profiles").delete().eq("id", otherProfile.id);
    await supabase.from("companies").delete().eq("id", otherCompany.id);
  });

  it("throws NotFoundError for an unknown operation id", async () => {
    await expect(getOperation(opsManagerProfile, crypto.randomUUID())).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it("denies viewing an operation from a different company", async () => {
    const operation = await createOperation(opsManagerProfile, { title: "Visibility Test" });
    const { data: otherCompany, error: otherCompanyError } = await supabase
      .from("companies")
      .upsert({ name: "Other Co 2", slug: "test-co-operations-other-2" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (otherCompanyError) throw otherCompanyError;
    const { data: otherAuthUser, error: otherAuthError } = await supabase.auth.admin.createUser({
      email: `operations-test-other2-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (otherAuthError || !otherAuthUser.user) throw otherAuthError;
    const otherProfile = await createProfile({
      authUserId: otherAuthUser.user.id,
      companyId: otherCompany.id,
      fullName: "Other Company Employee 2",
      role: "employee",
    });

    await expect(getOperation(otherProfile, operation.id)).rejects.toBeInstanceOf(ForbiddenError);

    await supabase.auth.admin.deleteUser(otherAuthUser.user.id);
    await supabase.from("profiles").delete().eq("id", otherProfile.id);
    await supabase.from("companies").delete().eq("id", otherCompany.id);
  });

  it("computes progress from linked tasks only", async () => {
    const operation = await createOperation(opsManagerProfile, { title: "Progress Test" });
    const taskA = await createTask(opsManagerProfile, { title: "Task A" });
    const taskB = await createTask(opsManagerProfile, { title: "Task B" });
    await supabase.from("tasks").update({ related_operation_id: operation.id }).eq("id", taskA.id);
    await supabase.from("tasks").update({ related_operation_id: operation.id }).eq("id", taskB.id);
    await supabase.from("tasks").update({ status: "completed" }).eq("id", taskA.id);

    const detail = await getOperation(opsManagerProfile, operation.id);
    expect(detail.progress).toEqual({ completedTasks: 1, totalTasks: 2 });
    expect(detail.tasks).toHaveLength(2);
    expect(detail.requests).toEqual([]);
    expect(detail.assets).toEqual([]);
    expect(detail.employees).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:integration lib/domain/operations.test.ts`
Expected: FAIL — `@/lib/domain/operations` cannot be found.

- [ ] **Step 3: Implement `lib/domain/operations.ts`**

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getProfileById, PROFILE_COLUMNS, toProfile, type Profile } from "@/lib/domain/profiles";
import { logActivity } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import { canCreateOperation, canViewOperation } from "@/lib/domain/permissions";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import type { CreateOperationInput } from "@/lib/validation/operations";
import type { OperationPriority, OperationStatus } from "@/lib/domain/operation-status";
import { TASK_COLUMNS, toTask, type Task } from "@/lib/domain/tasks";
import { REQUEST_COLUMNS, toRequest, type Request } from "@/lib/domain/requests";
import { ASSET_COLUMNS, toAsset, type Asset } from "@/lib/domain/assets";

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

interface OperationRow {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  owner_id: string;
  department_id: string | null;
  status: OperationStatus;
  priority: OperationPriority;
  start_date: string | null;
  target_date: string | null;
  created_at: string;
}

function toOperation(row: OperationRow): Operation {
  return {
    id: row.id,
    companyId: row.company_id,
    title: row.title,
    description: row.description,
    ownerId: row.owner_id,
    departmentId: row.department_id,
    status: row.status,
    priority: row.priority,
    startDate: row.start_date,
    targetDate: row.target_date,
    createdAt: row.created_at,
  };
}

const OPERATION_COLUMNS =
  "id, company_id, title, description, owner_id, department_id, status, priority, start_date, target_date, created_at";

export async function createOperation(
  profile: Profile,
  input: CreateOperationInput
): Promise<Operation> {
  if (!canCreateOperation(profile)) {
    throw new ForbiddenError("You cannot create operations");
  }

  let ownerId = profile.id;
  if (input.ownerId) {
    const owner = await getProfileById(input.ownerId);
    if (!owner || owner.companyId !== profile.companyId) {
      throw new NotFoundError("Owner not found");
    }
    ownerId = owner.id;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("operations")
    .insert({
      company_id: profile.companyId,
      title: input.title,
      description: input.description ?? null,
      owner_id: ownerId,
      department_id: input.departmentId ?? null,
      priority: input.priority ?? "medium",
      start_date: input.startDate ?? null,
      target_date: input.targetDate ?? null,
    })
    .select(OPERATION_COLUMNS)
    .single();
  if (error) throw error;

  const operation = toOperation(data);
  await logActivity(
    "operation",
    operation.id,
    profile.id,
    `${profile.fullName} created this operation`
  );
  try {
    await broadcastChange(profile.companyId, "operations", { type: "operation_created" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }
  return operation;
}

export async function loadOperationOrThrow(operationId: string): Promise<Operation> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("operations")
    .select(OPERATION_COLUMNS)
    .eq("id", operationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError("Operation not found");
  return toOperation(data);
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

export async function getOperation(profile: Profile, operationId: string): Promise<OperationDetail> {
  const operation = await loadOperationOrThrow(operationId);
  if (!canViewOperation(profile, operation)) {
    throw new ForbiddenError("You cannot view this operation");
  }

  const supabase = createSupabaseAdminClient();
  const [tasksResult, requestsResult, assetsResult, employeesResult] = await Promise.all([
    supabase
      .from("tasks")
      .select(TASK_COLUMNS)
      .eq("related_operation_id", operationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("requests")
      .select(REQUEST_COLUMNS)
      .eq("related_operation_id", operationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("assets")
      .select(ASSET_COLUMNS)
      .eq("related_operation_id", operationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("related_operation_id", operationId)
      .order("full_name", { ascending: true }),
  ]);
  if (tasksResult.error) throw tasksResult.error;
  if (requestsResult.error) throw requestsResult.error;
  if (assetsResult.error) throw assetsResult.error;
  if (employeesResult.error) throw employeesResult.error;

  const tasks = tasksResult.data.map(toTask);
  const requests = requestsResult.data.map(toRequest);
  const assets = assetsResult.data.map(toAsset);
  const employees = employeesResult.data.map(toProfile);

  const completedTasks = tasks.filter((task) => task.status === "completed").length;

  return {
    operation,
    progress: { completedTasks, totalTasks: tasks.length },
    tasks,
    requests,
    assets,
    employees,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:integration lib/domain/operations.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Wire the new test file into `package.json`**

In the `test:unit` script, add `--exclude "lib/domain/operations.test.ts"` (anywhere in the existing `--exclude` chain).

In the `test:integration` script, add `lib/domain/operations.test.ts` to the space-separated file list.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/operations.ts lib/domain/operations.test.ts package.json
git commit -m "feat: add createOperation, loadOperationOrThrow, and getOperation"
```

---

## Task 11: `operations.ts` — `updateOperation` and `listOperations`

**Files:**
- Modify: `lib/domain/operations.ts`, `lib/domain/operations.test.ts`

**Interfaces:**
- Consumes: `canManageOperation` (Task 5); `UpdateOperationInput`/`OperationFilters` (Task 4); everything already in `operations.ts` (Task 10).
- Produces: `updateOperation(profile, operationId, input)`, `listOperations(profile, filters)` — consumed by the `/api/operations*` routes (Tasks 13–14).

- [ ] **Step 1: Write the failing tests**

Add a new top-level `describe` block at the end of `lib/domain/operations.test.ts` (self-contained fixture, matching the file's existing convention of one isolated `describe` per feature area):

```ts
describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("updateOperation / listOperations", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  let departmentId: string;
  const createdAuthUserIds: string[] = [];
  let opsManagerProfile: Profile;
  let employeeProfile: Profile;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert(
        { name: "Test Co (operations-update)", slug: "test-co-operations-update" },
        { onConflict: "slug" }
      )
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: department, error: departmentError } = await supabase
      .from("departments")
      .upsert(
        { company_id: companyId, name: "Ops (operations-update)" },
        { onConflict: "company_id,name" }
      )
      .select("id")
      .single();
    if (departmentError) throw departmentError;
    departmentId = department.id;

    const { data: opsManagerAuthUser, error: opsManagerAuthError } =
      await supabase.auth.admin.createUser({
        email: `operations-update-manager-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
    if (opsManagerAuthError || !opsManagerAuthUser.user) throw opsManagerAuthError;
    createdAuthUserIds.push(opsManagerAuthUser.user.id);
    opsManagerProfile = await createProfile({
      authUserId: opsManagerAuthUser.user.id,
      companyId,
      fullName: "Ops Manager",
      role: "operations_manager",
    });

    const { data: employeeAuthUser, error: employeeAuthError } =
      await supabase.auth.admin.createUser({
        email: `operations-update-employee-${crypto.randomUUID()}@example.com`,
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
    await supabase.from("operations").delete().eq("company_id", companyId);
    await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
    for (const id of createdAuthUserIds) {
      await supabase.auth.admin.deleteUser(id);
    }
    await supabase.from("companies").delete().eq("slug", "test-co-operations-update");
  });

  it("rejects an update from a non-elevated role", async () => {
    const operation = await createOperation(opsManagerProfile, { title: "Reject Update Test" });
    await expect(
      updateOperation(employeeProfile, operation.id, { status: "in_progress" })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("updates status, priority, and department", async () => {
    const operation = await createOperation(opsManagerProfile, { title: "Update Test" });
    const updated = await updateOperation(opsManagerProfile, operation.id, {
      status: "in_progress",
      priority: "critical",
      departmentId,
    });
    expect(updated.status).toBe("in_progress");
    expect(updated.priority).toBe("critical");
    expect(updated.departmentId).toBe(departmentId);
  });

  it("clears a nullable field when explicitly set to null", async () => {
    const operation = await createOperation(opsManagerProfile, {
      title: "Nullable Test",
      departmentId,
    });
    const updated = await updateOperation(opsManagerProfile, operation.id, { departmentId: null });
    expect(updated.departmentId).toBeNull();
  });

  it("lists operations filtered by status and department", async () => {
    await createOperation(opsManagerProfile, { title: "Planning Op" });
    const inProgressOp = await createOperation(opsManagerProfile, { title: "In Progress Op", departmentId });
    await updateOperation(opsManagerProfile, inProgressOp.id, { status: "in_progress" });

    const inProgress = await listOperations(opsManagerProfile, { status: "in_progress" });
    expect(inProgress.every((o) => o.status === "in_progress")).toBe(true);
    expect(inProgress.some((o) => o.id === inProgressOp.id)).toBe(true);

    const byDepartment = await listOperations(opsManagerProfile, { departmentId });
    expect(byDepartment.every((o) => o.departmentId === departmentId)).toBe(true);
  });
});
```

Add `updateOperation` and `listOperations` to the existing `import { ... } from "@/lib/domain/operations"` block at the top of the test file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:integration lib/domain/operations.test.ts`
Expected: FAIL — `updateOperation`/`listOperations` are not exported.

- [ ] **Step 3: Extend `lib/domain/operations.ts`**

Add the import for `canManageOperation` and `UpdateOperationInput`/`OperationFilters` types:

```ts
import { canCreateOperation, canManageOperation, canViewOperation } from "@/lib/domain/permissions";
import type {
  CreateOperationInput,
  OperationFilters,
  UpdateOperationInput,
} from "@/lib/validation/operations";
```

(Replace the existing narrower `import { canCreateOperation, canViewOperation } ...` and `import type { CreateOperationInput } ...` lines with these two.)

Append at the end of the file:

```ts
export async function updateOperation(
  profile: Profile,
  operationId: string,
  input: UpdateOperationInput
): Promise<Operation> {
  const operation = await loadOperationOrThrow(operationId);
  if (!canManageOperation(profile, operation)) {
    throw new ForbiddenError("You cannot update this operation");
  }

  let ownerId = operation.ownerId;
  if (input.ownerId) {
    const owner = await getProfileById(input.ownerId);
    if (!owner || owner.companyId !== profile.companyId) {
      throw new NotFoundError("Owner not found");
    }
    ownerId = owner.id;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("operations")
    .update({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      owner_id: ownerId,
      ...(input.departmentId !== undefined && { department_id: input.departmentId }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.startDate !== undefined && { start_date: input.startDate }),
      ...(input.targetDate !== undefined && { target_date: input.targetDate }),
    })
    .eq("id", operationId)
    .select(OPERATION_COLUMNS)
    .single();
  if (error) throw error;

  const updated = toOperation(data);
  await logActivity(
    "operation",
    updated.id,
    profile.id,
    `${profile.fullName} updated this operation`
  );
  try {
    await broadcastChange(profile.companyId, "operations", { type: "operation_updated" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }
  return updated;
}

export async function listOperations(
  profile: Profile,
  filters: OperationFilters
): Promise<Operation[]> {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("operations")
    .select(OPERATION_COLUMNS)
    .eq("company_id", profile.companyId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.departmentId) query = query.eq("department_id", filters.departmentId);
  if (filters.ownerId) query = query.eq("owner_id", filters.ownerId);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toOperation);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:integration lib/domain/operations.test.ts`
Expected: PASS (all tests across both `describe` blocks).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/operations.ts lib/domain/operations.test.ts
git commit -m "feat: add updateOperation and listOperations"
```

---

## Task 12: `operations.ts` — `linkEntity` and `unlinkEntity`

**Files:**
- Modify: `lib/domain/operations.ts`, `lib/domain/operations.test.ts`

**Interfaces:**
- Consumes: `loadTaskOrThrow`/`setTaskOperation` (`tasks.ts`); `loadRequestOrThrow`/`setRequestOperation` (`requests.ts`); `loadAssetOrThrow`/`setAssetOperation` (`assets.ts`); `getProfileById`/`updateProfile` (`profiles.ts`); `canManageOperation` (Task 5).
- Produces: `LinkableEntityType`, `linkEntity(profile, operationId, entityType, entityId)`, `unlinkEntity(profile, operationId, entityType, entityId)` — consumed by the `/api/operations/[id]/link` route (Task 15) and the frontend link/unlink components (Tasks 19, 22–25).

- [ ] **Step 1: Write the failing tests**

Add a new top-level `describe` block at the end of `lib/domain/operations.test.ts`:

```ts
describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("linkEntity / unlinkEntity", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  const createdAuthUserIds: string[] = [];
  let opsManagerProfile: Profile;
  let employeeProfile: Profile;
  let operationA: Operation;
  let operationB: Operation;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (operations-link)", slug: "test-co-operations-link" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: opsManagerAuthUser, error: opsManagerAuthError } =
      await supabase.auth.admin.createUser({
        email: `operations-link-manager-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
    if (opsManagerAuthError || !opsManagerAuthUser.user) throw opsManagerAuthError;
    createdAuthUserIds.push(opsManagerAuthUser.user.id);
    opsManagerProfile = await createProfile({
      authUserId: opsManagerAuthUser.user.id,
      companyId,
      fullName: "Ops Manager",
      role: "operations_manager",
    });

    const { data: employeeAuthUser, error: employeeAuthError } =
      await supabase.auth.admin.createUser({
        email: `operations-link-employee-${crypto.randomUUID()}@example.com`,
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

    operationA = await createOperation(opsManagerProfile, { title: "Operation A" });
    operationB = await createOperation(opsManagerProfile, { title: "Operation B" });
  });

  afterAll(async () => {
    await supabase.from("tasks").delete().eq("company_id", companyId);
    await supabase.from("operations").delete().eq("company_id", companyId);
    await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
    for (const id of createdAuthUserIds) {
      await supabase.auth.admin.deleteUser(id);
    }
    await supabase.from("companies").delete().eq("slug", "test-co-operations-link");
  });

  it("rejects linking from a non-elevated role", async () => {
    const task = await createTask(opsManagerProfile, { title: "Reject Link Test" });
    await expect(
      linkEntity(employeeProfile, operationA.id, "task", task.id)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("links a task, request, asset, and employee, then unlinks each", async () => {
    const task = await createTask(opsManagerProfile, { title: "Linkable Task" });
    await linkEntity(opsManagerProfile, operationA.id, "task", task.id);
    const afterLinkTask = await getOperation(opsManagerProfile, operationA.id);
    expect(afterLinkTask.tasks.map((t) => t.id)).toContain(task.id);

    await linkEntity(opsManagerProfile, operationA.id, "employee", employeeProfile.id);
    const afterLinkEmployee = await getOperation(opsManagerProfile, operationA.id);
    expect(afterLinkEmployee.employees.map((e) => e.id)).toContain(employeeProfile.id);

    await unlinkEntity(opsManagerProfile, operationA.id, "task", task.id);
    await unlinkEntity(opsManagerProfile, operationA.id, "employee", employeeProfile.id);
    const afterUnlink = await getOperation(opsManagerProfile, operationA.id);
    expect(afterUnlink.tasks).toHaveLength(0);
    expect(afterUnlink.employees).toHaveLength(0);
  });

  it("rejects unlinking an entity that belongs to a different operation", async () => {
    const task = await createTask(opsManagerProfile, { title: "Cross-Operation Task" });
    await linkEntity(opsManagerProfile, operationA.id, "task", task.id);

    await expect(
      unlinkEntity(opsManagerProfile, operationB.id, "task", task.id)
    ).rejects.toBeInstanceOf(NotFoundError);

    const stillLinked = await getOperation(opsManagerProfile, operationA.id);
    expect(stillLinked.tasks.map((t) => t.id)).toContain(task.id);
  });

  it("rejects linking a task from a different company", async () => {
    const { data: otherCompany, error: otherCompanyError } = await supabase
      .from("companies")
      .upsert({ name: "Other Co 3", slug: "test-co-operations-link-other" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (otherCompanyError) throw otherCompanyError;
    const { data: otherTask, error: otherTaskError } = await supabase
      .from("tasks")
      .insert({ company_id: otherCompany.id, title: "Other company task", status: "todo" })
      .select("id")
      .single();
    if (otherTaskError) throw otherTaskError;

    await expect(
      linkEntity(opsManagerProfile, operationA.id, "task", otherTask.id)
    ).rejects.toBeInstanceOf(NotFoundError);

    await supabase.from("tasks").delete().eq("id", otherTask.id);
    await supabase.from("companies").delete().eq("id", otherCompany.id);
  });
});
```

Change the file's import blocks at the top to include the newly-needed names:

```ts
import { createOperation, getOperation, linkEntity, unlinkEntity, updateOperation, listOperations, type Operation } from "@/lib/domain/operations";
import { createTask } from "@/lib/domain/tasks";
```

(Merge these into the existing `import { ... } from "@/lib/domain/operations"` and add a new `createTask` import from `@/lib/domain/tasks` if not already present from Task 10's test additions.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:integration lib/domain/operations.test.ts`
Expected: FAIL — `linkEntity`/`unlinkEntity` are not exported.

- [ ] **Step 3: Extend `lib/domain/operations.ts`**

Add imports:

```ts
import { loadTaskOrThrow, setTaskOperation } from "@/lib/domain/tasks";
import { loadRequestOrThrow, setRequestOperation } from "@/lib/domain/requests";
import { loadAssetOrThrow, setAssetOperation } from "@/lib/domain/assets";
import { updateProfile } from "@/lib/domain/profiles";
```

(`getProfileById` and `PROFILE_COLUMNS`/`toProfile` are already imported from `@/lib/domain/profiles` from Task 10 — add `updateProfile` to that same import line rather than a new one. Similarly, `TASK_COLUMNS`/`toTask`/`type Task` are already imported from `@/lib/domain/tasks` — add `loadTaskOrThrow`/`setTaskOperation` to that line; same pattern for the `requests.ts` and `assets.ts` imports.)

Append at the end of the file:

```ts
export type LinkableEntityType = "task" | "request" | "asset" | "employee";

async function assertEntityInCompany(
  entityType: LinkableEntityType,
  entityId: string,
  companyId: string
): Promise<void> {
  switch (entityType) {
    case "task": {
      const task = await loadTaskOrThrow(entityId);
      if (task.companyId !== companyId) throw new NotFoundError("Task not found");
      return;
    }
    case "request": {
      const request = await loadRequestOrThrow(entityId);
      if (request.companyId !== companyId) throw new NotFoundError("Request not found");
      return;
    }
    case "asset": {
      const asset = await loadAssetOrThrow(entityId);
      if (asset.companyId !== companyId) throw new NotFoundError("Asset not found");
      return;
    }
    case "employee": {
      const employee = await getProfileById(entityId);
      if (!employee || employee.companyId !== companyId) {
        throw new NotFoundError("Employee not found");
      }
      return;
    }
  }
}

async function writeEntityOperation(
  entityType: LinkableEntityType,
  entityId: string,
  operationId: string | null
): Promise<void> {
  switch (entityType) {
    case "task":
      await setTaskOperation(entityId, operationId);
      return;
    case "request":
      await setRequestOperation(entityId, operationId);
      return;
    case "asset":
      await setAssetOperation(entityId, operationId);
      return;
    case "employee":
      await updateProfile(entityId, { relatedOperationId: operationId });
      return;
  }
}

async function loadEntityOperationId(
  entityType: LinkableEntityType,
  entityId: string
): Promise<string | null> {
  switch (entityType) {
    case "task":
      return (await loadTaskOrThrow(entityId)).relatedOperationId;
    case "request":
      return (await loadRequestOrThrow(entityId)).relatedOperationId;
    case "asset":
      return (await loadAssetOrThrow(entityId)).relatedOperationId;
    case "employee": {
      const employee = await getProfileById(entityId);
      if (!employee) throw new NotFoundError("Employee not found");
      return employee.relatedOperationId;
    }
  }
}

export async function linkEntity(
  profile: Profile,
  operationId: string,
  entityType: LinkableEntityType,
  entityId: string
): Promise<void> {
  const operation = await loadOperationOrThrow(operationId);
  if (!canManageOperation(profile, operation)) {
    throw new ForbiddenError("You cannot link entities to this operation");
  }

  await assertEntityInCompany(entityType, entityId, operation.companyId);
  await writeEntityOperation(entityType, entityId, operationId);

  await logActivity(
    "operation",
    operation.id,
    profile.id,
    `${profile.fullName} linked a ${entityType} to this operation`
  );
  try {
    await broadcastChange(profile.companyId, "operations", { type: "operation_updated" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }
}

export async function unlinkEntity(
  profile: Profile,
  operationId: string,
  entityType: LinkableEntityType,
  entityId: string
): Promise<void> {
  const operation = await loadOperationOrThrow(operationId);
  if (!canManageOperation(profile, operation)) {
    throw new ForbiddenError("You cannot unlink entities from this operation");
  }

  const currentOperationId = await loadEntityOperationId(entityType, entityId);
  if (currentOperationId !== operationId) {
    throw new NotFoundError(`This ${entityType} is not linked to this operation`);
  }
  await writeEntityOperation(entityType, entityId, null);

  await logActivity(
    "operation",
    operation.id,
    profile.id,
    `${profile.fullName} unlinked a ${entityType} from this operation`
  );
  try {
    await broadcastChange(profile.companyId, "operations", { type: "operation_updated" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:integration lib/domain/operations.test.ts`
Expected: PASS (all tests across all four `describe` blocks in the file).

- [ ] **Step 5: Run the full build**

Run: `pnpm build`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/operations.ts lib/domain/operations.test.ts
git commit -m "feat: add linkEntity and unlinkEntity"
```

---

## Task 13: `GET/POST /api/operations`

**Files:**
- Create: `app/api/operations/route.ts`, `app/api/operations/route.test.ts`

**Interfaces:**
- Consumes: `createOperation`/`listOperations` (Tasks 10–11); `createOperationSchema`/`operationFiltersSchema` (Task 4); `getCurrentProfile` (`lib/auth/session.ts`); `toErrorResponse` (`lib/api/error-response.ts`).
- Produces: `GET /api/operations` (list, filtered by query params), `POST /api/operations` (create) — consumed by the frontend `OperationListView`/`OperationForm` (Tasks 17–18) and `OperationLinkPicker`/`XOperationControl` components (Tasks 19, 22–25) for their "pick an operation"/"pick an item" dropdowns.

- [ ] **Step 1: Write the failing test**

Create `app/api/operations/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/operations", () => ({
  createOperation: vi.fn(),
  listOperations: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { createOperation, listOperations } from "@/lib/domain/operations";
import { GET, POST } from "@/app/api/operations/route";
import { ForbiddenError } from "@/lib/domain/errors";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "Ops Manager",
  role: "operations_manager" as const,
  departmentId: null,
  managerId: null,
  positionTitle: null,
  employeeNumber: null,
  locationId: null,
  relatedOperationId: null,
  status: "active" as const,
};

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(createOperation).mockReset();
  vi.mocked(listOperations).mockReset();
});

describe("GET /api/operations", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/operations"));
    expect(response.status).toBe(401);
  });

  it("returns 400 for an invalid status filter", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await GET(new Request("http://localhost/api/operations?status=archived"));
    expect(response.status).toBe(400);
  });

  it("returns the operations list", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(listOperations).mockResolvedValue([{ id: "op-1" } as never]);
    const response = await GET(new Request("http://localhost/api/operations"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.operations).toEqual([{ id: "op-1" }]);
  });
});

describe("POST /api/operations", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost/api/operations", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await POST(jsonRequest({ title: "New Operation" }));
    expect(response.status).toBe(401);
  });

  it("returns 400 for a missing title", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(jsonRequest({}));
    expect(response.status).toBe(400);
  });

  it("returns 403 when the domain layer rejects the caller", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(createOperation).mockRejectedValue(new ForbiddenError());
    const response = await POST(jsonRequest({ title: "New Operation" }));
    expect(response.status).toBe(403);
  });

  it("creates the operation", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(createOperation).mockResolvedValue({ id: "op-1", title: "New Operation" } as never);
    const response = await POST(jsonRequest({ title: "New Operation" }));
    expect(response.status).toBe(201);
    expect(createOperation).toHaveBeenCalledWith(PROFILE, { title: "New Operation" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test app/api/operations/route.test.ts`
Expected: FAIL — `@/app/api/operations/route` cannot be found.

- [ ] **Step 3: Implement `app/api/operations/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { createOperation, listOperations } from "@/lib/domain/operations";
import { createOperationSchema, operationFiltersSchema } from "@/lib/validation/operations";
import { toErrorResponse } from "@/lib/api/error-response";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = operationFiltersSchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    departmentId: url.searchParams.get("departmentId") ?? undefined,
    ownerId: url.searchParams.get("ownerId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const operations = await listOperations(profile, parsed.data);
    return NextResponse.json({ operations });
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
  const parsed = createOperationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const operation = await createOperation(profile, parsed.data);
    return NextResponse.json({ operation }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test app/api/operations/route.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/operations/route.ts app/api/operations/route.test.ts
git commit -m "feat: add GET/POST /api/operations"
```

---

## Task 14: `GET/PATCH /api/operations/[id]`

**Files:**
- Create: `app/api/operations/[id]/route.ts`, `app/api/operations/[id]/route.test.ts`

**Interfaces:**
- Consumes: `getOperation`/`updateOperation` (Tasks 10–11); `updateOperationSchema` (Task 4).
- Produces: `GET /api/operations/[id]` (returns `OperationDetail`), `PATCH /api/operations/[id]` (update) — consumed by the `/operations/[id]` page (Task 21) and the `XOperationControl` components (Tasks 22–25) fetching a linked operation's title.

- [ ] **Step 1: Write the failing test**

Create `app/api/operations/[id]/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/operations", () => ({
  getOperation: vi.fn(),
  updateOperation: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { getOperation, updateOperation } from "@/lib/domain/operations";
import { GET, PATCH } from "@/app/api/operations/[id]/route";
import { NotFoundError } from "@/lib/domain/errors";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "Ops Manager",
  role: "operations_manager" as const,
  departmentId: null,
  managerId: null,
  positionTitle: null,
  employeeNumber: null,
  locationId: null,
  relatedOperationId: null,
  status: "active" as const,
};

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(getOperation).mockReset();
  vi.mocked(updateOperation).mockReset();
});

describe("GET /api/operations/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost"), params("op-1"));
    expect(response.status).toBe(401);
  });

  it("returns 404 when the operation does not exist", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getOperation).mockRejectedValue(new NotFoundError());
    const response = await GET(new Request("http://localhost"), params("op-1"));
    expect(response.status).toBe(404);
  });

  it("returns the operation detail", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getOperation).mockResolvedValue({
      operation: { id: "op-1", title: "Test Op" },
      progress: { completedTasks: 0, totalTasks: 0 },
      tasks: [],
      requests: [],
      assets: [],
      employees: [],
    } as never);
    const response = await GET(new Request("http://localhost"), params("op-1"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.operation.title).toBe("Test Op");
  });
});

describe("PATCH /api/operations/[id]", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 400 for an invalid status", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await PATCH(jsonRequest({ status: "archived" }), params("op-1"));
    expect(response.status).toBe(400);
  });

  it("updates the operation", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(updateOperation).mockResolvedValue({ id: "op-1", status: "in_progress" } as never);
    const response = await PATCH(jsonRequest({ status: "in_progress" }), params("op-1"));
    expect(response.status).toBe(200);
    expect(updateOperation).toHaveBeenCalledWith(PROFILE, "op-1", { status: "in_progress" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test app/api/operations/[id]/route.test.ts`
Expected: FAIL — `@/app/api/operations/[id]/route` cannot be found.

- [ ] **Step 3: Implement `app/api/operations/[id]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getOperation, updateOperation } from "@/lib/domain/operations";
import { updateOperationSchema } from "@/lib/validation/operations";
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
    const detail = await getOperation(profile, id);
    return NextResponse.json(detail);
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
  const parsed = updateOperationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const operation = await updateOperation(profile, id, parsed.data);
    return NextResponse.json({ operation });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test app/api/operations/[id]/route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/api/operations/[id]/route.ts" "app/api/operations/[id]/route.test.ts"
git commit -m "feat: add GET/PATCH /api/operations/[id]"
```

---

## Task 15: `POST /api/operations/[id]/link`

**Files:**
- Create: `app/api/operations/[id]/link/route.ts`, `app/api/operations/[id]/link/route.test.ts`

**Interfaces:**
- Consumes: `linkEntity`/`unlinkEntity` (Task 12); `linkActionSchema` (Task 4).
- Produces: `POST /api/operations/[id]/link` (body `{ action: "link" | "unlink", entityType, entityId }`) — consumed by `OperationLinkPicker` (Task 19) and the four `XOperationControl` components (Tasks 22–25).

- [ ] **Step 1: Write the failing test**

Create `app/api/operations/[id]/link/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/operations", () => ({
  linkEntity: vi.fn(),
  unlinkEntity: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { linkEntity, unlinkEntity } from "@/lib/domain/operations";
import { POST } from "@/app/api/operations/[id]/link/route";
import { ForbiddenError } from "@/lib/domain/errors";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "Ops Manager",
  role: "operations_manager" as const,
  departmentId: null,
  managerId: null,
  positionTitle: null,
  employeeNumber: null,
  locationId: null,
  relatedOperationId: null,
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
  vi.mocked(linkEntity).mockReset();
  vi.mocked(unlinkEntity).mockReset();
});

describe("POST /api/operations/[id]/link", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await POST(
      jsonRequest({ action: "link", entityType: "task", entityId: "task-1" }),
      params("op-1")
    );
    expect(response.status).toBe(401);
  });

  it("returns 400 for an unknown entity type", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(
      jsonRequest({ action: "link", entityType: "invoice", entityId: "11111111-1111-4111-8111-111111111111" }),
      params("op-1")
    );
    expect(response.status).toBe(400);
  });

  it("calls linkEntity for a link action", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(linkEntity).mockResolvedValue(undefined);
    const response = await POST(
      jsonRequest({
        action: "link",
        entityType: "task",
        entityId: "11111111-1111-4111-8111-111111111111",
      }),
      params("op-1")
    );
    expect(response.status).toBe(200);
    expect(linkEntity).toHaveBeenCalledWith(
      PROFILE,
      "op-1",
      "task",
      "11111111-1111-4111-8111-111111111111"
    );
  });

  it("calls unlinkEntity for an unlink action", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(unlinkEntity).mockResolvedValue(undefined);
    const response = await POST(
      jsonRequest({
        action: "unlink",
        entityType: "employee",
        entityId: "11111111-1111-4111-8111-111111111111",
      }),
      params("op-1")
    );
    expect(response.status).toBe(200);
    expect(unlinkEntity).toHaveBeenCalledWith(
      PROFILE,
      "op-1",
      "employee",
      "11111111-1111-4111-8111-111111111111"
    );
  });

  it("returns 403 when the domain layer rejects the caller", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(linkEntity).mockRejectedValue(new ForbiddenError());
    const response = await POST(
      jsonRequest({
        action: "link",
        entityType: "task",
        entityId: "11111111-1111-4111-8111-111111111111",
      }),
      params("op-1")
    );
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test app/api/operations/[id]/link/route.test.ts`
Expected: FAIL — `@/app/api/operations/[id]/link/route` cannot be found.

- [ ] **Step 3: Implement `app/api/operations/[id]/link/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { linkEntity, unlinkEntity } from "@/lib/domain/operations";
import { linkActionSchema } from "@/lib/validation/operations";
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
  const parsed = linkActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    if (parsed.data.action === "link") {
      await linkEntity(profile, id, parsed.data.entityType, parsed.data.entityId);
    } else {
      await unlinkEntity(profile, id, parsed.data.entityType, parsed.data.entityId);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test app/api/operations/[id]/link/route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/api/operations/[id]/link/route.ts" "app/api/operations/[id]/link/route.test.ts"
git commit -m "feat: add POST /api/operations/[id]/link"
```

---

## Task 16: `GET/POST /api/operations/[id]/comments`

**Files:**
- Create: `app/api/operations/[id]/comments/route.ts`, `app/api/operations/[id]/comments/route.test.ts`

**Interfaces:**
- Consumes: `loadOperationOrThrow` (Task 10); `canCommentOnOperation` (Task 5); `addComment`/`listComments` (`lib/domain/comments.ts`, existing); `addCommentSchema` (`lib/validation/tasks.ts`, existing — reused as-is, matching how `app/api/requests/[id]/comments/route.ts` already reuses it rather than duplicating).
- Produces: `GET /api/operations/[id]/comments`, `POST /api/operations/[id]/comments` — consumed by the `/operations/[id]` page (Task 21) and `OperationComments` (Task 20).

- [ ] **Step 1: Write the failing test**

Create `app/api/operations/[id]/comments/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/operations", () => ({
  loadOperationOrThrow: vi.fn(),
}));
vi.mock("@/lib/domain/comments", () => ({
  addComment: vi.fn(),
  listComments: vi.fn(),
}));
vi.mock("@/lib/domain/activity", () => ({
  logActivity: vi.fn(),
}));
vi.mock("@/lib/realtime/broadcast", () => ({
  broadcastChange: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { loadOperationOrThrow } from "@/lib/domain/operations";
import { addComment, listComments } from "@/lib/domain/comments";
import { GET, POST } from "@/app/api/operations/[id]/comments/route";
import { NotFoundError } from "@/lib/domain/errors";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "Test User",
  role: "employee" as const,
  departmentId: null,
  managerId: null,
  positionTitle: null,
  employeeNumber: null,
  locationId: null,
  relatedOperationId: null,
  status: "active" as const,
};

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(loadOperationOrThrow).mockReset();
  vi.mocked(addComment).mockReset();
  vi.mocked(listComments).mockReset();
});

describe("GET /api/operations/[id]/comments", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost"), params("op-1"));
    expect(response.status).toBe(401);
  });

  it("returns 404 when the operation does not exist", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(loadOperationOrThrow).mockRejectedValue(new NotFoundError());
    const response = await GET(new Request("http://localhost"), params("op-1"));
    expect(response.status).toBe(404);
  });

  it("returns 403 for a caller from a different company", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(loadOperationOrThrow).mockResolvedValue({
      id: "op-1",
      companyId: "other-company",
    } as never);
    const response = await GET(new Request("http://localhost"), params("op-1"));
    expect(response.status).toBe(403);
  });

  it("returns the comments", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(loadOperationOrThrow).mockResolvedValue({
      id: "op-1",
      companyId: "company-1",
    } as never);
    vi.mocked(listComments).mockResolvedValue([{ id: "comment-1", body: "Looks good" } as never]);
    const response = await GET(new Request("http://localhost"), params("op-1"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.comments).toEqual([{ id: "comment-1", body: "Looks good" }]);
  });
});

describe("POST /api/operations/[id]/comments", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 400 for an empty comment body", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(jsonRequest({ body: "" }), params("op-1"));
    expect(response.status).toBe(400);
  });

  it("adds the comment", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(loadOperationOrThrow).mockResolvedValue({
      id: "op-1",
      companyId: "company-1",
    } as never);
    vi.mocked(addComment).mockResolvedValue({ id: "comment-1", body: "New comment" } as never);
    const response = await POST(jsonRequest({ body: "New comment" }), params("op-1"));
    expect(response.status).toBe(201);
    expect(addComment).toHaveBeenCalledWith("operation", "op-1", PROFILE.id, "New comment");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test app/api/operations/[id]/comments/route.test.ts`
Expected: FAIL — `@/app/api/operations/[id]/comments/route` cannot be found.

- [ ] **Step 3: Implement `app/api/operations/[id]/comments/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { loadOperationOrThrow } from "@/lib/domain/operations";
import { canCommentOnOperation } from "@/lib/domain/permissions";
import { addComment, listComments } from "@/lib/domain/comments";
import { logActivity } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import { addCommentSchema } from "@/lib/validation/tasks";
import { toErrorResponse } from "@/lib/api/error-response";
import { ForbiddenError } from "@/lib/domain/errors";

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
    const operation = await loadOperationOrThrow(id);
    if (!canCommentOnOperation(profile, operation)) {
      throw new ForbiddenError("You cannot view comments on this operation");
    }
    const comments = await listComments("operation", operation.id);
    return NextResponse.json({ comments });
  } catch (error) {
    return toErrorResponse(error);
  }
}

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
  const parsed = addCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const operation = await loadOperationOrThrow(id);
    if (!canCommentOnOperation(profile, operation)) {
      throw new ForbiddenError("You cannot comment on this operation");
    }
    const comment = await addComment("operation", operation.id, profile.id, parsed.data.body);
    await logActivity(
      "operation",
      operation.id,
      profile.id,
      `${profile.fullName} commented on this operation`
    );
    try {
      await broadcastChange(profile.companyId, "operations", { type: "operation_updated" });
    } catch (error) {
      console.error("broadcastChange failed:", error);
    }
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test app/api/operations/[id]/comments/route.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/api/operations/[id]/comments/route.ts" "app/api/operations/[id]/comments/route.test.ts"
git commit -m "feat: add GET/POST /api/operations/[id]/comments"
```

---

## Task 17: `OperationListView` and `/operations` page

**Files:**
- Create: `components/operations/operation-list-view.tsx`, `components/operations/operation-list-view.test.tsx`, `app/(app)/operations/page.tsx`

**Interfaces:**
- Consumes: `GET /api/operations` (Task 13); `Department` (`lib/domain/departments.ts`, existing); `canCreateOperation` (Task 5); `listDepartments` (existing); `useBroadcastListener` (existing); shadcn `Table`/`Badge`/`Button` (existing).
- Produces: `OperationListView` component — the `/operations` page, following the exact `EmployeeListView`/`app/(app)/employees/page.tsx` pattern.

- [ ] **Step 1: Write the failing test**

Create `components/operations/operation-list-view.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => ({ on: () => ({ subscribe: vi.fn() }) }),
    removeChannel: vi.fn(),
  }),
}));

import { OperationListView } from "@/components/operations/operation-list-view";

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        operations: [
          {
            id: "op-1",
            title: "Vienna Office Relocation",
            status: "in_progress",
            priority: "high",
            departmentId: null,
          },
        ],
      }),
    })
  );
});

describe("OperationListView", () => {
  it("renders the fetched operations", async () => {
    renderWithClient(
      <OperationListView companyId="company-1" canCreate={false} departments={[]} />
    );
    expect(await screen.findByText("Vienna Office Relocation")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new operation/i })).not.toBeInTheDocument();
  });

  it("shows the new operation link when canCreate is true", async () => {
    renderWithClient(
      <OperationListView companyId="company-1" canCreate={true} departments={[]} />
    );
    await waitFor(() => screen.getByRole("button", { name: /new operation/i }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test components/operations/operation-list-view.test.tsx`
Expected: FAIL — `@/components/operations/operation-list-view` cannot be found.

- [ ] **Step 3: Implement `components/operations/operation-list-view.tsx`**

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
import type { Department } from "@/lib/domain/departments";

interface OperationListItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  departmentId: string | null;
}

const STATUS_OPTIONS = ["planning", "in_progress", "on_hold", "completed", "cancelled"];

export function OperationListView({
  companyId,
  canCreate,
  departments,
}: {
  companyId: string;
  canCreate: boolean;
  departments: Department[];
}) {
  const [status, setStatus] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["operations", { status, departmentId }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (departmentId) params.set("departmentId", departmentId);
      const response = await fetch(`/api/operations?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load operations");
      const body = await response.json();
      return body.operations as OperationListItem[];
    },
  });

  useBroadcastListener(`company:${companyId}:operations`, () => {
    queryClient.invalidateQueries({ queryKey: ["operations"] });
  });

  function departmentName(id: string | null) {
    if (!id) return "—";
    return departments.find((department) => department.id === id)?.name ?? "—";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option.replace("_", " ")}
              </option>
            ))}
          </select>
          <select
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">All departments</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </div>
        {canCreate && (
          <Button render={<Link href="/operations/new" />} nativeButton={false}>
            New operation
          </Button>
        )}
      </div>

      {isLoading && <p className="text-muted-foreground">Loading operations...</p>}
      {error && <p className="text-red-600">Failed to load operations.</p>}

      {data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Department</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((operation) => (
              <TableRow key={operation.id}>
                <TableCell>
                  <Link href={`/operations/${operation.id}`} className="hover:underline">
                    {operation.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{operation.status.replace("_", " ")}</Badge>
                </TableCell>
                <TableCell>{operation.priority}</TableCell>
                <TableCell>{departmentName(operation.departmentId)}</TableCell>
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No operations found.
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

Run: `pnpm test components/operations/operation-list-view.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Create `app/(app)/operations/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { canCreateOperation } from "@/lib/domain/permissions";
import { listDepartments } from "@/lib/domain/departments";
import { BackLink } from "@/components/back-link";
import { OperationListView } from "@/components/operations/operation-list-view";

export default async function OperationsPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const departments = await listDepartments(profile.companyId);

  return (
    <div>
      <BackLink href="/dashboard" />
      <h1 className="text-2xl font-semibold mb-4 mt-2">Operations</h1>
      <OperationListView
        companyId={profile.companyId}
        canCreate={canCreateOperation(profile)}
        departments={departments}
      />
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add components/operations/operation-list-view.tsx components/operations/operation-list-view.test.tsx "app/(app)/operations/page.tsx"
git commit -m "feat: add the operations list page"
```

---

## Task 18: `OperationForm` and `/operations/new` page

**Files:**
- Create: `components/operations/operation-form.tsx`, `components/operations/operation-form.test.tsx`, `app/(app)/operations/new/page.tsx`

**Interfaces:**
- Consumes: `createOperationSchema`/`CreateOperationInput` (Task 4); `POST /api/operations` (Task 13); `Department` (existing); `canCreateOperation` (Task 5); `listDepartments` (existing).
- Produces: `OperationForm` component — the `/operations/new` page, following the exact `EmployeeForm`/`app/(app)/employees/new/page.tsx` pattern. No owner picker: `createOperation` (Task 10) already defaults `ownerId` to the caller when omitted, so the form only exposes title/description/department/priority/dates.

- [ ] **Step 1: Write the failing test**

Create `components/operations/operation-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { OperationForm } from "@/components/operations/operation-form";

beforeEach(() => {
  pushMock.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ operation: { id: "op-1" } }),
    })
  );
});

describe("OperationForm", () => {
  it("shows a validation error when submitted empty", async () => {
    render(<OperationForm departments={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /create operation/i }));

    expect(await screen.findByText("Title is required")).toBeInTheDocument();
  });

  it("creates an operation and redirects to its detail page", async () => {
    render(<OperationForm departments={[]} />);

    await userEvent.type(screen.getByLabelText(/title/i), "Vienna Office Relocation");
    await userEvent.click(screen.getByRole("button", { name: /create operation/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/operations/op-1"));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test components/operations/operation-form.test.tsx`
Expected: FAIL — `@/components/operations/operation-form` cannot be found.

- [ ] **Step 3: Implement `components/operations/operation-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createOperationSchema, type CreateOperationInput } from "@/lib/validation/operations";
import type { Department } from "@/lib/domain/departments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PRIORITY_OPTIONS: NonNullable<CreateOperationInput["priority"]>[] = [
  "low",
  "medium",
  "high",
  "critical",
];

export function OperationForm({ departments }: { departments: Department[] }) {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateOperationInput>({
    resolver: zodResolver(createOperationSchema),
    defaultValues: { priority: "medium" },
  });

  async function onSubmit(values: CreateOperationInput) {
    setSubmitError(null);
    const response = await fetch("/api/operations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      const body = await response.json();
      setSubmitError(typeof body.error === "string" ? body.error : "Failed to create operation");
      return;
    }

    const { operation } = await response.json();
    router.push(`/operations/${operation.id}`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 max-w-lg">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" {...register("title")} />
        {errors.title && <p className="text-sm text-red-600">{errors.title.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          {...register("description", { setValueAs: (v) => v || undefined })}
          className="min-h-24 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
        <Label htmlFor="priority">Priority</Label>
        <select
          id="priority"
          {...register("priority")}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="startDate">Start date</Label>
        <Input
          id="startDate"
          type="date"
          {...register("startDate", { setValueAs: (v) => v || undefined })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="targetDate">Target date</Label>
        <Input
          id="targetDate"
          type="date"
          {...register("targetDate", { setValueAs: (v) => v || undefined })}
        />
      </div>

      {submitError && <p className="text-sm text-red-600">{submitError}</p>}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating..." : "Create operation"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test components/operations/operation-form.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Create `app/(app)/operations/new/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { canCreateOperation } from "@/lib/domain/permissions";
import { listDepartments } from "@/lib/domain/departments";
import { BackLink } from "@/components/back-link";
import { OperationForm } from "@/components/operations/operation-form";

export default async function NewOperationPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }
  if (!canCreateOperation(profile)) {
    notFound();
  }

  const departments = await listDepartments(profile.companyId);

  return (
    <div>
      <BackLink href="/operations" />
      <h1 className="text-2xl font-semibold mb-4 mt-2">New operation</h1>
      <OperationForm departments={departments} />
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add components/operations/operation-form.tsx components/operations/operation-form.test.tsx "app/(app)/operations/new/page.tsx"
git commit -m "feat: add the operation creation form and page"
```

---

## Task 19: `OperationLinkPicker` and `OperationUnlinkButton`

**Files:**
- Create: `components/operations/operation-link-picker.tsx`, `components/operations/operation-link-picker.test.tsx`

**Interfaces:**
- Consumes: `POST /api/operations/[id]/link` (Task 15); `GET /api/tasks`, `GET /api/requests`, `GET /api/assets`, `GET /api/employees` (all existing).
- Produces: `OperationLinkPicker({ operationId, entityType })` and `OperationUnlinkButton({ operationId, entityType, entityId })` — consumed by the `/operations/[id]` page (Task 21). One generic component pair parameterized by entity type (unlike the four separate `XOperationControl` components in Tasks 22–25) because all four instances live on the same page in the same role — see the spec's Frontend section for the rationale split.

- [ ] **Step 1: Write the failing test**

Create `components/operations/operation-link-picker.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { OperationLinkPicker, OperationUnlinkButton } from "@/components/operations/operation-link-picker";

beforeEach(() => {
  refreshMock.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (url === "/api/tasks") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ tasks: [{ id: "task-1", title: "Move desks" }] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    })
  );
});

describe("OperationLinkPicker", () => {
  it("links the selected task and refreshes", async () => {
    render(<OperationLinkPicker operationId="op-1" entityType="task" />);

    const select = await screen.findByRole("combobox");
    await userEvent.selectOptions(select, "task-1");
    await userEvent.click(screen.getByRole("button", { name: /^link$/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/operations/op-1/link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "link", entityType: "task", entityId: "task-1" }),
      })
    );
  });
});

describe("OperationUnlinkButton", () => {
  it("unlinks the entity and refreshes", async () => {
    render(<OperationUnlinkButton operationId="op-1" entityType="task" entityId="task-1" />);

    await userEvent.click(screen.getByRole("button", { name: /unlink/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/operations/op-1/link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "unlink", entityType: "task", entityId: "task-1" }),
      })
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test components/operations/operation-link-picker.test.tsx`
Expected: FAIL — `@/components/operations/operation-link-picker` cannot be found.

- [ ] **Step 3: Implement `components/operations/operation-link-picker.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export type LinkableEntityType = "task" | "request" | "asset" | "employee";

interface PickableItem {
  id: string;
  label: string;
}

const ENTITY_CONFIG: Record<
  LinkableEntityType,
  { endpoint: string; responseKey: string; label: (item: Record<string, unknown>) => string }
> = {
  task: { endpoint: "/api/tasks", responseKey: "tasks", label: (item) => String(item.title) },
  request: {
    endpoint: "/api/requests",
    responseKey: "requests",
    label: (item) => String(item.title),
  },
  asset: { endpoint: "/api/assets", responseKey: "assets", label: (item) => String(item.name) },
  employee: {
    endpoint: "/api/employees",
    responseKey: "employees",
    label: (item) => String(item.fullName),
  },
};

export function OperationLinkPicker({
  operationId,
  entityType,
}: {
  operationId: string;
  entityType: LinkableEntityType;
}) {
  const router = useRouter();
  const [items, setItems] = useState<PickableItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const config = ENTITY_CONFIG[entityType];
    fetch(config.endpoint).then(async (response) => {
      if (cancelled || !response.ok) return;
      const body = await response.json();
      const list = (body[config.responseKey] ?? []) as Record<string, unknown>[];
      setItems(list.map((item) => ({ id: String(item.id), label: config.label(item) })));
    });
    return () => {
      cancelled = true;
    };
  }, [entityType]);

  async function link() {
    if (!selectedId) return;
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/operations/${operationId}/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "link", entityType, entityId: selectedId }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to link");
      return;
    }

    setSelectedId("");
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <select
        value={selectedId}
        onChange={(event) => setSelectedId(event.target.value)}
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
      >
        <option value="">Select an item to link</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      <Button variant="outline" disabled={isSubmitting || !selectedId} onClick={link}>
        Link
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function OperationUnlinkButton({
  operationId,
  entityType,
  entityId,
}: {
  operationId: string;
  entityType: LinkableEntityType;
  entityId: string;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function unlink() {
    setIsSubmitting(true);
    const response = await fetch(`/api/operations/${operationId}/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "unlink", entityType, entityId }),
    });
    setIsSubmitting(false);
    if (response.ok) {
      router.refresh();
    }
  }

  return (
    <Button variant="ghost" size="sm" disabled={isSubmitting} onClick={unlink}>
      Unlink
    </Button>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test components/operations/operation-link-picker.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/operations/operation-link-picker.tsx components/operations/operation-link-picker.test.tsx
git commit -m "feat: add OperationLinkPicker and OperationUnlinkButton"
```

---

## Task 20: `OperationComments`

**Files:**
- Create: `components/operations/operation-comments.tsx`

**Interfaces:**
- Consumes: `Comment` (`lib/domain/comments.ts`, existing); `POST /api/operations/[id]/comments` (Task 16).
- Produces: `OperationComments({ operationId, initialComments })` — consumed by the `/operations/[id]` page (Task 21). Mirrors `components/tasks/task-comments.tsx` exactly, save for the API path and prop name. No test file: neither `TaskComments` nor `RequestComments` (the two existing precedents for this exact component shape) have one, so this task matches that established convention rather than adding new rigor unilaterally.

- [ ] **Step 1: Implement `components/operations/operation-comments.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Comment } from "@/lib/domain/comments";
import { Button } from "@/components/ui/button";

export function OperationComments({
  operationId,
  initialComments,
}: {
  operationId: string;
  initialComments: Comment[];
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitComment() {
    if (!body.trim()) return;
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/operations/${operationId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const responseBody = await response.json();
      setError(
        typeof responseBody.error === "string" ? responseBody.error : "Failed to add comment"
      );
      return;
    }

    setBody("");
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">Comments</h2>
      <ul className="flex flex-col gap-2">
        {initialComments.map((comment) => (
          <li key={comment.id} className="text-sm">
            {comment.body}
          </li>
        ))}
        {initialComments.length === 0 && (
          <li className="text-sm text-muted-foreground">No comments yet.</li>
        )}
      </ul>
      <div className="flex flex-col gap-2">
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="min-h-16 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          placeholder="Add a comment..."
        />
        <Button onClick={submitComment} disabled={isSubmitting}>
          {isSubmitting ? "Posting..." : "Post comment"}
        </Button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/operations/operation-comments.tsx
git commit -m "feat: add OperationComments"
```

---

## Task 21: `/operations/[id]` page

**Files:**
- Create: `app/(app)/operations/[id]/page.tsx`

**Interfaces:**
- Consumes: `getOperation` (Task 10); `canManageOperation` (Task 5); `listComments`/`listActivity` (existing); `OperationLinkPicker`/`OperationUnlinkButton` (Task 19); `OperationComments` (Task 20).
- Produces: the operation detail page — assembles everything from Tasks 10, 19, and 20 into one server component, following the exact `EmployeeDetailPage`/`AssetDetailPage` pattern (fetch in the server component, `notFound()` on `NotFoundError`/`ForbiddenError`).

- [ ] **Step 1: Implement `app/(app)/operations/[id]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { getOperation } from "@/lib/domain/operations";
import { listComments } from "@/lib/domain/comments";
import { listActivity } from "@/lib/domain/activity";
import { canManageOperation } from "@/lib/domain/permissions";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import { BackLink } from "@/components/back-link";
import {
  OperationLinkPicker,
  OperationUnlinkButton,
} from "@/components/operations/operation-link-picker";
import { OperationComments } from "@/components/operations/operation-comments";

export default async function OperationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const { id } = await params;

  let detail;
  try {
    detail = await getOperation(profile, id);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      notFound();
    }
    throw error;
  }

  const { operation, progress, tasks, requests, assets, employees } = detail;
  const canManage = canManageOperation(profile, operation);

  const [comments, activity] = await Promise.all([
    listComments("operation", operation.id),
    listActivity("operation", operation.id),
  ]);

  const progressPercent =
    progress.totalTasks === 0
      ? 0
      : Math.round((progress.completedTasks / progress.totalTasks) * 100);

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <BackLink href="/operations" />

      <div>
        <h1 className="text-2xl font-semibold">{operation.title}</h1>
        <p className="text-muted-foreground">
          {operation.status.replace("_", " ")} · {operation.priority}
        </p>
        {operation.description && (
          <p className="mt-2 text-muted-foreground">{operation.description}</p>
        )}
      </div>

      <div className="rounded-md border p-4">
        <p className="text-sm text-muted-foreground">Progress</p>
        <p className="text-2xl font-semibold">
          {progressPercent}% ({progress.completedTasks}/{progress.totalTasks} tasks)
        </p>
      </div>

      <section>
        <h2 className="text-lg font-medium mb-2">Tasks ({tasks.length})</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center justify-between">
              <Link href={`/tasks/${task.id}`} className="hover:underline">
                {task.title}
              </Link>
              {canManage && (
                <OperationUnlinkButton
                  operationId={operation.id}
                  entityType="task"
                  entityId={task.id}
                />
              )}
            </li>
          ))}
          {tasks.length === 0 && <li className="text-muted-foreground">No tasks linked yet.</li>}
        </ul>
        {canManage && <OperationLinkPicker operationId={operation.id} entityType="task" />}
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Requests ({requests.length})</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {requests.map((request) => (
            <li key={request.id} className="flex items-center justify-between">
              <Link href={`/requests/${request.id}`} className="hover:underline">
                {request.title}
              </Link>
              {canManage && (
                <OperationUnlinkButton
                  operationId={operation.id}
                  entityType="request"
                  entityId={request.id}
                />
              )}
            </li>
          ))}
          {requests.length === 0 && (
            <li className="text-muted-foreground">No requests linked yet.</li>
          )}
        </ul>
        {canManage && <OperationLinkPicker operationId={operation.id} entityType="request" />}
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Assets ({assets.length})</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {assets.map((asset) => (
            <li key={asset.id} className="flex items-center justify-between">
              <Link href={`/assets/${asset.id}`} className="hover:underline">
                {asset.name}
              </Link>
              {canManage && (
                <OperationUnlinkButton
                  operationId={operation.id}
                  entityType="asset"
                  entityId={asset.id}
                />
              )}
            </li>
          ))}
          {assets.length === 0 && <li className="text-muted-foreground">No assets linked yet.</li>}
        </ul>
        {canManage && <OperationLinkPicker operationId={operation.id} entityType="asset" />}
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Employees ({employees.length})</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {employees.map((employee) => (
            <li key={employee.id} className="flex items-center justify-between">
              <Link href={`/employees/${employee.id}`} className="hover:underline">
                {employee.fullName}
              </Link>
              {canManage && (
                <OperationUnlinkButton
                  operationId={operation.id}
                  entityType="employee"
                  entityId={employee.id}
                />
              )}
            </li>
          ))}
          {employees.length === 0 && (
            <li className="text-muted-foreground">No employees linked yet.</li>
          )}
        </ul>
        {canManage && <OperationLinkPicker operationId={operation.id} entityType="employee" />}
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Activity</h2>
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {activity.map((entry) => (
            <li key={entry.id}>{entry.message}</li>
          ))}
          {activity.length === 0 && <li>No activity yet.</li>}
        </ul>
      </section>

      <OperationComments operationId={operation.id} initialComments={comments} />
    </div>
  );
}
```

- [ ] **Step 2: Verify the project builds**

Run: `pnpm build`
Expected: build completes with no errors (confirms `getOperation`'s `OperationDetail` shape lines up with what this page destructures, and every linked-item route exists).

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/operations/[id]/page.tsx"
git commit -m "feat: add the operation detail page"
```

---

## Task 22: `TaskOperationControl` and wiring into the task detail page

**Files:**
- Create: `components/tasks/task-operation-control.tsx`, `components/tasks/task-operation-control.test.tsx`
- Modify: `app/(app)/tasks/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/operations` and `GET /api/operations/[id]` (Tasks 13–14); `POST /api/operations/[id]/link` (Task 15); `Task.relatedOperationId` (Task 6); `canCreateOperation` (Task 5).
- Produces: `TaskOperationControl({ taskId, relatedOperationId })` — the first of four small, near-identical `XOperationControl` components (see the spec's Frontend section for why these stay separate rather than one generalized component, unlike `OperationLinkPicker`).

- [ ] **Step 1: Write the failing test**

Create `components/tasks/task-operation-control.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { TaskOperationControl } from "@/components/tasks/task-operation-control";

beforeEach(() => {
  refreshMock.mockReset();
});

describe("TaskOperationControl", () => {
  it("shows a picker and links the selected operation when unlinked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/operations") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ operations: [{ id: "op-1", title: "Vienna Relocation" }] }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );

    render(<TaskOperationControl taskId="task-1" relatedOperationId={null} />);

    const select = await screen.findByLabelText(/operation/i);
    await userEvent.selectOptions(select, "op-1");
    await userEvent.click(screen.getByRole("button", { name: /^link$/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/operations/op-1/link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "link", entityType: "task", entityId: "task-1" }),
      })
    );
  });

  it("shows the linked operation's title and unlinks it when already linked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/operations/op-1") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ operation: { id: "op-1", title: "Vienna Relocation" } }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );

    render(<TaskOperationControl taskId="task-1" relatedOperationId="op-1" />);

    expect(await screen.findByText("Vienna Relocation")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /unlink/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/operations/op-1/link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "unlink", entityType: "task", entityId: "task-1" }),
      })
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test components/tasks/task-operation-control.test.tsx`
Expected: FAIL — `@/components/tasks/task-operation-control` cannot be found.

- [ ] **Step 3: Implement `components/tasks/task-operation-control.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface OperationOption {
  id: string;
  title: string;
}

export function TaskOperationControl({
  taskId,
  relatedOperationId,
}: {
  taskId: string;
  relatedOperationId: string | null;
}) {
  const router = useRouter();
  const [operations, setOperations] = useState<OperationOption[]>([]);
  const [linkedTitle, setLinkedTitle] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (relatedOperationId) {
      fetch(`/api/operations/${relatedOperationId}`).then(async (response) => {
        if (cancelled || !response.ok) return;
        const body = await response.json();
        setLinkedTitle(body.operation.title);
      });
    } else {
      fetch("/api/operations").then(async (response) => {
        if (cancelled || !response.ok) return;
        const body = await response.json();
        setOperations(body.operations);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [relatedOperationId]);

  async function link() {
    if (!selectedId) return;
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/operations/${selectedId}/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "link", entityType: "task", entityId: taskId }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to link operation");
      return;
    }

    router.refresh();
  }

  async function unlink() {
    if (!relatedOperationId) return;
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/operations/${relatedOperationId}/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "unlink", entityType: "task", entityId: taskId }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to unlink operation");
      return;
    }

    router.refresh();
  }

  if (relatedOperationId) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Operation:</span>
        <Link href={`/operations/${relatedOperationId}`} className="hover:underline">
          {linkedTitle ?? "Loading..."}
        </Link>
        <Button variant="ghost" size="sm" disabled={isSubmitting} onClick={unlink}>
          Unlink
        </Button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="task-link-operation">Operation</Label>
      <div className="flex gap-2">
        <select
          id="task-link-operation"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">Select an operation</option>
          {operations.map((operation) => (
            <option key={operation.id} value={operation.id}>
              {operation.title}
            </option>
          ))}
        </select>
        <Button variant="outline" disabled={isSubmitting || !selectedId} onClick={link}>
          Link
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test components/tasks/task-operation-control.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire it into the task detail page**

In `app/(app)/tasks/[id]/page.tsx`, add the import:

```ts
import { canCreateOperation } from "@/lib/domain/permissions";
import { TaskOperationControl } from "@/components/tasks/task-operation-control";
```

and render it after `TaskStatusControl`/`TaskAssetAssignmentForm`, before the Activity section:

```tsx
      <TaskStatusControl
        taskId={task.id}
        currentStatus={task.status}
        hideCompletedTransition={showAssetForm}
      />
      {showAssetForm && <TaskAssetAssignmentForm taskId={task.id} />}
      {canCreateOperation(profile) && (
        <TaskOperationControl taskId={task.id} relatedOperationId={task.relatedOperationId} />
      )}
```

- [ ] **Step 6: Verify the project builds**

Run: `pnpm build`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/tasks/task-operation-control.tsx components/tasks/task-operation-control.test.tsx "app/(app)/tasks/[id]/page.tsx"
git commit -m "feat: wire operation linking into the task detail page"
```

---

## Task 23: `RequestOperationControl` and wiring into the request detail page

**Files:**
- Create: `components/requests/request-operation-control.tsx`, `components/requests/request-operation-control.test.tsx`
- Modify: `app/(app)/requests/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/operations` and `GET /api/operations/[id]` (Tasks 13–14); `POST /api/operations/[id]/link` (Task 15); `Request.relatedOperationId` (Task 7); `canCreateOperation` (Task 5).
- Produces: `RequestOperationControl({ requestId, relatedOperationId })`.

- [ ] **Step 1: Write the failing test**

Create `components/requests/request-operation-control.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { RequestOperationControl } from "@/components/requests/request-operation-control";

beforeEach(() => {
  refreshMock.mockReset();
});

describe("RequestOperationControl", () => {
  it("shows a picker and links the selected operation when unlinked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/operations") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ operations: [{ id: "op-1", title: "Vienna Relocation" }] }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );

    render(<RequestOperationControl requestId="request-1" relatedOperationId={null} />);

    const select = await screen.findByLabelText(/operation/i);
    await userEvent.selectOptions(select, "op-1");
    await userEvent.click(screen.getByRole("button", { name: /^link$/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/operations/op-1/link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "link", entityType: "request", entityId: "request-1" }),
      })
    );
  });

  it("shows the linked operation's title and unlinks it when already linked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/operations/op-1") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ operation: { id: "op-1", title: "Vienna Relocation" } }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );

    render(<RequestOperationControl requestId="request-1" relatedOperationId="op-1" />);

    expect(await screen.findByText("Vienna Relocation")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /unlink/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/operations/op-1/link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "unlink", entityType: "request", entityId: "request-1" }),
      })
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test components/requests/request-operation-control.test.tsx`
Expected: FAIL — `@/components/requests/request-operation-control` cannot be found.

- [ ] **Step 3: Implement `components/requests/request-operation-control.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface OperationOption {
  id: string;
  title: string;
}

export function RequestOperationControl({
  requestId,
  relatedOperationId,
}: {
  requestId: string;
  relatedOperationId: string | null;
}) {
  const router = useRouter();
  const [operations, setOperations] = useState<OperationOption[]>([]);
  const [linkedTitle, setLinkedTitle] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (relatedOperationId) {
      fetch(`/api/operations/${relatedOperationId}`).then(async (response) => {
        if (cancelled || !response.ok) return;
        const body = await response.json();
        setLinkedTitle(body.operation.title);
      });
    } else {
      fetch("/api/operations").then(async (response) => {
        if (cancelled || !response.ok) return;
        const body = await response.json();
        setOperations(body.operations);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [relatedOperationId]);

  async function link() {
    if (!selectedId) return;
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/operations/${selectedId}/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "link", entityType: "request", entityId: requestId }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to link operation");
      return;
    }

    router.refresh();
  }

  async function unlink() {
    if (!relatedOperationId) return;
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/operations/${relatedOperationId}/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "unlink", entityType: "request", entityId: requestId }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to unlink operation");
      return;
    }

    router.refresh();
  }

  if (relatedOperationId) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Operation:</span>
        <Link href={`/operations/${relatedOperationId}`} className="hover:underline">
          {linkedTitle ?? "Loading..."}
        </Link>
        <Button variant="ghost" size="sm" disabled={isSubmitting} onClick={unlink}>
          Unlink
        </Button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="request-link-operation">Operation</Label>
      <div className="flex gap-2">
        <select
          id="request-link-operation"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">Select an operation</option>
          {operations.map((operation) => (
            <option key={operation.id} value={operation.id}>
              {operation.title}
            </option>
          ))}
        </select>
        <Button variant="outline" disabled={isSubmitting || !selectedId} onClick={link}>
          Link
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test components/requests/request-operation-control.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire it into the request detail page**

In `app/(app)/requests/[id]/page.tsx`, add the import:

```ts
import { canCreateOperation } from "@/lib/domain/permissions";
import { RequestOperationControl } from "@/components/requests/request-operation-control";
```

(Note: `canDecideApproval` is already imported from `@/lib/domain/permissions` in this file — add `canCreateOperation` to that same import line rather than a new one.)

Render it after the `RequestReassignControl` block, before the Activity section:

```tsx
      {canDecide && approval && approverProfile && (
        <RequestReassignControl
          approvalId={approval.id}
          currentApproverRole={approverProfile.role}
        />
      )}

      {canCreateOperation(profile) && (
        <RequestOperationControl
          requestId={request.id}
          relatedOperationId={request.relatedOperationId}
        />
      )}
```

- [ ] **Step 6: Verify the project builds**

Run: `pnpm build`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/requests/request-operation-control.tsx components/requests/request-operation-control.test.tsx "app/(app)/requests/[id]/page.tsx"
git commit -m "feat: wire operation linking into the request detail page"
```

---

## Task 24: `AssetOperationControl` and wiring into the asset detail page

**Files:**
- Create: `components/assets/asset-operation-control.tsx`, `components/assets/asset-operation-control.test.tsx`
- Modify: `app/(app)/assets/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/operations` and `GET /api/operations/[id]` (Tasks 13–14); `POST /api/operations/[id]/link` (Task 15); `Asset.relatedOperationId` (Task 8); `canCreateOperation` (Task 5).
- Produces: `AssetOperationControl({ assetId, relatedOperationId })`.

- [ ] **Step 1: Write the failing test**

Create `components/assets/asset-operation-control.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { AssetOperationControl } from "@/components/assets/asset-operation-control";

beforeEach(() => {
  refreshMock.mockReset();
});

describe("AssetOperationControl", () => {
  it("shows a picker and links the selected operation when unlinked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/operations") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ operations: [{ id: "op-1", title: "Vienna Relocation" }] }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );

    render(<AssetOperationControl assetId="asset-1" relatedOperationId={null} />);

    const select = await screen.findByLabelText(/operation/i);
    await userEvent.selectOptions(select, "op-1");
    await userEvent.click(screen.getByRole("button", { name: /^link$/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/operations/op-1/link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "link", entityType: "asset", entityId: "asset-1" }),
      })
    );
  });

  it("shows the linked operation's title and unlinks it when already linked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/operations/op-1") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ operation: { id: "op-1", title: "Vienna Relocation" } }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );

    render(<AssetOperationControl assetId="asset-1" relatedOperationId="op-1" />);

    expect(await screen.findByText("Vienna Relocation")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /unlink/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/operations/op-1/link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "unlink", entityType: "asset", entityId: "asset-1" }),
      })
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test components/assets/asset-operation-control.test.tsx`
Expected: FAIL — `@/components/assets/asset-operation-control` cannot be found.

- [ ] **Step 3: Implement `components/assets/asset-operation-control.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface OperationOption {
  id: string;
  title: string;
}

export function AssetOperationControl({
  assetId,
  relatedOperationId,
}: {
  assetId: string;
  relatedOperationId: string | null;
}) {
  const router = useRouter();
  const [operations, setOperations] = useState<OperationOption[]>([]);
  const [linkedTitle, setLinkedTitle] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (relatedOperationId) {
      fetch(`/api/operations/${relatedOperationId}`).then(async (response) => {
        if (cancelled || !response.ok) return;
        const body = await response.json();
        setLinkedTitle(body.operation.title);
      });
    } else {
      fetch("/api/operations").then(async (response) => {
        if (cancelled || !response.ok) return;
        const body = await response.json();
        setOperations(body.operations);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [relatedOperationId]);

  async function link() {
    if (!selectedId) return;
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/operations/${selectedId}/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "link", entityType: "asset", entityId: assetId }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to link operation");
      return;
    }

    router.refresh();
  }

  async function unlink() {
    if (!relatedOperationId) return;
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/operations/${relatedOperationId}/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "unlink", entityType: "asset", entityId: assetId }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to unlink operation");
      return;
    }

    router.refresh();
  }

  if (relatedOperationId) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Operation:</span>
        <Link href={`/operations/${relatedOperationId}`} className="hover:underline">
          {linkedTitle ?? "Loading..."}
        </Link>
        <Button variant="ghost" size="sm" disabled={isSubmitting} onClick={unlink}>
          Unlink
        </Button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="asset-link-operation">Operation</Label>
      <div className="flex gap-2">
        <select
          id="asset-link-operation"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">Select an operation</option>
          {operations.map((operation) => (
            <option key={operation.id} value={operation.id}>
              {operation.title}
            </option>
          ))}
        </select>
        <Button variant="outline" disabled={isSubmitting || !selectedId} onClick={link}>
          Link
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test components/assets/asset-operation-control.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire it into the asset detail page**

In `app/(app)/assets/[id]/page.tsx`, add the import:

```ts
import { AssetOperationControl } from "@/components/assets/asset-operation-control";
```

(`canAssignAsset`/`canChangeAssetStatus` are already imported from `@/lib/domain/permissions` in this file; add `canCreateOperation` to that same import line.)

Render it after the existing `AssetReportIssueForm`, before the Activity section:

```tsx
      {canAssignAsset(profile, asset) && <AssetAssignControl assetId={asset.id} />}
      {canChangeAssetStatus(profile, asset) && (
        <AssetStatusControl assetId={asset.id} currentStatus={asset.status} />
      )}
      <AssetReportIssueForm assetId={asset.id} />
      {canCreateOperation(profile) && (
        <AssetOperationControl assetId={asset.id} relatedOperationId={asset.relatedOperationId} />
      )}
```

- [ ] **Step 6: Verify the project builds**

Run: `pnpm build`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/assets/asset-operation-control.tsx components/assets/asset-operation-control.test.tsx "app/(app)/assets/[id]/page.tsx"
git commit -m "feat: wire operation linking into the asset detail page"
```

---

## Task 25: `EmployeeOperationControl` and wiring into the employee detail page

**Files:**
- Create: `components/employees/employee-operation-control.tsx`, `components/employees/employee-operation-control.test.tsx`
- Modify: `app/(app)/employees/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/operations` and `GET /api/operations/[id]` (Tasks 13–14); `POST /api/operations/[id]/link` (Task 15); `Profile.relatedOperationId` (Task 9, exposed here as `Employee.relatedOperationId` since `Employee = Profile`); `canCreateOperation` (Task 5).
- Produces: `EmployeeOperationControl({ employeeId, relatedOperationId })`.

- [ ] **Step 1: Write the failing test**

Create `components/employees/employee-operation-control.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { EmployeeOperationControl } from "@/components/employees/employee-operation-control";

beforeEach(() => {
  refreshMock.mockReset();
});

describe("EmployeeOperationControl", () => {
  it("shows a picker and links the selected operation when unlinked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/operations") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ operations: [{ id: "op-1", title: "Vienna Relocation" }] }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );

    render(<EmployeeOperationControl employeeId="employee-1" relatedOperationId={null} />);

    const select = await screen.findByLabelText(/operation/i);
    await userEvent.selectOptions(select, "op-1");
    await userEvent.click(screen.getByRole("button", { name: /^link$/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/operations/op-1/link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "link", entityType: "employee", entityId: "employee-1" }),
      })
    );
  });

  it("shows the linked operation's title and unlinks it when already linked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/operations/op-1") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ operation: { id: "op-1", title: "Vienna Relocation" } }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );

    render(<EmployeeOperationControl employeeId="employee-1" relatedOperationId="op-1" />);

    expect(await screen.findByText("Vienna Relocation")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /unlink/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/operations/op-1/link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "unlink", entityType: "employee", entityId: "employee-1" }),
      })
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test components/employees/employee-operation-control.test.tsx`
Expected: FAIL — `@/components/employees/employee-operation-control` cannot be found.

- [ ] **Step 3: Implement `components/employees/employee-operation-control.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface OperationOption {
  id: string;
  title: string;
}

export function EmployeeOperationControl({
  employeeId,
  relatedOperationId,
}: {
  employeeId: string;
  relatedOperationId: string | null;
}) {
  const router = useRouter();
  const [operations, setOperations] = useState<OperationOption[]>([]);
  const [linkedTitle, setLinkedTitle] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (relatedOperationId) {
      fetch(`/api/operations/${relatedOperationId}`).then(async (response) => {
        if (cancelled || !response.ok) return;
        const body = await response.json();
        setLinkedTitle(body.operation.title);
      });
    } else {
      fetch("/api/operations").then(async (response) => {
        if (cancelled || !response.ok) return;
        const body = await response.json();
        setOperations(body.operations);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [relatedOperationId]);

  async function link() {
    if (!selectedId) return;
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/operations/${selectedId}/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "link", entityType: "employee", entityId: employeeId }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to link operation");
      return;
    }

    router.refresh();
  }

  async function unlink() {
    if (!relatedOperationId) return;
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/operations/${relatedOperationId}/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "unlink", entityType: "employee", entityId: employeeId }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to unlink operation");
      return;
    }

    router.refresh();
  }

  if (relatedOperationId) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Operation:</span>
        <Link href={`/operations/${relatedOperationId}`} className="hover:underline">
          {linkedTitle ?? "Loading..."}
        </Link>
        <Button variant="ghost" size="sm" disabled={isSubmitting} onClick={unlink}>
          Unlink
        </Button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="employee-link-operation">Operation</Label>
      <div className="flex gap-2">
        <select
          id="employee-link-operation"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">Select an operation</option>
          {operations.map((operation) => (
            <option key={operation.id} value={operation.id}>
              {operation.title}
            </option>
          ))}
        </select>
        <Button variant="outline" disabled={isSubmitting || !selectedId} onClick={link}>
          Link
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test components/employees/employee-operation-control.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire it into the employee detail page**

In `app/(app)/employees/[id]/page.tsx`, add the import:

```ts
import { EmployeeOperationControl } from "@/components/employees/employee-operation-control";
```

Render it after the counts grid, before the Activity section — this page has no permissions import yet, so gate on the `profile` (the viewer, already in scope) directly:

```tsx
import { canCreateOperation } from "@/lib/domain/permissions";
```

```tsx
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

      {canCreateOperation(profile) && (
        <EmployeeOperationControl
          employeeId={employee.id}
          relatedOperationId={employee.relatedOperationId}
        />
      )}
```

- [ ] **Step 6: Verify the project builds**

Run: `pnpm build`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/employees/employee-operation-control.tsx components/employees/employee-operation-control.test.tsx "app/(app)/employees/[id]/page.tsx"
git commit -m "feat: wire operation linking into the employee detail page"
```

---

## Task 26: Full verification and status board update

**Files:**
- Modify: `docs/STATUS.md`

**Interfaces:** none — this task only verifies and documents.

- [ ] **Step 1: Run the full unit suite**

Run: `pnpm test:unit`
Expected: PASS, zero failures.

- [ ] **Step 2: Run the full integration suite**

Run: `pnpm test:integration`
Expected: PASS, zero failures. (Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`; if a run fails only on setup with a duplicate-key error on one of this plan's own company slugs, see the Global Constraints sandbox note — clean up the stale row and retry once.)

- [ ] **Step 3: Run the production build**

Run: `pnpm build`
Expected: build completes with no type errors and no route errors.

- [ ] **Step 4: Run the seed script against the live project**

Run: `pnpm seed`
Expected: completes without error — confirms none of this phase's migrations broke the existing seed flow (seeding never touches `operations`, so this is a pure regression check).

- [ ] **Step 5: Update `docs/STATUS.md`**

Move the Phase 6 entry from **Backlog** to **In Progress**.

Change:

```markdown
## Backlog

Not started yet. See `docs/superpowers/plans/2026-08-26-remaining-phases-outline.md` for the full breakdown of each.

- **Phase 6 — Operations**: higher-level grouping over tasks/requests/assets/employees.
- **Phase 7 — Dashboard/Overview**: replaces the Foundation placeholder dashboard with the real one, built from a shadcn/ui dashboard block (see `docs/architecture.md` §3).
```

to:

```markdown
## Backlog

Not started yet. See `docs/superpowers/plans/2026-08-26-remaining-phases-outline.md` for the full breakdown of each.

- **Phase 7 — Dashboard/Overview**: replaces the Foundation placeholder dashboard with the real one, built from a shadcn/ui dashboard block (see `docs/architecture.md` §3).
```

Change:

```markdown
## In Progress

_(nothing right now)_
```

to:

```markdown
## In Progress

- **Phase 6 — Operations**: higher-level grouping object linking tasks/requests/assets/employees to a larger initiative, with a company-wide-visible operation detail page showing linked-item lists and task-completion progress. Spec: `docs/superpowers/specs/2026-09-13-phase6-operations-design.md`. Plan: `docs/superpowers/plans/2026-09-13-phase6-operations.md`.
```

- [ ] **Step 6: Commit**

```bash
git add docs/STATUS.md
git commit -m "docs: move phase 6 to in progress on the status board"
```

---
