# Phase 4 — Workflow Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A generic engine that runs a `workflow_template`'s ordered steps, auto-generating a task or approval per step and advancing to the next step whenever that task/approval completes — one engine, not one code path per workflow type. Seeds the three templates from `idea.md` (Equipment Request, Maintenance, Employee Onboarding) and auto-starts Equipment/Maintenance workflows once their originating request's Phase 3 approval is granted. Onboarding is seeded but not startable this phase (no Employee entity until Phase 5).

**Architecture:** `lib/domain/workflows.ts` is a new domain module, following the exact Phase 2/3 conventions: `snake_case` DB rows mapped to `camelCase` domain objects via `toX`/`X_COLUMNS`, the service-role Supabase client, `ForbiddenError`/`NotFoundError`/`UnprocessableRequestError` for control flow. It is advanced by two small hooks added to existing domain functions — `tasks.ts`'s `updateTaskStatus` and `approvals.ts`'s `decideApproval` — rather than any new infrastructure (Realtime broadcasts, DB triggers). Two GET-only API routes expose progress for the frontend; there are no POST routes, since instances are only ever created by the `decideApproval` hook. A new `/workflows/[id]` page (with its own `<BackLink>` to the originating request) renders the step list; the request detail page gets a link to it.

**Tech Stack:** Everything from Foundation/Phase 2/Phase 3 — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-28-phase4-workflow-engine-design.md`

## Global Constraints

- REST API (Next.js Route Handlers) is the sole authorization boundary. RLS stays disabled on every table; the service-role key is used server-side only (`lib/domain/**`), never shipped to the browser.
- Hosted Supabase project, no local Docker/CLI dev stack. `project_id` = `yqzcunssgvffischmwle`. Schema changes (DDL) are applied with `mcp__claude_ai_Supabase__apply_migration` (`project_id`, `name`, `query`). Use `mcp__claude_ai_Supabase__list_migrations` and `mcp__claude_ai_Supabase__list_tables` to verify, and `mcp__claude_ai_Supabase__execute_sql` for verification queries.
- Verify after every migration: `select table_name, grantee from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated');` must return zero rows for the new table.
- **Migration filenames must match the version `apply_migration` actually assigns.** After calling `apply_migration`, call `list_migrations` and rename the local file to `<version-from-list_migrations>_<name>.sql` before committing.
- Regenerate `lib/supabase/database.types.ts` after all five Phase 4 migrations land (Task 6), before any later task that types against the new tables/columns.
- Two existing Postgres enums are reused unmodified in this phase's tables: `request_category` (on `workflow_templates.trigger_category`) and `user_role` (on `workflow_template_steps.responsible_role`) — no redefinition, they already exist from Foundation/Phase 3.
- **Cross-cutting fix carried by Task 12:** `requests.ts`'s `loadApproverIdForRequest` and `approvals.ts`'s `getApprovalForRequest` both currently assume exactly one `approvals` row per request (`.maybeSingle()` with no ordering) — true through Phase 3, but false as soon as a workflow generates a second approval-type step (e.g. Equipment's "IT Review") on the same `request_id`. Both are changed to order by `created_at desc, limit 1` so they return the *current* approval. Task 12 also makes `decideApproval`'s request-status overwrite conditional: only the original, non-workflow approval sets `requests.status` to `approved`/`rejected` directly — a workflow-generated approval step must not clobber the status `startWorkflow`/`advanceWorkflow` are managing. See Task 12 for the full reasoning and diff.
- Test/domain-object convention: DB rows are `snake_case`; domain objects are `camelCase` via a private `toX(row)` mapper and an `X_COLUMNS` column-list constant per file — follow `lib/domain/requests.ts` exactly.
- Integration tests hitting the live Supabase project use `describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)`. **Every new integration test file must be added to both the `--exclude` list in `test:unit` and the file list in `test:integration` in `package.json`, in the task that introduces it.**
- Every task ends with a commit. Commit messages use the `feat:`/`fix:`/`chore:`/`test:`/`docs:` conventional prefix matching the task's nature.
- This plan runs inside its own git worktree/branch (`worktree-phase4-workflow-engine-plan`), not on `main`.
- Package manager: pnpm (v10.x). Node.js v22+. TypeScript strict mode throughout.

---

## Task 1: Migration — `workflow_templates` table

**Files:**
- Create: `supabase/migrations/<timestamp>_create_workflow_templates.sql`

**Interfaces:**
- Consumes: `companies` (Foundation), `request_category` enum (Phase 3).
- Produces: table `workflow_templates(id, company_id, slug, name, trigger_category, created_at)`, unique on `(company_id, slug)`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/<YYYYMMDDHHMMSS>_create_workflow_templates.sql` (current UTC timestamp, later than the last existing migration `20260828101507_add_tasks_related_request_id.sql`) with:

```sql
create table workflow_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  slug text not null,
  name text not null,
  trigger_category request_category,
  created_at timestamptz not null default now(),
  unique (company_id, slug)
);

create index workflow_templates_company_id_idx on workflow_templates(company_id);
create index workflow_templates_trigger_category_idx on workflow_templates(trigger_category);
```

`trigger_category` is nullable — `null` for `employee-onboarding` (not request-triggered), set for `equipment-request`/`maintenance`.

- [ ] **Step 2: Apply the migration**

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id: "yqzcunssgvffischmwle"`, `name: "create_workflow_templates"`, `query` set to the exact SQL from Step 1.

- [ ] **Step 3: Verify**

`mcp__claude_ai_Supabase__list_tables` (`project_id: "yqzcunssgvffischmwle"`, `schemas: ["public"]`) → expect `workflow_templates`.

`mcp__claude_ai_Supabase__execute_sql`:
```sql
select table_name, grantee from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'workflow_templates' and grantee in ('anon','authenticated');
```
Expected: zero rows.

- [ ] **Step 4: Rename the local file**

`mcp__claude_ai_Supabase__list_migrations` → rename to `supabase/migrations/<version>_create_workflow_templates.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add workflow_templates table"
```

---

## Task 2: Migration — `workflow_template_steps` table

**Files:**
- Create: `supabase/migrations/<timestamp>_create_workflow_template_steps.sql`

**Interfaces:**
- Consumes: `workflow_templates` (Task 1), `user_role` enum (Foundation).
- Produces: enum `workflow_step_type` (`task|approval`); table `workflow_template_steps(id, template_id, step_order, step_type, title, description, responsible_role, responsible_department_name)`, unique on `(template_id, step_order)`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/<YYYYMMDDHHMMSS>_create_workflow_template_steps.sql` (timestamp later than Task 1's) with:

```sql
create type workflow_step_type as enum ('task', 'approval');

create table workflow_template_steps (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references workflow_templates(id) on delete cascade,
  step_order int not null,
  step_type workflow_step_type not null,
  title text not null,
  description text,
  responsible_role user_role,
  responsible_department_name text,
  unique (template_id, step_order)
);

create index workflow_template_steps_template_id_idx on workflow_template_steps(template_id);
```

`responsible_role` and `responsible_department_name` are both nullable; app-level code (Task 10) enforces exactly one is set per step — not a DB constraint, matching this codebase's existing preference for app-level validation over DB-level `CHECK` constraints (see `lib/validation/**`).

- [ ] **Step 2: Apply the migration**

`mcp__claude_ai_Supabase__apply_migration`, `name: "create_workflow_template_steps"`, `query` from Step 1.

- [ ] **Step 3: Verify**

`list_tables` → expect `workflow_template_steps`. Grants query (`table_name = 'workflow_template_steps'`) → expect zero rows.

- [ ] **Step 4: Rename the local file**

`list_migrations` → rename to `<version>_create_workflow_template_steps.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add workflow_template_steps table"
```

---

## Task 3: Migration — `workflow_instances` table

**Files:**
- Create: `supabase/migrations/<timestamp>_create_workflow_instances.sql`

**Interfaces:**
- Consumes: `companies`, `workflow_templates` (Task 1), `requests` (Phase 3).
- Produces: enum `workflow_instance_status` (`in_progress|completed`); table `workflow_instances(id, company_id, template_id, related_request_id, status, created_at)`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/<YYYYMMDDHHMMSS>_create_workflow_instances.sql` (timestamp later than Task 2's) with:

```sql
create type workflow_instance_status as enum ('in_progress', 'completed');

create table workflow_instances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  template_id uuid not null references workflow_templates(id),
  related_request_id uuid references requests(id) on delete cascade,
  status workflow_instance_status not null default 'in_progress',
  created_at timestamptz not null default now()
);

create index workflow_instances_company_id_idx on workflow_instances(company_id);
create index workflow_instances_related_request_id_idx on workflow_instances(related_request_id);
```

`related_request_id` is nullable — `null` for a future non-request-triggered instance (Phase 5 onboarding); every instance created in this phase always sets it (Equipment/Maintenance are always request-triggered).

- [ ] **Step 2: Apply the migration**

`mcp__claude_ai_Supabase__apply_migration`, `name: "create_workflow_instances"`, `query` from Step 1.

- [ ] **Step 3: Verify**

`list_tables` → expect `workflow_instances`. Grants query (`table_name = 'workflow_instances'`) → expect zero rows.

- [ ] **Step 4: Rename the local file**

`list_migrations` → rename to `<version>_create_workflow_instances.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add workflow_instances table"
```

---

## Task 4: Migration — `workflow_instance_steps` table

**Files:**
- Create: `supabase/migrations/<timestamp>_create_workflow_instance_steps.sql`

**Interfaces:**
- Consumes: `workflow_instances` (Task 3), `workflow_template_steps` (Task 2), `tasks` (Phase 2), `approvals` (Phase 3).
- Produces: enum `workflow_instance_step_status` (`pending|in_progress|completed`); table `workflow_instance_steps(id, instance_id, template_step_id, step_order, status, generated_task_id, generated_approval_id, created_at, completed_at)`, unique on `(instance_id, step_order)`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/<YYYYMMDDHHMMSS>_create_workflow_instance_steps.sql` (timestamp later than Task 3's) with:

```sql
create type workflow_instance_step_status as enum ('pending', 'in_progress', 'completed');

create table workflow_instance_steps (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references workflow_instances(id) on delete cascade,
  template_step_id uuid not null references workflow_template_steps(id),
  step_order int not null,
  status workflow_instance_step_status not null default 'pending',
  generated_task_id uuid references tasks(id),
  generated_approval_id uuid references approvals(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (instance_id, step_order)
);

create index workflow_instance_steps_instance_id_idx on workflow_instance_steps(instance_id);
create index workflow_instance_steps_generated_task_id_idx on workflow_instance_steps(generated_task_id);
create index workflow_instance_steps_generated_approval_id_idx on workflow_instance_steps(generated_approval_id);
```

By construction (engine logic in Task 10/11), at most one row per `instance_id` has `status = 'in_progress'` at a time — not a DB constraint, an invariant the domain layer maintains.

- [ ] **Step 2: Apply the migration**

`mcp__claude_ai_Supabase__apply_migration`, `name: "create_workflow_instance_steps"`, `query` from Step 1.

- [ ] **Step 3: Verify**

`list_tables` → expect `workflow_instance_steps`. Grants query (`table_name = 'workflow_instance_steps'`) → expect zero rows.

- [ ] **Step 4: Rename the local file**

`list_migrations` → rename to `<version>_create_workflow_instance_steps.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add workflow_instance_steps table"
```

---

## Task 5: Migration — `tasks.related_workflow_instance_id` column

**Files:**
- Create: `supabase/migrations/<timestamp>_add_tasks_related_workflow_instance_id.sql`

**Interfaces:**
- Consumes: `tasks` (Phase 2), `workflow_instances` (Task 3).
- Produces: `tasks.related_workflow_instance_id uuid references workflow_instances(id)`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/<YYYYMMDDHHMMSS>_add_tasks_related_workflow_instance_id.sql` (timestamp later than Task 4's) with:

```sql
alter table tasks add column related_workflow_instance_id uuid references workflow_instances(id);

create index tasks_related_workflow_instance_id_idx on tasks(related_workflow_instance_id);
```

- [ ] **Step 2: Apply the migration**

`mcp__claude_ai_Supabase__apply_migration`, `name: "add_tasks_related_workflow_instance_id"`, `query` from Step 1.

- [ ] **Step 3: Verify**

```sql
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'tasks' and column_name = 'related_workflow_instance_id';
```
Expected: one row, `data_type = 'uuid'`.

- [ ] **Step 4: Rename the local file**

`list_migrations` → rename to `<version>_add_tasks_related_workflow_instance_id.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add tasks.related_workflow_instance_id column"
```

---

## Task 6: Regenerate Supabase types

**Files:**
- Modify: `lib/supabase/database.types.ts`

**Interfaces:**
- Produces: `Database["public"]["Tables"]` including `workflow_templates`, `workflow_template_steps`, `workflow_instances`, `workflow_instance_steps`, and `tasks` with `related_workflow_instance_id`, matching Tasks 1–5.

- [ ] **Step 1: Regenerate the database types**

Call `mcp__claude_ai_Supabase__generate_typescript_types` with `project_id: "yqzcunssgvffischmwle"`. Overwrite `lib/supabase/database.types.ts` with the tool's `types` field verbatim.

- [ ] **Step 2: Verify the project builds**

Run: `pnpm build`
Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/database.types.ts
git commit -m "chore: regenerate Supabase types for Phase 4 tables"
```

---

## Task 7: `findEarliestProfileByRole` — move from `requests.ts` to `profiles.ts` and generalize

**Files:**
- Modify: `lib/domain/profiles.ts`, `lib/domain/profiles.test.ts`, `lib/domain/requests.ts`

**Interfaces:**
- Consumes: `Profile`, `getProfileById` (already in `profiles.ts`); `Role` (`@/lib/validation/auth`).
- Produces: `findEarliestProfileByRole(companyId: string, role: Role): Promise<Profile | null>`, exported from `lib/domain/profiles.ts` — consumed by `requests.ts`'s existing `resolveApprover` (unchanged call sites) and by `lib/domain/workflows.ts` (Task 10).

`requests.ts` currently has a private, narrowly-typed copy of this exact function (`role: "operations_manager" | "admin"`). `workflows.ts` needs the same "earliest-created profile with role X in company Y" lookup for arbitrary roles (`it`, `manager`, `operations_manager`). Rather than duplicate it, this task relocates and generalizes it — no behavior change for `requests.ts`'s existing callers.

- [ ] **Step 1: Write the failing test**

Add to `lib/domain/profiles.test.ts`, inside the existing `describe.skipIf(...)(...)` block (after the `listProfilesByRole` test, before the closing `}\n);`):

```ts
    it("finds the earliest-created profile with a given role, or null if none exists", async () => {
      const { data: authUserA, error: authErrorA } = await supabase.auth.admin.createUser({
        email: `profile-test-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
      if (authErrorA || !authUserA.user) throw authErrorA;
      createdAuthUserIds.push(authUserA.user.id);
      const first = await createProfile({
        authUserId: authUserA.user.id,
        companyId,
        fullName: "First IT",
        role: "it",
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
        fullName: "Second IT",
        role: "it",
      });

      const earliest = await findEarliestProfileByRole(companyId, "it");
      expect(earliest?.id).toBe(first.id);

      const none = await findEarliestProfileByRole(companyId, "hr");
      expect(none).toBeNull();
    });
```

Update the import at the top of the file:

```ts
import {
  createProfile,
  findEarliestProfileByRole,
  getProfileByAuthUserId,
  getProfileById,
  listProfilesByRole,
} from "@/lib/domain/profiles";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration lib/domain/profiles.test.ts`
Expected: FAIL — `findEarliestProfileByRole` is not exported from `@/lib/domain/profiles`.

- [ ] **Step 3: Add `findEarliestProfileByRole` to `lib/domain/profiles.ts`**

Add the import and function (append after `listProfilesByRole`, before `createProfile`):

```ts
import type { Role } from "@/lib/validation/auth";
```

(This becomes the second import line, after `createSupabaseAdminClient`.)

```ts
export async function findEarliestProfileByRole(
  companyId: string,
  role: Role
): Promise<Profile | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("company_id", companyId)
    .eq("role", role)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return getProfileById(data.id);
}
```

- [ ] **Step 4: Remove the duplicate from `lib/domain/requests.ts` and import the shared one**

In `lib/domain/requests.ts`, delete this function (currently between `listRequests` and `resolveApprover`):

```ts
async function findEarliestProfileByRole(
  companyId: string,
  role: "operations_manager" | "admin"
): Promise<Profile | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("company_id", companyId)
    .eq("role", role)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return getProfileById(data.id);
}
```

Change the top-of-file import from:

```ts
import { getProfileById, type Profile } from "@/lib/domain/profiles";
```

to:

```ts
import { findEarliestProfileByRole, getProfileById, type Profile } from "@/lib/domain/profiles";
```

`resolveApprover`'s two call sites (`findEarliestProfileByRole(profile.companyId, "operations_manager")` and `findEarliestProfileByRole(profile.companyId, "admin")`) are unchanged — both are valid `Role` values, so no call-site edits are needed.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test:integration lib/domain/profiles.test.ts lib/domain/requests.test.ts`
Expected: PASS — `profiles.test.ts` gains 1 test (6 total), `requests.test.ts`'s existing 6 tests are unaffected (submit-adjacent tests aren't in this file yet — they land in Phase 3's `requests.test.ts` unchanged).

Run: `pnpm build`
Expected: no type errors (confirms no other file imported the now-deleted private function).

- [ ] **Step 6: Commit**

```bash
git add lib/domain/profiles.ts lib/domain/profiles.test.ts lib/domain/requests.ts
git commit -m "refactor: move findEarliestProfileByRole to profiles.ts and generalize its role type"
```

---

## Task 8: Seed the three workflow templates

**Files:**
- Modify: `lib/domain/seed.ts`, `lib/domain/seed.test.ts`, `scripts/seed.ts`

**Interfaces:**
- Consumes: `createSupabaseAdminClient` (Foundation); `RequestCategory` (`@/lib/domain/request-status`); `Role` (`@/lib/validation/auth`).
- Produces: `seedWorkflowTemplates(companyId: string): Promise<void>` — idempotent upsert of `equipment-request`, `maintenance`, `employee-onboarding` templates and their steps. Consumed by `scripts/seed.ts` and, indirectly, by Task 10/11/12's integration tests that rely on `describe.skipIf`'s live project already having these templates seeded is **not** assumed — every workflow test in this plan inserts its own isolated test template (see Task 10), so this function is only exercised by `seed.test.ts` and the manual `pnpm seed` script.

- [ ] **Step 1: Write the failing test**

Add to `lib/domain/seed.test.ts`, a new `describe` block after the existing `seedFoundationData` one:

```ts
describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("seedWorkflowTemplates", () => {
  it("seeds the three workflow templates with their steps, and is idempotent", async () => {
    const supabase = createSupabaseAdminClient();
    const { companyId } = await seedFoundationData();

    await seedWorkflowTemplates(companyId);
    await seedWorkflowTemplates(companyId);

    const { data: templates, error: templatesError } = await supabase
      .from("workflow_templates")
      .select("id, slug, trigger_category")
      .eq("company_id", companyId);
    if (templatesError) throw templatesError;
    expect(templates?.map((t) => t.slug).sort()).toEqual(
      ["employee-onboarding", "equipment-request", "maintenance"].sort()
    );

    const equipmentTemplate = templates!.find((t) => t.slug === "equipment-request")!;
    expect(equipmentTemplate.trigger_category).toBe("equipment");
    const onboardingTemplate = templates!.find((t) => t.slug === "employee-onboarding")!;
    expect(onboardingTemplate.trigger_category).toBeNull();

    const { data: equipmentSteps, error: stepsError } = await supabase
      .from("workflow_template_steps")
      .select("step_order, step_type, title, responsible_role, responsible_department_name")
      .eq("template_id", equipmentTemplate.id)
      .order("step_order", { ascending: true });
    if (stepsError) throw stepsError;
    expect(equipmentSteps?.map((s) => s.title)).toEqual([
      "IT Review",
      "Procurement",
      "Ordered",
      "Delivered",
      "Asset Assigned",
    ]);
    expect(equipmentSteps?.[0]).toMatchObject({
      step_type: "approval",
      responsible_role: "it",
      responsible_department_name: null,
    });
    expect(equipmentSteps?.[1]).toMatchObject({
      step_type: "task",
      responsible_role: null,
      responsible_department_name: "Procurement",
    });
  });
});
```

Update the import at the top of `lib/domain/seed.test.ts`:

```ts
import {
  seedFoundationData,
  seedWorkflowTemplates,
  ALPENTECH_DEPARTMENTS,
  ALPENTECH_LOCATIONS,
} from "@/lib/domain/seed";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration lib/domain/seed.test.ts`
Expected: FAIL — `seedWorkflowTemplates` is not exported from `@/lib/domain/seed`.

- [ ] **Step 3: Implement `seedWorkflowTemplates` in `lib/domain/seed.ts`**

Add imports at the top:

```ts
import type { RequestCategory } from "@/lib/domain/request-status";
import type { Role } from "@/lib/validation/auth";
```

Append to the end of the file:

```ts
interface WorkflowTemplateStepSeed {
  order: number;
  type: "task" | "approval";
  title: string;
  description: string | null;
  responsibleRole: Role | null;
  responsibleDepartmentName: string | null;
}

interface WorkflowTemplateSeed {
  slug: string;
  name: string;
  triggerCategory: RequestCategory | null;
  steps: WorkflowTemplateStepSeed[];
}

export const WORKFLOW_TEMPLATES: WorkflowTemplateSeed[] = [
  {
    slug: "equipment-request",
    name: "Equipment Request",
    triggerCategory: "equipment",
    steps: [
      {
        order: 1,
        type: "approval",
        title: "IT Review",
        description: null,
        responsibleRole: "it",
        responsibleDepartmentName: null,
      },
      {
        order: 2,
        type: "task",
        title: "Procurement",
        description: null,
        responsibleRole: null,
        responsibleDepartmentName: "Procurement",
      },
      {
        order: 3,
        type: "task",
        title: "Ordered",
        description: null,
        responsibleRole: null,
        responsibleDepartmentName: "Procurement",
      },
      {
        order: 4,
        type: "task",
        title: "Delivered",
        description: null,
        responsibleRole: null,
        responsibleDepartmentName: "Procurement",
      },
      {
        order: 5,
        type: "task",
        title: "Asset Assigned",
        description: null,
        responsibleRole: null,
        responsibleDepartmentName: "IT",
      },
    ],
  },
  {
    slug: "maintenance",
    name: "Maintenance",
    triggerCategory: "maintenance",
    steps: [
      {
        order: 1,
        type: "task",
        title: "Employee Assigned",
        description: null,
        responsibleRole: null,
        responsibleDepartmentName: "Operations",
      },
      {
        order: 2,
        type: "task",
        title: "Repair",
        description: null,
        responsibleRole: null,
        responsibleDepartmentName: "Operations",
      },
      {
        order: 3,
        type: "approval",
        title: "Verification",
        description: null,
        responsibleRole: "operations_manager",
        responsibleDepartmentName: null,
      },
    ],
  },
  {
    slug: "employee-onboarding",
    name: "Employee Onboarding",
    triggerCategory: null,
    steps: [
      {
        order: 1,
        type: "task",
        title: "Create company account",
        description: null,
        responsibleRole: null,
        responsibleDepartmentName: "IT",
      },
      {
        order: 2,
        type: "task",
        title: "Prepare laptop",
        description: null,
        responsibleRole: null,
        responsibleDepartmentName: "IT",
      },
      {
        order: 3,
        type: "task",
        title: "Prepare workspace",
        description: null,
        responsibleRole: null,
        responsibleDepartmentName: "Operations",
      },
      {
        order: 4,
        type: "task",
        title: "Welcome meeting",
        description: null,
        responsibleRole: "manager",
        responsibleDepartmentName: null,
      },
      {
        order: 5,
        type: "task",
        title: "Manager confirms",
        description: null,
        responsibleRole: "manager",
        responsibleDepartmentName: null,
      },
    ],
  },
];

export async function seedWorkflowTemplates(companyId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();

  for (const template of WORKFLOW_TEMPLATES) {
    const { data: templateRow, error: templateError } = await supabase
      .from("workflow_templates")
      .upsert(
        {
          company_id: companyId,
          slug: template.slug,
          name: template.name,
          trigger_category: template.triggerCategory,
        },
        { onConflict: "company_id,slug" }
      )
      .select("id")
      .single();
    if (templateError) throw templateError;

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
    if (stepsError) throw stepsError;
  }
}
```

`idea.md` §12 assigns "Prepare workspace" to "Office Operations", which isn't one of `ALPENTECH_DEPARTMENTS` — mapped to "Operations" instead, per the design spec's note (not user-visible this phase since onboarding isn't startable).

- [ ] **Step 4: Wire it into `scripts/seed.ts`**

Replace the file content:

```ts
import { config as loadEnv } from "dotenv";
import { seedFoundationData, seedWorkflowTemplates } from "@/lib/domain/seed";

loadEnv({ path: ".env.local" });

seedFoundationData()
  .then(async ({ companyId }) => {
    await seedWorkflowTemplates(companyId);
    console.log(`Seeded AlpenTech Industries (${companyId}) and its workflow templates.`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test:integration lib/domain/seed.test.ts`
Expected: PASS (2 tests — the existing `seedFoundationData` test plus the new one).

- [ ] **Step 6: Run the seed smoke test**

`scripts/seed.smoke.test.ts` already runs `pnpm seed`-equivalent logic against the live project as part of `test:integration` — no change needed to that file, but confirm it still passes since `scripts/seed.ts` changed:

Run: `pnpm test:integration scripts/seed.smoke.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/domain/seed.ts lib/domain/seed.test.ts scripts/seed.ts
git commit -m "feat: seed the three phase 4 workflow templates"
```

---

## Task 9: Permissions — `canViewWorkflowInstance`

**Files:**
- Modify: `lib/domain/permissions.ts`, `lib/domain/permissions.test.ts`

**Interfaces:**
- Consumes: `Profile`; `RequestLike`, `canViewRequest`, `COMPANY_WIDE_VIEW_ROLES` (all already in this file).
- Produces: `canViewWorkflowInstance(profile, instance, request, approverId): boolean` — consumed by `lib/domain/workflows.ts`'s `getWorkflowProgress` (Task 11).

- [ ] **Step 1: Write the failing tests**

Update the import at the top of `lib/domain/permissions.test.ts` to add `canViewWorkflowInstance`:

```ts
import {
  canAssignTask,
  canChangeTaskStatus,
  canCommentOnRequest,
  canCreateRequest,
  canCreateTask,
  canDecideApproval,
  canDeleteTask,
  canTransitionRequestStatus,
  canUploadRequestAttachment,
  canViewRequest,
  canViewTask,
  canViewWorkflowInstance,
} from "@/lib/domain/permissions";
```

Append at the end of the file:

```ts
describe("canViewWorkflowInstance", () => {
  it("denies a profile from a different company", () => {
    const profile = makeProfile({ companyId: "other-company" });
    expect(
      canViewWorkflowInstance(profile, { companyId: "company-1" }, makeRequest(), null)
    ).toBe(false);
  });

  it("delegates to canViewRequest when the instance is linked to a request", () => {
    const creator = makeProfile({ id: "creator-1" });
    expect(
      canViewWorkflowInstance(
        creator,
        { companyId: "company-1" },
        makeRequest({ createdBy: "creator-1" }),
        null
      )
    ).toBe(true);

    const stranger = makeProfile({ id: "someone-else" });
    expect(
      canViewWorkflowInstance(stranger, { companyId: "company-1" }, makeRequest(), null)
    ).toBe(false);
  });

  it("falls back to COMPANY_WIDE_VIEW_ROLES when there is no linked request", () => {
    const opsManager = makeProfile({ id: "someone-else", role: "operations_manager" });
    expect(canViewWorkflowInstance(opsManager, { companyId: "company-1" }, null, null)).toBe(
      true
    );

    const employee = makeProfile({ id: "someone-else" });
    expect(canViewWorkflowInstance(employee, { companyId: "company-1" }, null, null)).toBe(
      false
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/domain/permissions.test.ts`
Expected: FAIL — `canViewWorkflowInstance` is not exported.

- [ ] **Step 3: Add `canViewWorkflowInstance` to `lib/domain/permissions.ts`**

Append to the end of the file:

```ts
export function canViewWorkflowInstance(
  profile: Profile,
  instance: { companyId: string },
  request: RequestLike | null,
  approverId: string | null
): boolean {
  if (profile.companyId !== instance.companyId) return false;
  if (request) return canViewRequest(profile, request, approverId);
  return COMPANY_WIDE_VIEW_ROLES.has(profile.role);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test lib/domain/permissions.test.ts`
Expected: PASS (41 tests — 38 existing plus 3 new).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/permissions.ts lib/domain/permissions.test.ts
git commit -m "feat: add canViewWorkflowInstance permission"
```

---

## Task 10: Workflow engine domain layer — types, template loaders, `startWorkflow`

**Files:**
- Create: `lib/domain/workflows.ts`
- Test: `lib/domain/workflows.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `Profile`, `findEarliestProfileByRole` (Task 7); `logActivity` (Phase 2); `broadcastChange` (Phase 2); `createNotification` (Phase 3); `NotFoundError`, `UnprocessableRequestError` (Phase 2); `RequestCategory` (`@/lib/domain/request-status`); `Role` (`@/lib/validation/auth`); `createSupabaseAdminClient` (Foundation).
- Produces: `WorkflowTemplate`, `WorkflowTemplateStep`, `WorkflowInstance`, `WorkflowInstanceStep` (types); `listWorkflowTemplates(companyId): Promise<WorkflowTemplate[]>`; `startWorkflow(profile, templateSlug, context: { requestId?: string }): Promise<WorkflowInstance>` — consumed by `lib/domain/approvals.ts` (Task 12) and the `/api/workflows/templates` route (Task 13). This task also defines the private `generateStepEntity` helper, extended by Task 11.

- [ ] **Step 1: Write the failing test**

Create `lib/domain/workflows.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile } from "@/lib/domain/profiles";
import type { Profile } from "@/lib/domain/profiles";
import { createRequest } from "@/lib/domain/requests";
import { startWorkflow, listWorkflowTemplates } from "@/lib/domain/workflows";
import { NotFoundError } from "@/lib/domain/errors";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("startWorkflow", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  let departmentId: string;
  const createdAuthUserIds: string[] = [];
  let employee: Profile;
  let itProfile: Profile;
  let taskOnlyTemplateId: string;
  let approvalFirstTemplateId: string;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (workflows)", slug: "test-co-workflows" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: department, error: departmentError } = await supabase
      .from("departments")
      .upsert(
        { company_id: companyId, name: "Ops (workflows test)" },
        { onConflict: "company_id,name" }
      )
      .select("id")
      .single();
    if (departmentError) throw departmentError;
    departmentId = department.id;

    async function createTestProfile(fullName: string, role: Profile["role"]) {
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: `workflows-test-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
      if (authError || !authUser.user) throw authError;
      createdAuthUserIds.push(authUser.user.id);
      return createProfile({ authUserId: authUser.user.id, companyId, fullName, role });
    }

    employee = await createTestProfile("Employee (workflows)", "employee");
    itProfile = await createTestProfile("IT Person (workflows)", "it");

    const { data: taskOnlyTemplate, error: taskOnlyError } = await supabase
      .from("workflow_templates")
      .insert({ company_id: companyId, slug: "task-only-test", name: "Task Only Test" })
      .select("id")
      .single();
    if (taskOnlyError) throw taskOnlyError;
    taskOnlyTemplateId = taskOnlyTemplate.id;
    const { error: taskOnlyStepsError } = await supabase.from("workflow_template_steps").insert([
      {
        template_id: taskOnlyTemplateId,
        step_order: 1,
        step_type: "task",
        title: "First task step",
        responsible_department_name: "Ops (workflows test)",
      },
      {
        template_id: taskOnlyTemplateId,
        step_order: 2,
        step_type: "task",
        title: "Second task step",
        responsible_department_name: "Ops (workflows test)",
      },
    ]);
    if (taskOnlyStepsError) throw taskOnlyStepsError;

    const { data: approvalFirstTemplate, error: approvalFirstError } = await supabase
      .from("workflow_templates")
      .insert({
        company_id: companyId,
        slug: "approval-first-test",
        name: "Approval First Test",
        trigger_category: "equipment",
      })
      .select("id")
      .single();
    if (approvalFirstError) throw approvalFirstError;
    approvalFirstTemplateId = approvalFirstTemplate.id;
    const { error: approvalFirstStepsError } = await supabase
      .from("workflow_template_steps")
      .insert({
        template_id: approvalFirstTemplateId,
        step_order: 1,
        step_type: "approval",
        title: "First approval step",
        responsible_role: "it",
      });
    if (approvalFirstStepsError) throw approvalFirstStepsError;
  });

  afterAll(async () => {
    await supabase.from("workflow_instances").delete().eq("company_id", companyId);
    await supabase
      .from("workflow_template_steps")
      .delete()
      .in("template_id", [taskOnlyTemplateId, approvalFirstTemplateId]);
    await supabase
      .from("workflow_templates")
      .delete()
      .in("id", [taskOnlyTemplateId, approvalFirstTemplateId]);
    await supabase.from("requests").delete().eq("company_id", companyId);
    await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
    for (const id of createdAuthUserIds) {
      await supabase.auth.admin.deleteUser(id);
    }
    await supabase.from("companies").delete().eq("slug", "test-co-workflows");
  });

  it("lists templates for a company", async () => {
    const templates = await listWorkflowTemplates(companyId);
    expect(templates.map((t) => t.slug).sort()).toEqual(
      ["approval-first-test", "task-only-test"].sort()
    );
  });

  it("throws NotFoundError for an unknown template slug", async () => {
    await expect(startWorkflow(employee, "no-such-template", {})).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it("creates all steps and generates the first step's task, unassigned with the department set", async () => {
    const instance = await startWorkflow(employee, "task-only-test", {});
    expect(instance.status).toBe("in_progress");
    expect(instance.relatedRequestId).toBeNull();

    const { data: steps, error } = await supabase
      .from("workflow_instance_steps")
      .select("step_order, status, generated_task_id")
      .eq("instance_id", instance.id)
      .order("step_order", { ascending: true });
    if (error) throw error;
    expect(steps).toHaveLength(2);
    expect(steps![0].status).toBe("in_progress");
    expect(steps![0].generated_task_id).not.toBeNull();
    expect(steps![1].status).toBe("pending");
    expect(steps![1].generated_task_id).toBeNull();

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("assignee_id, department_id, related_workflow_instance_id")
      .eq("id", steps![0].generated_task_id)
      .single();
    if (taskError) throw taskError;
    expect(task.assignee_id).toBeNull();
    expect(task.department_id).toBe(departmentId);
    expect(task.related_workflow_instance_id).toBe(instance.id);
  });

  it("generates the first step's approval when the template starts with one, and sets the request in_progress", async () => {
    const request = await createRequest(employee, { title: "New laptop", category: "equipment" });

    const instance = await startWorkflow(employee, "approval-first-test", {
      requestId: request.id,
    });
    expect(instance.relatedRequestId).toBe(request.id);

    const { data: step, error } = await supabase
      .from("workflow_instance_steps")
      .select("status, generated_approval_id")
      .eq("instance_id", instance.id)
      .eq("step_order", 1)
      .single();
    if (error) throw error;
    expect(step.status).toBe("in_progress");
    expect(step.generated_approval_id).not.toBeNull();

    const { data: approval, error: approvalError } = await supabase
      .from("approvals")
      .select("approver_id, request_id, status")
      .eq("id", step.generated_approval_id)
      .single();
    if (approvalError) throw approvalError;
    expect(approval.approver_id).toBe(itProfile.id);
    expect(approval.request_id).toBe(request.id);
    expect(approval.status).toBe("pending");

    const { data: updatedRequest, error: requestError } = await supabase
      .from("requests")
      .select("status")
      .eq("id", request.id)
      .single();
    if (requestError) throw requestError;
    expect(updatedRequest.status).toBe("in_progress");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration lib/domain/workflows.test.ts`
Expected: FAIL — `@/lib/domain/workflows` cannot be found.

- [ ] **Step 3: Implement `lib/domain/workflows.ts`**

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { findEarliestProfileByRole, type Profile } from "@/lib/domain/profiles";
import { logActivity } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import { createNotification } from "@/lib/domain/notifications";
import { NotFoundError, UnprocessableRequestError } from "@/lib/domain/errors";
import type { RequestCategory } from "@/lib/domain/request-status";
import type { Role } from "@/lib/validation/auth";

export interface WorkflowTemplate {
  id: string;
  companyId: string;
  slug: string;
  name: string;
  triggerCategory: RequestCategory | null;
  createdAt: string;
}

interface WorkflowTemplateRow {
  id: string;
  company_id: string;
  slug: string;
  name: string;
  trigger_category: RequestCategory | null;
  created_at: string;
}

function toWorkflowTemplate(row: WorkflowTemplateRow): WorkflowTemplate {
  return {
    id: row.id,
    companyId: row.company_id,
    slug: row.slug,
    name: row.name,
    triggerCategory: row.trigger_category,
    createdAt: row.created_at,
  };
}

const WORKFLOW_TEMPLATE_COLUMNS = "id, company_id, slug, name, trigger_category, created_at";

export interface WorkflowTemplateStep {
  id: string;
  templateId: string;
  stepOrder: number;
  stepType: "task" | "approval";
  title: string;
  description: string | null;
  responsibleRole: Role | null;
  responsibleDepartmentName: string | null;
}

interface WorkflowTemplateStepRow {
  id: string;
  template_id: string;
  step_order: number;
  step_type: "task" | "approval";
  title: string;
  description: string | null;
  responsible_role: Role | null;
  responsible_department_name: string | null;
}

function toWorkflowTemplateStep(row: WorkflowTemplateStepRow): WorkflowTemplateStep {
  return {
    id: row.id,
    templateId: row.template_id,
    stepOrder: row.step_order,
    stepType: row.step_type,
    title: row.title,
    description: row.description,
    responsibleRole: row.responsible_role,
    responsibleDepartmentName: row.responsible_department_name,
  };
}

const WORKFLOW_TEMPLATE_STEP_COLUMNS =
  "id, template_id, step_order, step_type, title, description, responsible_role, responsible_department_name";

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

export interface WorkflowInstanceStep {
  id: string;
  instanceId: string;
  templateStepId: string;
  stepOrder: number;
  status: "pending" | "in_progress" | "completed";
  generatedTaskId: string | null;
  generatedApprovalId: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface WorkflowInstanceStepRow {
  id: string;
  instance_id: string;
  template_step_id: string;
  step_order: number;
  status: "pending" | "in_progress" | "completed";
  generated_task_id: string | null;
  generated_approval_id: string | null;
  created_at: string;
  completed_at: string | null;
}

function toWorkflowInstanceStep(row: WorkflowInstanceStepRow): WorkflowInstanceStep {
  return {
    id: row.id,
    instanceId: row.instance_id,
    templateStepId: row.template_step_id,
    stepOrder: row.step_order,
    status: row.status,
    generatedTaskId: row.generated_task_id,
    generatedApprovalId: row.generated_approval_id,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

const WORKFLOW_INSTANCE_STEP_COLUMNS =
  "id, instance_id, template_step_id, step_order, status, generated_task_id, generated_approval_id, created_at, completed_at";

export async function listWorkflowTemplates(companyId: string): Promise<WorkflowTemplate[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workflow_templates")
    .select(WORKFLOW_TEMPLATE_COLUMNS)
    .eq("company_id", companyId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toWorkflowTemplate);
}

async function loadTemplateBySlug(companyId: string, slug: string): Promise<WorkflowTemplate> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workflow_templates")
    .select(WORKFLOW_TEMPLATE_COLUMNS)
    .eq("company_id", companyId)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError(`Workflow template "${slug}" not found`);
  return toWorkflowTemplate(data);
}

async function loadTemplateById(templateId: string): Promise<WorkflowTemplate> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workflow_templates")
    .select(WORKFLOW_TEMPLATE_COLUMNS)
    .eq("id", templateId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError("Workflow template not found");
  return toWorkflowTemplate(data);
}

async function loadTemplateSteps(templateId: string): Promise<WorkflowTemplateStep[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workflow_template_steps")
    .select(WORKFLOW_TEMPLATE_STEP_COLUMNS)
    .eq("template_id", templateId)
    .order("step_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toWorkflowTemplateStep);
}

async function resolveDepartmentIdByName(
  companyId: string,
  name: string
): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("departments")
    .select("id")
    .eq("company_id", companyId)
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function generateStepEntity(
  profile: Profile,
  instance: WorkflowInstance,
  step: WorkflowTemplateStep
): Promise<{ generatedTaskId: string | null; generatedApprovalId: string | null }> {
  const supabase = createSupabaseAdminClient();

  if (step.stepType === "task") {
    let assigneeId: string | null = null;
    let departmentId: string | null = null;

    if (step.responsibleDepartmentName) {
      departmentId = await resolveDepartmentIdByName(
        instance.companyId,
        step.responsibleDepartmentName
      );
    } else if (step.responsibleRole) {
      const assignee = await findEarliestProfileByRole(instance.companyId, step.responsibleRole);
      if (!assignee) {
        throw new UnprocessableRequestError(
          `No profile with role "${step.responsibleRole}" found in company ${instance.companyId} for workflow step "${step.title}"`
        );
      }
      assigneeId = assignee.id;
    }

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        company_id: instance.companyId,
        title: step.title,
        description: step.description,
        status: "todo",
        creator_id: profile.id,
        assignee_id: assigneeId,
        department_id: departmentId,
        related_workflow_instance_id: instance.id,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { generatedTaskId: data.id, generatedApprovalId: null };
  }

  if (!step.responsibleRole) {
    throw new UnprocessableRequestError(
      `Approval step "${step.title}" has no responsible role configured`
    );
  }
  if (!instance.relatedRequestId) {
    throw new UnprocessableRequestError(
      `Approval step "${step.title}" requires a workflow instance linked to a request`
    );
  }

  const approver = await findEarliestProfileByRole(instance.companyId, step.responsibleRole);
  if (!approver) {
    throw new UnprocessableRequestError(
      `No profile with role "${step.responsibleRole}" found in company ${instance.companyId} for workflow step "${step.title}"`
    );
  }

  const { data, error } = await supabase
    .from("approvals")
    .insert({ request_id: instance.relatedRequestId, approver_id: approver.id, status: "pending" })
    .select("id")
    .single();
  if (error) throw error;

  await createNotification(
    approver.id,
    "request",
    instance.relatedRequestId,
    "approval_required",
    `"${step.title}" requires your approval`
  );

  return { generatedTaskId: null, generatedApprovalId: data.id };
}

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

  const { error: stepsError } = await supabase.from("workflow_instance_steps").insert(
    templateSteps.map((step) => ({
      instance_id: instance.id,
      template_step_id: step.id,
      step_order: step.stepOrder,
      status: "pending",
    }))
  );
  if (stepsError) throw stepsError;

  const firstStep = templateSteps[0];
  const generated = await generateStepEntity(profile, instance, firstStep);
  const { error: firstStepUpdateError } = await supabase
    .from("workflow_instance_steps")
    .update({
      status: "in_progress",
      generated_task_id: generated.generatedTaskId,
      generated_approval_id: generated.generatedApprovalId,
    })
    .eq("instance_id", instance.id)
    .eq("step_order", firstStep.stepOrder);
  if (firstStepUpdateError) throw firstStepUpdateError;

  if (context.requestId) {
    const { error: requestUpdateError } = await supabase
      .from("requests")
      .update({ status: "in_progress" })
      .eq("id", context.requestId);
    if (requestUpdateError) throw requestUpdateError;

    await logActivity(
      "request",
      context.requestId,
      profile.id,
      `Workflow "${template.name}" started`
    );
  }

  try {
    await broadcastChange(profile.companyId, "workflows", { type: "workflow_started" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }

  return instance;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:integration lib/domain/workflows.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Register the new integration test in `package.json`**

```json
"test:unit": "vitest run --exclude \"lib/domain/profiles.test.ts\" --exclude \"lib/domain/seed.test.ts\" --exclude \"lib/domain/activity.test.ts\" --exclude \"lib/domain/comments.test.ts\" --exclude \"lib/domain/tasks.test.ts\" --exclude \"lib/domain/attachments.test.ts\" --exclude \"lib/domain/notifications.test.ts\" --exclude \"lib/domain/requests.test.ts\" --exclude \"lib/domain/approvals.test.ts\" --exclude \"lib/domain/workflows.test.ts\" --exclude \"scripts/seed.smoke.test.ts\"",
"test:integration": "vitest run lib/domain/profiles.test.ts lib/domain/seed.test.ts lib/domain/activity.test.ts lib/domain/comments.test.ts lib/domain/tasks.test.ts lib/domain/attachments.test.ts lib/domain/notifications.test.ts lib/domain/requests.test.ts lib/domain/approvals.test.ts lib/domain/workflows.test.ts scripts/seed.smoke.test.ts",
```

- [ ] **Step 6: Commit**

```bash
git add lib/domain/workflows.ts lib/domain/workflows.test.ts package.json
git commit -m "feat: add workflow engine domain layer — templates, startWorkflow"
```

---

## Task 11: Workflow engine domain layer — `advanceWorkflow`, `getWorkflowProgress`, finder helpers

**Files:**
- Modify: `lib/domain/workflows.ts`, `lib/domain/workflows.test.ts`

**Interfaces:**
- Consumes: everything from Task 10 (same file); `loadRequestOrThrow` (`@/lib/domain/requests`); `canViewWorkflowInstance` (Task 9); `ForbiddenError` (Phase 2).
- Produces: `advanceWorkflow(profile, instanceId): Promise<void>`, `getWorkflowProgress(profile, instanceId): Promise<WorkflowProgress>`, `getWorkflowInstanceForRequest(requestId): Promise<WorkflowInstance | null>`, `findWorkflowStepByApprovalId(approvalId): Promise<WorkflowInstanceStep | null>`, `findWorkflowTemplateByTriggerCategory(companyId, category): Promise<WorkflowTemplate | null>` — all consumed by `lib/domain/approvals.ts`/`lib/domain/tasks.ts` (Task 12) and the `/api/workflows/instances/[id]` route (Task 14) and the request detail page (Task 17).

- [ ] **Step 1: Write the failing test**

Append to `lib/domain/workflows.test.ts`, a new `describe` block after the `startWorkflow` one, reusing that block's `beforeAll`/`afterAll` fixtures by restructuring the file's top-level `describe.skipIf` to wrap **both** blocks. Change the file's structure: rename the existing `describe.skipIf(...)("startWorkflow", ...)` wrapper to `describe.skipIf(...)("workflow engine", ...)`, and nest two inner `describe` blocks (`"startWorkflow"` and `"advanceWorkflow / getWorkflowProgress / finders"`) inside it, sharing the single `beforeAll`/`afterAll`. Concretely, change the top of the file's `describe` call from:

```ts
describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("startWorkflow", () => {
```

to:

```ts
describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("workflow engine", () => {
```

Wrap the existing four `it(...)` blocks (from Task 10) in `describe("startWorkflow", () => { ... });` immediately after the `afterAll` block, and add a sibling `describe` after it:

```ts
  describe("advanceWorkflow / getWorkflowProgress / finders", () => {
    it("advances to the next step, generating its entity, when the current step's generated task completes", async () => {
      const instance = await startWorkflow(employee, "task-only-test", {});
      const { data: firstStepBefore, error: firstStepError } = await supabase
        .from("workflow_instance_steps")
        .select("id, generated_task_id")
        .eq("instance_id", instance.id)
        .eq("step_order", 1)
        .single();
      if (firstStepError) throw firstStepError;

      await advanceWorkflow(employee, instance.id);

      const { data: steps, error: stepsError } = await supabase
        .from("workflow_instance_steps")
        .select("step_order, status, generated_task_id")
        .eq("instance_id", instance.id)
        .order("step_order", { ascending: true });
      if (stepsError) throw stepsError;
      expect(steps![0].status).toBe("completed");
      expect(steps![0].generated_task_id).toBe(firstStepBefore.generated_task_id);
      expect(steps![1].status).toBe("in_progress");
      expect(steps![1].generated_task_id).not.toBeNull();

      const { data: instanceRow, error: instanceError } = await supabase
        .from("workflow_instances")
        .select("status")
        .eq("id", instance.id)
        .single();
      if (instanceError) throw instanceError;
      expect(instanceRow.status).toBe("in_progress");
    });

    it("completes the instance and the linked request once the last step advances", async () => {
      const request = await createRequest(employee, {
        title: "Broken monitor",
        category: "equipment",
      });
      const instance = await startWorkflow(employee, "approval-first-test", {
        requestId: request.id,
      });

      await advanceWorkflow(employee, instance.id);

      const { data: instanceRow, error: instanceError } = await supabase
        .from("workflow_instances")
        .select("status")
        .eq("id", instance.id)
        .single();
      if (instanceError) throw instanceError;
      expect(instanceRow.status).toBe("completed");

      const { data: requestRow, error: requestError } = await supabase
        .from("requests")
        .select("status")
        .eq("id", request.id)
        .single();
      if (requestError) throw requestError;
      expect(requestRow.status).toBe("completed");
    });

    it("is a no-op when the instance is already completed", async () => {
      const instance = await startWorkflow(employee, "approval-first-test", {});
      await advanceWorkflow(employee, instance.id);
      await expect(advanceWorkflow(employee, instance.id)).resolves.toBeUndefined();

      const { data: instanceRow, error } = await supabase
        .from("workflow_instances")
        .select("status")
        .eq("id", instance.id)
        .single();
      if (error) throw error;
      expect(instanceRow.status).toBe("completed");
    });

    it("returns progress with step titles/types from the template, and enforces view permission", async () => {
      const instance = await startWorkflow(employee, "task-only-test", {});
      const progress = await getWorkflowProgress(employee, instance.id);
      expect(progress.instance.id).toBe(instance.id);
      expect(progress.steps).toHaveLength(2);
      expect(progress.steps[0].title).toBe("First task step");
      expect(progress.steps[0].stepType).toBe("task");
      expect(progress.steps[0].responsibleDepartmentName).toBe("Ops (workflows test)");
    });

    it("denies getWorkflowProgress to an unrelated employee when the instance is linked to a request", async () => {
      const request = await createRequest(employee, { title: "Denied view", category: "equipment" });
      const instance = await startWorkflow(employee, "approval-first-test", {
        requestId: request.id,
      });

      const { data: strangerAuthUser, error: strangerAuthError } =
        await supabase.auth.admin.createUser({
          email: `workflows-test-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
      if (strangerAuthError || !strangerAuthUser.user) throw strangerAuthError;
      createdAuthUserIds.push(strangerAuthUser.user.id);
      const stranger = await createProfile({
        authUserId: strangerAuthUser.user.id,
        companyId,
        fullName: "Stranger (workflows)",
        role: "employee",
      });

      await expect(getWorkflowProgress(stranger, instance.id)).rejects.toBeInstanceOf(
        ForbiddenError
      );
    });

    it("finds the workflow step generated for a given approval id, or null", async () => {
      const request = await createRequest(employee, { title: "Finder test", category: "equipment" });
      const instance = await startWorkflow(employee, "approval-first-test", {
        requestId: request.id,
      });
      const { data: step, error } = await supabase
        .from("workflow_instance_steps")
        .select("generated_approval_id")
        .eq("instance_id", instance.id)
        .single();
      if (error) throw error;

      const found = await findWorkflowStepByApprovalId(step.generated_approval_id!);
      expect(found?.instanceId).toBe(instance.id);

      const notFound = await findWorkflowStepByApprovalId(crypto.randomUUID());
      expect(notFound).toBeNull();
    });

    it("finds a template by trigger category, or null when none matches", async () => {
      const found = await findWorkflowTemplateByTriggerCategory(companyId, "equipment");
      expect(found?.slug).toBe("approval-first-test");

      const notFound = await findWorkflowTemplateByTriggerCategory(companyId, "hr");
      expect(notFound).toBeNull();
    });

    it("finds the workflow instance for a request, or null", async () => {
      const request = await createRequest(employee, { title: "Lookup test", category: "equipment" });
      const instance = await startWorkflow(employee, "approval-first-test", {
        requestId: request.id,
      });

      const found = await getWorkflowInstanceForRequest(request.id);
      expect(found?.id).toBe(instance.id);

      const otherRequest = await createRequest(employee, { title: "No workflow", category: "hr" });
      const notFound = await getWorkflowInstanceForRequest(otherRequest.id);
      expect(notFound).toBeNull();
    });
  });
});
```

Update the imports at the top of the file:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile } from "@/lib/domain/profiles";
import type { Profile } from "@/lib/domain/profiles";
import { createRequest } from "@/lib/domain/requests";
import {
  advanceWorkflow,
  findWorkflowStepByApprovalId,
  findWorkflowTemplateByTriggerCategory,
  getWorkflowInstanceForRequest,
  getWorkflowProgress,
  listWorkflowTemplates,
  startWorkflow,
} from "@/lib/domain/workflows";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration lib/domain/workflows.test.ts`
Expected: FAIL — `advanceWorkflow`, `getWorkflowProgress`, `findWorkflowStepByApprovalId`, `findWorkflowTemplateByTriggerCategory`, `getWorkflowInstanceForRequest` are not exported.

- [ ] **Step 3: Append the new functions to `lib/domain/workflows.ts`**

Add to the imports at the top:

```ts
import { loadRequestOrThrow } from "@/lib/domain/requests";
import { canViewWorkflowInstance } from "@/lib/domain/permissions";
import { ForbiddenError } from "@/lib/domain/errors";
```

(`NotFoundError`/`UnprocessableRequestError` are already imported from Task 10.)

Append to the end of the file:

```ts
async function loadInstanceOrThrow(instanceId: string): Promise<WorkflowInstance> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workflow_instances")
    .select(WORKFLOW_INSTANCE_COLUMNS)
    .eq("id", instanceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError("Workflow instance not found");
  return toWorkflowInstance(data);
}

async function loadInstanceSteps(instanceId: string): Promise<WorkflowInstanceStep[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workflow_instance_steps")
    .select(WORKFLOW_INSTANCE_STEP_COLUMNS)
    .eq("instance_id", instanceId)
    .order("step_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toWorkflowInstanceStep);
}

async function loadApproverIdForRequest(requestId: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("approvals")
    .select("approver_id")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.approver_id ?? null;
}

export async function getWorkflowInstanceForRequest(
  requestId: string
): Promise<WorkflowInstance | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workflow_instances")
    .select(WORKFLOW_INSTANCE_COLUMNS)
    .eq("related_request_id", requestId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toWorkflowInstance(data);
}

export async function findWorkflowStepByApprovalId(
  approvalId: string
): Promise<WorkflowInstanceStep | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workflow_instance_steps")
    .select(WORKFLOW_INSTANCE_STEP_COLUMNS)
    .eq("generated_approval_id", approvalId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toWorkflowInstanceStep(data);
}

export async function findWorkflowTemplateByTriggerCategory(
  companyId: string,
  category: RequestCategory
): Promise<WorkflowTemplate | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workflow_templates")
    .select(WORKFLOW_TEMPLATE_COLUMNS)
    .eq("company_id", companyId)
    .eq("trigger_category", category)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toWorkflowTemplate(data);
}

export async function advanceWorkflow(profile: Profile, instanceId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const instance = await loadInstanceOrThrow(instanceId);
  if (instance.status !== "in_progress") return;

  const { data: currentStepRow, error: currentStepError } = await supabase
    .from("workflow_instance_steps")
    .select("id, step_order")
    .eq("instance_id", instanceId)
    .eq("status", "in_progress")
    .maybeSingle();
  if (currentStepError) throw currentStepError;
  if (!currentStepRow) return;

  const { error: completeCurrentError } = await supabase
    .from("workflow_instance_steps")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", currentStepRow.id);
  if (completeCurrentError) throw completeCurrentError;

  const { data: nextTemplateStepRow, error: nextTemplateStepError } = await supabase
    .from("workflow_template_steps")
    .select(WORKFLOW_TEMPLATE_STEP_COLUMNS)
    .eq("template_id", instance.templateId)
    .eq("step_order", currentStepRow.step_order + 1)
    .maybeSingle();
  if (nextTemplateStepError) throw nextTemplateStepError;

  if (nextTemplateStepRow) {
    const nextStep = toWorkflowTemplateStep(nextTemplateStepRow);
    const generated = await generateStepEntity(profile, instance, nextStep);
    const { error: nextStepUpdateError } = await supabase
      .from("workflow_instance_steps")
      .update({
        status: "in_progress",
        generated_task_id: generated.generatedTaskId,
        generated_approval_id: generated.generatedApprovalId,
      })
      .eq("instance_id", instanceId)
      .eq("step_order", nextStep.stepOrder);
    if (nextStepUpdateError) throw nextStepUpdateError;
  } else {
    const { error: completeInstanceError } = await supabase
      .from("workflow_instances")
      .update({ status: "completed" })
      .eq("id", instanceId);
    if (completeInstanceError) throw completeInstanceError;

    if (instance.relatedRequestId) {
      const { error: requestUpdateError } = await supabase
        .from("requests")
        .update({ status: "completed" })
        .eq("id", instance.relatedRequestId);
      if (requestUpdateError) throw requestUpdateError;

      const template = await loadTemplateById(instance.templateId);
      await logActivity(
        "request",
        instance.relatedRequestId,
        profile.id,
        `Workflow "${template.name}" completed`
      );
    }
  }

  try {
    await broadcastChange(instance.companyId, "workflows", { type: "workflow_updated" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }
}

export interface WorkflowProgressStep extends WorkflowInstanceStep {
  title: string;
  description: string | null;
  stepType: "task" | "approval";
  responsibleRole: Role | null;
  responsibleDepartmentName: string | null;
}

export interface WorkflowProgress {
  instance: WorkflowInstance;
  steps: WorkflowProgressStep[];
}

export async function getWorkflowProgress(
  profile: Profile,
  instanceId: string
): Promise<WorkflowProgress> {
  const instance = await loadInstanceOrThrow(instanceId);

  if (instance.relatedRequestId) {
    const request = await loadRequestOrThrow(instance.relatedRequestId);
    const approverId = await loadApproverIdForRequest(instance.relatedRequestId);
    if (!canViewWorkflowInstance(profile, instance, request, approverId)) {
      throw new ForbiddenError("You cannot view this workflow instance");
    }
  } else if (!canViewWorkflowInstance(profile, instance, null, null)) {
    throw new ForbiddenError("You cannot view this workflow instance");
  }

  const [instanceSteps, templateSteps] = await Promise.all([
    loadInstanceSteps(instanceId),
    loadTemplateSteps(instance.templateId),
  ]);
  const templateStepsById = new Map(templateSteps.map((step) => [step.id, step]));

  const steps: WorkflowProgressStep[] = instanceSteps.map((instanceStep) => {
    const templateStep = templateStepsById.get(instanceStep.templateStepId);
    if (!templateStep) {
      throw new NotFoundError(`Template step ${instanceStep.templateStepId} not found`);
    }
    return {
      ...instanceStep,
      title: templateStep.title,
      description: templateStep.description,
      stepType: templateStep.stepType,
      responsibleRole: templateStep.responsibleRole,
      responsibleDepartmentName: templateStep.responsibleDepartmentName,
    };
  });

  return { instance, steps };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:integration lib/domain/workflows.test.ts`
Expected: PASS (12 tests — 4 from Task 10's `startWorkflow` block plus 8 new).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/workflows.ts lib/domain/workflows.test.ts
git commit -m "feat: add advanceWorkflow, getWorkflowProgress, and workflow finder helpers"
```

---

## Task 12: Wire workflow hooks into `tasks.ts` and `approvals.ts`, and fix the single-approval-per-request assumption

**Files:**
- Modify: `lib/domain/tasks.ts`, `lib/domain/tasks.test.ts`, `lib/domain/approvals.ts`, `lib/domain/approvals.test.ts`, `lib/domain/requests.ts`, `lib/domain/requests.test.ts`

**Interfaces:**
- Consumes: `advanceWorkflow`, `findWorkflowStepByApprovalId`, `findWorkflowTemplateByTriggerCategory`, `startWorkflow` (Task 10/11).
- Produces: `Task.relatedWorkflowInstanceId: string | null` (new field on the existing `Task` type); `updateTaskStatus` now calls `advanceWorkflow` when a workflow-linked task completes; `decideApproval` now calls `startWorkflow`/`advanceWorkflow` appropriately and no longer assumes exactly one approval per request.

**Why this task also touches `requests.ts` and existing Phase 3 approval logic:** `requests.ts`'s `loadApproverIdForRequest` and `approvals.ts`'s `getApprovalForRequest` both use `.maybeSingle()` with no ordering, which throws if a request ever has more than one row in `approvals`. Through Phase 3 that was always true (exactly one approval per request). Starting with this task, an equipment/maintenance request's workflow inserts a *second* approval (e.g. "IT Review") on the same `request_id` once it starts — so both functions are changed to order by `created_at desc, limit 1`, returning the request's *current* approval. Separately, `decideApproval` unconditionally sets `requests.status` to `approved`/`rejected` on every decision — correct for the original Phase 3 approval, but wrong for a workflow-generated approval step (deciding "IT Review" must not stomp the `in_progress` status `startWorkflow`/`advanceWorkflow` are managing). Both fixes and the two hook call-sites are made together here because they're the same deliverable: "the engine is actually wired in, and existing request/approval flows keep working now that a request can carry multiple approvals."

- [ ] **Step 1: Write the failing tests**

**In `lib/domain/tasks.test.ts`**, add this import:

```ts
import { startWorkflow } from "@/lib/domain/workflows";
```

The file is a single flat `describe.skipIf(...)(...)` block (no nested `describe`s) with fixtures `companyId`, `departmentAId`, `departmentBId`, `employee`, `managerA`, `opsManager`, and a `supabase` client, all declared in its `beforeAll`. Add this test directly after the existing `it("lets the creator delete a task, but denies an unrelated employee", ...)` test (the last one in the file) and before the block's closing `}\n);`. It uses `employee` (an existing `Profile` fixture) as the task creator, matching how every other test in this file calls `createTask`/`updateTaskStatus`, and inserts its own workflow template directly since none is seeded for this isolated test company:

```ts
    it("advances the linked workflow when a task generated by that workflow is completed", async () => {
      const { data: template, error: templateError } = await supabase
        .from("workflow_templates")
        .insert({ company_id: companyId, slug: "tasks-hook-test", name: "Tasks Hook Test" })
        .select("id")
        .single();
      if (templateError) throw templateError;
      const { error: stepError } = await supabase.from("workflow_template_steps").insert({
        template_id: template.id,
        step_order: 1,
        step_type: "task",
        title: "Only step",
        responsible_department_name: null,
      });
      if (stepError) throw stepError;

      const instance = await startWorkflow(employee, "tasks-hook-test", {});
      const { data: step, error: stepLookupError } = await supabase
        .from("workflow_instance_steps")
        .select("generated_task_id")
        .eq("instance_id", instance.id)
        .single();
      if (stepLookupError) throw stepLookupError;

      await updateTaskStatus(employee, step.generated_task_id!, "completed");

      const { data: instanceRow, error: instanceError } = await supabase
        .from("workflow_instances")
        .select("status")
        .eq("id", instance.id)
        .single();
      if (instanceError) throw instanceError;
      expect(instanceRow.status).toBe("completed");

      await supabase.from("workflow_instances").delete().eq("id", instance.id);
      await supabase.from("workflow_template_steps").delete().eq("template_id", template.id);
      await supabase.from("workflow_templates").delete().eq("id", template.id);
    });
```

The new test's cleanup (the three `delete` calls at the end) is local to the test since these rows aren't covered by the file's existing `afterAll`, which only deletes `tasks`/`profiles`/the test company.

**In `lib/domain/approvals.test.ts`**, add this import:

```ts
import { findWorkflowTemplateByTriggerCategory, startWorkflow } from "@/lib/domain/workflows";
```

The file is a single flat `describe.skipIf(...)("decideApproval / getApprovalForRequest", ...)` block with fixtures `companyId`, `requester` (an `employee`-role profile with no manager set), `opsManager`, `opsManagerPeer` (both `operations_manager` role, `opsManager` created first), and `manager`, all declared in its `beforeAll` — `requester.managerId` is unset, so `resolveApprover` (Phase 3) always routes `requester`'s submitted requests to the earliest-created `operations_manager`, i.e. `opsManager`. Add these three tests directly after the existing `it("denies an elevated-role profile from a different company from deciding the approval", ...)` test — the last `decideApproval`-focused test, immediately before the `reassignApproval` tests begin:

```ts
    it("auto-starts the matching workflow when the original approval for an equipment request is approved", async () => {
      const { data: template, error: templateError } = await supabase
        .from("workflow_templates")
        .upsert(
          {
            company_id: companyId,
            slug: "approvals-hook-equipment-test",
            name: "Approvals Hook Equipment Test",
            trigger_category: "equipment",
          },
          { onConflict: "company_id,slug" }
        )
        .select("id")
        .single();
      if (templateError) throw templateError;
      await supabase.from("workflow_template_steps").upsert(
        {
          template_id: template.id,
          step_order: 1,
          step_type: "task",
          title: "Only step",
          responsible_department_name: null,
        },
        { onConflict: "template_id,step_order" }
      );

      const request = await createRequest(requester, {
        title: "New laptop",
        category: "equipment",
      });
      const submitted = await submitRequest(requester, request.id);
      const { data: approvalRow, error: approvalError } = await supabase
        .from("approvals")
        .select("id")
        .eq("request_id", submitted.id)
        .single();
      if (approvalError) throw approvalError;

      await decideApproval(opsManager, approvalRow.id, "approved");

      const { data: instances, error: instancesError } = await supabase
        .from("workflow_instances")
        .select("id, template_id")
        .eq("related_request_id", submitted.id);
      if (instancesError) throw instancesError;
      expect(instances).toHaveLength(1);
      expect(instances![0].template_id).toBe(template.id);

      await supabase.from("workflow_instances").delete().eq("related_request_id", submitted.id);
    });

    it("does not start a workflow for a category with no matching template", async () => {
      const request = await createRequest(requester, { title: "Access request", category: "access" });
      const submitted = await submitRequest(requester, request.id);
      const { data: approvalRow, error: approvalError } = await supabase
        .from("approvals")
        .select("id")
        .eq("request_id", submitted.id)
        .single();
      if (approvalError) throw approvalError;

      await decideApproval(opsManager, approvalRow.id, "approved");

      const template = await findWorkflowTemplateByTriggerCategory(companyId, "access");
      expect(template).toBeNull();
      const { data: instances, error: instancesError } = await supabase
        .from("workflow_instances")
        .select("id")
        .eq("related_request_id", submitted.id);
      if (instancesError) throw instancesError;
      expect(instances).toHaveLength(0);
    });

    it("advances the workflow, instead of resetting request status, when a workflow-generated approval is decided", async () => {
      const { data: template, error: templateError } = await supabase
        .from("workflow_templates")
        .upsert(
          {
            company_id: companyId,
            slug: "approvals-hook-step-test",
            name: "Approvals Hook Step Test",
          },
          { onConflict: "company_id,slug" }
        )
        .select("id")
        .single();
      if (templateError) throw templateError;
      await supabase.from("workflow_template_steps").upsert(
        {
          template_id: template.id,
          step_order: 1,
          step_type: "approval",
          title: "Only approval step",
          responsible_role: "operations_manager",
        },
        { onConflict: "template_id,step_order" }
      );

      const request = await createRequest(requester, { title: "Step approval test", category: "general" });
      const instance = await startWorkflow(requester, "approvals-hook-step-test", {
        requestId: request.id,
      });
      const { data: stepRow, error: stepError } = await supabase
        .from("workflow_instance_steps")
        .select("generated_approval_id")
        .eq("instance_id", instance.id)
        .single();
      if (stepError) throw stepError;

      await decideApproval(opsManager, stepRow.generated_approval_id!, "approved");

      const { data: instanceRow, error: instanceError } = await supabase
        .from("workflow_instances")
        .select("status")
        .eq("id", instance.id)
        .single();
      if (instanceError) throw instanceError;
      expect(instanceRow.status).toBe("completed");

      const { data: requestRow, error: requestError } = await supabase
        .from("requests")
        .select("status")
        .eq("id", request.id)
        .single();
      if (requestError) throw requestError;
      expect(requestRow.status).toBe("completed");

      await supabase.from("workflow_instances").delete().eq("id", instance.id);
    });
```

**In `lib/domain/requests.test.ts`**, add a regression test for the ordering fix (find the existing `describe` block and add alongside its tests):

```ts
    it("still resolves visibility correctly when a request has more than one approval row", async () => {
      const request = await createRequest(employee, { title: "Multi-approval test", category: "general" });
      const submitted = await submitRequest(employee, request.id);
      const { data: firstApproval, error: firstApprovalError } = await supabase
        .from("approvals")
        .select("id, approver_id")
        .eq("request_id", submitted.id)
        .single();
      if (firstApprovalError) throw firstApprovalError;

      const { error: secondApprovalError } = await supabase.from("approvals").insert({
        request_id: submitted.id,
        approver_id: opsManager.id,
        status: "pending",
      });
      if (secondApprovalError) throw secondApprovalError;

      await expect(getRequest(opsManager, submitted.id)).resolves.toMatchObject({
        id: submitted.id,
      });
    });
```

`submitRequest`, `createRequest`, and `getRequest` are already imported in this file (used by the existing tests), so no import changes are needed for this test.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:integration lib/domain/tasks.test.ts lib/domain/approvals.test.ts lib/domain/requests.test.ts`
Expected: FAIL — `advanceWorkflow`/`startWorkflow` aren't called yet, so the new assertions fail (no workflow instance created, `updateTaskStatus` doesn't touch `workflow_instances`).

- [ ] **Step 3: Add `relatedWorkflowInstanceId` and the hook to `lib/domain/tasks.ts`**

Add the import:

```ts
import { advanceWorkflow } from "@/lib/domain/workflows";
```

Update the `Task` interface, `TaskRow` interface, `toTask` mapper, and `TASK_COLUMNS` constant to include the new field:

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
    relatedWorkflowInstanceId: row.related_workflow_instance_id,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}
```

```ts
const TASK_COLUMNS =
  "id, company_id, title, description, status, priority, assignee_id, creator_id, department_id, related_employee_id, related_workflow_instance_id, due_date, completed_at, created_at";
```

In `updateTaskStatus`, after the existing `broadcastChange` try/catch block and before `return updated;`, add:

```ts
  if (newStatus === "completed" && updated.relatedWorkflowInstanceId) {
    try {
      await advanceWorkflow(profile, updated.relatedWorkflowInstanceId);
    } catch (workflowError) {
      console.error("advanceWorkflow failed:", workflowError);
    }
  }

```

- [ ] **Step 4: Fix `loadApproverIdForRequest` in `lib/domain/requests.ts`**

Replace:

```ts
async function loadApproverIdForRequest(requestId: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("approvals")
    .select("approver_id")
    .eq("request_id", requestId)
    .maybeSingle();
  if (error) throw error;
  return data?.approver_id ?? null;
}
```

with:

```ts
async function loadApproverIdForRequest(requestId: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("approvals")
    .select("approver_id")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.approver_id ?? null;
}
```

- [ ] **Step 5: Fix `getApprovalForRequest` and rewrite `decideApproval` in `lib/domain/approvals.ts`**

Add the import:

```ts
import {
  advanceWorkflow,
  findWorkflowStepByApprovalId,
  findWorkflowTemplateByTriggerCategory,
  startWorkflow,
} from "@/lib/domain/workflows";
```

Replace `getApprovalForRequest`:

```ts
export async function getApprovalForRequest(requestId: string): Promise<Approval | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("approvals")
    .select(APPROVAL_COLUMNS)
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toApproval(data);
}
```

Replace the body of `decideApproval` from `const newRequestStatus = ...` through the final `return updatedApproval;` with:

```ts
  const workflowStep = await findWorkflowStepByApprovalId(approvalId);

  if (!workflowStep) {
    const newRequestStatus = decision === "approved" ? "approved" : "rejected";
    const { error: requestUpdateError } = await supabase
      .from("requests")
      .update({ status: newRequestStatus })
      .eq("id", approval.requestId);
    if (requestUpdateError) throw requestUpdateError;
  }

  await logActivity(
    "request",
    approval.requestId,
    profile.id,
    `${profile.fullName} ${decision} this request`
  );

  if (request.createdBy) {
    await createNotification(
      request.createdBy,
      "request",
      request.id,
      "request_status_changed",
      `Your request "${request.title}" was ${decision}`
    );
  }

  if (decision === "approved") {
    if (workflowStep) {
      try {
        await advanceWorkflow(profile, workflowStep.instanceId);
      } catch (workflowError) {
        console.error("advanceWorkflow failed:", workflowError);
      }
    } else {
      try {
        const template = await findWorkflowTemplateByTriggerCategory(
          profile.companyId,
          request.category
        );
        if (template) {
          await startWorkflow(profile, template.slug, { requestId: request.id });
        }
      } catch (workflowError) {
        console.error("startWorkflow failed:", workflowError);
      }
    }
  }

  try {
    await broadcastChange(request.companyId, "requests", { type: "request_updated" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }

  return updatedApproval;
}
```

(This keeps everything before `const newRequestStatus = ...` in the original function unchanged — approval loading, `pending` check, `canDecideApproval`, the `approvals` row update, and `const request = await loadRequestOrThrow(...)` all stay exactly as they are today.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test:integration lib/domain/tasks.test.ts lib/domain/approvals.test.ts lib/domain/requests.test.ts`
Expected: PASS — `tasks.test.ts` gains 1 test, `approvals.test.ts` gains 3, `requests.test.ts` gains 1; all pre-existing tests in these three files still pass unmodified.

Run: `pnpm build`
Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add lib/domain/tasks.ts lib/domain/tasks.test.ts lib/domain/approvals.ts lib/domain/approvals.test.ts lib/domain/requests.ts lib/domain/requests.test.ts
git commit -m "feat: wire workflow engine hooks into task completion and approval decisions"
```

---

## Task 13: `GET /api/workflows/templates`

**Files:**
- Create: `app/api/workflows/templates/route.ts`, `app/api/workflows/templates/route.test.ts`

**Interfaces:**
- Consumes: `getCurrentProfile` (`@/lib/auth/session`); `listWorkflowTemplates` (Task 10); `toErrorResponse` (Phase 2).
- Produces: `GET` handler returning `{ templates: WorkflowTemplate[] }`.

- [ ] **Step 1: Write the failing test**

Create `app/api/workflows/templates/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/workflows", () => ({
  listWorkflowTemplates: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { listWorkflowTemplates } from "@/lib/domain/workflows";
import { GET } from "@/app/api/workflows/templates/route";

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
  vi.mocked(listWorkflowTemplates).mockReset();
});

describe("GET /api/workflows/templates", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns the company's templates", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(listWorkflowTemplates).mockResolvedValue([{ id: "template-1" } as never]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(listWorkflowTemplates).toHaveBeenCalledWith("company-1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test app/api/workflows/templates/route.test.ts`
Expected: FAIL — `@/app/api/workflows/templates/route` cannot be found.

- [ ] **Step 3: Implement the route**

Create `app/api/workflows/templates/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { listWorkflowTemplates } from "@/lib/domain/workflows";
import { toErrorResponse } from "@/lib/api/error-response";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const templates = await listWorkflowTemplates(profile.companyId);
    return NextResponse.json({ templates });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test app/api/workflows/templates/route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/workflows/templates
git commit -m "feat: add GET /api/workflows/templates route"
```

---

## Task 14: `GET /api/workflows/instances/[id]`

**Files:**
- Create: `app/api/workflows/instances/[id]/route.ts`, `app/api/workflows/instances/[id]/route.test.ts`

**Interfaces:**
- Consumes: `getCurrentProfile`; `getWorkflowProgress` (Task 11); `toErrorResponse`.
- Produces: `GET` handler returning `WorkflowProgress` as JSON (`{ instance, steps }`).

- [ ] **Step 1: Write the failing test**

Create `app/api/workflows/instances/[id]/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/workflows", () => ({
  getWorkflowProgress: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { getWorkflowProgress } from "@/lib/domain/workflows";
import { GET } from "@/app/api/workflows/instances/[id]/route";
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
  vi.mocked(getWorkflowProgress).mockReset();
});

describe("GET /api/workflows/instances/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost"), params("instance-1"));
    expect(response.status).toBe(401);
  });

  it("returns 404 when the instance does not exist", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getWorkflowProgress).mockRejectedValue(new NotFoundError());
    const response = await GET(new Request("http://localhost"), params("instance-1"));
    expect(response.status).toBe(404);
  });

  it("returns the workflow progress", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getWorkflowProgress).mockResolvedValue({
      instance: { id: "instance-1" },
      steps: [],
    } as never);
    const response = await GET(new Request("http://localhost"), params("instance-1"));
    expect(response.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test app/api/workflows/instances/[id]/route.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Implement the route**

Create `app/api/workflows/instances/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getWorkflowProgress } from "@/lib/domain/workflows";
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
    const progress = await getWorkflowProgress(profile, id);
    return NextResponse.json(progress);
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test app/api/workflows/instances/[id]/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/workflows/instances
git commit -m "feat: add GET /api/workflows/instances/[id] route"
```

---

## Task 15: `WorkflowStepper` component

**Files:**
- Create: `components/workflows/workflow-stepper.tsx`, `components/workflows/workflow-stepper.test.tsx`

**Interfaces:**
- Consumes: `WorkflowProgress` (Task 11, type-only import); `Badge` (`@/components/ui/badge`).
- Produces: `WorkflowStepper({ progress }): JSX.Element` — consumed by the workflow instance page (Task 16).

- [ ] **Step 1: Write the failing test**

Create `components/workflows/workflow-stepper.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkflowStepper } from "@/components/workflows/workflow-stepper";
import type { WorkflowProgress } from "@/lib/domain/workflows";

const PROGRESS: WorkflowProgress = {
  instance: {
    id: "instance-1",
    companyId: "company-1",
    templateId: "template-1",
    relatedRequestId: "request-1",
    status: "in_progress",
    createdAt: "2026-08-28T00:00:00.000Z",
  },
  steps: [
    {
      id: "step-1",
      instanceId: "instance-1",
      templateStepId: "template-step-1",
      stepOrder: 1,
      status: "completed",
      generatedTaskId: null,
      generatedApprovalId: "approval-1",
      createdAt: "2026-08-28T00:00:00.000Z",
      completedAt: "2026-08-28T01:00:00.000Z",
      title: "IT Review",
      description: null,
      stepType: "approval",
      responsibleRole: "it",
      responsibleDepartmentName: null,
    },
    {
      id: "step-2",
      instanceId: "instance-1",
      templateStepId: "template-step-2",
      stepOrder: 2,
      status: "in_progress",
      generatedTaskId: "task-1",
      generatedApprovalId: null,
      createdAt: "2026-08-28T01:00:00.000Z",
      completedAt: null,
      title: "Procurement",
      description: null,
      stepType: "task",
      responsibleRole: null,
      responsibleDepartmentName: "Procurement",
    },
  ],
};

describe("WorkflowStepper", () => {
  it("renders every step with its title and status", () => {
    render(<WorkflowStepper progress={PROGRESS} />);
    expect(screen.getByText("IT Review")).toBeInTheDocument();
    expect(screen.getByText("Procurement")).toBeInTheDocument();
    expect(screen.getAllByText("Completed")).toHaveLength(1);
    expect(screen.getAllByText("In Progress")).toHaveLength(2); // one badge for the step, one for the instance
  });

  it("links to the generated task when a step produced one", () => {
    render(<WorkflowStepper progress={PROGRESS} />);
    const link = screen.getByRole("link", { name: "View task" });
    expect(link).toHaveAttribute("href", "/tasks/task-1");
  });

  it("shows the responsible department or role", () => {
    render(<WorkflowStepper progress={PROGRESS} />);
    expect(screen.getByText(/Procurement/)).toBeInTheDocument();
    expect(screen.getByText(/It/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test components/workflows/workflow-stepper.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement the component**

Create `components/workflows/workflow-stepper.tsx`:

```tsx
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { WorkflowProgress } from "@/lib/domain/workflows";

function formatLabel(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function stepBadgeVariant(status: "pending" | "in_progress" | "completed") {
  if (status === "completed") return "default" as const;
  if (status === "in_progress") return "secondary" as const;
  return "outline" as const;
}

export function WorkflowStepper({ progress }: { progress: WorkflowProgress }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-medium">Workflow progress</h2>
        <Badge variant={progress.instance.status === "completed" ? "default" : "secondary"}>
          {formatLabel(progress.instance.status)}
        </Badge>
      </div>
      <ol className="flex flex-col gap-2">
        {progress.steps.map((step) => (
          <li
            key={step.id}
            className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm"
          >
            <div className="flex flex-col gap-1">
              <span className="font-medium">{step.title}</span>
              <span className="text-muted-foreground">
                {step.responsibleRole
                  ? formatLabel(step.responsibleRole)
                  : step.responsibleDepartmentName}
                {" · "}
                {formatLabel(step.stepType)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {step.generatedTaskId && (
                <Link href={`/tasks/${step.generatedTaskId}`} className="text-primary hover:underline">
                  View task
                </Link>
              )}
              <Badge variant={stepBadgeVariant(step.status)}>{formatLabel(step.status)}</Badge>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test components/workflows/workflow-stepper.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/workflows/workflow-stepper.tsx components/workflows/workflow-stepper.test.tsx
git commit -m "feat: add WorkflowStepper component"
```

---

## Task 16: Workflow instance page

**Files:**
- Create: `app/(app)/workflows/[id]/page.tsx`, `components/workflows/workflow-realtime-refresh.tsx`

**Interfaces:**
- Consumes: `getCurrentProfile`; `getWorkflowProgress` (Task 11); `BackLink` (`@/components/back-link`); `WorkflowStepper` (Task 15); `useBroadcastListener` (`@/lib/realtime/use-broadcast-listener`, Phase 3).
- Produces: the `/workflows/[id]` route.

- [ ] **Step 1: Create `WorkflowRealtimeRefresh`**

Create `components/workflows/workflow-realtime-refresh.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useBroadcastListener } from "@/lib/realtime/use-broadcast-listener";

export function WorkflowRealtimeRefresh({ companyId }: { companyId: string }) {
  const router = useRouter();
  useBroadcastListener(`company:${companyId}:workflows`, () => {
    router.refresh();
  });
  return null;
}
```

This mirrors `components/requests/request-realtime-refresh.tsx` exactly, subscribed to the `workflows` channel `startWorkflow`/`advanceWorkflow` broadcast on (Task 10/11).

- [ ] **Step 2: Create the page**

Create `app/(app)/workflows/[id]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { getWorkflowProgress } from "@/lib/domain/workflows";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import { BackLink } from "@/components/back-link";
import { WorkflowRealtimeRefresh } from "@/components/workflows/workflow-realtime-refresh";
import { WorkflowStepper } from "@/components/workflows/workflow-stepper";

export default async function WorkflowInstancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const { id } = await params;

  let progress;
  try {
    progress = await getWorkflowProgress(profile, id);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      notFound();
    }
    throw error;
  }

  const backHref = progress.instance.relatedRequestId
    ? `/requests/${progress.instance.relatedRequestId}`
    : "/dashboard";

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <WorkflowRealtimeRefresh companyId={profile.companyId} />
      <BackLink href={backHref} />
      <WorkflowStepper progress={progress} />
    </div>
  );
}
```

This page has no dedicated route test (matching the existing convention — `app/(app)/requests/[id]/page.tsx` also has none; page-level coverage comes from the domain-layer and component tests already written in Tasks 11 and 15, plus manual verification in Step 3).

- [ ] **Step 3: Manually verify**

Run: `pnpm build`
Expected: build completes with no errors (confirms the new route compiles and types against `getWorkflowProgress`'s return type).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/workflows" components/workflows/workflow-realtime-refresh.tsx
git commit -m "feat: add workflow instance progress page"
```

---

## Task 17: Link to workflow progress from the request detail page

**Files:**
- Modify: `app/(app)/requests/[id]/page.tsx`

**Interfaces:**
- Consumes: `getWorkflowInstanceForRequest` (Task 11).
- Produces: a "View workflow progress" link on the request detail page when a `workflow_instances` row exists for that request.

- [ ] **Step 1: Add the import and fetch**

Add to the imports:

```ts
import { getWorkflowInstanceForRequest } from "@/lib/domain/workflows";
```

Change the existing `Promise.all` from:

```ts
  const [comments, activity, attachments, approval] = await Promise.all([
    listComments("request", request.id),
    listActivity("request", request.id),
    listAttachments("request", request.id),
    getApprovalForRequest(request.id),
  ]);
```

to:

```ts
  const [comments, activity, attachments, approval, workflowInstance] = await Promise.all([
    listComments("request", request.id),
    listActivity("request", request.id),
    listAttachments("request", request.id),
    getApprovalForRequest(request.id),
    getWorkflowInstanceForRequest(request.id),
  ]);
```

- [ ] **Step 2: Render the link**

Add `Link` to the imports:

```ts
import Link from "next/link";
```

Insert this block right after `<RequestStatusTimeline status={request.status} />` and before the `{canDecide && ...}` blocks:

```tsx
      {workflowInstance && (
        <Link
          href={`/workflows/${workflowInstance.id}`}
          className="text-sm text-primary hover:underline"
        >
          View workflow progress
        </Link>
      )}
```

- [ ] **Step 3: Manually verify**

Run: `pnpm build`
Expected: build completes with no errors.

Run: `pnpm test` (full suite, `test:unit` portion)
Expected: PASS — no existing request-detail-page test exists to update (matching Task 16's note, this page has no dedicated test file); this step is a build/type-check confirmation only.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/requests/[id]/page.tsx"
git commit -m "feat: link to workflow progress from the request detail page"
```

---

## Post-plan: full verification

Not a task with its own commit — run once after Task 17, before requesting final review (per `superpowers:subagent-driven-development`'s whole-branch review):

```bash
pnpm test:unit
pnpm test:integration
pnpm build
```

Expected: all green. This is the same gate Phase 2 and Phase 3 used before their final review and merge.
