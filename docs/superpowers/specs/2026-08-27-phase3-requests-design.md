# Phase 3 — Requests & Approvals: Design Spec

**Status:** Approved for planning.

## Goal

Employees can submit categorized requests; an authorized approver can approve/reject them; status and approval state are visible end to end, including a visual progress timeline (`idea.md` §9). Automatic multi-step chaining ("approved → IT reviews → procurement orders") is explicitly **not** built here — that is Phase 4's workflow engine. This phase covers a request having its own status and needing exactly one approval.

This phase follows the pattern established in Phase 2 (`docs/superpowers/specs/2026-08-27-phase2-tasks-design.md`): thin Next.js Route Handlers validate with Zod and delegate to a domain layer that is the sole authorization boundary (`lib/domain/permissions.ts`) and the sole place that talks to Supabase Postgres. `comments`, `activity_log`, and `attachments` (built in Phase 2) are reused as-is via `entity_type: "request"`. The broadcast-only Realtime pattern is reused and extended with a per-profile channel for notifications.

## Data Model

### `requests`

```
id              uuid primary key default gen_random_uuid()
company_id      uuid not null references companies(id) on delete cascade
title           text not null
description     text
category        request_category not null   -- equipment | software | access | maintenance | purchase | hr | general | other
status          request_status not null default 'draft'
                -- draft | submitted | under_review | approved | rejected | in_progress | completed
created_by      uuid not null references profiles(id) on delete set null
department_id   uuid references departments(id) on delete set null
created_at      timestamptz not null default now()
```

Note: `submitted` is part of the enum for parity with `idea.md` §8's documented lifecycle, but this phase's `submitRequest` writes `under_review` directly (see Domain Layer) — approval routing is synchronous, so a persisted `submitted` moment doesn't occur in this phase. The enum value stays reachable for a later phase that might insert an async gap before routing.

### `approvals`

```
id              uuid primary key default gen_random_uuid()
request_id      uuid not null references requests(id) on delete cascade
approver_id     uuid not null references profiles(id) on delete set null
status          approval_status not null default 'pending'   -- pending | approved | rejected
decided_at      timestamptz
comment         text
created_at      timestamptz not null default now()
```

Exactly one `approvals` row per request in this phase (created by `submitRequest`). Multiple/parallel approvals per request are out of scope — deferred to Phase 4 alongside chaining.

### `notifications`

```
id              uuid primary key default gen_random_uuid()
profile_id      uuid not null references profiles(id) on delete cascade   -- recipient
entity_type     text not null
entity_id       uuid not null
type            text not null    -- free text, not a DB enum: idea.md §19 lists 9 event
                                  -- types spread across every later phase; a DB enum
                                  -- would need a migration each time a phase adds one,
                                  -- same reasoning as entity_type on comments/activity_log
message         text not null
read_at         timestamptz
created_at      timestamptz not null default now()
```

Only two `type` values are produced in this phase: `approval_required` (on submit, to the approver) and `request_status_changed` (on approve/reject decision, to the requester). No `markAsRead` — nothing sets `read_at` until Phase 9 builds the notification bell.

### `tasks` extension

```sql
alter table tasks add column related_request_id uuid references requests(id);
```

Schema prep only, per `docs/superpowers/plans/2026-08-26-remaining-phases-outline.md`. Nothing in this phase's domain logic sets it — same precedent as Phase 2 shipping `tasks.related_employee_id` unused until a later phase wires it up.

All four migrations follow the Phase 2 convention: apply via `mcp__claude_ai_Supabase__apply_migration`, verify zero `anon`/`authenticated` grants, rename the local file to match the version `list_migrations` reports.

## Domain Layer

### `lib/domain/requests.ts`

- `createRequest(profile, input): Promise<Request>` — inserts with `status: 'draft'`, logs `activity_log` ("Request created"), no broadcast yet (nothing else can see a draft).
- `submitRequest(profile, requestId): Promise<Request>` — the only way out of `draft`. In one domain call:
  1. Resolve the approver: the requester's `profiles.managerId`, if set; otherwise the company's earliest-created `operations_manager` profile; otherwise the earliest-created `admin` profile. (No manager and no operations_manager/admin in the company is an unrecoverable seed-data problem, not a code path — throw.)
  2. Update `requests.status` to `under_review`.
  3. Insert the `approvals` row (`status: 'pending'`, `approver_id` resolved above).
  4. Log activity ("Request submitted, awaiting approval from {approver}").
  5. Call `notifications.createNotification` for the approver, `type: 'approval_required'`.
  6. Broadcast on `company:{companyId}:requests`.
- `transitionRequestStatus(profile, requestId, status): Promise<Request>` — validates against `REQUEST_STATUS_TRANSITIONS` (only `approved → in_progress` and `in_progress → completed` are legal manual transitions; anything else, including trying to reach `submitted`/`under_review`/`approved`/`rejected` this way, throws `InvalidTransitionError`). Checks `canTransitionRequestStatus`. Logs activity, broadcasts.
- `listRequests(profile, filters): Promise<Request[]>` — filters: `status`, `category`, `departmentId`, and `scope: 'mine' | 'all'` (mine = `created_by === profile.id`; all = everything `canViewRequest` would allow, i.e. company-wide for elevated roles, department-scoped for managers — same visibility duplication risk Phase 2 already flagged as deferred, not re-solved here).
- `getRequest(profile, id): Promise<Request>` — throws `NotFoundError` / `ForbiddenError` per `canViewRequest`.

### `lib/domain/approvals.ts`

- `decideApproval(profile, approvalId, decision: 'approved' | 'rejected', comment?): Promise<Approval>`:
  1. Load the approval; throw `NotFoundError` if missing, `InvalidTransitionError` if not `pending`.
  2. Check `canDecideApproval`.
  3. Update the approval (`status`, `decided_at: now()`, `comment`).
  4. Update the request's status to `approved` or `rejected` (`rejected` is terminal — no further transitions).
  5. Log activity on the request.
  6. Notify the requester, `type: 'request_status_changed'`.
  7. Broadcast on `company:{companyId}:requests`.

### `lib/domain/notifications.ts`

- `createNotification(profileId, entityType, entityId, type, message): Promise<Notification>` — inserts the row, then calls the new `broadcastToProfile(profileId, "notifications", { type })`.
- `listNotifications(profileId): Promise<Notification[]>` — ordered by `created_at` desc. No consumer in this phase's frontend; exists so the module is tested now and ready for Phase 9.

### `lib/realtime/broadcast.ts` extension

Add `broadcastToProfile(profileId: string, channel: string, event: { type: string }): Promise<void>`, sending on `profile:{profileId}:{channel}` — refactor the existing subscribe/send/removeChannel sequence in `broadcastChange` into a shared private helper so both functions call it, rather than duplicating the promise/subscribe logic.

### `lib/domain/permissions.ts` additions

Same style as the Phase 2 task functions — plain functions taking `Profile` and a minimal `*Like` shape, no DB access inside:

```ts
export interface RequestLike {
  companyId: string;
  createdBy: string;
  departmentId: string | null;
}

export function canCreateRequest(_profile: Profile): boolean // true always

export function canViewRequest(
  profile: Profile,
  request: RequestLike,
  approverId: string | null
): boolean
// company match required; then COMPANY_WIDE_VIEW_ROLES (operations_manager/it/hr/admin)
// see all; else creator, approverId, or a manager whose departmentId matches.

export function canDecideApproval(
  profile: Profile,
  approval: { approverId: string }
): boolean
// profile.id === approval.approverId, or ELEVATED_ROLES (operations_manager/admin)

export function canTransitionRequestStatus(
  profile: Profile,
  request: RequestLike,
  approverId: string | null
): boolean
// creator, approverId, or ELEVATED_ROLES

export const canCommentOnRequest = canViewRequest;
export const canUploadRequestAttachment = canViewRequest;
```

`COMPANY_WIDE_VIEW_ROLES` and `ELEVATED_ROLES` are the existing constants from Phase 2 — no redefinition needed, these functions live in the same file.

### `lib/validation/requests.ts`

Mirrors `lib/validation/tasks.ts`: `createRequestSchema` (title, description?, category, departmentId?), `patchRequestSchema` (status only, reusing the same single-key-union style as `patchTaskSchema` if more fields are ever added — for now just `{ status }`), `requestFiltersSchema` (status?, category?, departmentId?, scope?), `decideApprovalSchema` (`decision: 'approved' | 'rejected'`, `comment?`).

### `lib/domain/task-status.ts`-equivalent: `lib/domain/request-status.ts`

Same shape as the existing module: `RequestStatus`, `RequestCategory` types, `REQUEST_STATUSES`, `REQUEST_CATEGORIES`, `REQUEST_STATUS_TRANSITIONS` (`approved: ['in_progress']`, `in_progress: ['completed']`, every other status: `[]` — including `draft`/`submitted`/`under_review`/`rejected`/`completed`, since those are only reached through `submitRequest`/`decideApproval`, never the generic transition entry point), `getValidNextStatuses`.

## API Routes

- `POST /api/requests` — validates `createRequestSchema`, calls `createRequest` then `submitRequest` back-to-back (single-step form, per your answer — no draft UI in this phase), returns the submitted request.
- `GET /api/requests` — validates `requestFiltersSchema` from query params, calls `listRequests`.
- `GET /api/requests/[id]` — calls `getRequest`.
- `PATCH /api/requests/[id]` — validates `patchRequestSchema`, calls `transitionRequestStatus`.
- `POST /api/requests/[id]/comments` — validates `addCommentSchema` (reused from Phase 2), checks `canCommentOnRequest`, calls `comments.addComment("request", ...)`, broadcasts.
- `POST /api/requests/[id]/attachments` — mirrors the Phase 2 attachments route exactly, `entity_type: "request"`, checks `canUploadRequestAttachment`.
- `POST /api/approvals/[id]/decide` — validates `decideApprovalSchema`, calls `decideApproval`.

All routes resolve `getCurrentProfile()` first and reject with 401 if absent, same as every Phase 2 route. Errors go through the existing `toErrorResponse` — no new error types needed (`InvalidTransitionError` already covers "not pending" and "illegal status transition").

## Frontend

- **Request list** (`app/(app)/requests/page.tsx`): table with a mine/all toggle and status/category/department filters, React Query (same shape as the Phase 2 task list — first reuse of that pattern).
- **Request creation form** (`app/(app)/requests/new/page.tsx`): single-step — submits immediately (create+submit), redirects to the detail page.
- **Request detail** (`app/(app)/requests/[id]/page.tsx`): a visual status timeline (`idea.md` §9's "entire progress visually" — a stepper-style component showing `draft → under_review → approved/rejected → in_progress → completed`, with the actual current step highlighted), approve/reject buttons with an optional comment field (visible only when `profile.id === approverId` or an elevated role, matching `canDecideApproval`), plus comments and attachments sections reusing the same component pattern as the task detail page (generalized or duplicated with `entityType: "request"` — implementation plan decides which, based on how much the Phase 2 components already generalize).
- No notification UI. Phase 9 builds the bell against the `notifications` table and `profile:{id}:notifications` channel this phase produces.

## Testing

Same convention as Phase 2:
- Unit tests (no DB): `request-status.test.ts`, `requests.test.ts`/`approvals.test.ts` validation schemas, permission function tests in `permissions.test.ts` (extending the existing file).
- Integration tests (`describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)`, hitting the hosted Supabase project): `requests.test.ts`, `approvals.test.ts`, `notifications.test.ts` domain-layer tests, registered in both `test:unit`'s `--exclude` list and `test:integration`'s file list in `package.json`.
- `pnpm build` must pass after the Supabase types are regenerated (new tables/columns).

## Open Items Deferred Beyond This Phase

- Multiple/parallel approvals per request, and automatic chaining — Phase 4 (workflow engine).
- Notification bell UI, `markAsRead` — Phase 9.
- `listRequests`/`canViewRequest` visibility-logic duplication — same category of deferred cleanup already noted for Phase 2's `listTasks`/`canViewTask`; not re-solved here.
