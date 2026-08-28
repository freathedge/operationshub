# Phase 3 — Requests & Approvals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Employees can submit categorized requests; an authorized approver can approve/reject them; status and approval state are visible end to end, including a visual progress timeline. This phase covers a request having its own status and needing exactly one approval — automatic multi-step chaining is Phase 4's workflow engine, not built here.

**Architecture:** Thin Next.js Route Handlers under `app/api/requests/**` and `app/api/approvals/**` validate with Zod and delegate to a domain layer (`lib/domain/**`) that is the sole authorization boundary (via `lib/domain/permissions.ts`) and the sole place that talks to Supabase Postgres (service-role key). `comments`, `activity_log`, and `attachments` (built in Phase 2) are reused as-is via `entity_type: "request"` — no new generic modules are built in this phase. The broadcast-only Realtime pattern (`lib/realtime/broadcast.ts` server-side, `useBroadcastListener` client-side hook, both already built) is reused for `company:{companyId}:requests` and extended with a new per-profile channel (`profile:{profileId}:notifications`) for notifications. The request list and detail pages reuse the exact React Query / Server-Component-with-Client-Component-islands patterns Phase 2 established for tasks.

**Tech Stack:** Everything from the Foundation and Phase 2 plans — no new dependencies. `@tanstack/react-query`, the `table`/`badge` shadcn components, the React Query provider, and `useBroadcastListener` all already exist from Phase 2 and are reused unmodified.

**Spec:** `docs/superpowers/specs/2026-08-27-phase3-requests-design.md`

## Global Constraints

- REST API (Next.js Route Handlers) is the sole authorization boundary. RLS stays disabled on every table; the service-role key is used server-side only (`lib/domain/**`), never shipped to the browser.
- Hosted Supabase project (no local Docker/CLI dev stack). `project_id` = `yqzcunssgvffischmwle`. Schema changes (DDL) are applied with the `mcp__claude_ai_Supabase__apply_migration` tool (`project_id`, `name`, `query`) — this is the current tool name; if it is unavailable to you, report NEEDS_CONTEXT rather than falling back to the Supabase CLI (no local dev stack exists in this environment). Use `mcp__claude_ai_Supabase__list_migrations` and `mcp__claude_ai_Supabase__list_tables` to verify, and `mcp__claude_ai_Supabase__execute_sql` for verification queries.
- Verify after every migration in this plan: `select table_name, grantee from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated');` must return zero rows for the new table.
- **Migration filenames must match the version `apply_migration` actually assigns.** After calling `apply_migration`, call `list_migrations` and rename the local file to `<version-from-list_migrations>_<name>.sql` before committing.
- The domain layer's Supabase clients are typed against `lib/supabase/database.types.ts` (`SupabaseClient<Database>`). **Regenerate this file after all four Phase 3 migrations land (Task 5), before any later task that types against `requests`, `approvals`, `notifications`, or `tasks.related_request_id`.**
- Single fictional company (AlpenTech Industries) — no multi-tenant isolation logic; every table still carries or resolves to a `company_id` for consistency with later phases.
- Package manager: pnpm (v10.x). Node.js v22+. TypeScript strict mode throughout.
- Integration tests that hit the live Supabase project use `describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)` so `pnpm test:unit` / CI-without-secrets stays green. **Every new integration test file must be added to both the `--exclude` list in `test:unit` and the file list in `test:integration` in `package.json`, in the task that introduces it.**
- Test/domain-object convention: DB rows are `snake_case`; domain objects returned by `lib/domain/**` functions are `camelCase`, via a private `toX(row)` mapper and a `X_COLUMNS` column-list constant per file — follow `lib/domain/profiles.ts` / `lib/domain/tasks.ts` exactly.
- Every task ends with a commit. Commit messages use the `feat:`/`fix:`/`chore:`/`test:`/`docs:` conventional prefix matching the task's nature.
- This plan runs inside its own git worktree/branch already (`worktree-phase3-requests-plan`), not on `main`.

---

## Task 1: Migration — `requests` table

**Files:**
- Create: `supabase/migrations/<timestamp>_create_requests.sql`

**Interfaces:**
- Consumes: `companies`, `departments`, `profiles` (Foundation phase).
- Produces: enums `request_category` (`equipment|software|access|maintenance|purchase|hr|general|other`) and `request_status` (`draft|submitted|under_review|approved|rejected|in_progress|completed`); table `requests(id, company_id, title, description, category, status, created_by, department_id, created_at)`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/<YYYYMMDDHHMMSS>_create_requests.sql` (current UTC timestamp, later than the last existing migration `20260827140054_create_attachments.sql`) with:

```sql
create type request_category as enum (
  'equipment',
  'software',
  'access',
  'maintenance',
  'purchase',
  'hr',
  'general',
  'other'
);

create type request_status as enum (
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'in_progress',
  'completed'
);

create table requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  title text not null,
  description text,
  category request_category not null,
  status request_status not null default 'draft',
  created_by uuid references profiles(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  created_at timestamptz not null default now()
);

create index requests_company_id_idx on requests(company_id);
create index requests_status_idx on requests(status);
create index requests_created_by_idx on requests(created_by);
create index requests_department_id_idx on requests(department_id);
```

**Note (same class of fix as Phase 2 Task 2's `tasks.creator_id`):** the design spec's data model shows `created_by uuid not null references profiles(id) on delete set null`. That combination is self-contradictory in Postgres — deleting the referenced profile fires `SET NULL`, which then immediately violates `NOT NULL`, aborting the delete. `not null` is dropped here; `createRequest` (Task 10) always sets a real profile id at insert time, the column only goes `null` later if that profile is deleted. `Request.createdBy` (Task 10) is typed `string | null` to match, and `permissions.ts`'s `RequestLike.createdBy` (Task 9) is `string | null` for the same reason.

- [ ] **Step 2: Apply the migration**

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id: "yqzcunssgvffischmwle"`, `name: "create_requests"`, `query` set to the exact SQL from Step 1.

- [ ] **Step 3: Verify the table exists and carries no anon/authenticated grants**

Use `mcp__claude_ai_Supabase__list_tables` (`project_id: "yqzcunssgvffischmwle"`, `schemas: ["public"]`) — expect `requests` in the result.

Use `mcp__claude_ai_Supabase__execute_sql` with:
```sql
select table_name, grantee from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'requests' and grantee in ('anon','authenticated');
```
Expected: zero rows.

- [ ] **Step 4: Rename the local file to match the applied version**

Call `mcp__claude_ai_Supabase__list_migrations` with `project_id: "yqzcunssgvffischmwle"`. Rename the local file to `supabase/migrations/<version>_create_requests.sql` using the version `list_migrations` reports for this migration.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add requests table"
```

---

## Task 2: Migration — `approvals` table

**Files:**
- Create: `supabase/migrations/<timestamp>_create_approvals.sql`

**Interfaces:**
- Consumes: `requests` (Task 1), `profiles`.
- Produces: enum `approval_status` (`pending|approved|rejected`); table `approvals(id, request_id, approver_id, status, decided_at, comment, created_at)`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/<YYYYMMDDHHMMSS>_create_approvals.sql` (timestamp later than Task 1's) with:

```sql
create type approval_status as enum (
  'pending',
  'approved',
  'rejected'
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  approver_id uuid references profiles(id) on delete set null,
  status approval_status not null default 'pending',
  decided_at timestamptz,
  comment text,
  created_at timestamptz not null default now()
);

create index approvals_request_id_idx on approvals(request_id);
create index approvals_approver_id_idx on approvals(approver_id);
```

**Note (same class of fix as Task 1's `created_by`):** the spec's data model shows `approver_id uuid not null references profiles(id) on delete set null` — the same self-contradiction. `not null` is dropped; `submitRequest` (Task 11) always sets a real profile id at insert time. `Approval.approverId` (Task 12) is typed `string | null`, and `canDecideApproval`'s parameter (Task 9) is `{ approverId: string | null }` to match.

- [ ] **Step 2: Apply the migration**

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id: "yqzcunssgvffischmwle"`, `name: "create_approvals"`, `query` set to the exact SQL from Step 1.

- [ ] **Step 3: Verify**

`list_tables` → expect `approvals`. Grants query (as Task 1 Step 3, `table_name = 'approvals'`) → expect zero rows.

- [ ] **Step 4: Rename the local file**

`list_migrations` → rename to `<version>_create_approvals.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add approvals table"
```

---

## Task 3: Migration — `notifications` table

**Files:**
- Create: `supabase/migrations/<timestamp>_create_notifications.sql`

**Interfaces:**
- Consumes: `profiles`.
- Produces: table `notifications(id, profile_id, entity_type, entity_id, type, message, read_at, created_at)`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/<YYYYMMDDHHMMSS>_create_notifications.sql` (timestamp later than Task 2's) with:

```sql
create table notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  type text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_profile_id_idx on notifications(profile_id);
```

`profile_id` is `not null` with `on delete cascade` (not `set null`), so there is no contradiction here — unlike `requests.created_by` and `approvals.approver_id`, this column is left exactly as the spec's data model shows it.

- [ ] **Step 2: Apply the migration**

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id: "yqzcunssgvffischmwle"`, `name: "create_notifications"`, `query` set to the exact SQL from Step 1.

- [ ] **Step 3: Verify**

`list_tables` → expect `notifications`. Grants query (`table_name = 'notifications'`) → expect zero rows.

- [ ] **Step 4: Rename the local file**

`list_migrations` → rename to `<version>_create_notifications.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add notifications table"
```

---

## Task 4: Migration — `tasks.related_request_id` column

**Files:**
- Create: `supabase/migrations/<timestamp>_add_tasks_related_request_id.sql`

**Interfaces:**
- Consumes: `tasks` (Phase 2), `requests` (Task 1).
- Produces: `tasks.related_request_id uuid references requests(id)` — schema prep only, per `docs/superpowers/plans/2026-08-26-remaining-phases-outline.md`. Nothing in this phase's domain logic sets it, same precedent as Phase 2 shipping `tasks.related_employee_id` unused until a later phase wires it up.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/<YYYYMMDDHHMMSS>_add_tasks_related_request_id.sql` (timestamp later than Task 3's) with:

```sql
alter table tasks add column related_request_id uuid references requests(id);

create index tasks_related_request_id_idx on tasks(related_request_id);
```

- [ ] **Step 2: Apply the migration**

Use `mcp__claude_ai_Supabase__apply_migration` with `project_id: "yqzcunssgvffischmwle"`, `name: "add_tasks_related_request_id"`, `query` set to the exact SQL from Step 1.

- [ ] **Step 3: Verify**

Use `mcp__claude_ai_Supabase__execute_sql` with:
```sql
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'tasks' and column_name = 'related_request_id';
```
Expected: one row, `data_type = 'uuid'`.

- [ ] **Step 4: Rename the local file**

`list_migrations` → rename to `<version>_add_tasks_related_request_id.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add tasks.related_request_id column"
```

---

## Task 5: Regenerate Supabase types

**Files:**
- Modify: `lib/supabase/database.types.ts`

**Interfaces:**
- Produces: `Database["public"]["Tables"]` including `requests`, `approvals`, `notifications`, and `tasks` with `related_request_id`, matching the migrations from Tasks 1–4.

- [ ] **Step 1: Regenerate the database types**

Call `mcp__claude_ai_Supabase__generate_typescript_types` with `project_id: "yqzcunssgvffischmwle"`. Overwrite `lib/supabase/database.types.ts` with the tool's `types` field verbatim, replacing the entire current file content.

- [ ] **Step 2: Verify the project builds**

Run: `pnpm build`
Expected: build completes with no errors (existing domain code must still type-check against the regenerated `Database` type).

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/database.types.ts
git commit -m "chore: regenerate Supabase types for Phase 3 tables"
```

---

## Task 6: Request status graph and validation schemas

**Files:**
- Create: `lib/domain/request-status.ts`, `lib/validation/requests.ts`
- Test: `lib/domain/request-status.test.ts`, `lib/validation/requests.test.ts`

**Interfaces:**
- Produces:
  - `RequestStatus`, `RequestCategory` (types), `REQUEST_STATUSES`, `REQUEST_CATEGORIES`, `REQUEST_STATUS_TRANSITIONS`, `getValidNextStatuses(current: RequestStatus): RequestStatus[]` — consumed by `lib/domain/requests.ts` (Tasks 10–11) and the request detail page (Task 20). No server-only dependency, safe to import from Client Components.
  - `createRequestSchema`/`CreateRequestInput`, `patchRequestSchema`/`PatchRequestInput`, `requestFiltersSchema`/`RequestFilters`, `decideApprovalSchema`/`DecideApprovalInput` — consumed by the API routes (Tasks 13–17) and the request creation form (Task 19).

- [ ] **Step 1: Write the failing tests**

Create `lib/domain/request-status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getValidNextStatuses } from "@/lib/domain/request-status";

describe("getValidNextStatuses", () => {
  it("allows approved to move to in_progress", () => {
    expect(getValidNextStatuses("approved")).toEqual(["in_progress"]);
  });

  it("allows in_progress to move to completed", () => {
    expect(getValidNextStatuses("in_progress")).toEqual(["completed"]);
  });

  it("treats draft, submitted, under_review, rejected, and completed as having no manual next status", () => {
    expect(getValidNextStatuses("draft")).toEqual([]);
    expect(getValidNextStatuses("submitted")).toEqual([]);
    expect(getValidNextStatuses("under_review")).toEqual([]);
    expect(getValidNextStatuses("rejected")).toEqual([]);
    expect(getValidNextStatuses("completed")).toEqual([]);
  });
});
```

Create `lib/validation/requests.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createRequestSchema,
  decideApprovalSchema,
  patchRequestSchema,
  requestFiltersSchema,
} from "@/lib/validation/requests";

describe("createRequestSchema", () => {
  it("accepts a minimal valid payload", () => {
    expect(
      createRequestSchema.safeParse({ title: "New laptop", category: "equipment" }).success
    ).toBe(true);
  });

  it("rejects an empty title", () => {
    expect(createRequestSchema.safeParse({ title: "", category: "equipment" }).success).toBe(
      false
    );
  });

  it("rejects a missing category", () => {
    expect(createRequestSchema.safeParse({ title: "New laptop" }).success).toBe(false);
  });

  it("rejects an invalid category", () => {
    expect(
      createRequestSchema.safeParse({ title: "New laptop", category: "snacks" }).success
    ).toBe(false);
  });

  it("rejects a non-uuid departmentId", () => {
    expect(
      createRequestSchema.safeParse({
        title: "New laptop",
        category: "equipment",
        departmentId: "not-a-uuid",
      }).success
    ).toBe(false);
  });
});

describe("patchRequestSchema", () => {
  it("accepts a valid status", () => {
    expect(patchRequestSchema.safeParse({ status: "in_progress" }).success).toBe(true);
  });

  it("rejects a missing status", () => {
    expect(patchRequestSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an invalid status value", () => {
    expect(patchRequestSchema.safeParse({ status: "done" }).success).toBe(false);
  });
});

describe("requestFiltersSchema", () => {
  it("accepts an empty filter set", () => {
    expect(requestFiltersSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a full filter set", () => {
    expect(
      requestFiltersSchema.safeParse({
        status: "under_review",
        category: "software",
        departmentId: "11111111-1111-4111-8111-111111111111",
        scope: "mine",
      }).success
    ).toBe(true);
  });

  it("rejects an invalid scope value", () => {
    expect(requestFiltersSchema.safeParse({ scope: "everything" }).success).toBe(false);
  });
});

describe("decideApprovalSchema", () => {
  it("accepts a decision with no comment", () => {
    expect(decideApprovalSchema.safeParse({ decision: "approved" }).success).toBe(true);
  });

  it("accepts a decision with a comment", () => {
    expect(
      decideApprovalSchema.safeParse({ decision: "rejected", comment: "Not needed" }).success
    ).toBe(true);
  });

  it("rejects an invalid decision value", () => {
    expect(decideApprovalSchema.safeParse({ decision: "maybe" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/domain/request-status.test.ts lib/validation/requests.test.ts`
Expected: FAIL — neither module exists yet.

- [ ] **Step 3: Implement `lib/domain/request-status.ts`**

```ts
export type RequestStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "in_progress"
  | "completed";

export type RequestCategory =
  | "equipment"
  | "software"
  | "access"
  | "maintenance"
  | "purchase"
  | "hr"
  | "general"
  | "other";

export const REQUEST_STATUSES: RequestStatus[] = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "in_progress",
  "completed",
];

export const REQUEST_CATEGORIES: RequestCategory[] = [
  "equipment",
  "software",
  "access",
  "maintenance",
  "purchase",
  "hr",
  "general",
  "other",
];

export const REQUEST_STATUS_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  draft: [],
  submitted: [],
  under_review: [],
  approved: ["in_progress"],
  rejected: [],
  in_progress: ["completed"],
  completed: [],
};

export function getValidNextStatuses(current: RequestStatus): RequestStatus[] {
  return REQUEST_STATUS_TRANSITIONS[current];
}
```

- [ ] **Step 4: Implement `lib/validation/requests.ts`**

```ts
import { z } from "zod";
import {
  REQUEST_CATEGORIES,
  REQUEST_STATUSES,
  type RequestCategory,
  type RequestStatus,
} from "@/lib/domain/request-status";

export const requestStatusSchema = z.enum(
  REQUEST_STATUSES as [RequestStatus, ...RequestStatus[]]
);
export const requestCategorySchema = z.enum(
  REQUEST_CATEGORIES as [RequestCategory, ...RequestCategory[]]
);

export const createRequestSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(5000).optional(),
  category: requestCategorySchema,
  departmentId: z.string().uuid().optional(),
});
export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export const patchRequestSchema = z.object({ status: requestStatusSchema });
export type PatchRequestInput = z.infer<typeof patchRequestSchema>;

export const requestFiltersSchema = z.object({
  status: requestStatusSchema.optional(),
  category: requestCategorySchema.optional(),
  departmentId: z.string().uuid().optional(),
  scope: z.enum(["mine", "all"]).optional(),
});
export type RequestFilters = z.infer<typeof requestFiltersSchema>;

export const decideApprovalSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().max(5000).optional(),
});
export type DecideApprovalInput = z.infer<typeof decideApprovalSchema>;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test lib/domain/request-status.test.ts lib/validation/requests.test.ts`
Expected: PASS (3 + 14 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/domain/request-status.ts lib/domain/request-status.test.ts lib/validation/requests.ts lib/validation/requests.test.ts
git commit -m "feat: add request status graph and request validation schemas"
```

---

## Task 7: Realtime broadcast — `broadcastToProfile`

**Files:**
- Modify: `lib/realtime/broadcast.ts`, `lib/realtime/broadcast.test.ts`

**Interfaces:**
- Consumes: `createSupabaseAdminClient` (Foundation).
- Produces: `broadcastToProfile(profileId: string, channel: string, event: { type: string }): Promise<void>` — sends on `profile:{profileId}:{channel}`. `broadcastChange`'s existing signature and behavior are unchanged. Consumed by `lib/domain/notifications.ts` (Task 8).

- [ ] **Step 1: Write the failing test**

Append to `lib/realtime/broadcast.test.ts` — change the import line:

```ts
import { broadcastChange, broadcastToProfile } from "@/lib/realtime/broadcast";
```

Add a new `describe` block at the end of the file:

```ts
describe("broadcastToProfile", () => {
  it("subscribes to the profile-scoped channel, sends the event, and cleans up", async () => {
    await broadcastToProfile("profile-1", "notifications", { type: "approval_required" });

    expect(channelMock).toHaveBeenCalledWith("profile:profile-1:notifications");
    expect(sendMock).toHaveBeenCalledWith({
      type: "broadcast",
      event: "approval_required",
      payload: {},
    });
    expect(removeChannelMock).toHaveBeenCalled();
  });

  it("rejects if the channel fails to subscribe", async () => {
    subscribeMock.mockImplementationOnce((callback: (status: string) => void) => {
      callback("CHANNEL_ERROR");
    });

    await expect(
      broadcastToProfile("profile-1", "notifications", { type: "approval_required" })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test lib/realtime/broadcast.test.ts`
Expected: FAIL — `broadcastToProfile` is not exported.

- [ ] **Step 3: Refactor `lib/realtime/broadcast.ts`**

Replace the entire file content with:

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function sendBroadcast(channelName: string, event: { type: string }): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const realtimeChannel = supabase.channel(channelName);

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

export async function broadcastChange(
  companyId: string,
  channel: string,
  event: { type: string }
): Promise<void> {
  await sendBroadcast(`company:${companyId}:${channel}`, event);
}

export async function broadcastToProfile(
  profileId: string,
  channel: string,
  event: { type: string }
): Promise<void> {
  await sendBroadcast(`profile:${profileId}:${channel}`, event);
}
```

This is the refactor the spec calls for: the existing subscribe/send/removeChannel sequence moves into the shared private `sendBroadcast` helper, and both `broadcastChange` and `broadcastToProfile` call it with a different channel-name prefix. `broadcastChange`'s existing tests (unchanged, still asserting `channel:"company:company-1:tasks"` behavior) continue to pass unmodified.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test lib/realtime/broadcast.test.ts`
Expected: PASS (4 tests — the 2 existing `broadcastChange` tests plus the 2 new `broadcastToProfile` tests).

- [ ] **Step 5: Commit**

```bash
git add lib/realtime/broadcast.ts lib/realtime/broadcast.test.ts
git commit -m "feat: add broadcastToProfile and refactor shared broadcast helper"
```

---

## Task 8: Notifications domain layer

**Files:**
- Create: `lib/domain/notifications.ts`
- Test: `lib/domain/notifications.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `createSupabaseAdminClient` (Foundation); `broadcastToProfile` (Task 7).
- Produces: `Notification { id, profileId, entityType, entityId, type, message, readAt, createdAt }`, `createNotification(profileId, entityType, entityId, type, message): Promise<Notification>`, `listNotifications(profileId): Promise<Notification[]>` — consumed by `lib/domain/requests.ts` (Task 11) and `lib/domain/approvals.ts` (Task 12).

- [ ] **Step 1: Write the failing test**

Create `lib/domain/notifications.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile } from "@/lib/domain/profiles";
import type { Profile } from "@/lib/domain/profiles";
import { createNotification, listNotifications } from "@/lib/domain/notifications";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)(
  "createNotification / listNotifications",
  () => {
    const supabase = createSupabaseAdminClient();
    let companyId: string;
    const createdAuthUserIds: string[] = [];
    let recipient: Profile;
    const entityId = crypto.randomUUID();

    beforeAll(async () => {
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .upsert(
          { name: "Test Co (notifications)", slug: "test-co-notifications" },
          { onConflict: "slug" }
        )
        .select("id")
        .single();
      if (companyError) throw companyError;
      companyId = company.id;

      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: `notifications-test-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
      if (authError || !authUser.user) throw authError;
      createdAuthUserIds.push(authUser.user.id);

      recipient = await createProfile({
        authUserId: authUser.user.id,
        companyId,
        fullName: "Notifications Test User",
        role: "employee",
      });
    });

    afterAll(async () => {
      await supabase.from("notifications").delete().eq("profile_id", recipient.id);
      await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
      for (const id of createdAuthUserIds) {
        await supabase.auth.admin.deleteUser(id);
      }
      await supabase.from("companies").delete().eq("slug", "test-co-notifications");
    });

    it("creates a notification and lists it back for the recipient", async () => {
      const notification = await createNotification(
        recipient.id,
        "request",
        entityId,
        "approval_required",
        "Please review this request"
      );

      expect(notification.profileId).toBe(recipient.id);
      expect(notification.type).toBe("approval_required");
      expect(notification.readAt).toBeNull();

      const notifications = await listNotifications(recipient.id);
      expect(notifications.map((n) => n.id)).toContain(notification.id);
    });

    it("orders notifications newest first", async () => {
      const first = await createNotification(
        recipient.id,
        "request",
        entityId,
        "request_status_changed",
        "First"
      );
      const second = await createNotification(
        recipient.id,
        "request",
        entityId,
        "request_status_changed",
        "Second"
      );

      const notifications = await listNotifications(recipient.id);
      const firstIndex = notifications.findIndex((n) => n.id === first.id);
      const secondIndex = notifications.findIndex((n) => n.id === second.id);
      expect(secondIndex).toBeLessThan(firstIndex);
    });
  }
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration lib/domain/notifications.test.ts`
Expected: FAIL — `@/lib/domain/notifications` cannot be found.

- [ ] **Step 3: Implement `lib/domain/notifications.ts`**

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { broadcastToProfile } from "@/lib/realtime/broadcast";

export interface Notification {
  id: string;
  profileId: string;
  entityType: string;
  entityId: string;
  type: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}

interface NotificationRow {
  id: string;
  profile_id: string;
  entity_type: string;
  entity_id: string;
  type: string;
  message: string;
  read_at: string | null;
  created_at: string;
}

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    profileId: row.profile_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    type: row.type,
    message: row.message,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

const NOTIFICATION_COLUMNS =
  "id, profile_id, entity_type, entity_id, type, message, read_at, created_at";

export async function createNotification(
  profileId: string,
  entityType: string,
  entityId: string,
  type: string,
  message: string
): Promise<Notification> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("notifications")
    .insert({
      profile_id: profileId,
      entity_type: entityType,
      entity_id: entityId,
      type,
      message,
    })
    .select(NOTIFICATION_COLUMNS)
    .single();
  if (error) throw error;

  const notification = toNotification(data);
  try {
    await broadcastToProfile(profileId, "notifications", { type });
  } catch (broadcastError) {
    console.error("broadcastToProfile failed:", broadcastError);
  }
  return notification;
}

export async function listNotifications(profileId: string): Promise<Notification[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toNotification);
}
```

The `try`/`catch`/`console.error` around the broadcast call mirrors the actual current `lib/domain/tasks.ts` (not the literal Phase 2 plan document, which predates that hardening) — a Realtime hiccup must not fail the notification write itself.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:integration lib/domain/notifications.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Register the new integration test in `package.json`**

```json
"test:unit": "vitest run --exclude \"lib/domain/profiles.test.ts\" --exclude \"lib/domain/seed.test.ts\" --exclude \"lib/domain/activity.test.ts\" --exclude \"lib/domain/comments.test.ts\" --exclude \"lib/domain/tasks.test.ts\" --exclude \"lib/domain/attachments.test.ts\" --exclude \"lib/domain/notifications.test.ts\" --exclude \"scripts/seed.smoke.test.ts\"",
"test:integration": "vitest run lib/domain/profiles.test.ts lib/domain/seed.test.ts lib/domain/activity.test.ts lib/domain/comments.test.ts lib/domain/tasks.test.ts lib/domain/attachments.test.ts lib/domain/notifications.test.ts scripts/seed.smoke.test.ts",
```

- [ ] **Step 6: Commit**

```bash
git add lib/domain/notifications.ts lib/domain/notifications.test.ts package.json
git commit -m "feat: add notifications domain layer"
```

---

## Task 9: Permissions domain layer — Phase 3 additions

**Files:**
- Modify: `lib/domain/permissions.ts`, `lib/domain/permissions.test.ts`

**Interfaces:**
- Consumes: `Profile` (Task 7 of Phase 2); `COMPANY_WIDE_VIEW_ROLES`, `ELEVATED_ROLES` (already private constants in this file, Phase 2).
- Produces: `RequestLike`, `canCreateRequest`, `canViewRequest`, `canDecideApproval`, `canTransitionRequestStatus`, `canCommentOnRequest`, `canUploadRequestAttachment` — consumed by `lib/domain/requests.ts` (Tasks 10–11), `lib/domain/approvals.ts` (Task 12), and the request detail page (Task 20).

- [ ] **Step 1: Write the failing tests**

Replace the import block at the top of `lib/domain/permissions.test.ts` (lines 1–10):

```ts
import { describe, expect, it } from "vitest";
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
} from "@/lib/domain/permissions";
import type { Profile } from "@/lib/domain/profiles";
import type { RequestLike, TaskLike } from "@/lib/domain/permissions";
```

Add a `makeRequest` helper immediately after the existing `makeTask` helper (after line 33):

```ts
function makeRequest(overrides: Partial<RequestLike> = {}): RequestLike {
  return {
    companyId: "company-1",
    createdBy: "profile-1",
    departmentId: null,
    ...overrides,
  };
}
```

Append these `describe` blocks at the end of the file:

```ts
describe("canCreateRequest", () => {
  it("allows any profile", () => {
    expect(canCreateRequest(makeProfile())).toBe(true);
  });
});

describe("canViewRequest", () => {
  it("denies a profile from a different company", () => {
    const profile = makeProfile({ companyId: "other-company" });
    expect(canViewRequest(profile, makeRequest(), null)).toBe(false);
  });

  it("allows the creator", () => {
    const profile = makeProfile({ id: "creator-1" });
    expect(canViewRequest(profile, makeRequest({ createdBy: "creator-1" }), null)).toBe(true);
  });

  it("allows the approver", () => {
    const profile = makeProfile({ id: "approver-1" });
    expect(canViewRequest(profile, makeRequest(), "approver-1")).toBe(true);
  });

  it("denies an unrelated employee", () => {
    const profile = makeProfile({ id: "someone-else" });
    expect(canViewRequest(profile, makeRequest(), null)).toBe(false);
  });

  it("allows a manager for a request in their department", () => {
    const profile = makeProfile({ id: "manager-1", role: "manager", departmentId: "dept-1" });
    expect(canViewRequest(profile, makeRequest({ departmentId: "dept-1" }), null)).toBe(true);
  });

  it("denies a manager for a request in a different department", () => {
    const profile = makeProfile({ id: "manager-1", role: "manager", departmentId: "dept-1" });
    expect(canViewRequest(profile, makeRequest({ departmentId: "dept-2" }), null)).toBe(false);
  });

  it("allows operations_manager, it, hr, and admin to view any company request", () => {
    for (const role of ["operations_manager", "it", "hr", "admin"] as const) {
      const profile = makeProfile({ id: "someone-else", role });
      expect(canViewRequest(profile, makeRequest(), null)).toBe(true);
    }
  });
});

describe("canDecideApproval", () => {
  it("allows the assigned approver", () => {
    const profile = makeProfile({ id: "approver-1" });
    expect(canDecideApproval(profile, { approverId: "approver-1" })).toBe(true);
  });

  it("allows operations_manager and admin regardless of the assigned approver", () => {
    for (const role of ["operations_manager", "admin"] as const) {
      const profile = makeProfile({ id: "someone-else", role });
      expect(canDecideApproval(profile, { approverId: "approver-1" })).toBe(true);
    }
  });

  it("denies an unrelated employee", () => {
    const profile = makeProfile({ id: "someone-else" });
    expect(canDecideApproval(profile, { approverId: "approver-1" })).toBe(false);
  });
});

describe("canTransitionRequestStatus", () => {
  it("allows the creator", () => {
    const profile = makeProfile({ id: "creator-1" });
    expect(
      canTransitionRequestStatus(profile, makeRequest({ createdBy: "creator-1" }), null)
    ).toBe(true);
  });

  it("allows the approver", () => {
    const profile = makeProfile({ id: "approver-1" });
    expect(canTransitionRequestStatus(profile, makeRequest(), "approver-1")).toBe(true);
  });

  it("allows operations_manager and admin regardless of relation", () => {
    for (const role of ["operations_manager", "admin"] as const) {
      const profile = makeProfile({ id: "someone-else", role });
      expect(canTransitionRequestStatus(profile, makeRequest(), null)).toBe(true);
    }
  });

  it("denies an unrelated employee", () => {
    const profile = makeProfile({ id: "someone-else" });
    expect(canTransitionRequestStatus(profile, makeRequest(), null)).toBe(false);
  });
});

describe("canCommentOnRequest / canUploadRequestAttachment", () => {
  it("are aliases of canViewRequest", () => {
    expect(canCommentOnRequest).toBe(canViewRequest);
    expect(canUploadRequestAttachment).toBe(canViewRequest);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/domain/permissions.test.ts`
Expected: FAIL — `canCreateRequest`, `canViewRequest`, `canDecideApproval`, `canTransitionRequestStatus`, `canCommentOnRequest`, `canUploadRequestAttachment`, `RequestLike` are not exported.

- [ ] **Step 3: Append the Phase 3 functions to `lib/domain/permissions.ts`**

Append to the end of the file (after the existing `export const canUploadAttachment = canViewTask;`):

```ts
export interface RequestLike {
  companyId: string;
  createdBy: string | null;
  departmentId: string | null;
}

export function canCreateRequest(_profile: Profile): boolean {
  return true;
}

export function canViewRequest(
  profile: Profile,
  request: RequestLike,
  approverId: string | null
): boolean {
  if (profile.companyId !== request.companyId) return false;
  if (COMPANY_WIDE_VIEW_ROLES.has(profile.role)) return true;
  if (profile.id === request.createdBy || profile.id === approverId) return true;
  if (
    profile.role === "manager" &&
    profile.departmentId !== null &&
    profile.departmentId === request.departmentId
  ) {
    return true;
  }
  return false;
}

export function canDecideApproval(
  profile: Profile,
  approval: { approverId: string | null }
): boolean {
  return profile.id === approval.approverId || ELEVATED_ROLES.has(profile.role);
}

export function canTransitionRequestStatus(
  profile: Profile,
  request: RequestLike,
  approverId: string | null
): boolean {
  if (profile.companyId !== request.companyId) return false;
  if (ELEVATED_ROLES.has(profile.role)) return true;
  return profile.id === request.createdBy || profile.id === approverId;
}

export const canCommentOnRequest = canViewRequest;
export const canUploadRequestAttachment = canViewRequest;
```

This reuses `COMPANY_WIDE_VIEW_ROLES` and `ELEVATED_ROLES`, the existing private constants already defined earlier in this same file from Phase 2 — no redefinition. `RequestLike.createdBy` and `canDecideApproval`'s `approverId` are typed `string | null`, matching the nullable-FK fixes from Tasks 1–2 (the design spec's literal signatures show `createdBy: string` and `{ approverId: string }` — both non-null — but that's inconsistent with the DB schema this plan actually creates, so the domain-layer type is corrected to match, same as Phase 2's `TaskLike.creatorId: string | null` fix).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test lib/domain/permissions.test.ts`
Expected: PASS (34 tests — 19 existing Phase 2 tests plus 15 new).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/permissions.ts lib/domain/permissions.test.ts
git commit -m "feat: add request and approval permissions"
```

---

## Task 10: Requests domain layer — create, get, list

**Files:**
- Create: `lib/domain/requests.ts`
- Test: `lib/domain/requests.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `Profile` (Phase 2); `CreateRequestInput`, `RequestFilters` (Task 6); `ForbiddenError`, `NotFoundError` (Phase 2, `lib/domain/errors.ts`); `canCreateRequest`, `canViewRequest` (Task 9); `logActivity` (Phase 2); `createSupabaseAdminClient` (Foundation).
- Produces: `Request { id, companyId, title, description, category, status, createdBy, departmentId, createdAt }`, `createRequest(profile, input): Promise<Request>`, `loadRequestOrThrow(requestId): Promise<Request>`, `getRequest(profile, requestId): Promise<Request>`, `listRequests(profile, filters): Promise<Request[]>` — consumed by the `/api/requests` routes (Tasks 13–14), `lib/domain/approvals.ts` (Task 12, via `loadRequestOrThrow`), and Task 11 (which adds `submitRequest`/`transitionRequestStatus` to this same file).

**Note on the type name `Request`:** this shadows the global Fetch API `Request` type within this module's scope, exactly as the spec names it (mirroring `Task`, `Comment`, `Attachment`). No file in this plan imports both the global `Request` (used only as a Route Handler parameter type, e.g. `request: Request`) and this domain `Request` type in the same file, so there is no actual collision — but never write `import type { Request } from "@/lib/domain/requests"` in a Route Handler file.

- [ ] **Step 1: Write the failing test**

Create `lib/domain/requests.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile } from "@/lib/domain/profiles";
import type { Profile } from "@/lib/domain/profiles";
import { createRequest, getRequest, listRequests } from "@/lib/domain/requests";
import { ForbiddenError } from "@/lib/domain/errors";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)(
  "createRequest / getRequest / listRequests",
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
        .upsert({ name: "Test Co (requests)", slug: "test-co-requests" }, { onConflict: "slug" })
        .select("id")
        .single();
      if (companyError) throw companyError;
      companyId = company.id;

      const { data: departments, error: departmentsError } = await supabase
        .from("departments")
        .upsert(
          [
            { company_id: companyId, name: "Dept A (requests test)" },
            { company_id: companyId, name: "Dept B (requests test)" },
          ],
          { onConflict: "company_id,name" }
        )
        .select("id, name");
      if (departmentsError) throw departmentsError;
      departmentAId = departments.find((d) => d.name === "Dept A (requests test)")!.id;
      departmentBId = departments.find((d) => d.name === "Dept B (requests test)")!.id;

      async function createTestProfile(
        fullName: string,
        role: Profile["role"],
        departmentId: string | null
      ) {
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email: `requests-test-${crypto.randomUUID()}@example.com`,
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
      await supabase.from("requests").delete().eq("company_id", companyId);
      await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
      for (const id of createdAuthUserIds) {
        await supabase.auth.admin.deleteUser(id);
      }
      await supabase.from("companies").delete().eq("slug", "test-co-requests");
    });

    it("creates a request with the creator and company set, and draft status", async () => {
      const request = await createRequest(employee, {
        title: "New laptop",
        category: "equipment",
      });
      expect(request.createdBy).toBe(employee.id);
      expect(request.companyId).toBe(companyId);
      expect(request.status).toBe("draft");
      expect(request.category).toBe("equipment");
    });

    it("lets the creator view their own draft request, but not an unrelated employee", async () => {
      const request = await createRequest(employee, {
        title: "Access request",
        category: "access",
      });

      await expect(getRequest(employee, request.id)).resolves.toMatchObject({ id: request.id });

      const stranger = await (async () => {
        const { data: authUser, error } = await supabase.auth.admin.createUser({
          email: `requests-test-${crypto.randomUUID()}@example.com`,
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

      await expect(getRequest(stranger, request.id)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("lets a manager view requests in their department but not another department's", async () => {
      const inDept = await createRequest(employee, {
        title: "Dept A request",
        category: "general",
        departmentId: departmentAId,
      });
      const outOfDept = await createRequest(employee, {
        title: "Dept B request",
        category: "general",
        departmentId: departmentBId,
      });

      await expect(getRequest(managerA, inDept.id)).resolves.toMatchObject({ id: inDept.id });
      await expect(getRequest(managerA, outOfDept.id)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("lets an operations_manager view any request in the company", async () => {
      const request = await createRequest(employee, { title: "Any request", category: "other" });
      await expect(getRequest(opsManager, request.id)).resolves.toMatchObject({ id: request.id });
    });

    it("scopes listRequests('mine') to the caller's own requests", async () => {
      await supabase.from("requests").delete().eq("company_id", companyId);

      const own = await createRequest(employee, { title: "My request", category: "general" });
      await createRequest(managerA, { title: "Manager's request", category: "general" });

      const mine = await listRequests(employee, { scope: "mine" });
      expect(mine.map((r) => r.id)).toEqual([own.id]);
    });

    it("scopes listRequests('all') to what each role is allowed to see", async () => {
      await supabase.from("requests").delete().eq("company_id", companyId);

      await createRequest(employee, { title: "Employee's own request", category: "general" });
      await createRequest(managerA, {
        title: "Unrelated request",
        category: "general",
        departmentId: departmentBId,
      });

      const employeeRequests = await listRequests(employee, { scope: "all" });
      expect(employeeRequests.length).toBe(1);

      const opsManagerRequests = await listRequests(opsManager, { scope: "all" });
      expect(opsManagerRequests.length).toBe(2);
    });
  }
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration lib/domain/requests.test.ts`
Expected: FAIL — `@/lib/domain/requests` cannot be found.

- [ ] **Step 3: Implement `lib/domain/requests.ts`**

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/domain/profiles";
import { logActivity } from "@/lib/domain/activity";
import { canCreateRequest, canViewRequest } from "@/lib/domain/permissions";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import type { CreateRequestInput, RequestFilters } from "@/lib/validation/requests";
import type { RequestCategory, RequestStatus } from "@/lib/domain/request-status";

export interface Request {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  category: RequestCategory;
  status: RequestStatus;
  createdBy: string | null;
  departmentId: string | null;
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
  created_at: string;
}

function toRequest(row: RequestRow): Request {
  return {
    id: row.id,
    companyId: row.company_id,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    createdBy: row.created_by,
    departmentId: row.department_id,
    createdAt: row.created_at,
  };
}

const REQUEST_COLUMNS =
  "id, company_id, title, description, category, status, created_by, department_id, created_at";

const COMPANY_WIDE_VIEW_ROLES = new Set(["operations_manager", "it", "hr", "admin"]);

export async function createRequest(profile: Profile, input: CreateRequestInput): Promise<Request> {
  if (!canCreateRequest(profile)) {
    throw new ForbiddenError("You cannot create requests");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("requests")
    .insert({
      company_id: profile.companyId,
      title: input.title,
      description: input.description ?? null,
      category: input.category,
      created_by: profile.id,
      department_id: input.departmentId ?? null,
    })
    .select(REQUEST_COLUMNS)
    .single();
  if (error) throw error;

  const request = toRequest(data);
  await logActivity(
    "request",
    request.id,
    profile.id,
    `${profile.fullName} created this request`
  );
  return request;
}

export async function loadRequestOrThrow(requestId: string): Promise<Request> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("requests")
    .select(REQUEST_COLUMNS)
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError("Request not found");
  return toRequest(data);
}

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

export async function getRequest(profile: Profile, requestId: string): Promise<Request> {
  const request = await loadRequestOrThrow(requestId);
  const approverId = await loadApproverIdForRequest(requestId);
  if (!canViewRequest(profile, request, approverId)) {
    throw new ForbiddenError("You cannot view this request");
  }
  return request;
}

export async function listRequests(profile: Profile, filters: RequestFilters): Promise<Request[]> {
  const supabase = createSupabaseAdminClient();
  let query = supabase.from("requests").select(REQUEST_COLUMNS).eq("company_id", profile.companyId);

  if (filters.scope === "mine") {
    query = query.eq("created_by", profile.id);
  } else if (!COMPANY_WIDE_VIEW_ROLES.has(profile.role)) {
    if (profile.role === "manager" && profile.departmentId) {
      query = query.or(`created_by.eq.${profile.id},department_id.eq.${profile.departmentId}`);
    } else {
      query = query.eq("created_by", profile.id);
    }
  }

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.departmentId) query = query.eq("department_id", filters.departmentId);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toRequest);
}
```

`listRequests`'s `'all'`/unset-scope branch does not additionally check `approvals.approver_id` (i.e., an approver who is not the creator, an elevated role, or the department manager won't see the request in a list they didn't create) — this is the exact visibility-duplication gap the spec explicitly flags as already known from Phase 2's `listTasks`/`canViewTask` and deliberately not re-solved here. `getRequest`, unlike `listRequests`, does do the full `canViewRequest` check including `approverId`, since it has the request id up front and can afford the extra query.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:integration lib/domain/requests.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Register the new integration test in `package.json`**

```json
"test:unit": "vitest run --exclude \"lib/domain/profiles.test.ts\" --exclude \"lib/domain/seed.test.ts\" --exclude \"lib/domain/activity.test.ts\" --exclude \"lib/domain/comments.test.ts\" --exclude \"lib/domain/tasks.test.ts\" --exclude \"lib/domain/attachments.test.ts\" --exclude \"lib/domain/notifications.test.ts\" --exclude \"lib/domain/requests.test.ts\" --exclude \"scripts/seed.smoke.test.ts\"",
"test:integration": "vitest run lib/domain/profiles.test.ts lib/domain/seed.test.ts lib/domain/activity.test.ts lib/domain/comments.test.ts lib/domain/tasks.test.ts lib/domain/attachments.test.ts lib/domain/notifications.test.ts lib/domain/requests.test.ts scripts/seed.smoke.test.ts",
```

- [ ] **Step 6: Commit**

```bash
git add lib/domain/requests.ts lib/domain/requests.test.ts package.json
git commit -m "feat: add requests domain layer — create, get, list"
```

---

## Task 11: Requests domain layer — submit, transition status

**Files:**
- Modify: `lib/domain/requests.ts`, `lib/domain/requests.test.ts`

**Interfaces:**
- Consumes: `getProfileById` (Phase 2, `lib/domain/profiles.ts`); `REQUEST_STATUS_TRANSITIONS` (Task 6); `InvalidTransitionError` (Phase 2); `canTransitionRequestStatus` (Task 9); `createNotification` (Task 8); `broadcastChange` (Phase 2); everything already in `requests.ts` from Task 10.
- Produces: `submitRequest(profile, requestId): Promise<Request>`, `transitionRequestStatus(profile, requestId, status): Promise<Request>` — consumed by `/api/requests` (Task 13, `submitRequest`) and `/api/requests/[id]` (Task 14, `transitionRequestStatus`).

**Note on `submitRequest`'s permission check:** the spec's numbered steps for `submitRequest` don't explicitly name a permission function, but per the Goal's "domain layer is the sole authorization boundary," every mutator in this codebase checks one. `canTransitionRequestStatus(profile, request, null)` (approver is always null pre-submission — no approval row exists yet for a draft) reduces to "creator or elevated role," which is the correct guard: only the request's own creator (or an elevated role) may submit it out of draft. This is unreachable via the API surface in this phase (`POST /api/requests` always submits the request it just created, as the same profile), but the domain function itself stays defensively correct for direct callers and for whenever a later phase adds a "submit an existing draft" route.

- [ ] **Step 1: Write the failing tests**

Add to the imports at the top of `lib/domain/requests.test.ts`:

```ts
import { submitRequest, transitionRequestStatus } from "@/lib/domain/requests";
import { InvalidTransitionError } from "@/lib/domain/errors";
```

Add these `it` blocks inside the existing `describe.skipIf(...)(...)` block, after the last existing test:

```ts
    it("submits a request and routes approval to the requester's manager when set", async () => {
      const employeeWithManager = await (async () => {
        const { data: authUser, error } = await supabase.auth.admin.createUser({
          email: `requests-test-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
        if (error || !authUser.user) throw error;
        createdAuthUserIds.push(authUser.user.id);
        return createProfile({
          authUserId: authUser.user.id,
          companyId,
          fullName: "Employee With Manager",
          role: "employee",
          departmentId: departmentAId,
          managerId: managerA.id,
        });
      })();

      const draft = await createRequest(employeeWithManager, {
        title: "Manager-routed request",
        category: "general",
      });

      const submitted = await submitRequest(employeeWithManager, draft.id);
      expect(submitted.status).toBe("under_review");

      const { data: approval, error } = await supabase
        .from("approvals")
        .select("approver_id, status")
        .eq("request_id", draft.id)
        .single();
      if (error) throw error;
      expect(approval.approver_id).toBe(managerA.id);
      expect(approval.status).toBe("pending");
    });

    it("routes approval to the earliest-created operations_manager when the requester has no manager", async () => {
      const draft = await createRequest(employee, {
        title: "Ops-manager-routed request",
        category: "general",
      });

      const submitted = await submitRequest(employee, draft.id);
      expect(submitted.status).toBe("under_review");

      const { data: approval, error } = await supabase
        .from("approvals")
        .select("approver_id")
        .eq("request_id", draft.id)
        .single();
      if (error) throw error;
      expect(approval.approver_id).toBe(opsManager.id);
    });

    it("routes approval to the earliest-created admin when there is no manager or operations_manager", async () => {
      const { data: isolatedCompany, error: companyError } = await supabase
        .from("companies")
        .upsert(
          { name: "Test Co (requests, admin fallback)", slug: "test-co-requests-admin-fallback" },
          { onConflict: "slug" }
        )
        .select("id")
        .single();
      if (companyError) throw companyError;

      const { data: adminAuthUser, error: adminAuthError } =
        await supabase.auth.admin.createUser({
          email: `requests-test-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
      if (adminAuthError || !adminAuthUser.user) throw adminAuthError;

      const admin = await createProfile({
        authUserId: adminAuthUser.user.id,
        companyId: isolatedCompany.id,
        fullName: "Fallback Admin",
        role: "admin",
      });

      const { data: requesterAuthUser, error: requesterAuthError } =
        await supabase.auth.admin.createUser({
          email: `requests-test-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
      if (requesterAuthError || !requesterAuthUser.user) throw requesterAuthError;

      const requester = await createProfile({
        authUserId: requesterAuthUser.user.id,
        companyId: isolatedCompany.id,
        fullName: "Fallback Requester",
        role: "employee",
      });

      const draft = await createRequest(requester, {
        title: "Admin-routed request",
        category: "general",
      });
      const submitted = await submitRequest(requester, draft.id);
      expect(submitted.status).toBe("under_review");

      const { data: approval, error } = await supabase
        .from("approvals")
        .select("approver_id")
        .eq("request_id", draft.id)
        .single();
      if (error) throw error;
      expect(approval.approver_id).toBe(admin.id);

      await supabase.from("requests").delete().eq("company_id", isolatedCompany.id);
      await supabase.from("profiles").delete().eq("id", requester.id);
      await supabase.from("profiles").delete().eq("id", admin.id);
      await supabase.auth.admin.deleteUser(requesterAuthUser.user.id);
      await supabase.auth.admin.deleteUser(adminAuthUser.user.id);
      await supabase.from("companies").delete().eq("id", isolatedCompany.id);
    });

    it("throws when no manager, operations_manager, or admin exists to approve", async () => {
      const { data: emptyCompany, error: companyError } = await supabase
        .from("companies")
        .upsert(
          { name: "Test Co (requests, no approver)", slug: "test-co-requests-no-approver" },
          { onConflict: "slug" }
        )
        .select("id")
        .single();
      if (companyError) throw companyError;

      const { data: requesterAuthUser, error: requesterAuthError } =
        await supabase.auth.admin.createUser({
          email: `requests-test-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
      if (requesterAuthError || !requesterAuthUser.user) throw requesterAuthError;

      const requester = await createProfile({
        authUserId: requesterAuthUser.user.id,
        companyId: emptyCompany.id,
        fullName: "No-approver Requester",
        role: "employee",
      });

      const draft = await createRequest(requester, {
        title: "No approver available",
        category: "general",
      });

      await expect(submitRequest(requester, draft.id)).rejects.toThrow();

      await supabase.from("requests").delete().eq("company_id", emptyCompany.id);
      await supabase.from("profiles").delete().eq("id", requester.id);
      await supabase.auth.admin.deleteUser(requesterAuthUser.user.id);
      await supabase.from("companies").delete().eq("id", emptyCompany.id);
    });

    it("rejects submitting a request that is not in draft status", async () => {
      const draft = await createRequest(employee, {
        title: "Double submit test",
        category: "general",
      });
      await submitRequest(employee, draft.id);
      await expect(submitRequest(employee, draft.id)).rejects.toBeInstanceOf(
        InvalidTransitionError
      );
    });

    it("moves a request through a valid manual transition", async () => {
      const draft = await createRequest(employee, {
        title: "Transition test",
        category: "general",
      });
      const submitted = await submitRequest(employee, draft.id);
      const { data: approval, error } = await supabase
        .from("approvals")
        .select("id")
        .eq("request_id", submitted.id)
        .single();
      if (error) throw error;

      await supabase.from("approvals").update({ status: "approved" }).eq("id", approval.id);
      await supabase.from("requests").update({ status: "approved" }).eq("id", submitted.id);

      const inProgress = await transitionRequestStatus(employee, submitted.id, "in_progress");
      expect(inProgress.status).toBe("in_progress");

      const completed = await transitionRequestStatus(employee, submitted.id, "completed");
      expect(completed.status).toBe("completed");
    });

    it("rejects an invalid manual transition", async () => {
      const draft = await createRequest(employee, {
        title: "Invalid transition test",
        category: "general",
      });
      await expect(
        transitionRequestStatus(employee, draft.id, "approved")
      ).rejects.toBeInstanceOf(InvalidTransitionError);
    });

    it("denies a status change from an unrelated employee", async () => {
      const draft = await createRequest(employee, {
        title: "Unauthorized transition test",
        category: "general",
      });
      const submitted = await submitRequest(employee, draft.id);
      await supabase.from("requests").update({ status: "approved" }).eq("id", submitted.id);

      const stranger = await (async () => {
        const { data: authUser, error } = await supabase.auth.admin.createUser({
          email: `requests-test-${crypto.randomUUID()}@example.com`,
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

      await expect(
        transitionRequestStatus(stranger, submitted.id, "in_progress")
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:integration lib/domain/requests.test.ts`
Expected: FAIL — `submitRequest`, `transitionRequestStatus` are not exported.

- [ ] **Step 3: Add the new functions to `lib/domain/requests.ts`**

Update the imports at the top of the file:

```ts
import { getProfileById, type Profile } from "@/lib/domain/profiles";
import { logActivity } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import { createNotification } from "@/lib/domain/notifications";
import {
  canCreateRequest,
  canTransitionRequestStatus,
  canViewRequest,
} from "@/lib/domain/permissions";
import { ForbiddenError, InvalidTransitionError, NotFoundError } from "@/lib/domain/errors";
import type { CreateRequestInput, RequestFilters } from "@/lib/validation/requests";
import {
  REQUEST_STATUS_TRANSITIONS,
  type RequestCategory,
  type RequestStatus,
} from "@/lib/domain/request-status";
```

(This replaces the narrower `import type { Profile } from "@/lib/domain/profiles";`, the `canCreateRequest, canViewRequest` import, and the `import type { RequestCategory, RequestStatus }` from Task 10.)

Append to the end of the file:

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

async function resolveApprover(profile: Profile): Promise<Profile> {
  if (profile.managerId) {
    const manager = await getProfileById(profile.managerId);
    if (manager) return manager;
  }

  const opsManager = await findEarliestProfileByRole(profile.companyId, "operations_manager");
  if (opsManager) return opsManager;

  const admin = await findEarliestProfileByRole(profile.companyId, "admin");
  if (admin) return admin;

  throw new Error(
    `No approver could be resolved for company ${profile.companyId}: the requester has no manager, and the company has no operations_manager or admin profile.`
  );
}

export async function submitRequest(profile: Profile, requestId: string): Promise<Request> {
  const request = await loadRequestOrThrow(requestId);
  const approverId = await loadApproverIdForRequest(requestId);

  if (!canTransitionRequestStatus(profile, request, approverId)) {
    throw new ForbiddenError("You cannot submit this request");
  }
  if (request.status !== "draft") {
    throw new InvalidTransitionError(`Cannot submit a request with status "${request.status}"`);
  }

  const approver = await resolveApprover(profile);

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("requests")
    .update({ status: "under_review" })
    .eq("id", requestId)
    .select(REQUEST_COLUMNS)
    .single();
  if (error) throw error;
  const updated = toRequest(data);

  const { error: approvalError } = await supabase.from("approvals").insert({
    request_id: updated.id,
    approver_id: approver.id,
    status: "pending",
  });
  if (approvalError) throw approvalError;

  await logActivity(
    "request",
    updated.id,
    profile.id,
    `${profile.fullName} submitted this request, awaiting approval from ${approver.fullName}`
  );

  await createNotification(
    approver.id,
    "request",
    updated.id,
    "approval_required",
    `${profile.fullName} submitted "${updated.title}" for your approval`
  );

  try {
    await broadcastChange(profile.companyId, "requests", { type: "request_updated" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }

  return updated;
}

export async function transitionRequestStatus(
  profile: Profile,
  requestId: string,
  status: RequestStatus
): Promise<Request> {
  const request = await loadRequestOrThrow(requestId);
  const approverId = await loadApproverIdForRequest(requestId);

  if (!canTransitionRequestStatus(profile, request, approverId)) {
    throw new ForbiddenError("You cannot change this request's status");
  }

  if (!REQUEST_STATUS_TRANSITIONS[request.status].includes(status)) {
    throw new InvalidTransitionError(
      `Cannot move a request from "${request.status}" to "${status}"`
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("requests")
    .update({ status })
    .eq("id", requestId)
    .select(REQUEST_COLUMNS)
    .single();
  if (error) throw error;

  const updated = toRequest(data);
  await logActivity(
    "request",
    updated.id,
    profile.id,
    `${profile.fullName} changed status from "${request.status}" to "${status}"`
  );
  try {
    await broadcastChange(profile.companyId, "requests", { type: "request_updated" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }
  return updated;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:integration lib/domain/requests.test.ts`
Expected: PASS (14 tests total).

- [ ] **Step 5: Verify the project builds**

Run: `pnpm build`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/requests.ts lib/domain/requests.test.ts
git commit -m "feat: add submitRequest and transitionRequestStatus to requests domain layer"
```

---

## Task 12: Approvals domain layer

**Files:**
- Create: `lib/domain/approvals.ts`
- Test: `lib/domain/approvals.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `Profile` (Phase 2); `loadRequestOrThrow` (Task 10); `canDecideApproval` (Task 9); `logActivity` (Phase 2); `createNotification` (Task 8); `broadcastChange` (Phase 2); `ForbiddenError`, `InvalidTransitionError`, `NotFoundError` (Phase 2).
- Produces: `Approval { id, requestId, approverId, status, decidedAt, comment, createdAt }`, `decideApproval(profile, approvalId, decision, comment?): Promise<Approval>`, `getApprovalForRequest(requestId): Promise<Approval | null>` — consumed by `/api/approvals/[id]/decide` (Task 17, `decideApproval`) and the request detail page (Task 20, `getApprovalForRequest`).

**Note on `getApprovalForRequest`:** not named in the spec's domain-layer bullet list, but necessary plumbing — the request detail page needs the pending approval's id (to POST a decision to `/api/approvals/{approvalId}/decide`) and its `approverId`/`status` (to decide whether to render the approve/reject control at all, per `canDecideApproval`). This is the same kind of small, load-bearing addition Phase 2 made without a dedicated spec bullet (e.g. `loadTaskOrThrow`); it is not new product scope.

- [ ] **Step 1: Write the failing test**

Create `lib/domain/approvals.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile } from "@/lib/domain/profiles";
import type { Profile } from "@/lib/domain/profiles";
import { createRequest, submitRequest } from "@/lib/domain/requests";
import { decideApproval, getApprovalForRequest } from "@/lib/domain/approvals";
import { listNotifications } from "@/lib/domain/notifications";
import { ForbiddenError, InvalidTransitionError, NotFoundError } from "@/lib/domain/errors";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)(
  "decideApproval / getApprovalForRequest",
  () => {
    const supabase = createSupabaseAdminClient();
    let companyId: string;
    const createdAuthUserIds: string[] = [];
    let requester: Profile;
    let opsManager: Profile;

    beforeAll(async () => {
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .upsert({ name: "Test Co (approvals)", slug: "test-co-approvals" }, { onConflict: "slug" })
        .select("id")
        .single();
      if (companyError) throw companyError;
      companyId = company.id;

      async function createTestProfile(fullName: string, role: Profile["role"]) {
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email: `approvals-test-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
        if (authError || !authUser.user) throw authError;
        createdAuthUserIds.push(authUser.user.id);
        return createProfile({ authUserId: authUser.user.id, companyId, fullName, role });
      }

      requester = await createTestProfile("Requester", "employee");
      opsManager = await createTestProfile("Ops Manager", "operations_manager");
    });

    afterAll(async () => {
      await supabase.from("notifications").delete().eq("entity_type", "request");
      await supabase.from("requests").delete().eq("company_id", companyId);
      await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
      for (const id of createdAuthUserIds) {
        await supabase.auth.admin.deleteUser(id);
      }
      await supabase.from("companies").delete().eq("slug", "test-co-approvals");
    });

    it("approves a request, updates its status, and notifies the requester", async () => {
      const draft = await createRequest(requester, { title: "Approve me", category: "general" });
      const submitted = await submitRequest(requester, draft.id);

      const approval = await getApprovalForRequest(submitted.id);
      expect(approval?.status).toBe("pending");

      const decided = await decideApproval(opsManager, approval!.id, "approved", "Looks good");
      expect(decided.status).toBe("approved");
      expect(decided.decidedAt).not.toBeNull();
      expect(decided.comment).toBe("Looks good");

      const updatedApproval = await getApprovalForRequest(submitted.id);
      expect(updatedApproval?.status).toBe("approved");

      const notifications = await listNotifications(requester.id);
      expect(
        notifications.some(
          (n) => n.entityId === submitted.id && n.type === "request_status_changed"
        )
      ).toBe(true);
    });

    it("rejects a request and marks it terminal", async () => {
      const draft = await createRequest(requester, { title: "Reject me", category: "general" });
      const submitted = await submitRequest(requester, draft.id);
      const approval = await getApprovalForRequest(submitted.id);

      const decided = await decideApproval(opsManager, approval!.id, "rejected");
      expect(decided.status).toBe("rejected");
    });

    it("denies a decision from someone who is not the approver or elevated", async () => {
      const draft = await createRequest(requester, {
        title: "Unauthorized decision",
        category: "general",
      });
      const submitted = await submitRequest(requester, draft.id);
      const approval = await getApprovalForRequest(submitted.id);

      await expect(
        decideApproval(requester, approval!.id, "approved")
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("rejects deciding an approval that has already been decided", async () => {
      const draft = await createRequest(requester, {
        title: "Already decided",
        category: "general",
      });
      const submitted = await submitRequest(requester, draft.id);
      const approval = await getApprovalForRequest(submitted.id);

      await decideApproval(opsManager, approval!.id, "approved");
      await expect(
        decideApproval(opsManager, approval!.id, "rejected")
      ).rejects.toBeInstanceOf(InvalidTransitionError);
    });

    it("throws NotFoundError for a nonexistent approval", async () => {
      await expect(
        decideApproval(opsManager, crypto.randomUUID(), "approved")
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("returns null from getApprovalForRequest for a request with no approval yet", async () => {
      const draft = await createRequest(requester, { title: "Still draft", category: "general" });
      const approval = await getApprovalForRequest(draft.id);
      expect(approval).toBeNull();
    });
  }
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration lib/domain/approvals.test.ts`
Expected: FAIL — `@/lib/domain/approvals` cannot be found.

- [ ] **Step 3: Implement `lib/domain/approvals.ts`**

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/domain/profiles";
import { logActivity } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import { createNotification } from "@/lib/domain/notifications";
import { canDecideApproval } from "@/lib/domain/permissions";
import { loadRequestOrThrow } from "@/lib/domain/requests";
import { ForbiddenError, InvalidTransitionError, NotFoundError } from "@/lib/domain/errors";

export interface Approval {
  id: string;
  requestId: string;
  approverId: string | null;
  status: "pending" | "approved" | "rejected";
  decidedAt: string | null;
  comment: string | null;
  createdAt: string;
}

interface ApprovalRow {
  id: string;
  request_id: string;
  approver_id: string | null;
  status: "pending" | "approved" | "rejected";
  decided_at: string | null;
  comment: string | null;
  created_at: string;
}

function toApproval(row: ApprovalRow): Approval {
  return {
    id: row.id,
    requestId: row.request_id,
    approverId: row.approver_id,
    status: row.status,
    decidedAt: row.decided_at,
    comment: row.comment,
    createdAt: row.created_at,
  };
}

const APPROVAL_COLUMNS = "id, request_id, approver_id, status, decided_at, comment, created_at";

export async function getApprovalForRequest(requestId: string): Promise<Approval | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("approvals")
    .select(APPROVAL_COLUMNS)
    .eq("request_id", requestId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toApproval(data);
}

export async function decideApproval(
  profile: Profile,
  approvalId: string,
  decision: "approved" | "rejected",
  comment?: string
): Promise<Approval> {
  const supabase = createSupabaseAdminClient();
  const { data: approvalRow, error: loadError } = await supabase
    .from("approvals")
    .select(APPROVAL_COLUMNS)
    .eq("id", approvalId)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!approvalRow) throw new NotFoundError("Approval not found");

  const approval = toApproval(approvalRow);
  if (approval.status !== "pending") {
    throw new InvalidTransitionError(`Cannot decide an approval with status "${approval.status}"`);
  }

  if (!canDecideApproval(profile, approval)) {
    throw new ForbiddenError("You cannot decide this approval");
  }

  const { data: updatedRow, error: updateError } = await supabase
    .from("approvals")
    .update({
      status: decision,
      decided_at: new Date().toISOString(),
      comment: comment ?? null,
    })
    .eq("id", approvalId)
    .select(APPROVAL_COLUMNS)
    .single();
  if (updateError) throw updateError;
  const updatedApproval = toApproval(updatedRow);

  const request = await loadRequestOrThrow(approval.requestId);
  const newRequestStatus = decision === "approved" ? "approved" : "rejected";
  const { error: requestUpdateError } = await supabase
    .from("requests")
    .update({ status: newRequestStatus })
    .eq("id", approval.requestId);
  if (requestUpdateError) throw requestUpdateError;

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

  try {
    await broadcastChange(request.companyId, "requests", { type: "request_updated" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }

  return updatedApproval;
}
```

`decideApproval` updates `requests.status` directly (via `supabase.from("requests").update(...)`) rather than calling `transitionRequestStatus` — `under_review → approved`/`under_review → rejected` are deliberately **not** in `REQUEST_STATUS_TRANSITIONS` (Task 6), since that generic transition entry point is reserved for the manual `approved → in_progress` / `in_progress → completed` moves; only `decideApproval` is allowed to make the approve/reject transition, exactly as the spec's `REQUEST_STATUS_TRANSITIONS` design implies. Note also the load-order: `NotFoundError` → `InvalidTransitionError` (not-pending) → `ForbiddenError` (permission), matching the spec's own numbered steps for `decideApproval` literally — this is the opposite order from `transitionRequestStatus` (Task 11), which checks permission before transition validity, matching Phase 2's `updateTaskStatus` precedent instead. Both orderings are intentional and file-appropriate, not inconsistent.

`loadRequestOrThrow` is imported from `lib/domain/requests.ts` here; `requests.ts` does not import anything from `approvals.ts`, so this is a one-directional dependency with no import cycle.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:integration lib/domain/approvals.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Register the new integration test in `package.json`**

```json
"test:unit": "vitest run --exclude \"lib/domain/profiles.test.ts\" --exclude \"lib/domain/seed.test.ts\" --exclude \"lib/domain/activity.test.ts\" --exclude \"lib/domain/comments.test.ts\" --exclude \"lib/domain/tasks.test.ts\" --exclude \"lib/domain/attachments.test.ts\" --exclude \"lib/domain/notifications.test.ts\" --exclude \"lib/domain/requests.test.ts\" --exclude \"lib/domain/approvals.test.ts\" --exclude \"scripts/seed.smoke.test.ts\"",
"test:integration": "vitest run lib/domain/profiles.test.ts lib/domain/seed.test.ts lib/domain/activity.test.ts lib/domain/comments.test.ts lib/domain/tasks.test.ts lib/domain/attachments.test.ts lib/domain/notifications.test.ts lib/domain/requests.test.ts lib/domain/approvals.test.ts scripts/seed.smoke.test.ts",
```

- [ ] **Step 6: Commit**

```bash
git add lib/domain/approvals.ts lib/domain/approvals.test.ts package.json
git commit -m "feat: add approvals domain layer"
```

---

## Task 13: API route — `/api/requests`

**Files:**
- Create: `app/api/requests/route.ts`
- Test: `app/api/requests/route.test.ts`

**Interfaces:**
- Consumes: `getCurrentProfile` (Phase 2); `createRequestSchema`, `requestFiltersSchema` (Task 6); `toErrorResponse` (Phase 2); `createRequest`, `listRequests`, `submitRequest` (Tasks 10–11).
- Produces: `GET /api/requests?status=&category=&departmentId=&scope=` → `200 { requests: Request[] }`; `POST /api/requests` → `201 { request: Request }` (creates a draft then immediately submits it — single-step form, no draft UI in this phase). Both `401` unauthenticated, `400` invalid input. Consumed by the request list page (Task 18) and request creation form (Task 19).

- [ ] **Step 1: Write the failing test**

Create `app/api/requests/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/requests", () => ({
  createRequest: vi.fn(),
  listRequests: vi.fn(),
  submitRequest: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { createRequest, listRequests, submitRequest } from "@/lib/domain/requests";
import { GET, POST } from "@/app/api/requests/route";
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
  vi.mocked(createRequest).mockReset();
  vi.mocked(listRequests).mockReset();
  vi.mocked(submitRequest).mockReset();
});

describe("GET /api/requests", () => {
  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/requests"));
    expect(response.status).toBe(401);
  });

  it("returns requests scoped by the caller's filters", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(listRequests).mockResolvedValue([]);

    const response = await GET(new Request("http://localhost/api/requests?scope=mine"));
    expect(response.status).toBe(200);
    expect(listRequests).toHaveBeenCalledWith(PROFILE, { scope: "mine" });
  });

  it("returns 400 for an invalid filter value", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await GET(new Request("http://localhost/api/requests?status=nope"));
    expect(response.status).toBe(400);
  });
});

describe("POST /api/requests", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost/api/requests", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await POST(jsonRequest({ title: "x", category: "general" }));
    expect(response.status).toBe(401);
  });

  it("creates and submits a request", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(createRequest).mockResolvedValue({ id: "request-1", status: "draft" } as never);
    vi.mocked(submitRequest).mockResolvedValue({
      id: "request-1",
      status: "under_review",
    } as never);

    const response = await POST(jsonRequest({ title: "New laptop", category: "equipment" }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.request.status).toBe("under_review");
    expect(submitRequest).toHaveBeenCalledWith(PROFILE, "request-1");
  });

  it("returns 400 for an invalid body", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(jsonRequest({ title: "" }));
    expect(response.status).toBe(400);
  });

  it("maps a ForbiddenError from the domain layer to 403", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(createRequest).mockRejectedValue(new ForbiddenError("no"));

    const response = await POST(jsonRequest({ title: "New laptop", category: "equipment" }));
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test app/api/requests/route.test.ts`
Expected: FAIL — the route module cannot be found.

- [ ] **Step 3: Implement the route**

Create `app/api/requests/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { createRequest, listRequests, submitRequest } from "@/lib/domain/requests";
import { createRequestSchema, requestFiltersSchema } from "@/lib/validation/requests";
import { toErrorResponse } from "@/lib/api/error-response";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = requestFiltersSchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    departmentId: url.searchParams.get("departmentId") ?? undefined,
    scope: url.searchParams.get("scope") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const requests = await listRequests(profile, parsed.data);
    return NextResponse.json({ requests });
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
  const parsed = createRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const created = await createRequest(profile, parsed.data);
    const submitted = await submitRequest(profile, created.id);
    return NextResponse.json({ request: submitted }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test app/api/requests/route.test.ts`
Expected: PASS (7 tests). Fully mocked — does not require the live Supabase project.

- [ ] **Step 5: Commit**

```bash
git add app/api/requests/route.ts app/api/requests/route.test.ts
git commit -m "feat: add /api/requests route"
```

---

## Task 14: API route — `/api/requests/[id]`

**Files:**
- Create: `app/api/requests/[id]/route.ts`
- Test: `app/api/requests/[id]/route.test.ts`

**Interfaces:**
- Consumes: `getCurrentProfile` (Phase 2); `patchRequestSchema` (Task 6); `toErrorResponse` (Phase 2); `getRequest`, `transitionRequestStatus` (Tasks 10–11).
- Produces: `GET /api/requests/[id]` → `200 { request }`; `PATCH /api/requests/[id]` (body `{ status }`) → `200 { request }`. Consumed by the request detail page (Task 20).

- [ ] **Step 1: Write the failing test**

Create `app/api/requests/[id]/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/requests", () => ({
  getRequest: vi.fn(),
  transitionRequestStatus: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { getRequest, transitionRequestStatus } from "@/lib/domain/requests";
import { GET, PATCH } from "@/app/api/requests/[id]/route";
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
  vi.mocked(getRequest).mockReset();
  vi.mocked(transitionRequestStatus).mockReset();
});

describe("GET /api/requests/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost"), params("request-1"));
    expect(response.status).toBe(401);
  });

  it("returns 404 when the request does not exist", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getRequest).mockRejectedValue(new NotFoundError());
    const response = await GET(new Request("http://localhost"), params("request-1"));
    expect(response.status).toBe(404);
  });

  it("returns the request", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getRequest).mockResolvedValue({ id: "request-1" } as never);
    const response = await GET(new Request("http://localhost"), params("request-1"));
    expect(response.status).toBe(200);
  });
});

describe("PATCH /api/requests/[id]", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("calls transitionRequestStatus for a status payload", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(transitionRequestStatus).mockResolvedValue({
      id: "request-1",
      status: "in_progress",
    } as never);

    const response = await PATCH(jsonRequest({ status: "in_progress" }), params("request-1"));
    expect(response.status).toBe(200);
    expect(transitionRequestStatus).toHaveBeenCalledWith(PROFILE, "request-1", "in_progress");
  });

  it("returns 400 for an empty payload", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await PATCH(jsonRequest({}), params("request-1"));
    expect(response.status).toBe(400);
  });

  it("returns 400 for an invalid status value", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await PATCH(jsonRequest({ status: "nope" }), params("request-1"));
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test "app/api/requests/[id]/route.test.ts"`
Expected: FAIL — the route module cannot be found.

- [ ] **Step 3: Implement the route**

Create `app/api/requests/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getRequest, transitionRequestStatus } from "@/lib/domain/requests";
import { patchRequestSchema } from "@/lib/validation/requests";
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
    const request = await getRequest(profile, id);
    return NextResponse.json({ request });
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
  const parsed = patchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const updated = await transitionRequestStatus(profile, id, parsed.data.status);
    return NextResponse.json({ request: updated });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test "app/api/requests/[id]/route.test.ts"`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/api/requests/[id]/route.ts" "app/api/requests/[id]/route.test.ts"
git commit -m "feat: add /api/requests/[id] route"
```

---

## Task 15: API route — `/api/requests/[id]/comments`

**Files:**
- Create: `app/api/requests/[id]/comments/route.ts`
- Test: `app/api/requests/[id]/comments/route.test.ts`

**Interfaces:**
- Consumes: `getCurrentProfile` (Phase 2); `addCommentSchema` (Phase 2, `lib/validation/tasks.ts` — reused as-is, generic despite the file name); `toErrorResponse` (Phase 2); `logActivity` (Phase 2); `addComment` (Phase 2, `lib/domain/comments.ts`); `broadcastChange` (Phase 2); `getRequest` (Task 10).
- Produces: `POST /api/requests/[id]/comments` (body `{ body }`) → `201 { comment }`. Consumed by the request detail page (Task 20).

**Note on scope:** the spec's API Routes list only names `POST` for this endpoint (unlike Phase 2's `/api/tasks/[id]/comments`, which also has `GET`) — this matches the design intentionally, since the request detail page (a Server Component, Task 20) calls `listComments("request", ...)` directly in-process, the same way Phase 2's task detail page does, rather than through a client-side `GET`. Only `POST` is implemented here.

**Note on the permission check:** the spec says this route "checks `canCommentOnRequest`." `canCommentOnRequest` is `canViewRequest` (Task 9), which requires the request's `approverId` as a third argument, which `getRequest` (Task 10) already loads and checks internally when it enforces `canViewRequest` — so calling `getRequest` first is not a separate step from the permission check, it's how the permission check is performed. Rather than re-fetching the approver id in the route to redundantly call `canCommentOnRequest` a second time (as Phase 2's `/api/tasks/[id]/comments` does, where `canComment(profile, task)` needs no extra data beyond the already-loaded task), this route relies on `getRequest`'s own `ForbiddenError` — calling `getRequest` **is** the `canCommentOnRequest` check, since the two are the identical function. The route test below verifies denial by mocking `getRequest` to reject, the same way Task 14's `GET` test verifies a 404 by mocking `getRequest` to reject `NotFoundError`.

- [ ] **Step 1: Write the failing test**

Create `app/api/requests/[id]/comments/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/requests", () => ({
  getRequest: vi.fn(),
}));
vi.mock("@/lib/domain/comments", () => ({
  addComment: vi.fn(),
}));
vi.mock("@/lib/domain/activity", () => ({
  logActivity: vi.fn(),
}));
vi.mock("@/lib/realtime/broadcast", () => ({
  broadcastChange: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { getRequest } from "@/lib/domain/requests";
import { addComment } from "@/lib/domain/comments";
import { POST } from "@/app/api/requests/[id]/comments/route";
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
  vi.mocked(getRequest).mockReset();
  vi.mocked(addComment).mockReset();
});

describe("POST /api/requests/[id]/comments", () => {
  it("adds a comment for a request the caller can view", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getRequest).mockResolvedValue({ id: "request-1", companyId: "company-1" } as never);
    vi.mocked(addComment).mockResolvedValue({ id: "comment-1", body: "Looks good" } as never);

    const response = await POST(jsonRequest({ body: "Looks good" }), params("request-1"));
    expect(response.status).toBe(201);
    expect(addComment).toHaveBeenCalledWith("request", "request-1", PROFILE.id, "Looks good");
  });

  it("returns 400 for an empty body", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(jsonRequest({ body: "" }), params("request-1"));
    expect(response.status).toBe(400);
  });

  it("denies a caller who cannot view the request", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getRequest).mockRejectedValue(new ForbiddenError("nope"));

    const response = await POST(jsonRequest({ body: "Looks good" }), params("request-1"));
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test "app/api/requests/[id]/comments/route.test.ts"`
Expected: FAIL — the route module cannot be found.

- [ ] **Step 3: Implement the route**

Create `app/api/requests/[id]/comments/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getRequest } from "@/lib/domain/requests";
import { addComment } from "@/lib/domain/comments";
import { logActivity } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import { addCommentSchema } from "@/lib/validation/tasks";
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

  const body = await request.json();
  const parsed = addCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const targetRequest = await getRequest(profile, id);
    const comment = await addComment("request", targetRequest.id, profile.id, parsed.data.body);
    await logActivity(
      "request",
      targetRequest.id,
      profile.id,
      `${profile.fullName} commented on this request`
    );
    try {
      await broadcastChange(profile.companyId, "requests", { type: "request_updated" });
    } catch (broadcastError) {
      console.error("broadcastChange failed:", broadcastError);
    }
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test "app/api/requests/[id]/comments/route.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/api/requests/[id]/comments"
git commit -m "feat: add /api/requests/[id]/comments route"
```

---

## Task 16: API route — `/api/requests/[id]/attachments`

**Files:**
- Create: `app/api/requests/[id]/attachments/route.ts`
- Test: `app/api/requests/[id]/attachments/route.test.ts`

**Interfaces:**
- Consumes: `getCurrentProfile` (Phase 2); `createAttachmentSchema` (Phase 2, `lib/validation/tasks.ts` — reused as-is); `toErrorResponse` (Phase 2); `logActivity` (Phase 2); `createSignedUploadUrl` (Phase 2, `lib/domain/attachments.ts`); `getRequest` (Task 10).
- Produces: `POST /api/requests/[id]/attachments` (body `{ filename }`) → `201 { attachment, token }`. Consumed by the request detail page (Task 20).

Only `POST` is implemented, for the same reason as Task 15's comments route — the spec lists only `POST` for this endpoint, and the request detail page's Server Component calls `listAttachments`/`createSignedDownloadUrl` directly rather than through a `GET` route.

- [ ] **Step 1: Write the failing test**

Create `app/api/requests/[id]/attachments/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/requests", () => ({
  getRequest: vi.fn(),
}));
vi.mock("@/lib/domain/attachments", () => ({
  createSignedUploadUrl: vi.fn(),
}));
vi.mock("@/lib/domain/activity", () => ({
  logActivity: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { getRequest } from "@/lib/domain/requests";
import { createSignedUploadUrl } from "@/lib/domain/attachments";
import { POST } from "@/app/api/requests/[id]/attachments/route";
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
  vi.mocked(getRequest).mockReset();
  vi.mocked(createSignedUploadUrl).mockReset();
});

describe("POST /api/requests/[id]/attachments", () => {
  it("creates a signed upload URL for a request the caller can view", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getRequest).mockResolvedValue({ id: "request-1", companyId: "company-1" } as never);
    vi.mocked(createSignedUploadUrl).mockResolvedValue({
      attachment: { id: "attachment-1", storagePath: "request/request-1/file.pdf" },
      signedUrl: "https://example.com/upload",
      token: "token-1",
    } as never);

    const response = await POST(jsonRequest({ filename: "file.pdf" }), params("request-1"));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.token).toBe("token-1");
    expect(createSignedUploadUrl).toHaveBeenCalledWith(
      "request",
      "request-1",
      PROFILE.id,
      "file.pdf"
    );
  });

  it("returns 400 for an empty filename", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(jsonRequest({ filename: "" }), params("request-1"));
    expect(response.status).toBe(400);
  });

  it("denies a caller who cannot view the request", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getRequest).mockRejectedValue(new ForbiddenError("nope"));

    const response = await POST(jsonRequest({ filename: "file.pdf" }), params("request-1"));
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test "app/api/requests/[id]/attachments/route.test.ts"`
Expected: FAIL — the route module cannot be found.

- [ ] **Step 3: Implement the route**

Create `app/api/requests/[id]/attachments/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getRequest } from "@/lib/domain/requests";
import { createSignedUploadUrl } from "@/lib/domain/attachments";
import { logActivity } from "@/lib/domain/activity";
import { createAttachmentSchema } from "@/lib/validation/tasks";
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

  const body = await request.json();
  const parsed = createAttachmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const targetRequest = await getRequest(profile, id);
    const result = await createSignedUploadUrl(
      "request",
      targetRequest.id,
      profile.id,
      parsed.data.filename
    );
    await logActivity(
      "request",
      targetRequest.id,
      profile.id,
      `${profile.fullName} attached a file`
    );
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

Run: `pnpm test "app/api/requests/[id]/attachments/route.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/api/requests/[id]/attachments"
git commit -m "feat: add /api/requests/[id]/attachments route"
```

---

## Task 17: API route — `/api/approvals/[id]/decide`

**Files:**
- Create: `app/api/approvals/[id]/decide/route.ts`
- Test: `app/api/approvals/[id]/decide/route.test.ts`

**Interfaces:**
- Consumes: `getCurrentProfile` (Phase 2); `decideApprovalSchema` (Task 6); `toErrorResponse` (Phase 2); `decideApproval` (Task 12).
- Produces: `POST /api/approvals/[id]/decide` (body `{ decision, comment? }`) → `200 { approval }`. Consumed by the request detail page's approve/reject control (Task 20).

- [ ] **Step 1: Write the failing test**

Create `app/api/approvals/[id]/decide/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/approvals", () => ({
  decideApproval: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { decideApproval } from "@/lib/domain/approvals";
import { POST } from "@/app/api/approvals/[id]/decide/route";
import { ForbiddenError, InvalidTransitionError } from "@/lib/domain/errors";

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

function jsonRequest(body: unknown) {
  return new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(decideApproval).mockReset();
});

describe("POST /api/approvals/[id]/decide", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await POST(jsonRequest({ decision: "approved" }), params("approval-1"));
    expect(response.status).toBe(401);
  });

  it("records a decision", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(decideApproval).mockResolvedValue({
      id: "approval-1",
      status: "approved",
    } as never);

    const response = await POST(
      jsonRequest({ decision: "approved", comment: "Go ahead" }),
      params("approval-1")
    );
    expect(response.status).toBe(200);
    expect(decideApproval).toHaveBeenCalledWith(PROFILE, "approval-1", "approved", "Go ahead");
  });

  it("returns 400 for an invalid decision value", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(jsonRequest({ decision: "maybe" }), params("approval-1"));
    expect(response.status).toBe(400);
  });

  it("maps a ForbiddenError from the domain layer to 403", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(decideApproval).mockRejectedValue(new ForbiddenError("nope"));

    const response = await POST(jsonRequest({ decision: "approved" }), params("approval-1"));
    expect(response.status).toBe(403);
  });

  it("maps an InvalidTransitionError from the domain layer to 400", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(decideApproval).mockRejectedValue(new InvalidTransitionError("already decided"));

    const response = await POST(jsonRequest({ decision: "approved" }), params("approval-1"));
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test "app/api/approvals/[id]/decide/route.test.ts"`
Expected: FAIL — the route module cannot be found.

- [ ] **Step 3: Implement the route**

Create `app/api/approvals/[id]/decide/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { decideApproval } from "@/lib/domain/approvals";
import { decideApprovalSchema } from "@/lib/validation/requests";
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

  const body = await request.json();
  const parsed = decideApprovalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const approval = await decideApproval(profile, id, parsed.data.decision, parsed.data.comment);
    return NextResponse.json({ approval });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test "app/api/approvals/[id]/decide/route.test.ts"`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/api/approvals/[id]/decide"
git commit -m "feat: add /api/approvals/[id]/decide route"
```

---

## Task 18: Frontend — request list page

**Files:**
- Create: `components/requests/request-list-view.tsx`, `app/(app)/requests/page.tsx`
- Test: `components/requests/request-list-view.test.tsx`

**Interfaces:**
- Consumes: `getCurrentProfile` (Phase 2); `useBroadcastListener` (Phase 2, `lib/realtime/use-broadcast-listener.ts`); `Table`/`Badge`/`Button` (Phase 2, `components/ui/*`).
- Produces: the `/requests` route; `RequestListView` component. Links to `/requests/new` (Task 19) and `/requests/[id]` (Task 20).

**Note on the department filter:** the spec's frontend bullet mentions "status/category/department filters," but there is no departments-listing endpoint anywhere in the codebase — Phase 2's own `TaskListView` (which supports `departmentId` in `taskFiltersSchema`) never surfaced a department dropdown either, for the same reason (no data source to populate it from). This view follows that exact precedent: `status` and `category` get dropdowns; `departmentId` stays supported end-to-end in the schema/API/domain layer (testable, and ready for a later phase that adds a department picker) but has no UI control here.

- [ ] **Step 1: Write the failing test**

Create `components/requests/request-list-view.test.tsx`:

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

import { RequestListView } from "@/components/requests/request-list-view";

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
        requests: [
          {
            id: "request-1",
            title: "New laptop",
            status: "under_review",
            category: "equipment",
            departmentId: null,
            createdAt: "2026-08-27T00:00:00.000Z",
          },
        ],
      }),
    })
  );
});

describe("RequestListView", () => {
  it("renders requests returned from the API", async () => {
    renderWithClient(<RequestListView companyId="company-1" />);

    expect(await screen.findByText("New laptop")).toBeInTheDocument();
    expect(screen.getByText("under_review")).toBeInTheDocument();
  });

  it("shows an empty state when there are no requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ requests: [] }) })
    );
    renderWithClient(<RequestListView companyId="company-1" />);

    expect(await screen.findByText("No requests found.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test components/requests/request-list-view.test.tsx`
Expected: FAIL — `@/components/requests/request-list-view` cannot be found.

- [ ] **Step 3: Implement `RequestListView`**

Create `components/requests/request-list-view.tsx`:

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

interface RequestListItem {
  id: string;
  title: string;
  status: string;
  category: string;
  departmentId: string | null;
  createdAt: string;
}

const STATUS_OPTIONS = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "in_progress",
  "completed",
];
const CATEGORY_OPTIONS = [
  "equipment",
  "software",
  "access",
  "maintenance",
  "purchase",
  "hr",
  "general",
  "other",
];

function formatOptionLabel(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function RequestListView({ companyId }: { companyId: string }) {
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["requests", { status, category, scope }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (category) params.set("category", category);
      params.set("scope", scope);
      const response = await fetch(`/api/requests?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to load requests");
      const body = await response.json();
      return body.requests as RequestListItem[];
    },
  });

  useBroadcastListener(`company:${companyId}:requests`, () => {
    queryClient.invalidateQueries({ queryKey: ["requests"] });
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <div className="flex gap-1">
            <Button
              variant={scope === "mine" ? "default" : "outline"}
              onClick={() => setScope("mine")}
            >
              Mine
            </Button>
            <Button
              variant={scope === "all" ? "default" : "outline"}
              onClick={() => setScope("all")}
            >
              All
            </Button>
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {formatOptionLabel(option)}
              </option>
            ))}
          </select>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">All categories</option>
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {formatOptionLabel(option)}
              </option>
            ))}
          </select>
        </div>
        <Button render={<Link href="/requests/new" />} nativeButton={false}>
          New request
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading requests...</p>}
      {error && <p className="text-red-600">Failed to load requests.</p>}

      {data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Link href={`/requests/${item.id}`} className="hover:underline">
                    {item.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{item.status}</Badge>
                </TableCell>
                <TableCell>{item.category}</TableCell>
                <TableCell>{new Date(item.createdAt).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No requests found.
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

Create `app/(app)/requests/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { RequestListView } from "@/components/requests/request-list-view";

export default async function RequestsPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Requests</h1>
      <RequestListView companyId={profile.companyId} />
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test components/requests/request-list-view.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Verify the project builds**

Run: `pnpm build`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/requests/request-list-view.tsx components/requests/request-list-view.test.tsx "app/(app)/requests/page.tsx"
git commit -m "feat: add request list page"
```

---

## Task 19: Frontend — request creation form

**Files:**
- Create: `components/requests/request-form.tsx`, `app/(app)/requests/new/page.tsx`
- Test: `components/requests/request-form.test.tsx`

**Interfaces:**
- Consumes: `createRequestSchema`/`CreateRequestInput` (Task 6); `REQUEST_CATEGORIES` (Task 6); `Button`/`Input`/`Label` (Foundation).
- Produces: the `/requests/new` route; `RequestForm` component, posting to `POST /api/requests` (Task 13) and redirecting to `/requests/[id]` (Task 20) on success.

- [ ] **Step 1: Write the failing test**

Create `components/requests/request-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { RequestForm } from "@/components/requests/request-form";

beforeEach(() => {
  pushMock.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ request: { id: "request-1" } }),
    })
  );
});

describe("RequestForm", () => {
  it("shows a validation error when submitted empty", async () => {
    render(<RequestForm />);
    await userEvent.click(screen.getByRole("button", { name: /submit request/i }));

    expect(await screen.findByText("Title is required")).toBeInTheDocument();
  });

  it("creates a request and redirects to its detail page", async () => {
    render(<RequestForm />);

    await userEvent.type(screen.getByLabelText(/title/i), "New laptop");
    await userEvent.click(screen.getByRole("button", { name: /submit request/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/requests/request-1"));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test components/requests/request-form.test.tsx`
Expected: FAIL — `@/components/requests/request-form` cannot be found.

- [ ] **Step 3: Implement `RequestForm`**

Create `components/requests/request-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createRequestSchema, type CreateRequestInput } from "@/lib/validation/requests";
import { REQUEST_CATEGORIES } from "@/lib/domain/request-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function formatOptionLabel(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function RequestForm() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateRequestInput>({
    resolver: zodResolver(createRequestSchema),
    defaultValues: { category: REQUEST_CATEGORIES[0] },
  });

  async function onSubmit(values: CreateRequestInput) {
    setSubmitError(null);
    const response = await fetch("/api/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      const body = await response.json();
      setSubmitError(typeof body.error === "string" ? body.error : "Failed to create request");
      return;
    }

    const { request } = await response.json();
    router.push(`/requests/${request.id}`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 max-w-lg">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" {...register("title")} />
        {errors.title && <p className="text-sm text-red-600">{errors.title.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category">Category</Label>
        <select
          id="category"
          {...register("category")}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          {REQUEST_CATEGORIES.map((option) => (
            <option key={option} value={option}>
              {formatOptionLabel(option)}
            </option>
          ))}
        </select>
        {errors.category && <p className="text-sm text-red-600">{errors.category.message}</p>}
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
        {isSubmitting ? "Submitting..." : "Submit request"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Create the page**

Create `app/(app)/requests/new/page.tsx`:

```tsx
import { RequestForm } from "@/components/requests/request-form";

export default function NewRequestPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">New request</h1>
      <RequestForm />
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test components/requests/request-form.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Verify the project builds**

Run: `pnpm build`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/requests/request-form.tsx components/requests/request-form.test.tsx "app/(app)/requests/new"
git commit -m "feat: add request creation form"
```

---

## Task 20: Frontend — request detail page

**Files:**
- Create: `app/(app)/requests/[id]/page.tsx`, `components/requests/request-realtime-refresh.tsx`, `components/requests/request-status-timeline.tsx`, `components/requests/request-approval-control.tsx`, `components/requests/request-comments.tsx`, `components/requests/request-attachments.tsx`
- Test: `components/requests/request-status-timeline.test.tsx`, `components/requests/request-approval-control.test.tsx`

**Interfaces:**
- Consumes: `getCurrentProfile` (Phase 2); `getRequest` (Task 10); `getApprovalForRequest` (Task 12); `listComments` (Phase 2, `lib/domain/comments.ts`); `listActivity` (Phase 2); `listAttachments`/`createSignedDownloadUrl` (Phase 2, `lib/domain/attachments.ts`); `canDecideApproval` (Task 9); `getValidNextStatuses`/`RequestStatus` (Task 6); `useBroadcastListener` (Phase 2); `BackLink` (Phase 2, `components/back-link.tsx`); `POST /api/requests/[id]/comments` (Task 15), `POST /api/requests/[id]/attachments` (Task 16), `POST /api/approvals/[id]/decide` (Task 17).
- Produces: the `/requests/[id]` route, the final piece of Phase 3's user-facing surface.

**Component-reuse-vs-duplication decision:** `components/tasks/task-comments.tsx` and `components/tasks/task-attachments.tsx` (Phase 2) hardcode the task-specific fetch URL (`` `/api/tasks/${taskId}/comments` ``) directly inline — they take no `entityType` or `baseUrl` prop, so generalizing them would mean editing two already-shipped, already-tested Phase 2 components (and the task detail page that renders them) to thread a new prop through, for the sake of two call sites. This task instead **duplicates** them as `RequestComments`/`RequestAttachments` under `components/requests/`, changing only the fetch URL prefix and the prop name (`requestId` instead of `taskId`). This is lower-risk (zero changes to working Phase 2 code/tests) and matches the spec's own framing of `listRequests`/`canViewRequest` duplication as an accepted, already-precedented category of debt in this codebase — not something this phase needs to resolve for comments/attachments either.

**Note on scope — no manual status control on this page:** the spec's frontend bullet for the request detail page names the status timeline, the approve/reject control, and comments/attachments, but does not mention a manual "move to in_progress / completed" control (unlike Phase 2's `TaskStatusControl`, which the task detail page does render). `transitionRequestStatus` and its `PATCH /api/requests/[id]` route exist and are fully tested (Tasks 11, 14) but have no frontend control in this phase — not inventing UI scope the spec didn't ask for. A later phase can add one against the existing route without any domain-layer change.

- [ ] **Step 1: Write the failing tests**

Create `components/requests/request-status-timeline.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RequestStatusTimeline } from "@/components/requests/request-status-timeline";

describe("RequestStatusTimeline", () => {
  it("highlights the current step for an in-progress request", () => {
    render(<RequestStatusTimeline status="in_progress" />);
    expect(screen.getByText("In Progress")).toBeInTheDocument();
  });

  it("shows a rejected badge instead of the stepper when rejected", () => {
    render(<RequestStatusTimeline status="rejected" />);
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.queryByText("Under Review")).not.toBeInTheDocument();
  });
});
```

Create `components/requests/request-approval-control.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { RequestApprovalControl } from "@/components/requests/request-approval-control";

beforeEach(() => {
  refreshMock.mockReset();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});

describe("RequestApprovalControl", () => {
  it("submits an approve decision and refreshes", async () => {
    render(<RequestApprovalControl approvalId="approval-1" />);

    await userEvent.click(screen.getByRole("button", { name: /approve/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/approvals/approval-1/decide",
      expect.objectContaining({ method: "POST" })
    );
    const call = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(call[1]!.body as string)).toEqual({ decision: "approved" });
  });

  it("submits a reject decision", async () => {
    render(<RequestApprovalControl approvalId="approval-1" />);

    await userEvent.click(screen.getByRole("button", { name: /reject/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test components/requests/request-status-timeline.test.tsx components/requests/request-approval-control.test.tsx`
Expected: FAIL — neither module exists.

- [ ] **Step 3: Implement `RequestRealtimeRefresh`**

Create `components/requests/request-realtime-refresh.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useBroadcastListener } from "@/lib/realtime/use-broadcast-listener";

export function RequestRealtimeRefresh({ companyId }: { companyId: string }) {
  const router = useRouter();
  useBroadcastListener(`company:${companyId}:requests`, () => {
    router.refresh();
  });
  return null;
}
```

- [ ] **Step 4: Implement `RequestStatusTimeline`**

Create `components/requests/request-status-timeline.tsx`:

```tsx
import type { RequestStatus } from "@/lib/domain/request-status";

const STEPS: RequestStatus[] = ["draft", "under_review", "approved", "in_progress", "completed"];

function formatStepLabel(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function RequestStatusTimeline({ status }: { status: RequestStatus }) {
  if (status === "rejected") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-700">
          Rejected
        </span>
      </div>
    );
  }

  const currentIndex = STEPS.indexOf(status === "submitted" ? "under_review" : status);

  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((step, index) => {
        const isComplete = index < currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={
                isCurrent
                  ? "rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground"
                  : isComplete
                    ? "rounded-full bg-muted px-3 py-1 text-muted-foreground line-through"
                    : "rounded-full border px-3 py-1 text-muted-foreground"
              }
            >
              {formatStepLabel(step)}
            </span>
            {index < STEPS.length - 1 && <span className="text-muted-foreground">→</span>}
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 5: Run the timeline test to verify it passes**

Run: `pnpm test components/requests/request-status-timeline.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Implement `RequestApprovalControl`**

Create `components/requests/request-approval-control.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RequestApprovalControl({ approvalId }: { approvalId: string }) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approved" | "rejected") {
    setIsSubmitting(true);
    setError(null);
    const response = await fetch(`/api/approvals/${approvalId}/decide`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(comment ? { decision, comment } : { decision }),
    });
    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to record decision");
      return;
    }

    router.refresh();
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-medium">Your decision</h2>
      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Optional comment"
        className="min-h-16 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      <div className="flex gap-2">
        <Button disabled={isSubmitting} onClick={() => decide("approved")}>
          Approve
        </Button>
        <Button variant="outline" disabled={isSubmitting} onClick={() => decide("rejected")}>
          Reject
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 7: Run the approval control test to verify it passes**

Run: `pnpm test components/requests/request-approval-control.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 8: Implement `RequestComments`**

Create `components/requests/request-comments.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Comment } from "@/lib/domain/comments";
import { Button } from "@/components/ui/button";

export function RequestComments({
  requestId,
  initialComments,
}: {
  requestId: string;
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
    const response = await fetch(`/api/requests/${requestId}/comments`, {
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

- [ ] **Step 9: Implement `RequestAttachments`**

Create `components/requests/request-attachments.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

interface AttachmentWithUrl {
  id: string;
  storagePath: string;
  downloadUrl: string | null;
}

export function RequestAttachments({
  requestId,
  initialAttachments,
}: {
  requestId: string;
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

    const response = await fetch(`/api/requests/${requestId}/attachments`, {
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
            {attachment.downloadUrl ? (
              <a href={attachment.downloadUrl} className="hover:underline">
                {attachment.storagePath.split("/").pop()}
              </a>
            ) : (
              <span className="text-muted-foreground">
                {attachment.storagePath.split("/").pop()} (unavailable)
              </span>
            )}
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

- [ ] **Step 10: Implement the request detail page**

Create `app/(app)/requests/[id]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { getRequest } from "@/lib/domain/requests";
import { getApprovalForRequest } from "@/lib/domain/approvals";
import { listComments } from "@/lib/domain/comments";
import { listActivity } from "@/lib/domain/activity";
import { createSignedDownloadUrl, listAttachments } from "@/lib/domain/attachments";
import { canDecideApproval } from "@/lib/domain/permissions";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import { BackLink } from "@/components/back-link";
import { RequestRealtimeRefresh } from "@/components/requests/request-realtime-refresh";
import { RequestStatusTimeline } from "@/components/requests/request-status-timeline";
import { RequestApprovalControl } from "@/components/requests/request-approval-control";
import { RequestComments } from "@/components/requests/request-comments";
import { RequestAttachments } from "@/components/requests/request-attachments";

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const { id } = await params;

  let request;
  try {
    request = await getRequest(profile, id);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      notFound();
    }
    throw error;
  }

  const [comments, activity, attachments, approval] = await Promise.all([
    listComments("request", request.id),
    listActivity("request", request.id),
    listAttachments("request", request.id),
    getApprovalForRequest(request.id),
  ]);

  const attachmentsWithUrls = await Promise.all(
    attachments.map(async (attachment) => ({
      ...attachment,
      downloadUrl: await createSignedDownloadUrl(attachment.storagePath),
    }))
  );

  const canDecide =
    approval !== null && approval.status === "pending" && canDecideApproval(profile, approval);

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <RequestRealtimeRefresh companyId={profile.companyId} />

      <BackLink href="/requests" />

      <div>
        <h1 className="text-2xl font-semibold">{request.title}</h1>
        {request.description && (
          <p className="mt-2 text-muted-foreground">{request.description}</p>
        )}
      </div>

      <RequestStatusTimeline status={request.status} />

      {canDecide && approval && <RequestApprovalControl approvalId={approval.id} />}

      <section>
        <h2 className="text-lg font-medium mb-2">Activity</h2>
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {activity.map((entry) => (
            <li key={entry.id}>{entry.message}</li>
          ))}
          {activity.length === 0 && <li>No activity yet.</li>}
        </ul>
      </section>

      <RequestComments requestId={request.id} initialComments={comments} />

      <RequestAttachments requestId={request.id} initialAttachments={attachmentsWithUrls} />
    </div>
  );
}
```

- [ ] **Step 11: Verify the project builds**

Run: `pnpm build`
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add "app/(app)/requests/[id]" components/requests/request-realtime-refresh.tsx components/requests/request-status-timeline.tsx components/requests/request-status-timeline.test.tsx components/requests/request-approval-control.tsx components/requests/request-approval-control.test.tsx components/requests/request-comments.tsx components/requests/request-attachments.tsx
git commit -m "feat: add request detail page with status timeline, approvals, comments, and attachments"
```

---

## End-to-End Verification

After all 20 tasks are complete:

1. Run: `pnpm test:unit` — Expected: all unit tests pass (DB-independent).
2. Run: `pnpm test:integration` — Expected: all integration tests pass against the hosted Supabase project.
3. Run: `pnpm build` — Expected: build completes with no errors.
4. Run: `pnpm dev`, open `http://localhost:3000`, and walk through the flow using two browser profiles seeded via signup (e.g. one "Employee" with a manager set, one "Operations Manager"):
   - As Employee: visit `/requests` → empty list. Click "New request," submit "New laptop" (category Equipment) → redirected to its detail page, status timeline shows "Under Review" highlighted, no approve/reject control visible (not the approver).
   - Still as Employee: add a comment, upload a file attachment.
   - As the resolved approver (the Employee's manager, or the Operations Manager if no manager was set): open the same request's detail page → approve/reject control is visible. Reject with a comment.
   - Confirm the request's timeline now shows "Rejected," the Employee sees the rejection (activity log entry, and the domain-layer notification exists via `listNotifications` — no bell UI to check visually in this phase).
   - As Operations Manager, open `/requests?scope=all` (via the "All" toggle) → the request appears without a manual refresh once broadcasts arrive (may need a refresh/refetch depending on timing).
5. Confirm `tasks.related_request_id` exists and is nullable (`select column_name, is_nullable from information_schema.columns where table_name = 'tasks' and column_name = 'related_request_id';`) — schema prep only, unused by any code in this phase.
6. Re-verify no Phase 3 table carries `anon`/`authenticated` grants on the final state of the database (the grants query from any migration task, run once per new table: `requests`, `approvals`, `notifications`).

This closes out Phase 3 from `docs/superpowers/plans/2026-08-26-remaining-phases-outline.md`'s suggested build order. The next plan (Phase 4 — Workflow Engine) builds automatic multi-step approval chaining on top of `requests`/`approvals`, and Phase 9 builds the notification bell UI against the `notifications` table and `profile:{id}:notifications` channel this phase produces.
