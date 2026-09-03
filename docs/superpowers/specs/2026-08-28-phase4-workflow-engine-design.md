# Phase 4 — Workflow Engine: Design Spec

**Status:** Approved for planning.

## Goal

A generic engine that runs a `workflow_template`'s ordered steps, auto-generating a task or approval per step and advancing to the next step whenever that task/approval completes — one engine, not one code path per workflow type (`idea.md` §11). This phase seeds the three templates from `idea.md` §9/§12/§13 (Equipment Request, Employee Onboarding, Maintenance) and wires two of them (Equipment, Maintenance) to start automatically once their originating request's Phase 3 approval is granted. Onboarding is seeded for engine generality but not startable in this phase — it is triggered by "HR creates employee" (`idea.md` §12), and the Employee entity doesn't exist until Phase 5; wiring its trigger is deferred there.

This phase follows the Phase 2/3 pattern: thin Route Handlers validate with Zod and delegate to a domain layer that is the sole authorization boundary and the sole place that talks to Supabase Postgres.

## Data Model

### `workflow_templates`

```
id                  uuid primary key default gen_random_uuid()
company_id          uuid not null references companies(id) on delete cascade
slug                text not null                 -- 'equipment-request' | 'maintenance' | 'employee-onboarding'
name                text not null
trigger_category    request_category              -- 'equipment' | 'maintenance'; null for employee-onboarding
created_at          timestamptz not null default now()

unique (company_id, slug)
```

### `workflow_template_steps`

```
id                        uuid primary key default gen_random_uuid()
template_id               uuid not null references workflow_templates(id) on delete cascade
step_order                int not null
step_type                 workflow_step_type not null   -- 'task' | 'approval'
title                     text not null
description               text
responsible_role          user_role                     -- exactly one of these two is set (app-level check)
responsible_department_name text

unique (template_id, step_order)
```

`responsible_department_name` is resolved to a `department_id` by name lookup at generation time, same precedent as looking up profiles by role — departments are seed data (`ALPENTECH_DEPARTMENTS`), not a stable id known at spec-writing time.

### `workflow_instances`

```
id                  uuid primary key default gen_random_uuid()
company_id          uuid not null references companies(id) on delete cascade
template_id         uuid not null references workflow_templates(id)
related_request_id  uuid references requests(id) on delete cascade   -- null for future non-request triggers (Phase 5 onboarding)
status              workflow_instance_status not null default 'in_progress'   -- 'in_progress' | 'completed'
created_at          timestamptz not null default now()
```

### `workflow_instance_steps`

```
id                   uuid primary key default gen_random_uuid()
instance_id          uuid not null references workflow_instances(id) on delete cascade
template_step_id     uuid not null references workflow_template_steps(id)
step_order           int not null
status               workflow_instance_step_status not null default 'pending'  -- 'pending' | 'in_progress' | 'completed'
generated_task_id    uuid references tasks(id)
generated_approval_id uuid references approvals(id)
created_at           timestamptz not null default now()
completed_at         timestamptz

unique (instance_id, step_order)
```

By construction, at most one row per `instance_id` has `status = 'in_progress'` at a time — the engine is strictly sequential, no parallel steps.

### `tasks` extension

```sql
alter table tasks add column related_workflow_instance_id uuid references workflow_instances(id);
```

All four migrations follow the Phase 2/3 convention: apply via `mcp__claude_ai_Supabase__apply_migration`, verify zero `anon`/`authenticated` grants, rename the local file to match the version `list_migrations` reports.

## Domain Layer

### `lib/domain/profiles.ts` (small refactor, precedes new code)

Move `findEarliestProfileByRole` out of `lib/domain/requests.ts` into `profiles.ts` and generalize its role parameter from the narrow `"operations_manager" | "admin"` union to `UserRole`, exporting it. `requests.ts`'s `resolveApprover` and the new `workflows.ts` both need "earliest-created profile with role X in company Y" — this was Phase 3's local helper, now shared, no behavior change for existing callers.

### `lib/domain/workflows.ts`

- `startWorkflow(profile, templateSlug, context: { requestId?: string }): Promise<WorkflowInstance>`
  1. Load the template by `slug` + `profile.companyId`; throw `NotFoundError` if missing.
  2. Load its ordered `workflow_template_steps`.
  3. Insert the `workflow_instances` row (`related_request_id: context.requestId ?? null`, `status: 'in_progress'`).
  4. Insert one `workflow_instance_steps` row per template step, all `status: 'pending'`.
  5. Call `generateStepEntity` (below) for the first step; update that step's row to `status: 'in_progress'` with the generated id.
  6. If `context.requestId`: update `requests.status` to `'in_progress'` directly (bypassing `transitionRequestStatus`'s permission check — this is a system-driven transition following an already-authorized approval decision, not a new user action) and log activity on the request ("Workflow '{name}' started").
  7. Broadcast on `company:{companyId}:workflows` (best-effort, caught and logged like every existing broadcast call).
- `advanceWorkflow(profile, instanceId): Promise<void>`
  1. Load the instance; if `status !== 'in_progress'`, return (idempotency guard against double-invocation).
  2. Find the one `workflow_instance_step` with `status: 'in_progress'`; if none, return (defensive no-op).
  3. Mark it `completed` (`completed_at: now()`).
  4. If a next step exists (by `step_order`): generate its entity, mark it `in_progress`.
  5. Else: mark the instance `completed`; if `related_request_id` is set, update `requests.status` to `'completed'` directly (same rationale as step 6 above) and log activity ("Workflow '{name}' completed").
  6. Broadcast on `company:{companyId}:workflows` (best-effort).
- `getWorkflowProgress(profile, instanceId): Promise<WorkflowProgress>` — loads the instance and all its steps (joined with template step title/description/type for display), checks `canViewWorkflowInstance`, returns `{ instance, steps }` for the stepper UI.
- `generateStepEntity(profile, instance, step)` (private): if `step_type: 'task'` — department-based steps (`responsible_department_name` set) resolve `department_id` via a `departments` lookup and leave `assignee_id: null` (unassigned, per the department-scoped-pickup decision above); role-based steps (`responsible_role` set) instead resolve a specific `assignee_id` via `findEarliestProfileByRole(instance.companyId, step.responsibleRole)` (throws `UnprocessableRequestError` if none found) and leave `department_id: null`. Either way inserts into `tasks` with `creator_id: profile.id`, `status: 'todo'`, `related_workflow_instance_id: instance.id`. If `step_type: 'approval'` — resolves the approver the same way via `findEarliestProfileByRole` (same failure mode as `resolveApprover`), inserts into `approvals` (`request_id: instance.relatedRequestId!`, `approver_id`, `status: 'pending'`) and notifies the approver (`type: 'approval_required'`) — approval-type steps only occur on request-linked instances (Equipment/Maintenance), enforced by seed data, not a runtime check.

### Hooks in existing files

- **`lib/domain/tasks.ts`** `updateTaskStatus`: after a successful update, if the new status is `'completed'` and the task's `related_workflow_instance_id` is set, call `advanceWorkflow(profile, task.relatedWorkflowInstanceId)` wrapped in try/catch (log and continue on failure — same defensiveness as the existing `broadcastChange` calls, so a workflow-engine bug never blocks a user from completing their task).
- **`lib/domain/approvals.ts`** `decideApproval`: after a successful `'approved'` decision:
  1. If the approval belongs to a workflow step (`workflow_instance_steps` row where `generated_approval_id = approvalId`), call `advanceWorkflow(profile, thatStep.instanceId)`, same try/catch defensiveness.
  2. Else (a plain Phase-3 approval, not workflow-generated) — if the now-approved request's `category` has a matching `workflow_templates.trigger_category`, call `startWorkflow(profile, template.slug, { requestId: request.id })`, same try/catch defensiveness. This is the Equipment/Maintenance auto-start.

Both checks are cheap, indexed lookups; a request whose category has no matching template (e.g. `access`, `software`) simply finds nothing and no workflow starts — no per-category branching in `approvals.ts` itself.

### `lib/domain/permissions.ts` addition

```ts
export function canViewWorkflowInstance(
  profile: Profile,
  instance: { companyId: string },
  request: RequestLike | null,
  approverId: string | null
): boolean
// company match required; then delegates to canViewRequest(profile, request, approverId) when
// request is non-null; COMPANY_WIDE_VIEW_ROLES only when request is null (future non-request instances)
```

### `lib/validation/workflows.ts`

No user-supplied input in this phase (no POST routes — see below), so no new Zod schemas are needed; this module is skipped.

## Seed Data

Extend `lib/domain/seed.ts` with `seedWorkflowTemplates()` (called from the same place `seedFoundationData` is invoked), upserting on `(company_id, slug)` for idempotency, matching the existing seed style:

- **`equipment-request`** (`trigger_category: 'equipment'`): IT Review (approval, role `it`) → Procurement (task, dept "Procurement") → Ordered (task, dept "Procurement") → Delivered (task, dept "Procurement") → Asset Assigned (task, dept "IT")
- **`maintenance`** (`trigger_category: 'maintenance'`): Employee Assigned (task, dept "Operations") → Repair (task, dept "Operations") → Verification (approval, role `operations_manager`)
- **`employee-onboarding`** (`trigger_category: null`): Create company account (task, dept "IT") → Prepare laptop (task, dept "IT") → Prepare workspace (task, dept "Operations") → Welcome meeting (task, role `manager`) → Manager confirms (task, role `manager`)

`idea.md` §12 assigns "Prepare workspace" to "Office Operations", which isn't one of `ALPENTECH_DEPARTMENTS` — mapped to "Operations" instead. Not user-visible in this phase since onboarding isn't startable.

## API Routes

- `GET /api/workflows/templates` — lists the company's templates with their steps (any authenticated profile in the company; not sensitive data).
- `GET /api/workflows/instances/[id]` — calls `getWorkflowProgress`.

No `POST` routes: instances are only ever created by the `decideApproval` hook, never directly by a user action, in this phase.

All routes resolve `getCurrentProfile()` first and reject with 401 if absent, same as every existing route. Errors go through `toErrorResponse`; no new error types needed.

## Frontend

- **Workflow instance page** (`app/(app)/workflows/[id]/page.tsx`): `<BackLink href="/requests/{relatedRequestId}">` back to the originating request. Renders `components/workflows/workflow-stepper.tsx` — an ordered list of steps, each showing title, type badge (task/approval), status, responsible (role or department name), and a link into the generated task (`/tasks/[id]`) or the request's approval section when present.
- **Request detail page** (`app/(app)/requests/[id]/page.tsx`): when a `workflow_instances` row exists for the request (fetched alongside the request), show a link "View workflow progress" → `/workflows/[id]`.

## Testing

Same convention as Phase 2/3:
- Unit tests (no DB): `permissions.test.ts` (extended for `canViewWorkflowInstance`), any pure helpers in `workflows.ts`.
- Integration tests (`describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)`): `workflows.test.ts` covering `startWorkflow`/`advanceWorkflow`/`getWorkflowProgress` end-to-end (create request → approve → workflow auto-starts → complete each generated task/approval in order → instance completes → request status `completed`), `seed.test.ts` extended for template idempotency, hook coverage added to `tasks.test.ts`/`approvals.test.ts`.
- `pnpm build` must pass after Supabase types are regenerated (new tables/columns).

## Open Items Deferred Beyond This Phase

- Employee Onboarding's trigger ("HR creates employee") — Phase 5, once the Employee entity exists.
- The Equipment workflow's "Asset Assigned" step creating a real `assets` row — Phase 5 (`lib/domain/assets.ts` doesn't exist yet; the step is a plain task in this phase).
- Notification bell UI — Phase 9 (workflow-generated approval notifications reuse the existing `notifications` table/channel from Phase 3, same as everything else).
- Branching/parallel steps, rejection handling beyond the existing per-request approval reject path — out of scope; the engine is strictly linear.
