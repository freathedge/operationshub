# Phase 2 — Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first full entity through the whole stack — task CRUD, statuses, priorities, comments, activity log, attachments, RBAC, and Realtime broadcast — so every later phase (Requests, Workflows, Employees, Assets, Operations) reuses an already-proven pattern.

**Architecture:** Thin Next.js Route Handlers under `app/api/tasks/**` validate with Zod and delegate to a domain layer (`lib/domain/**`) that is the sole authorization boundary (via `lib/domain/permissions.ts`) and the sole place that talks to Supabase Postgres (service-role key). `comments` and `activity_log` are generic, polymorphic (`entity_type`/`entity_id`) modules reused by every entity from here on — this phase is where they're built. Realtime uses the broadcast-only pattern (`lib/realtime/broadcast.ts` server-side, `useBroadcastListener` client-side hook) — no payload data over the wire, just change signals that trigger a refetch. The task list page is the project's first use of React Query; the task detail page is a Server Component that calls the domain layer in-process (same non-violation rationale as the Foundation-phase app shell) with small Client Component islands for the interactive controls.

**Tech Stack:** Everything from the Foundation plan, plus `@tanstack/react-query` (added in Task 6) and two more shadcn/ui components (`table`, `badge`, added in Task 21).

**Spec:** `docs/superpowers/specs/2026-08-27-phase2-tasks-design.md` (also see `docs/architecture.md` and `docs/superpowers/plans/2026-08-26-remaining-phases-outline.md`'s "Phase 2 — Tasks" section)

## Global Constraints

- REST API (Next.js Route Handlers) is the sole authorization boundary. RLS stays disabled on every table; the service-role key is used server-side only (`lib/domain/**`), never shipped to the browser.
- **The schema-USAGE gap must be closed before any Phase 2 table is created — this is Task 1, not optional.** Live-verified while writing this plan (2026-08-27): `select has_schema_privilege('anon','public','usage'), has_schema_privilege('authenticated','public','usage');` currently returns `true, true` on the hosted project. Full background: spec §1, `docs/architecture.md` §2, `docs/superpowers/plans/2026-08-26-foundation.md` Global Constraints.
- Verify after every migration in this plan: `select table_name, grantee from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated');` must return zero rows, and the `has_schema_privilege` query above must return `false, false`.
- Hosted Supabase project (no local Docker/CLI dev stack). `project_id` = `yqzcunssgvffischmwle` (confirmed live, `ACTIVE_HEALTHY`, while writing this plan). Schema changes (DDL) are applied with the `mcp__claude_ai_Supabase__apply_migration` tool (`project_id`, `name`, `query`) — this is the current tool name; if it is unavailable to you, report NEEDS_CONTEXT rather than falling back to the Supabase CLI (no local dev stack exists in this environment). Use `mcp__claude_ai_Supabase__list_migrations` and `mcp__claude_ai_Supabase__list_tables` to verify, and `mcp__claude_ai_Supabase__execute_sql` for the verification queries above.
- **Migration filenames must match the version `apply_migration` actually assigns.** After calling `apply_migration`, call `list_migrations` and rename the local file to `<version-from-list_migrations>_<name>.sql` before committing.
- The domain layer's Supabase clients are typed against `lib/supabase/database.types.ts` (`SupabaseClient<Database>`). Every migration task in this plan must be followed by regenerating this file (Task 6 does the first regeneration, after all five Phase 2 migrations are applied) — code in later tasks that calls `.from("tasks")`, `.from("comments")`, etc. will not type-check until this file includes those tables.
- Single fictional company (AlpenTech Industries) — no multi-tenant isolation logic; every table still carries or resolves to a `company_id` for consistency with later phases.
- Package manager: pnpm (v10.x). Node.js v22+. TypeScript strict mode throughout.
- `server-only`-guarded modules (`lib/supabase/admin.ts`) resolve correctly under Vitest via the `server-only` → `node_modules/server-only/empty.js` alias already in `vitest.config.ts` — no changes needed there.
- Integration tests that hit the live Supabase project use `describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)` (see `lib/domain/profiles.test.ts`) so `pnpm test:unit` / CI-without-secrets stays green. Every new integration test file must be added to **both** the `--exclude` list in `test:unit` and the file list in `test:integration` in `package.json`, in the task that introduces it.
- Test/domain-object convention: DB rows are `snake_case`; domain objects returned by `lib/domain/**` functions are `camelCase`, via a private `toX(row)` mapper and a `X_COLUMNS` column-list constant per file — follow `lib/domain/profiles.ts` exactly.
- Every task ends with a commit. Commit messages use the `feat:`/`chore:`/`test:` conventional prefix matching the task's nature.
- This plan assumes it runs inside its own git worktree/branch per `docs/CLAUDE.md`'s branching convention (e.g. `phase2-tasks-plan`) — not directly on `main`.

---

## Task 1: Migration — close the schema-USAGE gap

**Files:**
- Create: `supabase/migrations/<timestamp>_close_schema_usage_gap.sql`

**Interfaces:**
- Produces: `anon`/`authenticated` denied `USAGE` on schema `public`, closing the gap described in the Global Constraints above. Every later migration in this plan depends on this running first.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/<YYYYMMDDHHMMSS>_close_schema_usage_gap.sql` (current UTC timestamp) with:

```sql
revoke usage on schema public from public;
```

**Note (ruled on during execution, 2026-08-27):** the plan originally also specified `alter default privileges for role supabase_admin in schema public revoke all on tables from anon, authenticated;` as defense-in-depth. `mcp__claude_ai_Supabase__apply_migration` executes as role `postgres`, which is not a member of `supabase_admin` and cannot alter that role's default privileges (`42501: permission denied to change default privileges`) — Postgres only allows `ALTER DEFAULT PRIVILEGES FOR ROLE X` to be run by `X` itself, a member of `X`, or a superuser, and the hosted `postgres` role is none of those. This statement is dropped. It is not load-bearing: every migration in this plan (including Tasks 2–5) runs via `apply_migration` as `postgres`, so every table this plan creates is already covered by the existing Foundation-phase migration `20260826230306_revoke_anon_authenticated_table_grants.sql`'s default-privilege revoke (which is correctly scoped to the `postgres` grantor). The `supabase_admin` default ACL only matters for tables created through a different path (e.g. the Supabase Studio UI) — out of scope for this plan — and even then, the schema-`USAGE` revoke below is what actually blocks `anon`/`authenticated` from reaching *any* object in `public`, regardless of that object's own grants or default privileges. The single `revoke usage` statement is therefore sufficient to close the gap for everything this plan touches.

- [ ] **Step 2: Apply the migration**

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id: "yqzcunssgvffischmwle"`, `name: "close_schema_usage_gap"`, `query` set to the exact SQL from Step 1.

- [ ] **Step 3: Verify the gap is closed**

Use `mcp__claude_ai_Supabase__execute_sql` with `project_id: "yqzcunssgvffischmwle"` and query:

```sql
select has_schema_privilege('anon','public','usage') as anon_usage,
       has_schema_privilege('authenticated','public','usage') as authenticated_usage;
```

Expected: `{"anon_usage": false, "authenticated_usage": false}`. If either is still `true`, stop and report NEEDS_CONTEXT — do not proceed to Task 2 with the gap still open.

- [ ] **Step 4: Rename the local file to match the applied version**

Call `mcp__claude_ai_Supabase__list_migrations` with `project_id: "yqzcunssgvffischmwle"`. Rename the local file to `supabase/migrations/<version>_close_schema_usage_gap.sql` using the version `list_migrations` reports for this migration.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "fix: close the schema-USAGE gap left over from Foundation"
```

---

## Task 2: Migration — tasks table

**Files:**
- Create: `supabase/migrations/<timestamp>_create_tasks.sql`

**Interfaces:**
- Consumes: `companies`, `departments`, `profiles` (Foundation phase).
- Produces: enums `task_status` (`todo|in_progress|blocked|completed|cancelled`) and `task_priority` (`low|medium|high|critical`); table `tasks(id, company_id, title, description, status, priority, assignee_id, creator_id, department_id, related_employee_id, due_date, completed_at, created_at)`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/<YYYYMMDDHHMMSS>_create_tasks.sql` (timestamp later than Task 1's) with:

```sql
create type task_status as enum (
  'todo',
  'in_progress',
  'blocked',
  'completed',
  'cancelled'
);

create type task_priority as enum (
  'low',
  'medium',
  'high',
  'critical'
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  title text not null,
  description text,
  status task_status not null default 'todo',
  priority task_priority not null default 'medium',
  assignee_id uuid references profiles(id) on delete set null,
  creator_id uuid not null references profiles(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  related_employee_id uuid references profiles(id) on delete set null,
  due_date timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index tasks_company_id_idx on tasks(company_id);
create index tasks_assignee_id_idx on tasks(assignee_id);
create index tasks_department_id_idx on tasks(department_id);
create index tasks_status_idx on tasks(status);
```

- [ ] **Step 2: Apply the migration**

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id: "yqzcunssgvffischmwle"`, `name: "create_tasks"`, `query` set to the exact SQL from Step 1.

- [ ] **Step 3: Verify the table exists and carries no anon/authenticated grants**

Use `mcp__claude_ai_Supabase__list_tables` (`project_id: "yqzcunssgvffischmwle"`, `schemas: ["public"]`) — expect `tasks` in the result.

Use `mcp__claude_ai_Supabase__execute_sql` with:
```sql
select table_name, grantee from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'tasks' and grantee in ('anon','authenticated');
```
Expected: zero rows.

- [ ] **Step 4: Rename the local file to match the applied version**

Call `mcp__claude_ai_Supabase__list_migrations`, rename the local file to `<version>_create_tasks.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add tasks table"
```

---

## Task 3: Migration — comments table

**Files:**
- Create: `supabase/migrations/<timestamp>_create_comments.sql`

**Interfaces:**
- Consumes: `profiles`.
- Produces: table `comments(id, entity_type, entity_id, author_id, body, created_at)` — generic/polymorphic, reused by every entity from here on.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/<YYYYMMDDHHMMSS>_create_comments.sql` with:

```sql
create table comments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  author_id uuid not null references profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index comments_entity_idx on comments(entity_type, entity_id);
```

- [ ] **Step 2: Apply the migration**

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id: "yqzcunssgvffischmwle"`, `name: "create_comments"`, `query` set to the exact SQL from Step 1.

- [ ] **Step 3: Verify**

`list_tables` → expect `comments`. `execute_sql` grants query (as in Task 2 Step 3, `table_name = 'comments'`) → expect zero rows.

- [ ] **Step 4: Rename the local file**

`list_migrations` → rename to `<version>_create_comments.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add comments table"
```

---

## Task 4: Migration — activity_log table

**Files:**
- Create: `supabase/migrations/<timestamp>_create_activity_log.sql`

**Interfaces:**
- Consumes: `profiles`.
- Produces: table `activity_log(id, entity_type, entity_id, actor_id, message, created_at)` — generic/polymorphic, reused by every entity from here on.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/<YYYYMMDDHHMMSS>_create_activity_log.sql` with:

```sql
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  actor_id uuid references profiles(id) on delete set null,
  message text not null,
  created_at timestamptz not null default now()
);

create index activity_log_entity_idx on activity_log(entity_type, entity_id);
```

- [ ] **Step 2: Apply the migration**

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id: "yqzcunssgvffischmwle"`, `name: "create_activity_log"`, `query` set to the exact SQL from Step 1.

- [ ] **Step 3: Verify**

`list_tables` → expect `activity_log`. Grants query (`table_name = 'activity_log'`) → expect zero rows.

- [ ] **Step 4: Rename the local file**

`list_migrations` → rename to `<version>_create_activity_log.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add activity_log table"
```

---

## Task 5: Migration — attachments table and storage bucket

**Files:**
- Create: `supabase/migrations/<timestamp>_create_attachments.sql`

**Interfaces:**
- Consumes: `profiles`.
- Produces: table `attachments(id, entity_type, entity_id, storage_path, uploaded_by, created_at)`; a private Storage bucket named `attachments`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/<YYYYMMDDHHMMSS>_create_attachments.sql` with:

```sql
create table attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  storage_path text not null,
  uploaded_by uuid not null references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index attachments_entity_idx on attachments(entity_type, entity_id);

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;
```

- [ ] **Step 2: Apply the migration**

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id: "yqzcunssgvffischmwle"`, `name: "create_attachments"`, `query` set to the exact SQL from Step 1.

- [ ] **Step 3: Verify**

`list_tables` → expect `attachments`. Grants query (`table_name = 'attachments'`) → expect zero rows.

Use `mcp__claude_ai_Supabase__execute_sql` with `select id, public from storage.buckets where id = 'attachments';` → expect one row, `public = false`.

- [ ] **Step 4: Rename the local file**

`list_migrations` → rename to `<version>_create_attachments.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add attachments table and storage bucket"
```

---

## Task 6: Regenerate Supabase types, add React Query

**Files:**
- Modify: `lib/supabase/database.types.ts`, `package.json`

**Interfaces:**
- Produces: `Database["public"]["Tables"]` including `tasks`, `comments`, `activity_log`, `attachments`, matching the migrations from Tasks 2–5. `@tanstack/react-query` added as a runtime dependency (first use is Task 22's `TaskListView`).

- [ ] **Step 1: Regenerate the database types**

Call `mcp__claude_ai_Supabase__generate_typescript_types` with `project_id: "yqzcunssgvffischmwle"`. Overwrite `lib/supabase/database.types.ts` with the tool's `types` field verbatim, replacing the entire current file content.

- [ ] **Step 2: Install React Query**

```bash
pnpm add @tanstack/react-query
```

- [ ] **Step 3: Verify the project builds**

Run: `pnpm build`
Expected: build completes with no errors (existing domain code — `companies.ts`, `profiles.ts`, `seed.ts` — must still type-check against the regenerated `Database` type).

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/database.types.ts package.json pnpm-lock.yaml
git commit -m "chore: regenerate Supabase types for Phase 2 tables, add React Query"
```

---

## Task 7: Profiles domain extension and session helper

**Files:**
- Modify: `lib/domain/profiles.ts`, `lib/domain/profiles.test.ts`
- Create: `lib/auth/session.ts`
- Test: `lib/auth/session.test.ts`

**Interfaces:**
- Consumes: `Profile`, `getProfileByAuthUserId` (existing, Foundation), `createSupabaseServerClient` (existing, Foundation).
- Produces: `getProfileById(id: string): Promise<Profile | null>`; `createProfile` extended to accept optional `departmentId`/`managerId`; `getCurrentProfile(): Promise<Profile | null>` — consumed by every API route task from Task 16 onward and by the frontend pages in Tasks 22–24.

- [ ] **Step 1: Write the failing tests**

In `lib/domain/profiles.test.ts`, add `getProfileById` to the import and add these two `it` blocks inside the existing `describe("createProfile / getProfileByAuthUserId", ...)` block (rename the describe title to `"createProfile / getProfileByAuthUserId / getProfileById"`):

```ts
import { createProfile, getProfileByAuthUserId, getProfileById } from "@/lib/domain/profiles";
```

```ts
  it("creates a profile with a department and manager, and retrieves it by id", async () => {
    const { data: managerAuthUser, error: managerAuthError } =
      await supabase.auth.admin.createUser({
        email: `profile-test-manager-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
    if (managerAuthError || !managerAuthUser.user) throw managerAuthError;
    createdAuthUserIds.push(managerAuthUser.user.id);
    const manager = await createProfile({
      authUserId: managerAuthUser.user.id,
      companyId,
      fullName: "Test Manager",
      role: "manager",
    });

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
      fullName: "Test Employee",
      role: "employee",
      managerId: manager.id,
    });
    expect(created.managerId).toBe(manager.id);

    const fetched = await getProfileById(created.id);
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.managerId).toBe(manager.id);
  });

  it("returns null from getProfileById when no profile exists for the id", async () => {
    const result = await getProfileById(crypto.randomUUID());
    expect(result).toBeNull();
  });
```

Create `lib/auth/session.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }),
}));

const getProfileByAuthUserIdMock = vi.fn();
vi.mock("@/lib/domain/profiles", () => ({
  getProfileByAuthUserId: (id: string) => getProfileByAuthUserIdMock(id),
}));

import { getCurrentProfile } from "@/lib/auth/session";

beforeEach(() => {
  getUserMock.mockReset();
  getProfileByAuthUserIdMock.mockReset();
});

describe("getCurrentProfile", () => {
  it("returns null when there is no authenticated user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const result = await getCurrentProfile();
    expect(result).toBeNull();
  });

  it("returns null when the user has no profile yet", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "auth-1" } } });
    getProfileByAuthUserIdMock.mockResolvedValue(null);
    const result = await getCurrentProfile();
    expect(result).toBeNull();
  });

  it("returns the profile for the authenticated user", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "auth-1" } } });
    getProfileByAuthUserIdMock.mockResolvedValue({ id: "profile-1", authUserId: "auth-1" });
    const result = await getCurrentProfile();
    expect(result).toEqual({ id: "profile-1", authUserId: "auth-1" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:integration lib/domain/profiles.test.ts` — Expected: FAIL (`getProfileById` not exported).
Run: `pnpm test lib/auth/session.test.ts` — Expected: FAIL (`@/lib/auth/session` cannot be found).

- [ ] **Step 3: Extend `lib/domain/profiles.ts`**

Change the `createProfile` input type and body to:

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

Add, after `getProfileByAuthUserId`:

```ts
export async function getProfileById(id: string): Promise<Profile | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return toProfile(data);
}
```

- [ ] **Step 4: Create `lib/auth/session.ts`**

```ts
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfileByAuthUserId, type Profile } from "@/lib/domain/profiles";

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  return getProfileByAuthUserId(user.id);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test:integration lib/domain/profiles.test.ts` — Expected: PASS.
Run: `pnpm test lib/auth/session.test.ts` — Expected: PASS (3 tests).

- [ ] **Step 6: Verify the project builds**

Run: `pnpm build` — Expected: no errors (the existing `POST /api/auth/complete-signup` route still calls `createProfile` with only its original four fields, which remain required — the two new fields are optional, so this is backward compatible).

- [ ] **Step 7: Commit**

```bash
git add lib/domain/profiles.ts lib/domain/profiles.test.ts lib/auth
git commit -m "feat: extend profiles domain layer and add session helper"
```

---

## Task 8: Task status/priority types and validation schemas

**Files:**
- Create: `lib/domain/task-status.ts`, `lib/validation/tasks.ts`
- Test: `lib/domain/task-status.test.ts`, `lib/validation/tasks.test.ts`

**Interfaces:**
- Produces:
  - `TaskStatus`, `TaskPriority` (types), `TASK_STATUS_TRANSITIONS`, `getValidNextStatuses(current: TaskStatus): TaskStatus[]` — consumed by `lib/domain/tasks.ts` (Tasks 14–15) and the task detail page (Task 24). This file has no server-only dependency so it is safe to import from Client Components.
  - `createTaskSchema`/`CreateTaskInput`, `patchTaskSchema`, `taskFiltersSchema`/`TaskFilters`, `addCommentSchema`/`AddCommentInput`, `createAttachmentSchema`/`CreateAttachmentInput` — consumed by the API routes (Tasks 16–20) and the task creation form (Task 23).

- [ ] **Step 1: Write the failing tests**

Create `lib/domain/task-status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getValidNextStatuses } from "@/lib/domain/task-status";

describe("getValidNextStatuses", () => {
  it("allows todo to move to in_progress or cancelled", () => {
    expect(getValidNextStatuses("todo")).toEqual(["in_progress", "cancelled"]);
  });

  it("allows in_progress to move to blocked, completed, or cancelled", () => {
    expect(getValidNextStatuses("in_progress")).toEqual(["blocked", "completed", "cancelled"]);
  });

  it("allows blocked to move back to in_progress or to cancelled", () => {
    expect(getValidNextStatuses("blocked")).toEqual(["in_progress", "cancelled"]);
  });

  it("treats completed and cancelled as terminal", () => {
    expect(getValidNextStatuses("completed")).toEqual([]);
    expect(getValidNextStatuses("cancelled")).toEqual([]);
  });
});
```

Create `lib/validation/tasks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  addCommentSchema,
  createAttachmentSchema,
  createTaskSchema,
  patchTaskSchema,
  taskFiltersSchema,
} from "@/lib/validation/tasks";

describe("createTaskSchema", () => {
  it("accepts a minimal valid payload", () => {
    expect(createTaskSchema.safeParse({ title: "Prepare laptop" }).success).toBe(true);
  });

  it("rejects an empty title", () => {
    const result = createTaskSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid priority", () => {
    expect(createTaskSchema.safeParse({ title: "x", priority: "urgent" }).success).toBe(false);
  });

  it("rejects a non-uuid departmentId", () => {
    expect(createTaskSchema.safeParse({ title: "x", departmentId: "not-a-uuid" }).success).toBe(
      false
    );
  });
});

describe("patchTaskSchema", () => {
  it("accepts a status-only payload", () => {
    expect(patchTaskSchema.safeParse({ status: "in_progress" }).success).toBe(true);
  });

  it("accepts an assigneeId-only payload", () => {
    expect(
      patchTaskSchema.safeParse({ assigneeId: "11111111-1111-1111-1111-111111111111" }).success
    ).toBe(true);
  });

  it("rejects an empty payload", () => {
    expect(patchTaskSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an invalid status value", () => {
    expect(patchTaskSchema.safeParse({ status: "done" }).success).toBe(false);
  });
});

describe("taskFiltersSchema", () => {
  it("accepts an empty filter set", () => {
    expect(taskFiltersSchema.safeParse({}).success).toBe(true);
  });

  it("accepts undefined values for unset query params", () => {
    expect(
      taskFiltersSchema.safeParse({ status: undefined, priority: undefined }).success
    ).toBe(true);
  });
});

describe("addCommentSchema", () => {
  it("rejects an empty body", () => {
    expect(addCommentSchema.safeParse({ body: "" }).success).toBe(false);
  });

  it("accepts a non-empty body", () => {
    expect(addCommentSchema.safeParse({ body: "Looks good" }).success).toBe(true);
  });
});

describe("createAttachmentSchema", () => {
  it("rejects an empty filename", () => {
    expect(createAttachmentSchema.safeParse({ filename: "" }).success).toBe(false);
  });

  it("accepts a filename", () => {
    expect(createAttachmentSchema.safeParse({ filename: "invoice.pdf" }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/domain/task-status.test.ts lib/validation/tasks.test.ts`
Expected: FAIL — neither module exists yet.

- [ ] **Step 3: Implement `lib/domain/task-status.ts`**

```ts
export type TaskStatus = "todo" | "in_progress" | "blocked" | "completed" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "critical";

export const TASK_STATUSES: TaskStatus[] = [
  "todo",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
];

export const TASK_PRIORITIES: TaskPriority[] = ["low", "medium", "high", "critical"];

export const TASK_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  todo: ["in_progress", "cancelled"],
  in_progress: ["blocked", "completed", "cancelled"],
  blocked: ["in_progress", "cancelled"],
  completed: [],
  cancelled: [],
};

export function getValidNextStatuses(current: TaskStatus): TaskStatus[] {
  return TASK_STATUS_TRANSITIONS[current];
}
```

- [ ] **Step 4: Implement `lib/validation/tasks.ts`**

```ts
import { z } from "zod";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/domain/task-status";

export const taskStatusSchema = z.enum(
  TASK_STATUSES as [TaskStatus, ...TaskStatus[]]
);
export const taskPrioritySchema = z.enum(
  TASK_PRIORITIES as [TaskPriority, ...TaskPriority[]]
);

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(5000).optional(),
  priority: taskPrioritySchema.optional(),
  departmentId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  relatedEmployeeId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const patchTaskSchema = z.union([
  z.object({ status: taskStatusSchema }),
  z.object({ assigneeId: z.string().uuid() }),
]);
export type PatchTaskInput = z.infer<typeof patchTaskSchema>;

export const taskFiltersSchema = z.object({
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigneeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
});
export type TaskFilters = z.infer<typeof taskFiltersSchema>;

export const addCommentSchema = z.object({
  body: z.string().min(1, "Comment cannot be empty").max(5000),
});
export type AddCommentInput = z.infer<typeof addCommentSchema>;

export const createAttachmentSchema = z.object({
  filename: z.string().min(1).max(255),
});
export type CreateAttachmentInput = z.infer<typeof createAttachmentSchema>;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test lib/domain/task-status.test.ts lib/validation/tasks.test.ts`
Expected: PASS (4 + 14 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/domain/task-status.ts lib/domain/task-status.test.ts lib/validation/tasks.ts lib/validation/tasks.test.ts
git commit -m "feat: add task status graph and task validation schemas"
```

---

## Task 9: Domain errors and API error-response helper

**Files:**
- Create: `lib/domain/errors.ts`, `lib/api/error-response.ts`
- Test: `lib/api/error-response.test.ts`

**Interfaces:**
- Produces: `ForbiddenError`, `NotFoundError`, `InvalidTransitionError` (all `Error` subclasses) — consumed by `lib/domain/tasks.ts` (Tasks 14–15) and every API route (Tasks 16–20). `toErrorResponse(error: unknown): NextResponse` — maps those three to 403/404/400, anything else to 500.

- [ ] **Step 1: Write the failing test**

Create `lib/api/error-response.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { toErrorResponse } from "@/lib/api/error-response";
import { ForbiddenError, InvalidTransitionError, NotFoundError } from "@/lib/domain/errors";

describe("toErrorResponse", () => {
  it("maps ForbiddenError to 403", async () => {
    const response = toErrorResponse(new ForbiddenError("nope"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "nope" });
  });

  it("maps NotFoundError to 404", async () => {
    const response = toErrorResponse(new NotFoundError("missing"));
    expect(response.status).toBe(404);
  });

  it("maps InvalidTransitionError to 400", async () => {
    const response = toErrorResponse(new InvalidTransitionError("bad transition"));
    expect(response.status).toBe(400);
  });

  it("maps unknown errors to 500 without leaking the message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = toErrorResponse(new Error("db connection string leaked"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test lib/api/error-response.test.ts`
Expected: FAIL — neither module exists.

- [ ] **Step 3: Implement `lib/domain/errors.ts`**

```ts
export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class InvalidTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTransitionError";
  }
}
```

- [ ] **Step 4: Implement `lib/api/error-response.ts`**

```ts
import { NextResponse } from "next/server";
import { ForbiddenError, InvalidTransitionError, NotFoundError } from "@/lib/domain/errors";

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof InvalidTransitionError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error(error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test lib/api/error-response.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/domain/errors.ts lib/api/error-response.ts lib/api/error-response.test.ts
git commit -m "feat: add domain error types and API error-response helper"
```

---

## Task 10: Permissions domain layer

**Files:**
- Create: `lib/domain/permissions.ts`
- Test: `lib/domain/permissions.test.ts`

**Interfaces:**
- Consumes: `Profile` (Task 7), `Task` (defined in this file's imports from Task 14 — see note below).
- Produces: `canViewTask`, `canCreateTask`, `canAssignTask`, `canChangeTaskStatus`, `canDeleteTask`, `canComment`, `canUploadAttachment` — consumed by `lib/domain/tasks.ts` (Tasks 14–15) and the comments/attachments API routes (Tasks 18, 20).

**Note on ordering:** `permissions.ts` needs the `Task` type, which is defined in `lib/domain/tasks.ts` (Task 14). To avoid a circular import (`tasks.ts` also needs `permissions.ts`), this task defines a minimal local `TaskLike` shape (the exact fields these functions read) instead of importing `Task`. `lib/domain/tasks.ts` in Task 14 uses the real `Task` type, which is structurally assignable to `TaskLike`, so no cast is needed at the call sites.

- [ ] **Step 1: Write the failing test**

Create `lib/domain/permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  canAssignTask,
  canChangeTaskStatus,
  canCreateTask,
  canDeleteTask,
  canViewTask,
} from "@/lib/domain/permissions";
import type { Profile } from "@/lib/domain/profiles";
import type { TaskLike } from "@/lib/domain/permissions";

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

function makeTask(overrides: Partial<TaskLike> = {}): TaskLike {
  return {
    companyId: "company-1",
    creatorId: "profile-1",
    assigneeId: null,
    departmentId: null,
    ...overrides,
  };
}

describe("canViewTask", () => {
  it("denies a profile from a different company", () => {
    const profile = makeProfile({ companyId: "other-company" });
    expect(canViewTask(profile, makeTask())).toBe(false);
  });

  it("allows the assignee", () => {
    const profile = makeProfile({ id: "assignee-1" });
    expect(canViewTask(profile, makeTask({ assigneeId: "assignee-1" }))).toBe(true);
  });

  it("allows the creator", () => {
    const profile = makeProfile({ id: "creator-1" });
    expect(canViewTask(profile, makeTask({ creatorId: "creator-1" }))).toBe(true);
  });

  it("denies an unrelated employee", () => {
    const profile = makeProfile({ id: "someone-else" });
    expect(canViewTask(profile, makeTask())).toBe(false);
  });

  it("allows a manager for a task in their department", () => {
    const profile = makeProfile({ id: "manager-1", role: "manager", departmentId: "dept-1" });
    expect(canViewTask(profile, makeTask({ departmentId: "dept-1" }))).toBe(true);
  });

  it("denies a manager for a task in a different department", () => {
    const profile = makeProfile({ id: "manager-1", role: "manager", departmentId: "dept-1" });
    expect(canViewTask(profile, makeTask({ departmentId: "dept-2" }))).toBe(false);
  });

  it("allows operations_manager, it, hr, and admin to view any company task", () => {
    for (const role of ["operations_manager", "it", "hr", "admin"] as const) {
      const profile = makeProfile({ id: "someone-else", role });
      expect(canViewTask(profile, makeTask())).toBe(true);
    }
  });
});

describe("canCreateTask", () => {
  it("allows any profile", () => {
    expect(canCreateTask(makeProfile())).toBe(true);
  });
});

describe("canAssignTask", () => {
  it("allows the creator", () => {
    const profile = makeProfile({ id: "creator-1" });
    const target = makeProfile({ id: "target-1" });
    expect(canAssignTask(profile, makeTask({ creatorId: "creator-1" }), null, target)).toBe(true);
  });

  it("allows self-claim", () => {
    const profile = makeProfile({ id: "employee-1" });
    expect(canAssignTask(profile, makeTask(), null, profile)).toBe(true);
  });

  it("allows the current assignee's manager", () => {
    const currentAssignee = makeProfile({ id: "assignee-1", managerId: "manager-1" });
    const profile = makeProfile({ id: "manager-1" });
    const target = makeProfile({ id: "target-1" });
    expect(canAssignTask(profile, makeTask(), currentAssignee, target)).toBe(true);
  });

  it("allows the target assignee's manager", () => {
    const target = makeProfile({ id: "target-1", managerId: "manager-1" });
    const profile = makeProfile({ id: "manager-1" });
    expect(canAssignTask(profile, makeTask(), null, target)).toBe(true);
  });

  it("allows operations_manager and admin regardless of relation", () => {
    const target = makeProfile({ id: "target-1" });
    for (const role of ["operations_manager", "admin"] as const) {
      const profile = makeProfile({ id: "someone-else", role });
      expect(canAssignTask(profile, makeTask(), null, target)).toBe(true);
    }
  });

  it("denies an unrelated employee", () => {
    const profile = makeProfile({ id: "someone-else" });
    const target = makeProfile({ id: "target-1" });
    expect(canAssignTask(profile, makeTask(), null, target)).toBe(false);
  });
});

describe("canChangeTaskStatus", () => {
  it("allows the assignee", () => {
    const profile = makeProfile({ id: "assignee-1" });
    expect(canChangeTaskStatus(profile, makeTask({ assigneeId: "assignee-1" }), profile)).toBe(
      true
    );
  });

  it("allows the creator", () => {
    const profile = makeProfile({ id: "creator-1" });
    expect(canChangeTaskStatus(profile, makeTask({ creatorId: "creator-1" }), null)).toBe(true);
  });

  it("allows the assignee's manager", () => {
    const assignee = makeProfile({ id: "assignee-1", managerId: "manager-1" });
    const profile = makeProfile({ id: "manager-1" });
    expect(
      canChangeTaskStatus(profile, makeTask({ assigneeId: "assignee-1" }), assignee)
    ).toBe(true);
  });

  it("denies an unrelated employee", () => {
    const profile = makeProfile({ id: "someone-else" });
    expect(canChangeTaskStatus(profile, makeTask(), null)).toBe(false);
  });
});

describe("canDeleteTask", () => {
  it("allows the creator", () => {
    const profile = makeProfile({ id: "creator-1" });
    expect(canDeleteTask(profile, makeTask({ creatorId: "creator-1" }))).toBe(true);
  });

  it("allows admin", () => {
    const profile = makeProfile({ id: "someone-else", role: "admin" });
    expect(canDeleteTask(profile, makeTask())).toBe(true);
  });

  it("denies an unrelated employee", () => {
    const profile = makeProfile({ id: "someone-else" });
    expect(canDeleteTask(profile, makeTask())).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test lib/domain/permissions.test.ts`
Expected: FAIL — `@/lib/domain/permissions` cannot be found.

- [ ] **Step 3: Implement `lib/domain/permissions.ts`**

```ts
import type { Profile } from "@/lib/domain/profiles";

export interface TaskLike {
  companyId: string;
  creatorId: string;
  assigneeId: string | null;
  departmentId: string | null;
}

const COMPANY_WIDE_VIEW_ROLES = new Set(["operations_manager", "it", "hr", "admin"]);
const ELEVATED_ROLES = new Set(["operations_manager", "admin"]);

export function canViewTask(profile: Profile, task: TaskLike): boolean {
  if (profile.companyId !== task.companyId) return false;
  if (COMPANY_WIDE_VIEW_ROLES.has(profile.role)) return true;
  if (profile.id === task.assigneeId || profile.id === task.creatorId) return true;
  if (
    profile.role === "manager" &&
    profile.departmentId !== null &&
    profile.departmentId === task.departmentId
  ) {
    return true;
  }
  return false;
}

export function canCreateTask(_profile: Profile): boolean {
  return true;
}

export function canAssignTask(
  profile: Profile,
  task: TaskLike,
  currentAssignee: Profile | null,
  targetAssignee: Profile
): boolean {
  if (profile.companyId !== task.companyId) return false;
  if (ELEVATED_ROLES.has(profile.role)) return true;
  if (profile.id === task.creatorId) return true;
  if (profile.id === targetAssignee.id) return true;
  if (currentAssignee && profile.id === currentAssignee.managerId) return true;
  if (profile.id === targetAssignee.managerId) return true;
  return false;
}

export function canChangeTaskStatus(
  profile: Profile,
  task: TaskLike,
  assignee: Profile | null
): boolean {
  if (profile.companyId !== task.companyId) return false;
  if (ELEVATED_ROLES.has(profile.role)) return true;
  if (profile.id === task.assigneeId || profile.id === task.creatorId) return true;
  if (assignee && profile.id === assignee.managerId) return true;
  return false;
}

export function canDeleteTask(profile: Profile, task: TaskLike): boolean {
  if (profile.companyId !== task.companyId) return false;
  return profile.id === task.creatorId || ELEVATED_ROLES.has(profile.role);
}

export const canComment = canViewTask;
export const canUploadAttachment = canViewTask;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test lib/domain/permissions.test.ts`
Expected: PASS (19 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/permissions.ts lib/domain/permissions.test.ts
git commit -m "feat: add task permissions domain layer"
```

---

## Task 11: Activity domain layer

**Files:**
- Create: `lib/domain/activity.ts`
- Test: `lib/domain/activity.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `ActivityEntry { id, entityType, entityId, actorId, message, createdAt }`, `logActivity(entityType, entityId, actorId, message): Promise<ActivityEntry>`, `listActivity(entityType, entityId): Promise<ActivityEntry[]>` — generic, consumed by `lib/domain/tasks.ts` (Tasks 14–15) and the task detail page (Task 24).

- [ ] **Step 1: Write the failing test**

Create `lib/domain/activity.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logActivity, listActivity } from "@/lib/domain/activity";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("logActivity / listActivity", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  let actorAuthUserId: string;
  let actorProfileId: string;
  const entityId = crypto.randomUUID();

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (activity)", slug: "test-co-activity" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: `activity-test-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (authError || !authUser.user) throw authError;
    actorAuthUserId = authUser.user.id;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .insert({
        auth_user_id: actorAuthUserId,
        company_id: companyId,
        full_name: "Activity Test User",
        role: "employee",
      })
      .select("id")
      .single();
    if (profileError) throw profileError;
    actorProfileId = profile.id;
  });

  afterAll(async () => {
    await supabase.from("activity_log").delete().eq("entity_id", entityId);
    await supabase.from("profiles").delete().eq("id", actorProfileId);
    await supabase.auth.admin.deleteUser(actorAuthUserId);
    await supabase.from("companies").delete().eq("slug", "test-co-activity");
  });

  it("logs an entry and lists it back in chronological order", async () => {
    const first = await logActivity("task", entityId, actorProfileId, "Task created");
    const second = await logActivity("task", entityId, actorProfileId, "Status changed");

    expect(first.message).toBe("Task created");
    expect(first.actorId).toBe(actorProfileId);

    const entries = await listActivity("task", entityId);
    expect(entries.map((e) => e.id)).toEqual([first.id, second.id]);
  });

  it("supports a null actorId for system-generated entries", async () => {
    const entry = await logActivity("task", entityId, null, "Auto-generated by workflow");
    expect(entry.actorId).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration lib/domain/activity.test.ts`
Expected: FAIL — `@/lib/domain/activity` cannot be found.

- [ ] **Step 3: Implement `lib/domain/activity.ts`**

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface ActivityEntry {
  id: string;
  entityType: string;
  entityId: string;
  actorId: string | null;
  message: string;
  createdAt: string;
}

interface ActivityRow {
  id: string;
  entity_type: string;
  entity_id: string;
  actor_id: string | null;
  message: string;
  created_at: string;
}

function toActivityEntry(row: ActivityRow): ActivityEntry {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    actorId: row.actor_id,
    message: row.message,
    createdAt: row.created_at,
  };
}

const ACTIVITY_COLUMNS = "id, entity_type, entity_id, actor_id, message, created_at";

export async function logActivity(
  entityType: string,
  entityId: string,
  actorId: string | null,
  message: string
): Promise<ActivityEntry> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("activity_log")
    .insert({ entity_type: entityType, entity_id: entityId, actor_id: actorId, message })
    .select(ACTIVITY_COLUMNS)
    .single();
  if (error) throw error;
  return toActivityEntry(data);
}

export async function listActivity(
  entityType: string,
  entityId: string
): Promise<ActivityEntry[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("activity_log")
    .select(ACTIVITY_COLUMNS)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toActivityEntry);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:integration lib/domain/activity.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Register the new integration test in `package.json`**

Update the two scripts:

```json
"test:unit": "vitest run --exclude \"lib/domain/profiles.test.ts\" --exclude \"lib/domain/seed.test.ts\" --exclude \"lib/domain/activity.test.ts\" --exclude \"scripts/seed.smoke.test.ts\"",
"test:integration": "vitest run lib/domain/profiles.test.ts lib/domain/seed.test.ts lib/domain/activity.test.ts scripts/seed.smoke.test.ts",
```

- [ ] **Step 6: Commit**

```bash
git add lib/domain/activity.ts lib/domain/activity.test.ts package.json
git commit -m "feat: add generic activity log domain layer"
```

---

## Task 12: Comments domain layer

**Files:**
- Create: `lib/domain/comments.ts`
- Test: `lib/domain/comments.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `Comment { id, entityType, entityId, authorId, body, createdAt }`, `addComment(entityType, entityId, authorId, body): Promise<Comment>`, `listComments(entityType, entityId): Promise<Comment[]>` — generic, no permission check inside (callers check `canComment` first). Consumed by the comments API route (Task 18) and the task detail page (Task 24).

- [ ] **Step 1: Write the failing test**

Create `lib/domain/comments.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { addComment, listComments } from "@/lib/domain/comments";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("addComment / listComments", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  let authorAuthUserId: string;
  let authorProfileId: string;
  const entityId = crypto.randomUUID();

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (comments)", slug: "test-co-comments" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: `comments-test-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (authError || !authUser.user) throw authError;
    authorAuthUserId = authUser.user.id;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .insert({
        auth_user_id: authorAuthUserId,
        company_id: companyId,
        full_name: "Comments Test User",
        role: "employee",
      })
      .select("id")
      .single();
    if (profileError) throw profileError;
    authorProfileId = profile.id;
  });

  afterAll(async () => {
    await supabase.from("comments").delete().eq("entity_id", entityId);
    await supabase.from("profiles").delete().eq("id", authorProfileId);
    await supabase.auth.admin.deleteUser(authorAuthUserId);
    await supabase.from("companies").delete().eq("slug", "test-co-comments");
  });

  it("adds a comment and lists it back", async () => {
    const comment = await addComment("task", entityId, authorProfileId, "Looks good");
    expect(comment.body).toBe("Looks good");
    expect(comment.authorId).toBe(authorProfileId);

    const comments = await listComments("task", entityId);
    expect(comments.map((c) => c.id)).toContain(comment.id);
  });

  it("only returns comments for the requested entity", async () => {
    const otherEntityId = crypto.randomUUID();
    await addComment("task", otherEntityId, authorProfileId, "Different task");

    const comments = await listComments("task", entityId);
    expect(comments.every((c) => c.entityId === entityId)).toBe(true);

    await supabase.from("comments").delete().eq("entity_id", otherEntityId);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration lib/domain/comments.test.ts`
Expected: FAIL — `@/lib/domain/comments` cannot be found.

- [ ] **Step 3: Implement `lib/domain/comments.ts`**

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface Comment {
  id: string;
  entityType: string;
  entityId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

interface CommentRow {
  id: string;
  entity_type: string;
  entity_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

const COMMENT_COLUMNS = "id, entity_type, entity_id, author_id, body, created_at";

export async function addComment(
  entityType: string,
  entityId: string,
  authorId: string,
  body: string
): Promise<Comment> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("comments")
    .insert({ entity_type: entityType, entity_id: entityId, author_id: authorId, body })
    .select(COMMENT_COLUMNS)
    .single();
  if (error) throw error;
  return toComment(data);
}

export async function listComments(entityType: string, entityId: string): Promise<Comment[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("comments")
    .select(COMMENT_COLUMNS)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toComment);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:integration lib/domain/comments.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Register the new integration test in `package.json`**

```json
"test:unit": "vitest run --exclude \"lib/domain/profiles.test.ts\" --exclude \"lib/domain/seed.test.ts\" --exclude \"lib/domain/activity.test.ts\" --exclude \"lib/domain/comments.test.ts\" --exclude \"scripts/seed.smoke.test.ts\"",
"test:integration": "vitest run lib/domain/profiles.test.ts lib/domain/seed.test.ts lib/domain/activity.test.ts lib/domain/comments.test.ts scripts/seed.smoke.test.ts",
```

- [ ] **Step 6: Commit**

```bash
git add lib/domain/comments.ts lib/domain/comments.test.ts package.json
git commit -m "feat: add generic comments domain layer"
```

---

## Task 13: Realtime broadcast helper

**Files:**
- Create: `lib/realtime/broadcast.ts`
- Test: `lib/realtime/broadcast.test.ts`

**Interfaces:**
- Produces: `broadcastChange(companyId: string, channel: string, event: { type: string }): Promise<void>` — sends on Supabase Realtime channel `company:{companyId}:{channel}`. Consumed by `lib/domain/tasks.ts` (Tasks 14–15) and the comments/attachments API routes (Tasks 18, 20).

- [ ] **Step 1: Write the failing test**

Create `lib/realtime/broadcast.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn().mockResolvedValue("ok");
const subscribeMock = vi.fn((callback: (status: string) => void) => {
  callback("SUBSCRIBED");
});
const channelMock = vi.fn(() => ({
  subscribe: subscribeMock,
  send: sendMock,
}));
const removeChannelMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    channel: channelMock,
    removeChannel: removeChannelMock,
  }),
}));

import { broadcastChange } from "@/lib/realtime/broadcast";

beforeEach(() => {
  sendMock.mockClear();
  subscribeMock.mockClear();
  channelMock.mockClear();
  removeChannelMock.mockClear();
});

describe("broadcastChange", () => {
  it("subscribes to the company-scoped channel, sends the event, and cleans up", async () => {
    await broadcastChange("company-1", "tasks", { type: "task_created" });

    expect(channelMock).toHaveBeenCalledWith("company:company-1:tasks");
    expect(sendMock).toHaveBeenCalledWith({
      type: "broadcast",
      event: "task_created",
      payload: {},
    });
    expect(removeChannelMock).toHaveBeenCalled();
  });

  it("rejects if the channel fails to subscribe", async () => {
    subscribeMock.mockImplementationOnce((callback: (status: string) => void) => {
      callback("CHANNEL_ERROR");
    });

    await expect(broadcastChange("company-1", "tasks", { type: "task_created" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test lib/realtime/broadcast.test.ts`
Expected: FAIL — `@/lib/realtime/broadcast` cannot be found.

- [ ] **Step 3: Implement `lib/realtime/broadcast.ts`**

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function broadcastChange(
  companyId: string,
  channel: string,
  event: { type: string }
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const realtimeChannel = supabase.channel(`company:${companyId}:${channel}`);

  await new Promise<void>((resolve, reject) => {
    realtimeChannel.subscribe((status: string) => {
      if (status === "SUBSCRIBED") {
        realtimeChannel
          .send({ type: "broadcast", event: event.type, payload: {} })
          .then(() => resolve())
          .catch(reject);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        reject(new Error(`Failed to subscribe to realtime channel: ${status}`));
      }
    });
  });

  await supabase.removeChannel(realtimeChannel);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test lib/realtime/broadcast.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/realtime/broadcast.ts lib/realtime/broadcast.test.ts
git commit -m "feat: add server-side realtime broadcast helper"
```

---

## Task 14: Tasks domain layer — create, get, list

**Files:**
- Create: `lib/domain/tasks.ts`
- Test: `lib/domain/tasks.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `Profile`, `getProfileById` (Task 7); `CreateTaskInput`, `TaskFilters` (Task 8); `ForbiddenError`, `NotFoundError` (Task 9); `canCreateTask`, `canViewTask` (Task 10); `logActivity` (Task 11); `broadcastChange` (Task 13).
- Produces: `Task { id, companyId, title, description, status, priority, assigneeId, creatorId, departmentId, relatedEmployeeId, dueDate, completedAt, createdAt }`, `createTask(profile, input): Promise<Task>`, `getTask(profile, taskId): Promise<Task>`, `listTasks(profile, filters): Promise<Task[]>` — consumed by the `/api/tasks` and `/api/tasks/[id]` routes (Tasks 16–17) and by Task 15 (which adds `updateTaskStatus`/`assignTask`/`deleteTask` to this same file).

- [ ] **Step 1: Write the failing test**

Create `lib/domain/tasks.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile } from "@/lib/domain/profiles";
import type { Profile } from "@/lib/domain/profiles";
import { createTask, getTask, listTasks } from "@/lib/domain/tasks";
import { ForbiddenError } from "@/lib/domain/errors";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)(
  "createTask / getTask / listTasks",
  () => {
    const supabase = createSupabaseAdminClient();
    let companyId: string;
    let departmentAId: string;
    let departmentBId: string;
    const createdAuthUserIds: string[] = [];
    let employee: Profile;
    let managerA: Profile;
    let opsManager: Profile;

    beforeAll(async () => {
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .upsert({ name: "Test Co (tasks)", slug: "test-co-tasks" }, { onConflict: "slug" })
        .select("id")
        .single();
      if (companyError) throw companyError;
      companyId = company.id;

      const { data: departments, error: departmentsError } = await supabase
        .from("departments")
        .upsert(
          [
            { company_id: companyId, name: "Dept A (tasks test)" },
            { company_id: companyId, name: "Dept B (tasks test)" },
          ],
          { onConflict: "company_id,name" }
        )
        .select("id, name");
      if (departmentsError) throw departmentsError;
      departmentAId = departments.find((d) => d.name === "Dept A (tasks test)")!.id;
      departmentBId = departments.find((d) => d.name === "Dept B (tasks test)")!.id;

      async function createTestProfile(fullName: string, role: Profile["role"], departmentId: string | null) {
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email: `tasks-test-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
        if (authError || !authUser.user) throw authError;
        createdAuthUserIds.push(authUser.user.id);
        return createProfile({
          authUserId: authUser.user.id,
          companyId,
          fullName,
          role,
          departmentId,
        });
      }

      employee = await createTestProfile("Employee A", "employee", departmentAId);
      managerA = await createTestProfile("Manager A", "manager", departmentAId);
      opsManager = await createTestProfile("Ops Manager", "operations_manager", null);
    });

    afterAll(async () => {
      await supabase.from("tasks").delete().eq("company_id", companyId);
      await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
      for (const id of createdAuthUserIds) {
        await supabase.auth.admin.deleteUser(id);
      }
      await supabase.from("companies").delete().eq("slug", "test-co-tasks");
    });

    it("creates a task with the creator and company set, and defaults", async () => {
      const task = await createTask(employee, { title: "Prepare laptop" });
      expect(task.creatorId).toBe(employee.id);
      expect(task.companyId).toBe(companyId);
      expect(task.status).toBe("todo");
      expect(task.priority).toBe("medium");
      expect(task.assigneeId).toBeNull();
    });

    it("lets the creator and the assignee view the task, but not an unrelated employee", async () => {
      const task = await createTask(employee, {
        title: "Assigned task",
        assigneeId: employee.id,
      });

      await expect(getTask(employee, task.id)).resolves.toMatchObject({ id: task.id });

      const stranger = await (async () => {
        const { data: authUser, error } = await supabase.auth.admin.createUser({
          email: `tasks-test-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
        if (error || !authUser.user) throw error;
        createdAuthUserIds.push(authUser.user.id);
        return createProfile({
          authUserId: authUser.user.id,
          companyId,
          fullName: "Stranger",
          role: "employee",
          departmentId: departmentBId,
        });
      })();

      await expect(getTask(stranger, task.id)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("lets a manager view tasks in their department but not another department's", async () => {
      const inDept = await createTask(employee, {
        title: "Dept A task",
        departmentId: departmentAId,
      });
      const outOfDept = await createTask(employee, {
        title: "Dept B task",
        departmentId: departmentBId,
      });

      await expect(getTask(managerA, inDept.id)).resolves.toMatchObject({ id: inDept.id });
      await expect(getTask(managerA, outOfDept.id)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("lets an operations_manager view any task in the company", async () => {
      const task = await createTask(employee, { title: "Any task" });
      await expect(getTask(opsManager, task.id)).resolves.toMatchObject({ id: task.id });
    });

    it("scopes listTasks to what each role is allowed to see", async () => {
      await supabase.from("tasks").delete().eq("company_id", companyId);

      const own = await createTask(employee, { title: "Employee's own task" });
      await createTask(managerA, { title: "Unrelated task", departmentId: departmentBId });

      const employeeTasks = await listTasks(employee, {});
      expect(employeeTasks.map((t) => t.id)).toEqual([own.id]);

      const opsManagerTasks = await listTasks(opsManager, {});
      expect(opsManagerTasks.length).toBe(2);
    });
  }
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration lib/domain/tasks.test.ts`
Expected: FAIL — `@/lib/domain/tasks` cannot be found.

- [ ] **Step 3: Implement `lib/domain/tasks.ts`**

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/domain/profiles";
import { logActivity } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import { canCreateTask, canViewTask } from "@/lib/domain/permissions";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import type { CreateTaskInput, TaskFilters } from "@/lib/validation/tasks";
import type { TaskPriority, TaskStatus } from "@/lib/domain/task-status";

export interface Task {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  creatorId: string;
  departmentId: string | null;
  relatedEmployeeId: string | null;
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
  creator_id: string;
  department_id: string | null;
  related_employee_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
}

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
    dueDate: row.due_date,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

const TASK_COLUMNS =
  "id, company_id, title, description, status, priority, assignee_id, creator_id, department_id, related_employee_id, due_date, completed_at, created_at";

const COMPANY_WIDE_VIEW_ROLES = new Set(["operations_manager", "it", "hr", "admin"]);

export async function createTask(profile: Profile, input: CreateTaskInput): Promise<Task> {
  if (!canCreateTask(profile)) {
    throw new ForbiddenError("You cannot create tasks");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tasks")
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
    .select(TASK_COLUMNS)
    .single();
  if (error) throw error;

  const task = toTask(data);
  await logActivity("task", task.id, profile.id, `${profile.fullName} created this task`);
  await broadcastChange(profile.companyId, "tasks", { type: "task_created" });
  return task;
}

export async function loadTaskOrThrow(taskId: string): Promise<Task> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_COLUMNS)
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError("Task not found");
  return toTask(data);
}

export async function getTask(profile: Profile, taskId: string): Promise<Task> {
  const task = await loadTaskOrThrow(taskId);
  if (!canViewTask(profile, task)) {
    throw new ForbiddenError("You cannot view this task");
  }
  return task;
}

export async function listTasks(profile: Profile, filters: TaskFilters): Promise<Task[]> {
  const supabase = createSupabaseAdminClient();
  let query = supabase.from("tasks").select(TASK_COLUMNS).eq("company_id", profile.companyId);

  if (!COMPANY_WIDE_VIEW_ROLES.has(profile.role)) {
    if (profile.role === "manager" && profile.departmentId) {
      query = query.or(
        `assignee_id.eq.${profile.id},creator_id.eq.${profile.id},department_id.eq.${profile.departmentId}`
      );
    } else {
      query = query.or(`assignee_id.eq.${profile.id},creator_id.eq.${profile.id}`);
    }
  }

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.assigneeId) query = query.eq("assignee_id", filters.assigneeId);
  if (filters.departmentId) query = query.eq("department_id", filters.departmentId);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toTask);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:integration lib/domain/tasks.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Register the new integration test in `package.json`**

```json
"test:unit": "vitest run --exclude \"lib/domain/profiles.test.ts\" --exclude \"lib/domain/seed.test.ts\" --exclude \"lib/domain/activity.test.ts\" --exclude \"lib/domain/comments.test.ts\" --exclude \"lib/domain/tasks.test.ts\" --exclude \"scripts/seed.smoke.test.ts\"",
"test:integration": "vitest run lib/domain/profiles.test.ts lib/domain/seed.test.ts lib/domain/activity.test.ts lib/domain/comments.test.ts lib/domain/tasks.test.ts scripts/seed.smoke.test.ts",
```

- [ ] **Step 6: Commit**

```bash
git add lib/domain/tasks.ts lib/domain/tasks.test.ts package.json
git commit -m "feat: add tasks domain layer — create, get, list"
```

---

## Task 15: Tasks domain layer — status transitions, assignment, delete

**Files:**
- Modify: `lib/domain/tasks.ts`, `lib/domain/tasks.test.ts`

**Interfaces:**
- Consumes: `getProfileById` (Task 7); `TASK_STATUS_TRANSITIONS` (Task 8); `InvalidTransitionError` (Task 9); `canAssignTask`, `canChangeTaskStatus`, `canDeleteTask` (Task 10); everything already in `tasks.ts` from Task 14.
- Produces: `updateTaskStatus(profile, taskId, newStatus): Promise<Task>`, `assignTask(profile, taskId, targetAssigneeId): Promise<Task>`, `deleteTask(profile, taskId): Promise<void>` — consumed by `/api/tasks/[id]` (Task 17).

- [ ] **Step 1: Write the failing tests**

Append to `lib/domain/tasks.test.ts` — add these imports:

```ts
import { assignTask, deleteTask, updateTaskStatus } from "@/lib/domain/tasks";
import { InvalidTransitionError } from "@/lib/domain/errors";
```

And add these `it` blocks inside the existing `describe.skipIf(...)(...)` block:

```ts
    it("moves a task through a valid transition and sets completedAt on completion", async () => {
      const task = await createTask(employee, {
        title: "Status test",
        assigneeId: employee.id,
      });

      const inProgress = await updateTaskStatus(employee, task.id, "in_progress");
      expect(inProgress.status).toBe("in_progress");
      expect(inProgress.completedAt).toBeNull();

      const completed = await updateTaskStatus(employee, task.id, "completed");
      expect(completed.status).toBe("completed");
      expect(completed.completedAt).not.toBeNull();
    });

    it("rejects an invalid transition", async () => {
      const task = await createTask(employee, { title: "Invalid transition test" });
      await expect(updateTaskStatus(employee, task.id, "completed")).rejects.toBeInstanceOf(
        InvalidTransitionError
      );
    });

    it("denies a status change from an unrelated employee", async () => {
      const task = await createTask(employee, { title: "Unauthorized status change" });
      await expect(updateTaskStatus(managerA, task.id, "in_progress")).resolves.toBeDefined();

      const stranger = await (async () => {
        const { data: authUser, error } = await supabase.auth.admin.createUser({
          email: `tasks-test-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
        if (error || !authUser.user) throw error;
        createdAuthUserIds.push(authUser.user.id);
        return createProfile({
          authUserId: authUser.user.id,
          companyId,
          fullName: "Stranger 2",
          role: "employee",
          departmentId: departmentBId,
        });
      })();

      const other = await createTask(employee, { title: "Another task" });
      await expect(updateTaskStatus(stranger, other.id, "in_progress")).rejects.toBeInstanceOf(
        ForbiddenError
      );
    });

    it("lets the creator assign a task, and lets the assignee self-claim it", async () => {
      const task = await createTask(employee, { title: "Assignment test" });
      const assigned = await assignTask(employee, task.id, managerA.id);
      expect(assigned.assigneeId).toBe(managerA.id);

      const unassigned = await createTask(employee, { title: "Self-claim test" });
      const selfClaimed = await assignTask(managerA, unassigned.id, managerA.id);
      expect(selfClaimed.assigneeId).toBe(managerA.id);
    });

    it("denies assignment from an unrelated employee", async () => {
      const task = await createTask(employee, { title: "Denied assignment test" });
      const stranger = await (async () => {
        const { data: authUser, error } = await supabase.auth.admin.createUser({
          email: `tasks-test-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
        if (error || !authUser.user) throw error;
        createdAuthUserIds.push(authUser.user.id);
        return createProfile({
          authUserId: authUser.user.id,
          companyId,
          fullName: "Stranger 3",
          role: "employee",
          departmentId: departmentBId,
        });
      })();

      await expect(assignTask(stranger, task.id, stranger.id)).rejects.toBeInstanceOf(
        ForbiddenError
      );
    });

    it("lets the creator delete a task, but denies an unrelated employee", async () => {
      const task = await createTask(employee, { title: "Delete test" });
      const stranger = await (async () => {
        const { data: authUser, error } = await supabase.auth.admin.createUser({
          email: `tasks-test-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
        if (error || !authUser.user) throw error;
        createdAuthUserIds.push(authUser.user.id);
        return createProfile({
          authUserId: authUser.user.id,
          companyId,
          fullName: "Stranger 4",
          role: "employee",
          departmentId: departmentBId,
        });
      })();

      await expect(deleteTask(stranger, task.id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(deleteTask(employee, task.id)).resolves.toBeUndefined();
      await expect(getTask(opsManager, task.id)).rejects.toBeInstanceOf(NotFoundError);
    });
```

Also add `NotFoundError` to the existing `@/lib/domain/errors` import at the top of the file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:integration lib/domain/tasks.test.ts`
Expected: FAIL — `updateTaskStatus`, `assignTask`, `deleteTask` are not exported.

- [ ] **Step 3: Add the new functions to `lib/domain/tasks.ts`**

Update the imports at the top of the file:

```ts
import { getProfileById, type Profile } from "@/lib/domain/profiles";
import { canAssignTask, canChangeTaskStatus, canCreateTask, canDeleteTask, canViewTask } from "@/lib/domain/permissions";
import { ForbiddenError, InvalidTransitionError, NotFoundError } from "@/lib/domain/errors";
import { TASK_STATUS_TRANSITIONS, type TaskPriority, type TaskStatus } from "@/lib/domain/task-status";
```

(This replaces the narrower `import type { Profile } from "@/lib/domain/profiles";` and the `canCreateTask, canViewTask` import from Task 14, and the `import type { TaskPriority, TaskStatus }` from `@/lib/domain/task-status`.)

Append to the end of the file:

```ts
export async function updateTaskStatus(
  profile: Profile,
  taskId: string,
  newStatus: TaskStatus
): Promise<Task> {
  const task = await loadTaskOrThrow(taskId);
  const assignee = task.assigneeId ? await getProfileById(task.assigneeId) : null;

  if (!canChangeTaskStatus(profile, task, assignee)) {
    throw new ForbiddenError("You cannot change this task's status");
  }

  if (!TASK_STATUS_TRANSITIONS[task.status].includes(newStatus)) {
    throw new InvalidTransitionError(
      `Cannot move a task from "${task.status}" to "${newStatus}"`
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({
      status: newStatus,
      completed_at: newStatus === "completed" ? new Date().toISOString() : task.completedAt,
    })
    .eq("id", taskId)
    .select(TASK_COLUMNS)
    .single();
  if (error) throw error;

  const updated = toTask(data);
  await logActivity(
    "task",
    updated.id,
    profile.id,
    `${profile.fullName} changed status from "${task.status}" to "${newStatus}"`
  );
  await broadcastChange(profile.companyId, "tasks", { type: "task_updated" });
  return updated;
}

export async function assignTask(
  profile: Profile,
  taskId: string,
  targetAssigneeId: string
): Promise<Task> {
  const task = await loadTaskOrThrow(taskId);
  const targetAssignee = await getProfileById(targetAssigneeId);
  if (!targetAssignee || targetAssignee.companyId !== task.companyId) {
    throw new NotFoundError("Target assignee not found");
  }
  const currentAssignee = task.assigneeId ? await getProfileById(task.assigneeId) : null;

  if (!canAssignTask(profile, task, currentAssignee, targetAssignee)) {
    throw new ForbiddenError("You cannot assign this task");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ assignee_id: targetAssigneeId })
    .eq("id", taskId)
    .select(TASK_COLUMNS)
    .single();
  if (error) throw error;

  const updated = toTask(data);
  await logActivity(
    "task",
    updated.id,
    profile.id,
    `${profile.fullName} assigned this task to ${targetAssignee.fullName}`
  );
  await broadcastChange(profile.companyId, "tasks", { type: "task_updated" });
  return updated;
}

export async function deleteTask(profile: Profile, taskId: string): Promise<void> {
  const task = await loadTaskOrThrow(taskId);
  if (!canDeleteTask(profile, task)) {
    throw new ForbiddenError("You cannot delete this task");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) throw error;

  await broadcastChange(profile.companyId, "tasks", { type: "task_deleted" });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:integration lib/domain/tasks.test.ts`
Expected: PASS (11 tests total).

- [ ] **Step 5: Verify the project builds**

Run: `pnpm build`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/tasks.ts lib/domain/tasks.test.ts
git commit -m "feat: add status transitions, assignment, and delete to tasks domain layer"
```

---

## Task 16: API route — `/api/tasks`

**Files:**
- Create: `app/api/tasks/route.ts`
- Test: `app/api/tasks/route.test.ts`

**Interfaces:**
- Consumes: `getCurrentProfile` (Task 7); `createTaskSchema`, `taskFiltersSchema` (Task 8); `toErrorResponse` (Task 9); `createTask`, `listTasks` (Task 14).
- Produces: `GET /api/tasks?status=&priority=&assigneeId=&departmentId=` → `200 { tasks: Task[] }`; `POST /api/tasks` → `201 { task: Task }`. Both `401` unauthenticated, `400` invalid input. Consumed by the task list page (Task 22) and task creation form (Task 23).

- [ ] **Step 1: Write the failing test**

Create `app/api/tasks/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/tasks", () => ({
  createTask: vi.fn(),
  listTasks: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { createTask, listTasks } from "@/lib/domain/tasks";
import { GET, POST } from "@/app/api/tasks/route";
import { ForbiddenError } from "@/lib/domain/errors";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "Test User",
  role: "employee" as const,
  departmentId: null,
  managerId: null,
};

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(createTask).mockReset();
  vi.mocked(listTasks).mockReset();
});

describe("GET /api/tasks", () => {
  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/tasks"));
    expect(response.status).toBe(401);
  });

  it("returns tasks scoped by the caller's filters", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(listTasks).mockResolvedValue([]);

    const response = await GET(new Request("http://localhost/api/tasks?status=todo"));
    expect(response.status).toBe(200);
    expect(listTasks).toHaveBeenCalledWith(PROFILE, { status: "todo" });
  });

  it("returns 400 for an invalid filter value", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await GET(new Request("http://localhost/api/tasks?status=nope"));
    expect(response.status).toBe(400);
  });
});

describe("POST /api/tasks", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost/api/tasks", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await POST(jsonRequest({ title: "x" }));
    expect(response.status).toBe(401);
  });

  it("creates a task", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(createTask).mockResolvedValue({ id: "task-1" } as never);

    const response = await POST(jsonRequest({ title: "Prepare laptop" }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.task.id).toBe("task-1");
  });

  it("returns 400 for an invalid body", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(jsonRequest({ title: "" }));
    expect(response.status).toBe(400);
  });

  it("maps a ForbiddenError from the domain layer to 403", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(createTask).mockRejectedValue(new ForbiddenError("no"));

    const response = await POST(jsonRequest({ title: "Prepare laptop" }));
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test app/api/tasks/route.test.ts`
Expected: FAIL — the route module cannot be found.

- [ ] **Step 3: Implement the route**

Create `app/api/tasks/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { createTask, listTasks } from "@/lib/domain/tasks";
import { createTaskSchema, taskFiltersSchema } from "@/lib/validation/tasks";
import { toErrorResponse } from "@/lib/api/error-response";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = taskFiltersSchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    priority: url.searchParams.get("priority") ?? undefined,
    assigneeId: url.searchParams.get("assigneeId") ?? undefined,
    departmentId: url.searchParams.get("departmentId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const tasks = await listTasks(profile, parsed.data);
    return NextResponse.json({ tasks });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const task = await createTask(profile, parsed.data);
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test app/api/tasks/route.test.ts`
Expected: PASS (7 tests). Fully mocked — does not require the live Supabase project.

- [ ] **Step 5: Commit**

```bash
git add app/api/tasks/route.ts app/api/tasks/route.test.ts
git commit -m "feat: add /api/tasks route"
```

---

## Task 17: API route — `/api/tasks/[id]`

**Files:**
- Create: `app/api/tasks/[id]/route.ts`
- Test: `app/api/tasks/[id]/route.test.ts`

**Interfaces:**
- Consumes: `getCurrentProfile` (Task 7); `patchTaskSchema` (Task 8); `toErrorResponse` (Task 9); `getTask`, `updateTaskStatus`, `assignTask`, `deleteTask` (Tasks 14–15).
- Produces: `GET /api/tasks/[id]` → `200 { task }`; `PATCH /api/tasks/[id]` (body `{ status }` or `{ assigneeId }`) → `200 { task }`; `DELETE /api/tasks/[id]` → `204`. Consumed by the task detail page's client controls (Task 24).

- [ ] **Step 1: Write the failing test**

Create `app/api/tasks/[id]/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/tasks", () => ({
  getTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  assignTask: vi.fn(),
  deleteTask: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { assignTask, deleteTask, getTask, updateTaskStatus } from "@/lib/domain/tasks";
import { GET, PATCH, DELETE } from "@/app/api/tasks/[id]/route";
import { NotFoundError } from "@/lib/domain/errors";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "Test User",
  role: "employee" as const,
  departmentId: null,
  managerId: null,
};

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(getTask).mockReset();
  vi.mocked(updateTaskStatus).mockReset();
  vi.mocked(assignTask).mockReset();
  vi.mocked(deleteTask).mockReset();
});

describe("GET /api/tasks/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost"), params("task-1"));
    expect(response.status).toBe(401);
  });

  it("returns 404 when the task does not exist", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getTask).mockRejectedValue(new NotFoundError());
    const response = await GET(new Request("http://localhost"), params("task-1"));
    expect(response.status).toBe(404);
  });

  it("returns the task", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getTask).mockResolvedValue({ id: "task-1" } as never);
    const response = await GET(new Request("http://localhost"), params("task-1"));
    expect(response.status).toBe(200);
  });
});

describe("PATCH /api/tasks/[id]", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("calls updateTaskStatus for a status payload", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(updateTaskStatus).mockResolvedValue({ id: "task-1", status: "in_progress" } as never);

    const response = await PATCH(jsonRequest({ status: "in_progress" }), params("task-1"));
    expect(response.status).toBe(200);
    expect(updateTaskStatus).toHaveBeenCalledWith(PROFILE, "task-1", "in_progress");
  });

  it("calls assignTask for an assigneeId payload", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(assignTask).mockResolvedValue({ id: "task-1" } as never);

    const response = await PATCH(
      jsonRequest({ assigneeId: "11111111-1111-1111-1111-111111111111" }),
      params("task-1")
    );
    expect(response.status).toBe(200);
    expect(assignTask).toHaveBeenCalledWith(
      PROFILE,
      "task-1",
      "11111111-1111-1111-1111-111111111111"
    );
  });

  it("returns 400 for an empty payload", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await PATCH(jsonRequest({}), params("task-1"));
    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/tasks/[id]", () => {
  it("returns 204 on success", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(deleteTask).mockResolvedValue(undefined);
    const response = await DELETE(new Request("http://localhost"), params("task-1"));
    expect(response.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test "app/api/tasks/[id]/route.test.ts"`
Expected: FAIL — the route module cannot be found.

- [ ] **Step 3: Implement the route**

Create `app/api/tasks/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { assignTask, deleteTask, getTask, updateTaskStatus } from "@/lib/domain/tasks";
import { patchTaskSchema } from "@/lib/validation/tasks";
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
    const task = await getTask(profile, id);
    return NextResponse.json({ task });
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

  const body = await request.json();
  const parsed = patchTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const task =
      "status" in parsed.data
        ? await updateTaskStatus(profile, id, parsed.data.status)
        : await assignTask(profile, id, parsed.data.assigneeId);
    return NextResponse.json({ task });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  try {
    await deleteTask(profile, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test "app/api/tasks/[id]/route.test.ts"`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/api/tasks/[id]/route.ts" "app/api/tasks/[id]/route.test.ts"
git commit -m "feat: add /api/tasks/[id] route"
```

---

## Task 18: API route — `/api/tasks/[id]/comments`

**Files:**
- Create: `app/api/tasks/[id]/comments/route.ts`
- Test: `app/api/tasks/[id]/comments/route.test.ts`

**Interfaces:**
- Consumes: `getCurrentProfile` (Task 7); `addCommentSchema` (Task 8); `toErrorResponse` (Task 9); `canComment` (Task 10); `logActivity` (Task 11); `addComment`, `listComments` (Task 12); `broadcastChange` (Task 13); `getTask` (Task 14).
- Produces: `GET /api/tasks/[id]/comments` → `200 { comments }`; `POST /api/tasks/[id]/comments` (body `{ body }`) → `201 { comment }`. Consumed by the task detail page (Task 24).

- [ ] **Step 1: Write the failing test**

Create `app/api/tasks/[id]/comments/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/tasks", () => ({
  getTask: vi.fn(),
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
import { getTask } from "@/lib/domain/tasks";
import { addComment, listComments } from "@/lib/domain/comments";
import { GET, POST } from "@/app/api/tasks/[id]/comments/route";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "Test User",
  role: "employee" as const,
  departmentId: null,
  managerId: null,
};

const TASK = {
  id: "task-1",
  companyId: "company-1",
  creatorId: "profile-1",
  assigneeId: null,
  departmentId: null,
};

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(getTask).mockReset();
  vi.mocked(addComment).mockReset();
  vi.mocked(listComments).mockReset();
});

describe("GET /api/tasks/[id]/comments", () => {
  it("returns comments for a task the caller can view", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getTask).mockResolvedValue(TASK as never);
    vi.mocked(listComments).mockResolvedValue([]);

    const response = await GET(new Request("http://localhost"), params("task-1"));
    expect(response.status).toBe(200);
    expect(listComments).toHaveBeenCalledWith("task", "task-1");
  });
});

describe("POST /api/tasks/[id]/comments", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("adds a comment for a task the caller can view", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getTask).mockResolvedValue(TASK as never);
    vi.mocked(addComment).mockResolvedValue({ id: "comment-1", body: "Looks good" } as never);

    const response = await POST(jsonRequest({ body: "Looks good" }), params("task-1"));
    expect(response.status).toBe(201);
    expect(addComment).toHaveBeenCalledWith("task", "task-1", PROFILE.id, "Looks good");
  });

  it("returns 400 for an empty body", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(jsonRequest({ body: "" }), params("task-1"));
    expect(response.status).toBe(400);
  });

  it("denies a caller who cannot view the task", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      ...PROFILE,
      id: "someone-else",
      companyId: "other-company",
    });
    vi.mocked(getTask).mockResolvedValue(TASK as never);

    const response = await POST(jsonRequest({ body: "Looks good" }), params("task-1"));
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test "app/api/tasks/[id]/comments/route.test.ts"`
Expected: FAIL — the route module cannot be found.

- [ ] **Step 3: Implement the route**

Create `app/api/tasks/[id]/comments/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getTask } from "@/lib/domain/tasks";
import { canComment } from "@/lib/domain/permissions";
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
    const task = await getTask(profile, id);
    if (!canComment(profile, task)) {
      throw new ForbiddenError("You cannot view comments on this task");
    }
    const comments = await listComments("task", task.id);
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

  const body = await request.json();
  const parsed = addCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const task = await getTask(profile, id);
    if (!canComment(profile, task)) {
      throw new ForbiddenError("You cannot comment on this task");
    }
    const comment = await addComment("task", task.id, profile.id, parsed.data.body);
    await logActivity("task", task.id, profile.id, `${profile.fullName} commented on this task`);
    await broadcastChange(profile.companyId, "tasks", { type: "task_updated" });
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test "app/api/tasks/[id]/comments/route.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/api/tasks/[id]/comments" 
git commit -m "feat: add /api/tasks/[id]/comments route"
```

---

## Task 19: Attachments domain layer

**Files:**
- Create: `lib/domain/attachments.ts`
- Test: `lib/domain/attachments.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `Attachment { id, entityType, entityId, storagePath, uploadedBy, createdAt }`, `createSignedUploadUrl(entityType, entityId, uploadedBy, filename): Promise<{ attachment, signedUrl, token }>`, `createSignedDownloadUrl(storagePath): Promise<string>`, `listAttachments(entityType, entityId): Promise<Attachment[]>` — consumed by the attachments API route (Task 20).

- [ ] **Step 1: Write the failing test**

Create `lib/domain/attachments.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createSignedDownloadUrl,
  createSignedUploadUrl,
  listAttachments,
} from "@/lib/domain/attachments";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)(
  "createSignedUploadUrl / createSignedDownloadUrl / listAttachments",
  () => {
    const supabase = createSupabaseAdminClient();
    let companyId: string;
    let uploaderAuthUserId: string;
    let uploaderProfileId: string;
    const entityId = crypto.randomUUID();
    const createdPaths: string[] = [];

    beforeAll(async () => {
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .upsert(
          { name: "Test Co (attachments)", slug: "test-co-attachments" },
          { onConflict: "slug" }
        )
        .select("id")
        .single();
      if (companyError) throw companyError;
      companyId = company.id;

      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: `attachments-test-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
      if (authError || !authUser.user) throw authError;
      uploaderAuthUserId = authUser.user.id;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .insert({
          auth_user_id: uploaderAuthUserId,
          company_id: companyId,
          full_name: "Attachments Test User",
          role: "employee",
        })
        .select("id")
        .single();
      if (profileError) throw profileError;
      uploaderProfileId = profile.id;
    });

    afterAll(async () => {
      if (createdPaths.length > 0) {
        await supabase.storage.from("attachments").remove(createdPaths);
      }
      await supabase.from("attachments").delete().eq("entity_id", entityId);
      await supabase.from("profiles").delete().eq("id", uploaderProfileId);
      await supabase.auth.admin.deleteUser(uploaderAuthUserId);
      await supabase.from("companies").delete().eq("slug", "test-co-attachments");
    });

    it("creates a signed upload URL, records the attachment, and lists it back", async () => {
      const result = await createSignedUploadUrl(
        "task",
        entityId,
        uploaderProfileId,
        "invoice.pdf"
      );
      createdPaths.push(result.attachment.storagePath);

      expect(result.signedUrl).toBeTruthy();
      expect(result.token).toBeTruthy();
      expect(result.attachment.uploadedBy).toBe(uploaderProfileId);

      const attachments = await listAttachments("task", entityId);
      expect(attachments.map((a) => a.id)).toContain(result.attachment.id);
    });

    it("creates a signed download URL for a stored path", async () => {
      const result = await createSignedUploadUrl(
        "task",
        entityId,
        uploaderProfileId,
        "photo.png"
      );
      createdPaths.push(result.attachment.storagePath);

      const downloadUrl = await createSignedDownloadUrl(result.attachment.storagePath);
      expect(downloadUrl).toBeTruthy();
    });
  }
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration lib/domain/attachments.test.ts`
Expected: FAIL — `@/lib/domain/attachments` cannot be found.

- [ ] **Step 3: Implement `lib/domain/attachments.ts`**

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const ATTACHMENTS_BUCKET = "attachments";

export interface Attachment {
  id: string;
  entityType: string;
  entityId: string;
  storagePath: string;
  uploadedBy: string;
  createdAt: string;
}

interface AttachmentRow {
  id: string;
  entity_type: string;
  entity_id: string;
  storage_path: string;
  uploaded_by: string;
  created_at: string;
}

function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    storagePath: row.storage_path,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}

const ATTACHMENT_COLUMNS = "id, entity_type, entity_id, storage_path, uploaded_by, created_at";

export async function createSignedUploadUrl(
  entityType: string,
  entityId: string,
  uploadedBy: string,
  filename: string
): Promise<{ attachment: Attachment; signedUrl: string; token: string }> {
  const supabase = createSupabaseAdminClient();
  const storagePath = `${entityType}/${entityId}/${crypto.randomUUID()}-${filename}`;

  const { data: signed, error: signedError } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUploadUrl(storagePath);
  if (signedError) throw signedError;

  const { data, error } = await supabase
    .from("attachments")
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      storage_path: storagePath,
      uploaded_by: uploadedBy,
    })
    .select(ATTACHMENT_COLUMNS)
    .single();
  if (error) throw error;

  return { attachment: toAttachment(data), signedUrl: signed.signedUrl, token: signed.token };
}

export async function createSignedDownloadUrl(storagePath: string): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function listAttachments(
  entityType: string,
  entityId: string
): Promise<Attachment[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("attachments")
    .select(ATTACHMENT_COLUMNS)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toAttachment);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:integration lib/domain/attachments.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Register the new integration test in `package.json`**

```json
"test:unit": "vitest run --exclude \"lib/domain/profiles.test.ts\" --exclude \"lib/domain/seed.test.ts\" --exclude \"lib/domain/activity.test.ts\" --exclude \"lib/domain/comments.test.ts\" --exclude \"lib/domain/tasks.test.ts\" --exclude \"lib/domain/attachments.test.ts\" --exclude \"scripts/seed.smoke.test.ts\"",
"test:integration": "vitest run lib/domain/profiles.test.ts lib/domain/seed.test.ts lib/domain/activity.test.ts lib/domain/comments.test.ts lib/domain/tasks.test.ts lib/domain/attachments.test.ts scripts/seed.smoke.test.ts",
```

- [ ] **Step 6: Commit**

```bash
git add lib/domain/attachments.ts lib/domain/attachments.test.ts package.json
git commit -m "feat: add attachments domain layer"
```

---

## Task 20: API route — `/api/tasks/[id]/attachments`

**Files:**
- Create: `app/api/tasks/[id]/attachments/route.ts`
- Test: `app/api/tasks/[id]/attachments/route.test.ts`

**Interfaces:**
- Consumes: `getCurrentProfile` (Task 7); `createAttachmentSchema` (Task 8); `toErrorResponse` (Task 9); `canUploadAttachment` (Task 10); `logActivity` (Task 11); `createSignedUploadUrl`, `createSignedDownloadUrl`, `listAttachments` (Task 19); `getTask` (Task 14).
- Produces: `GET /api/tasks/[id]/attachments` → `200 { attachments: (Attachment & { downloadUrl: string })[] }`; `POST /api/tasks/[id]/attachments` (body `{ filename }`) → `201 { attachment, token }`. Consumed by the task detail page (Task 24).

- [ ] **Step 1: Write the failing test**

Create `app/api/tasks/[id]/attachments/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/tasks", () => ({
  getTask: vi.fn(),
}));
vi.mock("@/lib/domain/attachments", () => ({
  createSignedUploadUrl: vi.fn(),
  createSignedDownloadUrl: vi.fn(),
  listAttachments: vi.fn(),
}));
vi.mock("@/lib/domain/activity", () => ({
  logActivity: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { getTask } from "@/lib/domain/tasks";
import {
  createSignedDownloadUrl,
  createSignedUploadUrl,
  listAttachments,
} from "@/lib/domain/attachments";
import { GET, POST } from "@/app/api/tasks/[id]/attachments/route";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "Test User",
  role: "employee" as const,
  departmentId: null,
  managerId: null,
};

const TASK = {
  id: "task-1",
  companyId: "company-1",
  creatorId: "profile-1",
  assigneeId: null,
  departmentId: null,
};

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(getTask).mockReset();
  vi.mocked(createSignedUploadUrl).mockReset();
  vi.mocked(createSignedDownloadUrl).mockReset();
  vi.mocked(listAttachments).mockReset();
});

describe("GET /api/tasks/[id]/attachments", () => {
  it("returns attachments with a fresh download URL for each", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getTask).mockResolvedValue(TASK as never);
    vi.mocked(listAttachments).mockResolvedValue([
      { id: "attachment-1", storagePath: "task/task-1/file.pdf" } as never,
    ]);
    vi.mocked(createSignedDownloadUrl).mockResolvedValue("https://example.com/signed");

    const response = await GET(new Request("http://localhost"), params("task-1"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.attachments[0].downloadUrl).toBe("https://example.com/signed");
  });
});

describe("POST /api/tasks/[id]/attachments", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("creates a signed upload URL for a task the caller can view", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getTask).mockResolvedValue(TASK as never);
    vi.mocked(createSignedUploadUrl).mockResolvedValue({
      attachment: { id: "attachment-1", storagePath: "task/task-1/file.pdf" },
      signedUrl: "https://example.com/upload",
      token: "token-1",
    } as never);

    const response = await POST(jsonRequest({ filename: "file.pdf" }), params("task-1"));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.token).toBe("token-1");
  });

  it("returns 400 for an empty filename", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(jsonRequest({ filename: "" }), params("task-1"));
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test "app/api/tasks/[id]/attachments/route.test.ts"`
Expected: FAIL — the route module cannot be found.

- [ ] **Step 3: Implement the route**

Create `app/api/tasks/[id]/attachments/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getTask } from "@/lib/domain/tasks";
import { canUploadAttachment } from "@/lib/domain/permissions";
import {
  createSignedDownloadUrl,
  createSignedUploadUrl,
  listAttachments,
} from "@/lib/domain/attachments";
import { logActivity } from "@/lib/domain/activity";
import { createAttachmentSchema } from "@/lib/validation/tasks";
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
    const task = await getTask(profile, id);
    if (!canUploadAttachment(profile, task)) {
      throw new ForbiddenError("You cannot view attachments on this task");
    }
    const attachments = await listAttachments("task", task.id);
    const withUrls = await Promise.all(
      attachments.map(async (attachment) => ({
        ...attachment,
        downloadUrl: await createSignedDownloadUrl(attachment.storagePath),
      }))
    );
    return NextResponse.json({ attachments: withUrls });
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

  const body = await request.json();
  const parsed = createAttachmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const task = await getTask(profile, id);
    if (!canUploadAttachment(profile, task)) {
      throw new ForbiddenError("You cannot upload attachments to this task");
    }
    const result = await createSignedUploadUrl(
      "task",
      task.id,
      profile.id,
      parsed.data.filename
    );
    await logActivity("task", task.id, profile.id, `${profile.fullName} attached a file`);
    return NextResponse.json(
      { attachment: result.attachment, token: result.token },
      { status: 201 }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test "app/api/tasks/[id]/attachments/route.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/api/tasks/[id]/attachments"
git commit -m "feat: add /api/tasks/[id]/attachments route"
```

---

## Task 21: Frontend setup — shadcn components, React Query provider, broadcast hook

**Files:**
- Create: `components/ui/table.tsx`, `components/ui/badge.tsx` (via shadcn CLI), `components/providers/query-provider.tsx`, `lib/realtime/use-broadcast-listener.ts`
- Test: `lib/realtime/use-broadcast-listener.test.tsx`
- Modify: `app/(app)/layout.tsx`

**Interfaces:**
- Produces: `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell` and `Badge` from `@/components/ui/*`; `QueryProvider` wrapping `(app)/layout.tsx`'s children; `useBroadcastListener(channelName: string, onMessage: () => void): void` — consumed by Tasks 22 and 24.

- [ ] **Step 1: Add the shadcn components**

```bash
pnpm dlx shadcn@latest add table badge -y
```

- [ ] **Step 2: Write the failing test for the broadcast hook**

Create `lib/realtime/use-broadcast-listener.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const onMock = vi.fn();
const subscribeMock = vi.fn();
const removeChannelMock = vi.fn();
let capturedCallback: (() => void) | undefined;

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => ({
      on: (_type: string, _filter: unknown, callback: () => void) => {
        capturedCallback = callback;
        onMock();
        return { subscribe: subscribeMock };
      },
    }),
    removeChannel: removeChannelMock,
  }),
}));

import { useBroadcastListener } from "@/lib/realtime/use-broadcast-listener";

function TestComponent({ onMessage }: { onMessage: () => void }) {
  useBroadcastListener("company:test:tasks", onMessage);
  return null;
}

beforeEach(() => {
  onMock.mockReset();
  subscribeMock.mockReset();
  removeChannelMock.mockReset();
  capturedCallback = undefined;
});

describe("useBroadcastListener", () => {
  it("subscribes to the channel and calls onMessage when a broadcast arrives", () => {
    const onMessage = vi.fn();
    render(<TestComponent onMessage={onMessage} />);

    expect(onMock).toHaveBeenCalled();
    expect(subscribeMock).toHaveBeenCalled();

    capturedCallback?.();
    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes on unmount", () => {
    const onMessage = vi.fn();
    const { unmount } = render(<TestComponent onMessage={onMessage} />);
    unmount();
    expect(removeChannelMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test lib/realtime/use-broadcast-listener.test.tsx`
Expected: FAIL — `@/lib/realtime/use-broadcast-listener` cannot be found.

- [ ] **Step 4: Implement the broadcast hook**

Create `lib/realtime/use-broadcast-listener.ts`:

```ts
"use client";

import { useEffect, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function useBroadcastListener(channelName: string, onMessage: () => void): void {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(channelName)
      .on("broadcast", { event: "*" }, () => {
        onMessageRef.current();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName]);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test lib/realtime/use-broadcast-listener.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Create the React Query provider**

Create `components/providers/query-provider.tsx`:

```tsx
"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 7: Wrap the app shell's children in the provider**

In `app/(app)/layout.tsx`, add the import:

```ts
import { QueryProvider } from "@/components/providers/query-provider";
```

Replace:

```tsx
      <main className="flex-1 p-6">{children}</main>
```

with:

```tsx
      <main className="flex-1 p-6">
        <QueryProvider>{children}</QueryProvider>
      </main>
```

- [ ] **Step 8: Verify the project builds and the existing layout test still passes**

Run: `pnpm test "app/(app)/layout.test.tsx"` — Expected: PASS (3 tests, unaffected by the provider wrapper).
Run: `pnpm build` — Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add components/ui/table.tsx components/ui/badge.tsx components/providers lib/realtime/use-broadcast-listener.ts lib/realtime/use-broadcast-listener.test.tsx "app/(app)/layout.tsx" package.json
git commit -m "chore: add table/badge components, React Query provider, and broadcast hook"
```

---

## Task 22: Frontend — task list page

**Files:**
- Create: `components/tasks/task-list-view.tsx`, `app/(app)/tasks/page.tsx`
- Test: `components/tasks/task-list-view.test.tsx`

**Interfaces:**
- Consumes: `getCurrentProfile` (Task 7); `useBroadcastListener` (Task 21); `Table`/`Badge`/`Button` (Task 21, Foundation).
- Produces: the `/tasks` route; `TaskListView` component. Links to `/tasks/new` (Task 23) and `/tasks/[id]` (Task 24).

- [ ] **Step 1: Write the failing test**

Create `components/tasks/task-list-view.test.tsx`:

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

import { TaskListView } from "@/components/tasks/task-list-view";

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
        tasks: [
          {
            id: "task-1",
            title: "Prepare laptop",
            status: "todo",
            priority: "high",
            assigneeId: null,
            departmentId: null,
            dueDate: null,
          },
        ],
      }),
    })
  );
});

describe("TaskListView", () => {
  it("renders tasks returned from the API", async () => {
    renderWithClient(<TaskListView companyId="company-1" />);

    expect(await screen.findByText("Prepare laptop")).toBeInTheDocument();
    expect(screen.getByText("todo")).toBeInTheDocument();
  });

  it("shows an empty state when there are no tasks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tasks: [] }) })
    );
    renderWithClient(<TaskListView companyId="company-1" />);

    expect(await screen.findByText("No tasks found.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test components/tasks/task-list-view.test.tsx`
Expected: FAIL — `@/components/tasks/task-list-view` cannot be found.

- [ ] **Step 3: Implement `TaskListView`**

Create `components/tasks/task-list-view.tsx`:

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

interface TaskListItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  departmentId: string | null;
  dueDate: string | null;
}

const STATUS_OPTIONS = ["todo", "in_progress", "blocked", "completed", "cancelled"];
const PRIORITY_OPTIONS = ["low", "medium", "high", "critical"];

export function TaskListView({ companyId }: { companyId: string }) {
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["tasks", { status, priority }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      const response = await fetch(`/api/tasks?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load tasks");
      const body = await response.json();
      return body.tasks as TaskListItem[];
    },
  });

  useBroadcastListener(`company:${companyId}:tasks`, () => {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">All priorities</option>
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <Button render={<Link href="/tasks/new" />}>New task</Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading tasks...</p>}
      {error && <p className="text-red-600">Failed to load tasks.</p>}

      {data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Due date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((task) => (
              <TableRow key={task.id}>
                <TableCell>
                  <Link href={`/tasks/${task.id}`} className="hover:underline">
                    {task.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{task.status}</Badge>
                </TableCell>
                <TableCell>{task.priority}</TableCell>
                <TableCell>
                  {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}
                </TableCell>
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No tasks found.
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

- [ ] **Step 4: Create the page**

Create `app/(app)/tasks/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { TaskListView } from "@/components/tasks/task-list-view";

export default async function TasksPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Tasks</h1>
      <TaskListView companyId={profile.companyId} />
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test components/tasks/task-list-view.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Verify the project builds**

Run: `pnpm build`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/tasks/task-list-view.tsx components/tasks/task-list-view.test.tsx "app/(app)/tasks/page.tsx"
git commit -m "feat: add task list page"
```

---

## Task 23: Frontend — task creation form

**Files:**
- Create: `components/tasks/task-form.tsx`, `app/(app)/tasks/new/page.tsx`
- Test: `components/tasks/task-form.test.tsx`

**Interfaces:**
- Consumes: `createTaskSchema`/`CreateTaskInput` (Task 8); `Button`/`Input`/`Label` (Foundation).
- Produces: the `/tasks/new` route; `TaskForm` component, posting to `POST /api/tasks` (Task 16) and redirecting to `/tasks/[id]` (Task 24) on success.

- [ ] **Step 1: Write the failing test**

Create `components/tasks/task-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { TaskForm } from "@/components/tasks/task-form";

beforeEach(() => {
  pushMock.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ task: { id: "task-1" } }),
    })
  );
});

describe("TaskForm", () => {
  it("shows a validation error when submitted empty", async () => {
    render(<TaskForm />);
    await userEvent.click(screen.getByRole("button", { name: /create task/i }));

    expect(await screen.findByText("Title is required")).toBeInTheDocument();
  });

  it("creates a task and redirects to its detail page", async () => {
    render(<TaskForm />);

    await userEvent.type(screen.getByLabelText(/title/i), "Prepare laptop");
    await userEvent.click(screen.getByRole("button", { name: /create task/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/tasks/task-1"));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test components/tasks/task-form.test.tsx`
Expected: FAIL — `@/components/tasks/task-form` cannot be found.

- [ ] **Step 3: Implement `TaskForm`**

Create `components/tasks/task-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createTaskSchema, type CreateTaskInput } from "@/lib/validation/tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TaskForm() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateTaskInput>({ resolver: zodResolver(createTaskSchema) });

  async function onSubmit(values: CreateTaskInput) {
    setSubmitError(null);
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      const body = await response.json();
      setSubmitError(typeof body.error === "string" ? body.error : "Failed to create task");
      return;
    }

    const { task } = await response.json();
    router.push(`/tasks/${task.id}`);
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
          {...register("description")}
          className="min-h-24 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </div>

      {submitError && <p className="text-sm text-red-600">{submitError}</p>}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating..." : "Create task"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Create the page**

Create `app/(app)/tasks/new/page.tsx`:

```tsx
import { TaskForm } from "@/components/tasks/task-form";

export default function NewTaskPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">New task</h1>
      <TaskForm />
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test components/tasks/task-form.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Verify the project builds**

Run: `pnpm build`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/tasks/task-form.tsx components/tasks/task-form.test.tsx "app/(app)/tasks/new"
git commit -m "feat: add task creation form"
```

---

## Task 24: Frontend — task detail page

**Files:**
- Create: `app/(app)/tasks/[id]/page.tsx`, `components/tasks/task-realtime-refresh.tsx`, `components/tasks/task-status-control.tsx`, `components/tasks/task-comments.tsx`, `components/tasks/task-attachments.tsx`
- Test: `components/tasks/task-status-control.test.tsx`

**Interfaces:**
- Consumes: `getCurrentProfile` (Task 7); `getTask` (Task 14); `listComments` (Task 12); `listActivity` (Task 11); `listAttachments`/`createSignedDownloadUrl` (Task 19); `getValidNextStatuses`/`TaskStatus` (Task 8); `useBroadcastListener` (Task 21); `Comment` type (Task 12); `PATCH /api/tasks/[id]` (Task 17), `POST /api/tasks/[id]/comments` (Task 18), `POST /api/tasks/[id]/attachments` (Task 20).
- Produces: the `/tasks/[id]` route, the final piece of Phase 2's user-facing surface.

- [ ] **Step 1: Write the failing test for the status control**

Create `components/tasks/task-status-control.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => ({ on: () => ({ subscribe: vi.fn() }) }),
    removeChannel: vi.fn(),
  }),
}));

import { TaskStatusControl } from "@/components/tasks/task-status-control";

beforeEach(() => {
  refreshMock.mockReset();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});

describe("TaskStatusControl", () => {
  it("only offers the valid next statuses for the current status", () => {
    render(<TaskStatusControl taskId="task-1" currentStatus="todo" />);

    expect(screen.getByRole("button", { name: /move to in_progress/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /move to cancelled/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /move to completed/i })).not.toBeInTheDocument();
  });

  it("shows no actions for a terminal status", () => {
    render(<TaskStatusControl taskId="task-1" currentStatus="completed" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("submits the chosen status and refreshes", async () => {
    render(<TaskStatusControl taskId="task-1" currentStatus="todo" />);

    await userEvent.click(screen.getByRole("button", { name: /move to in_progress/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/tasks/task-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "in_progress" }),
      })
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test components/tasks/task-status-control.test.tsx`
Expected: FAIL — `@/components/tasks/task-status-control` cannot be found.

- [ ] **Step 3: Implement `TaskRealtimeRefresh`**

Create `components/tasks/task-realtime-refresh.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useBroadcastListener } from "@/lib/realtime/use-broadcast-listener";

export function TaskRealtimeRefresh({ companyId }: { companyId: string }) {
  const router = useRouter();
  useBroadcastListener(`company:${companyId}:tasks`, () => {
    router.refresh();
  });
  return null;
}
```

- [ ] **Step 4: Implement `TaskStatusControl`**

Create `components/tasks/task-status-control.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getValidNextStatuses, type TaskStatus } from "@/lib/domain/task-status";
import { Button } from "@/components/ui/button";

export function TaskStatusControl({
  taskId,
  currentStatus,
}: {
  taskId: string;
  currentStatus: TaskStatus;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function changeStatus(nextStatus: TaskStatus) {
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to update status");
      return;
    }

    router.refresh();
  }

  const nextStatuses = getValidNextStatuses(currentStatus);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        Status: <span className="font-medium">{currentStatus}</span>
      </p>
      <div className="flex gap-2">
        {nextStatuses.map((nextStatus) => (
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

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test components/tasks/task-status-control.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Implement `TaskComments`**

Create `components/tasks/task-comments.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Comment } from "@/lib/domain/comments";
import { Button } from "@/components/ui/button";

export function TaskComments({
  taskId,
  initialComments,
}: {
  taskId: string;
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
    const response = await fetch(`/api/tasks/${taskId}/comments`, {
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

- [ ] **Step 7: Implement `TaskAttachments`**

Create `components/tasks/task-attachments.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

interface AttachmentWithUrl {
  id: string;
  storagePath: string;
  downloadUrl: string;
}

export function TaskAttachments({
  taskId,
  initialAttachments,
}: {
  taskId: string;
  initialAttachments: AttachmentWithUrl[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    const response = await fetch(`/api/tasks/${taskId}/attachments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: file.name }),
    });

    if (!response.ok) {
      setIsUploading(false);
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to prepare upload");
      return;
    }

    const { attachment, token } = await response.json();
    const supabase = createSupabaseBrowserClient();
    const { error: uploadError } = await supabase.storage
      .from("attachments")
      .uploadToSignedUrl(attachment.storagePath, token, file);
    setIsUploading(false);

    if (uploadError) {
      setError("Failed to upload file");
      return;
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">Attachments</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {initialAttachments.map((attachment) => (
          <li key={attachment.id}>
            <a href={attachment.downloadUrl} className="hover:underline">
              {attachment.storagePath.split("/").pop()}
            </a>
          </li>
        ))}
        {initialAttachments.length === 0 && (
          <li className="text-muted-foreground">No attachments yet.</li>
        )}
      </ul>
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          disabled={isUploading}
        />
        {isUploading && <span className="text-sm text-muted-foreground">Uploading...</span>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 8: Implement the task detail page**

Create `app/(app)/tasks/[id]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { getTask } from "@/lib/domain/tasks";
import { listComments } from "@/lib/domain/comments";
import { listActivity } from "@/lib/domain/activity";
import { createSignedDownloadUrl, listAttachments } from "@/lib/domain/attachments";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import { TaskRealtimeRefresh } from "@/components/tasks/task-realtime-refresh";
import { TaskStatusControl } from "@/components/tasks/task-status-control";
import { TaskComments } from "@/components/tasks/task-comments";
import { TaskAttachments } from "@/components/tasks/task-attachments";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const { id } = await params;

  let task;
  try {
    task = await getTask(profile, id);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      notFound();
    }
    throw error;
  }

  const [comments, activity, attachments] = await Promise.all([
    listComments("task", task.id),
    listActivity("task", task.id),
    listAttachments("task", task.id),
  ]);

  const attachmentsWithUrls = await Promise.all(
    attachments.map(async (attachment) => ({
      ...attachment,
      downloadUrl: await createSignedDownloadUrl(attachment.storagePath),
    }))
  );

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <TaskRealtimeRefresh companyId={profile.companyId} />

      <div>
        <h1 className="text-2xl font-semibold">{task.title}</h1>
        {task.description && (
          <p className="mt-2 text-muted-foreground">{task.description}</p>
        )}
      </div>

      <TaskStatusControl taskId={task.id} currentStatus={task.status} />

      <section>
        <h2 className="text-lg font-medium mb-2">Activity</h2>
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {activity.map((entry) => (
            <li key={entry.id}>{entry.message}</li>
          ))}
          {activity.length === 0 && <li>No activity yet.</li>}
        </ul>
      </section>

      <TaskComments taskId={task.id} initialComments={comments} />

      <TaskAttachments taskId={task.id} initialAttachments={attachmentsWithUrls} />
    </div>
  );
}
```

- [ ] **Step 9: Verify the project builds**

Run: `pnpm build`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add "app/(app)/tasks/[id]" components/tasks/task-realtime-refresh.tsx components/tasks/task-status-control.tsx components/tasks/task-status-control.test.tsx components/tasks/task-comments.tsx components/tasks/task-attachments.tsx
git commit -m "feat: add task detail page with status control, comments, and attachments"
```

---

## End-to-End Verification

After all 24 tasks are complete:

1. Run: `pnpm test:unit` — Expected: all unit tests pass (DB-independent).
2. Run: `pnpm test:integration` — Expected: all integration tests pass against the hosted Supabase project.
3. Run: `pnpm build` — Expected: build completes with no errors.
4. Run: `pnpm dev`, open `http://localhost:3000`, and walk through the flow using two browser profiles seeded via signup (e.g. one "Employee", one "Operations Manager"):
   - As Employee: visit `/tasks` → empty list. Click "New task", create "Prepare laptop" → redirected to its detail page.
   - Still as Employee: add a comment, upload a file attachment, move the task Todo → In Progress → Completed (confirm the "Move to completed" action disappears once completed — it's terminal).
   - As Operations Manager (second browser/profile): open `/tasks` → the task appears in the list (company-wide visibility) without a manual refresh once the Employee's action broadcasts (may need a refresh/refetch depending on timing, but the row must be there after `pnpm dev`'s live reload settles).
   - Confirm a task assigned to nobody, created by a different employee's department, does **not** appear in a plain Employee's `/tasks` list, but does appear in the Operations Manager's.
5. Manually re-verify the schema-USAGE gap is closed on the final state of the database (query from Task 1, Step 3) — confirms no later migration accidentally reintroduced a default grant.

This closes out Phase 2 from `docs/architecture.md` §12's suggested build order. The next plan (Phase 3 — Requests & Approvals) builds on `tasks` (via `related_request_id`), the `comments`/`activity_log` generic modules, the permissions pattern, and the broadcast pattern established here.
