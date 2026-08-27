# Operations Hub — Outline for Phases 2–9

Companion to the full Foundation plan (`2026-08-26-foundation.md`) and the architecture spec (`docs/architecture.md`).

**Purpose of this document:** give a complete, navigable picture of the whole build before diving into any one phase. Each section below is a compact task outline — files, key domain-layer functions, and data flow — not a bite-sized executable plan. **Before executing a phase, its section gets expanded into a full plan** (TDD steps, real code, exact test files) following the same format as the Foundation plan, and saved as its own `docs/superpowers/plans/YYYY-MM-DD-phaseN-<name>.md`. Expanding just-in-time (rather than all up front) lets each phase's plan reflect what actually got built in the phase before it, instead of guessed-at signatures.

**Cross-phase pattern — growing the `tasks` table:** `tasks.related_employee_id` (→ `profiles`) can be added in Phase 2 already, since `profiles` exists from Foundation. `related_request_id`, `related_workflow_instance_id`, `related_asset_id`, and `related_operation_id` don't exist yet at that point — each gets added as one nullable FK column via a small `ALTER TABLE tasks ADD COLUMN ...` migration in the phase that introduces that entity (Phase 3, 4, 5, 6 respectively), rather than forward-declaring empty tables in Phase 2.

**Cross-phase pattern — every mutation is a triple:** validate (Zod) → domain function (writes the row, writes an `activity_log` entry, sends a Realtime broadcast) → route handler returns JSON. This triple is established in Phase 2 and repeated for every entity in every later phase; later outlines don't re-explain it.

---

## Phase 2 — Tasks

**Goal:** full task CRUD, statuses, priorities, comments, activity log, attachments — the first entity through the whole stack (domain layer, REST API, RBAC, Realtime broadcast, React Query on the frontend), so every later phase reuses an already-proven pattern.

**Prerequisite — close the schema-USAGE gap before any new table lands:** the Foundation phase's final review found that `revoke usage on schema public from anon, authenticated` (migration `20260826230306`) doesn't actually hold — a pre-existing grant to the `PUBLIC` pseudo-role from project bootstrap survives a revoke aimed at named roles, so `has_schema_privilege('anon','public','usage')` returns `true` on the live project today. The four Foundation tables stay safe only because they're owned by `postgres`, whose default-privilege revoke is correctly scoped; `supabase_admin`'s default ACL still grants `anon`/`authenticated` full DML on tables it creates. Full detail: `docs/superpowers/plans/2026-08-26-foundation.md` Global Constraints, and `docs/architecture.md` §2. **Human decision (2026-08-27): document only, fix as the first task of this phase — not a Foundation-branch blocker.** First task here should add a migration that closes the gap (e.g. `revoke usage on schema public from public;` and/or an explicit `for role supabase_admin` default-privilege revoke for `tasks`/`comments`/`activity_log`/`attachments`), verified live via the `has_schema_privilege` query returning `false, false` for both roles, before any table migration in this phase runs.

- **Migrations:**
  - `tasks` (title, description, `status` enum `todo|in_progress|blocked|completed|cancelled`, `priority` enum `low|medium|high|critical`, `assignee_id`/`creator_id`→`profiles`, `department_id`→`departments`, `related_employee_id`→`profiles` nullable, `due_date`, `completed_at`, `company_id`)
  - `comments` (polymorphic: `entity_type`, `entity_id`, `author_id`→`profiles`, `body`) — generic, reused by every entity from here on
  - `activity_log` (polymorphic: `entity_type`, `entity_id`, `actor_id`→`profiles` nullable, `message`) — generic, reused by every entity from here on
  - `attachments` (polymorphic: `entity_type`, `entity_id`, `storage_path`, `uploaded_by`→`profiles`) + a private Supabase Storage bucket named `attachments`
- **Domain layer:**
  - `lib/domain/tasks.ts` — `createTask`, `updateTaskStatus`, `assignTask`, `listTasks(filters)`, `getTask(id)`
  - `lib/domain/comments.ts`, `lib/domain/activity.ts` (generic, keyed by `entityType`/`entityId` — every later domain module calls these two instead of reimplementing them)
  - `lib/domain/attachments.ts` — issues signed upload/download URLs after checking the caller can access the target entity
  - `lib/domain/permissions.ts` — first real RBAC capability functions (e.g. `canAssignTask`, `canChangeTaskStatus`), the pattern every later phase's permission checks follow
- **Realtime:** `lib/realtime/broadcast.ts` (server-side send helper) and a `useBroadcastListener(channel)` client hook — the concrete implementation of the spec §6 broadcast pattern, reused by every later phase.
- **API routes:** `/api/tasks`, `/api/tasks/[id]`, `/api/tasks/[id]/comments`, `/api/tasks/[id]/attachments`
- **Frontend:** task list (table, filters: status/priority/assignee/department), task detail (status change, comments, attachments), task creation form. First page wired to React Query.

---

## Phase 3 — Requests & Approvals

**Goal:** employees can submit categorized requests; authorized users can approve/reject; status and approvals are visible end to end. (Automatic multi-step chaining like "approved → IT reviews → procurement orders" is *not* built here — that's the workflow engine in Phase 4. This phase covers a request having its own status and needing approval; Phase 4 wires specific categories to a scripted sequence.)

- **Migrations:**
  - `requests` (`category` enum per idea.md §8, `status` enum `draft|submitted|under_review|approved|rejected|in_progress|completed`, `created_by`→`profiles`, `department_id`)
  - `approvals` (`request_id`, `approver_id`→`profiles`, `status` enum `pending|approved|rejected`, `decided_at`, `comment`)
  - `ALTER TABLE tasks ADD COLUMN related_request_id uuid REFERENCES requests(id)`
- **Domain layer:**
  - `lib/domain/requests.ts` — `createRequest`, `submitRequest`, `transitionRequestStatus`
  - `lib/domain/approvals.ts` — `requestApproval`, `decideApproval` (writes `activity_log`, broadcasts, and creates a `notifications` row for the approver — first real use of notifications)
  - `lib/domain/notifications.ts` introduced here (per idea.md §19 event list that already applies: approval required, request status changed)
- **API routes:** `/api/requests`, `/api/requests/[id]`, `/api/requests/[id]/approvals`, `/api/approvals/[id]/decide`
- **Frontend:** request list (mine / all, filter by category/status), request detail with a visual status timeline (idea.md §9's "entire progress visually"), request creation form, approve/reject UI with optional comment for approvers.

---

## Phase 4 — Workflow Engine

**Goal:** a generic engine that runs a `workflow_template`'s steps in order, auto-generating a task or approval per step and advancing when that task/approval completes — not one code path per workflow type.

- **Migrations:**
  - `workflow_templates`, `workflow_template_steps` (`order`, `step_type` `task|approval`, `responsible_role` or `responsible_department_id`, title/description)
  - `workflow_instances`, `workflow_instance_steps` (`status`, `generated_task_id`→`tasks` nullable, `generated_approval_id`→`approvals` nullable)
  - `ALTER TABLE tasks ADD COLUMN related_workflow_instance_id uuid REFERENCES workflow_instances(id)`
- **Domain layer:** `lib/domain/workflows.ts` — `startWorkflow(templateSlug, context)`, `advanceWorkflow(instanceId)` (called from `tasks.ts`/`approvals.ts` whenever a task completes or an approval is decided, via a small hook so Phase 2/3 code doesn't need workflow-specific logic baked in), `getWorkflowProgress(instanceId)`.
- **Seed:** the three templates from idea.md §12–14 (Employee Onboarding, Equipment Request, Maintenance) and their steps; wire `requests.ts` so submitting an `equipment` or `maintenance` category request starts the matching workflow instance.
- **API routes:** `/api/workflows/templates`, `/api/workflows/instances/[id]`
- **Frontend:** workflow instance progress view (stepper matching idea.md's "clear overall progress indicator"), linked from the originating request's detail page.

---

## Phase 5 — Employees & Assets

**Goal:** operational employee profiles and the asset registry, closing the loop so the equipment-request workflow actually ends in a real assigned asset.

- **Migrations:**
  - Extend `profiles`: `position_title`, `employee_number`, `status` enum `active|inactive` (idea.md's "Employees" are the existing `profiles`, viewed operationally — not a new table)
  - `assets` (human-readable `asset_code`, `category`, `status` enum `available|assigned|maintenance|retired|lost`, `assigned_to`→`profiles` nullable, `department_id`, `location_id`, `purchase_info`/`warranty_info` as `jsonb`)
  - `ALTER TABLE tasks ADD COLUMN related_asset_id uuid REFERENCES assets(id)`
- **Domain layer:**
  - `lib/domain/employees.ts` — `getEmployeeProfile(id)` aggregating open task/request/asset/workflow counts per idea.md §15's example
  - `lib/domain/assets.ts` — `createAsset`, `assignAsset`, `changeAssetStatus`
- **API routes:** `/api/employees`, `/api/employees/[id]`, `/api/assets`, `/api/assets/[id]`
- **Frontend:** employee directory + profile detail page, asset list + detail page, "assign asset" action.
- **Wiring:** the equipment-request workflow's final step (Phase 4) now calls `assets.ts` to create and assign a real asset, completing the idea.md §23 end-to-end scenario.

---

## Phase 6 — Operations

**Goal:** the higher-level grouping object that ties tasks/requests/assets/employees together for larger initiatives (idea.md §14).

- **Migrations:**
  - `operations` (`owner`→`profiles`, `department_id`, `status`, `priority`, `start_date`, `target_date`)
  - Join tables: `operation_tasks`, `operation_requests`, `operation_assets`, `operation_employees`
  - `ALTER TABLE tasks ADD COLUMN related_operation_id uuid REFERENCES operations(id)`
- **Domain layer:** `lib/domain/operations.ts` — `createOperation`, `linkEntity(operationId, entityType, entityId)`, `getOperationProgress(id)` (computed from the completion ratio of linked tasks).
- **API routes:** `/api/operations`, `/api/operations/[id]`
- **Frontend:** operations list + detail page showing linked tasks/requests/assets/employees and a progress percentage (idea.md §14 examples).

---

## Phase 7 — Dashboard / Overview

**Goal:** replace the Foundation-phase placeholder dashboard with the real Overview from idea.md §6 and §29 — no new tables, pure aggregation over everything built so far.

- **Domain layer:** `lib/domain/dashboard.ts` — `getPersonalOverview(profile)` (my tasks, pending approvals, open requests, active workflows, recent activity) and `getCompanyOverview()` (gated by role capability — totals, attention-required counts, active operations, department activity).
- **API routes:** `/api/dashboard/personal`, `/api/dashboard/company`
- **Frontend:** the real `/dashboard` page — summary cards, My Tasks, Recent Activity, company section for authorized roles, Active Operations with progress bars, Upcoming widget. First page subscribed to multiple Realtime broadcast channels at once (tasks, requests, notifications), since it aggregates everything.

---

## Phase 8 — Reports & Search

**Goal:** the operational metrics from idea.md §17 and the global search from idea.md §20.

- **Migrations:** generated `tsvector` columns + GIN indexes on the tables that need to be searchable (`profiles`, `tasks`, `requests`, `assets`, `operations`, `workflow_templates`).
- **Domain layer:**
  - `lib/domain/reports.ts` — `requestsByDepartment`, `avgRequestCompletionTime`, `taskStatistics`, `workflowCompletionRate` (plain SQL aggregation, no BI tooling, per spec §9)
  - `lib/domain/search.ts` — one function querying every searchable table's `tsvector` column and merging results, tagged by type
- **API routes:** `/api/reports/*`, `/api/search`
- **Frontend:** Reports page (Recharts, matching idea.md §17's example charts), global search bar in the app shell header with typeahead results grouped by type.

---

## Phase 9 — Realtime & Notifications Polish

**Goal:** close out the demo — a real notification bell, and confirm every central view is live-updating and every entity has activity history, matching idea.md §18–19 in full.

- **Frontend:** notification bell dropdown (unread count, mark-as-read), subscribed to the per-profile broadcast channel (`lib/domain/notifications.ts` from Phase 3 already produces the rows; this phase is the UI for them).
- **Audit pass, no new domain concepts:**
  - Every central view (dashboard, task board, request list, operation detail) is subscribed to its relevant broadcast channel(s) — some of this lands incrementally per phase already; this is the sweep to confirm none were missed.
  - Every entity type (`requests`, `tasks`, `workflows`, `employees`, `assets`, `operations`) renders its `activity_log` timeline (idea.md §18).
  - Every event in idea.md §19's notification list actually has a `notifications` row created somewhere in the domain layer; fill any gaps found.
