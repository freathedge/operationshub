# Phase 2 — Tasks: Design

Status: Approved by Adrian on 2026-08-27.

Companion to `docs/architecture.md` and `docs/superpowers/plans/2026-08-26-remaining-phases-outline.md` (Phase 2 section). This document resolves the open design questions for Phase 2 before it's expanded into a full implementation plan.

---

## 1. Schema-USAGE fix (first migration, before any Phase 2 table)

The Foundation phase's final review found that `revoke usage on schema public from anon, authenticated` (migration `20260826230306`) doesn't actually close the gap — a pre-existing grant to the `PUBLIC` pseudo-role from project bootstrap survives a revoke aimed at named roles, so `has_schema_privilege('anon','public','usage')` returns `true` on the live project today. The four Foundation tables stay safe only because they're owned by `postgres`, whose default-privilege revoke is correctly scoped; `supabase_admin`'s default ACL still grants `anon`/`authenticated` full DML on tables it creates.

**Fix, as its own first migration in this phase:**
- `revoke usage on schema public from public;`
- An explicit default-privilege revoke for `supabase_admin`-created objects in `public` (so future tables — `tasks`, `comments`, `activity_log`, `attachments` — don't inherit the gap).
- Verified live via `has_schema_privilege('anon','public','usage')` and `has_schema_privilege('authenticated','public','usage')` both returning `false`, before any Phase 2 table migration runs.

Full background: `docs/superpowers/plans/2026-08-26-foundation.md` Global Constraints, `docs/architecture.md` §2.

---

## 2. Migrations

- **`tasks`**
  - `id uuid primary key default gen_random_uuid()`
  - `company_id uuid not null references companies(id) on delete cascade`
  - `title text not null`
  - `description text`
  - `status task_status not null default 'todo'` — enum `todo|in_progress|blocked|completed|cancelled`
  - `priority task_priority not null default 'medium'` — enum `low|medium|high|critical`
  - `assignee_id uuid references profiles(id) on delete set null` (nullable — unassigned allowed)
  - `creator_id uuid not null references profiles(id) on delete set null`
  - `department_id uuid references departments(id) on delete set null`
  - `related_employee_id uuid references profiles(id) on delete set null`
  - `due_date timestamptz`
  - `completed_at timestamptz`
  - `created_at timestamptz not null default now()`
  - Indexes: `company_id`, `assignee_id`, `department_id`, `status`
- **`comments`** (polymorphic, generic — reused by every later entity)
  - `id uuid primary key default gen_random_uuid()`
  - `entity_type text not null`
  - `entity_id uuid not null`
  - `author_id uuid not null references profiles(id) on delete set null`
  - `body text not null`
  - `created_at timestamptz not null default now()`
  - Index: `(entity_type, entity_id)`
- **`activity_log`** (polymorphic, generic)
  - `id uuid primary key default gen_random_uuid()`
  - `entity_type text not null`
  - `entity_id uuid not null`
  - `actor_id uuid references profiles(id) on delete set null` (nullable — system-generated entries)
  - `message text not null`
  - `created_at timestamptz not null default now()`
  - Index: `(entity_type, entity_id)`
- **`attachments`** (polymorphic)
  - `id uuid primary key default gen_random_uuid()`
  - `entity_type text not null`
  - `entity_id uuid not null`
  - `storage_path text not null`
  - `uploaded_by uuid not null references profiles(id) on delete set null`
  - `created_at timestamptz not null default now()`
  - Index: `(entity_type, entity_id)`
  - Private Supabase Storage bucket named `attachments`

All four tables follow the existing `profiles`/`companies` convention: `uuid` PKs via `gen_random_uuid()`, snake_case columns, `timestamptz` defaults, owned by `postgres` (so the Foundation-phase default-privilege revoke pattern continues to apply once the schema-USAGE gap above is closed).

---

## 3. Status lifecycle (enforced graph)

```
todo → in_progress → completed
in_progress ↔ blocked
{todo, in_progress, blocked} → cancelled
```

`completed` and `cancelled` are terminal — no outgoing edges. `updateTaskStatus` validates the requested transition against this graph and throws a typed `InvalidTransitionError` (or similar) on any edge not listed. Entering `completed` sets `completed_at = now()`; entering any other state leaves `completed_at` untouched (it is never cleared once set, since `completed` has no outgoing edge).

---

## 4. Permissions (`lib/domain/permissions.ts`)

Task-scoped capabilities only for this phase — extended per-phase as new entities need checks, not a full `idea.md` §21 matrix built up front.

- **`canViewTask(profile, task)`**
  - `employee`: `profile.id === task.assigneeId || profile.id === task.creatorId`
  - `manager`: above, or `profile.departmentId === task.departmentId`
  - `operations_manager | it | hr | admin`: any task in `profile.companyId === task.companyId`
- **`canCreateTask(profile)`**: any authenticated profile.
- **`canAssignTask(profile, task, targetAssigneeId)`**: true if any of —
  - `profile.id === task.creatorId`
  - `profile.id === targetAssigneeId` (self-claim)
  - `profile.id === (current assignee's or target assignee's) managerId`
  - `profile.role === 'operations_manager' || profile.role === 'admin'`
- **`canChangeTaskStatus(profile, task)`**: `profile.id === task.assigneeId`, `profile.id === task.creatorId`, `profile.id === assignee's managerId`, or `profile.role === 'operations_manager' || profile.role === 'admin'`.
- **`canDeleteTask(profile, task)`**: `profile.id === task.creatorId` or `profile.role === 'operations_manager' || profile.role === 'admin'`.
- **`canComment(profile, task)`** / **`canUploadAttachment(profile, task)`**: identical to `canViewTask`.

`listTasks(profile, filters)` applies the `canViewTask` visibility rule as a query filter (not a per-row post-filter), then layers the caller's explicit `filters` (status/priority/assignee/department) on top.

---

## 5. Domain layer

- **`lib/domain/tasks.ts`**
  - `createTask(profile, input)` — validates via Zod upstream, checks `canCreateTask`, inserts, writes `activity_log` ("created"), broadcasts, returns the task.
  - `updateTaskStatus(profile, taskId, newStatus)` — loads task, checks `canChangeTaskStatus`, validates the transition against the graph in §3, updates, writes `activity_log`, broadcasts.
  - `assignTask(profile, taskId, targetAssigneeId)` — loads task, checks `canAssignTask`, updates `assignee_id`, writes `activity_log`, broadcasts.
  - `listTasks(profile, filters)` — see §4.
  - `getTask(profile, taskId)` — checks `canViewTask`, throws `ForbiddenError` otherwise.
  - `deleteTask(profile, taskId)` — checks `canDeleteTask`.
  - All write functions throw a typed `ForbiddenError` on a failed permission check (route handlers map this to HTTP 403).
- **`lib/domain/comments.ts`** — `addComment(profile, entityType, entityId, body)`, `listComments(entityType, entityId)`. Generic: no task-specific knowledge. Callers (e.g. the tasks API route) are responsible for their own `canComment` check before calling this.
- **`lib/domain/activity.ts`** — `logActivity(entityType, entityId, actorId | null, message)`, `listActivity(entityType, entityId)`. Every other domain write function in this phase (and every later phase) calls `logActivity` instead of inserting into `activity_log` directly.
- **`lib/domain/attachments.ts`** — `createSignedUploadUrl(profile, entityType, entityId, filename)` (checks `canUploadAttachment` for tasks via a caller-supplied check, issues a Storage signed upload URL, and records the `attachments` row), `createSignedDownloadUrl(profile, attachmentId)` (checks `canViewTask` for tasks), `listAttachments(entityType, entityId)`.

---

## 6. Realtime

`lib/realtime/broadcast.ts` exposes `broadcastChange(companyId, channel, event)` (e.g. `broadcastChange(companyId, 'tasks', { type: 'task_updated' })`), sent server-side after every task mutation on channel `company:{companyId}:tasks`. The client-side `useBroadcastListener(channel)` hook subscribes and calls React Query's `invalidateQueries` on receipt — no payload data crosses the wire, matching architecture.md §6.

---

## 7. API routes

- `GET/POST /api/tasks` — list (with filters as query params) / create.
- `GET/PATCH/DELETE /api/tasks/[id]` — get / update (status, assignment, fields) / delete.
- `GET/POST /api/tasks/[id]/comments` — list / add.
- `GET/POST /api/tasks/[id]/attachments` — list / request a signed upload URL.

Each handler: resolve the Supabase session server-side → load the `profiles` row → Zod-validate the body → call exactly one domain function → return JSON. No business logic in the handler itself, per architecture.md §2.

---

## 8. Frontend

First authenticated feature page beyond auth, and the first use of React Query (`@tanstack/react-query`, not yet a project dependency — added in this phase).

- **Task list** (`app/(app)/tasks`) — shadcn table block, filters for status/priority/assignee/department, wired to `GET /api/tasks` via React Query, invalidated by the `company:{id}:tasks` broadcast.
- **Task detail** (`app/(app)/tasks/[id]`) — status-change control (only the transitions valid from the current status, per §3, and only if `canChangeTaskStatus` — enforced server-side, reflected client-side by disabling invalid actions), comment thread, attachment list/upload.
- **Task creation form** — React Hook Form + Zod, schema shared with the `POST /api/tasks` route handler.

---

## 9. Testing

Mirrors the existing split (`profiles.test.ts` / `seed.test.ts` vs. the rest):

- **Unit** (mocked Supabase client, no DB): `lib/domain/permissions.ts` — every capability function, both allow and deny cases, for each role.
- **Integration** (real Supabase, added to `test:integration`): `lib/domain/tasks.test.ts`, `comments.test.ts`, `activity.test.ts`, `attachments.test.ts` — exercise actual inserts/reads/permission-denials against the live schema, following `profiles.test.ts`'s pattern.
- TDD throughout: tests before implementation for every domain function, per the project's standard workflow.

---

## Open items deferred to later phases (explicitly out of scope here)

- Department-level task queues (unassigned-to-department-only tasks) — deferred; Phase 2 assignment is individual-only.
- Full `idea.md` §21 role/capability matrix beyond task-scoped capabilities.
- Overdue-task detection/notifications (Phase 9 / dashboard).
- `related_request_id`, `related_workflow_instance_id`, `related_asset_id`, `related_operation_id` columns — added in the phase that introduces each entity, per the outline's cross-phase pattern.
