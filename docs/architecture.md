# Operations Hub — Tech Stack & Architecture Design

Status: Approved by Adrian on 2026-08-26. Basis for the implementation plan.

Companion to `idea.md` (product concept). This document defines *how* the product described there gets built.

---

## 1. Project Framing

- **Purpose:** Portfolio/demo project. Publicly deployable, showcasing high-quality custom internal business software. Not intended to onboard real companies.
- **Tenancy:** Single fictional company (AlpenTech Industries). A `companies` table exists for clean modeling and future extensibility, but only one row is ever populated. No multi-tenant isolation logic is built.
- **Auth:** Real Supabase Auth signup/login (not fixed demo accounts). At signup, the visitor picks which role they want to explore (Employee, Manager, Operations Manager, IT, HR, Admin). This lets every visitor self-serve into any perspective without an admin manually assigning roles.
- **Seed data:** A seed script populates AlpenTech Industries with realistic departments, locations, employees, assets, requests, tasks, and workflow instances, so the demo feels alive immediately after deploy, independent of real signups.

---

## 2. High-Level Architecture

Single Next.js project, deployed on Vercel.

```
Browser (React / Next.js Frontend)
        │  fetch()
        ▼
Next.js Route Handlers  (app/api/**)        ← REST endpoints, Zod validation
        │
        ▼
Domain / Service Layer  (lib/domain/**)     ← business logic: requests, approvals,
        │                                      workflow engine, task generation, RBAC checks
        ▼
Supabase Postgres  (via service-role key)   ← pure data storage, RLS disabled
        +
Supabase Auth        (login/signup, sessions)
Supabase Storage      (file attachments on tasks/requests)
Supabase Realtime     (broadcast channels only, see §6)
```

Principles:

- **Route Handlers are thin.** They accept the request, validate the body with Zod, call one domain-layer function, and return JSON. No business logic lives in the handlers themselves.
- **The domain layer is the sole authorization authority.** Every domain function receives the caller's profile (including role) and checks permissions itself before touching the database. There is no second authorization path.
- **The frontend never talks to Supabase directly for data.** All reads and writes go through the REST API. The Supabase client with the service-role key exists only server-side. (Narrow, explicit exceptions: Storage upload/download via signed URLs, and Realtime broadcast subscriptions for live-update signals — both described in their own sections below; neither exposes table data directly.)
- **RLS is disabled.** The REST API layer is the only authorization boundary, using the Supabase service-role key server-side. This is only actually true once `anon`/`authenticated` have zero table privileges — Supabase grants those roles full DML by default, expecting RLS to gate them, so disabling RLS without also revoking those default grants leaves every table readable and writable through PostgREST via the public anon key. Every migration must ensure this holds (see the Foundation plan's Global Constraints for the exact fix and verification query).

---

## 3. Tech Stack

| Area | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) | Frontend + API in one project, native Vercel integration |
| Language | TypeScript (strict) | Type safety across route handlers, domain layer, DB types |
| Database | Supabase Postgres | Managed Postgres, generated TS types from schema |
| Auth | Supabase Auth | Ready-made email/password signup flow, session handling |
| Storage | Supabase Storage | File attachments on tasks/requests, via signed URLs |
| API layer | REST via Next.js Route Handlers | Explicit, easy to read/demo, no extra infrastructure |
| Validation | Zod | Request body validation in route handlers, shared types with frontend |
| Data fetching (frontend) | React Query (TanStack Query) | Caching, refetching, optimistic updates for task/status changes |
| UI components | shadcn/ui + Tailwind | Matches the "professional / structured / enterprise" design direction (idea.md §30); full styling control |
| Forms | React Hook Form + Zod | Request creation, task creation, etc. |
| Charts | Recharts | Reports (idea.md §17) |
| Deployment | Vercel | Native Next.js hosting, preview deployments |
| DB migrations | Supabase CLI migrations | Versioned SQL migrations, reproducible locally and in CI |

---

## 4. Core Data Model

```
companies                (1 row: AlpenTech Industries)
departments               → company
locations                 → company

profiles                  → company, department, manager (self-ref), auth.users(id)
  role: employee | manager | operations_manager | it | hr | admin

assets                    → company, department, location, assigned_to (profile)
  status: available | assigned | maintenance | retired | lost

requests                  → company, created_by (profile), department, category
  status: draft | submitted | under_review | approved | rejected | in_progress | completed
  category: equipment | software | access | maintenance | purchase | hr | general | other

approvals                 → request, approver (profile)
  status: pending | approved | rejected

tasks                     → company, assignee (profile), department, creator (profile),
                             related_request, related_workflow_instance,
                             related_employee, related_asset, related_operation
  status: todo | in_progress | blocked | completed | cancelled
  priority: low | medium | high | critical

workflow_templates         → company
workflow_template_steps    → workflow_template  (order, step type: task | approval, responsible role)

workflow_instances         → workflow_template, related request/employee/operation
workflow_instance_steps    → workflow_instance, generated task/approval, status

operations                 → company, owner (profile), department
  status, priority, start_date, target_date
operation_tasks / operation_requests / operation_assets / operation_employees   (join tables)

activity_log                → polymorphic: entity_type + entity_id, actor (profile), message, created_at
notifications                → profile (recipient), entity_type + entity_id, type, read_at

comments                     → polymorphic: entity_type + entity_id, author (profile), body
attachments                  → polymorphic: entity_type + entity_id, storage_path, uploaded_by
```

`activity_log`, `comments`, and `attachments` are polymorphic (`entity_type` + `entity_id`) rather than one FK column per target table, because nearly every entity (request, task, workflow, employee, asset, operation) needs these features per idea.md — a dedicated FK per table would be heavily redundant.

**Workflow engine:** generic, not one code path per workflow type. A `workflow_instance` steps through its `workflow_instance_steps` in order; each step automatically generates a task or an approval. When that task/approval completes, the domain layer activates the next step. This logic lives in `lib/domain/workflows.ts`, not in database triggers — matching idea.md's framing of workflows as data-driven and extensible (§28: workflow builder is a later feature, so the engine should already be generic even though the authoring UI isn't built yet).

---

## 5. Auth & RBAC

- **Supabase Auth** handles signup/login/session (email + password). At signup, the visitor also picks their demo role. This creates a `profiles` row with `company_id = AlpenTech` and the chosen role (via a dedicated `/api/auth/complete-signup` endpoint called right after Supabase Auth signup succeeds).
- **Authorization happens exclusively in the domain layer** — never in the frontend, never in the database. Every domain function receives the caller's `profile` (with role) and checks permissions itself, e.g. `canApproveRequest(profile, request)`.
- Role capabilities are centralized as plain functions in `lib/domain/permissions.ts` (e.g. `hasCapability(profile, "approve:request")`) rather than scattered across individual routes. This maps to the roles and rights described in idea.md §21 (Employee < Manager < Operations Manager/IT/HR < Admin, with some overlapping and some exclusive rights).
- Every route handler resolves the current Supabase session server-side, loads the corresponding `profiles` row, and passes it into the domain layer. A missing/invalid session is rejected before any domain function runs.

---

## 6. Realtime Updates

Central views (dashboard, task board, request list) should reflect changes made by other users without a manual refresh — but without giving the frontend direct read access to Supabase tables (which would require RLS, contradicting §2's "REST API is the sole authorization boundary").

**Pattern: Broadcast, not Postgres Changes.** After a mutation succeeds, the domain layer (server-side, using the service-role client) sends a short broadcast message on a Supabase Realtime channel scoped to the company (e.g. `company:{id}:tasks`). The frontend subscribes to relevant channels purely to receive change *signals* — no payload data, just "task X changed" — and reacts by having React Query invalidate/refetch the relevant query, which goes through the normal REST API. Real data still only ever flows through the REST API; Realtime is a notification mechanism, not a second data path.

---

## 7. Notifications

- In-app only (no email) for the demo.
- Stored in the `notifications` table, created by the domain layer whenever a relevant event happens (task assigned, approval required, request status changed, task overdue, workflow step completed/blocked, request rejected, asset assigned, comment added — per idea.md §19).
- Delivered live via the same per-user Realtime broadcast pattern as §6 (channel `profile:{id}:notifications`) to update the notification bell without polling.

---

## 8. Search

- Postgres full-text search (`tsvector` columns) across employees, tasks, requests, assets, operations, and workflows.
- A single `/api/search?q=` endpoint in the domain layer queries each table and merges results, tagged by type, so the frontend can render one unified result list (idea.md §20).

---

## 9. Reports

- Computed via SQL aggregation queries in the domain layer (no separate BI tool or pipeline) — matches idea.md §17's explicit non-goal of building "complex business intelligence software."
- Exposed via `/api/reports/*` endpoints (e.g. requests-by-department, average completion time, task statistics), rendered with Recharts.

---

## 10. File Attachments

- Supabase Storage, private bucket.
- Upload: frontend asks the API for a signed upload URL (API layer requests it from Storage using the service-role key), then uploads directly to that URL. Download: same pattern with a signed download URL.
- This is a deliberate, narrow exception to "frontend never talks to Supabase directly" — it's the standard secure pattern for object storage and never exposes table data or bypasses the domain layer's authorization check (the API only issues a signed URL after confirming the caller may access that entity's attachments).

---

## 11. Project Structure

```
app/
  (marketing)/          landing page, signup with role picker
  (app)/                authenticated app shell
    dashboard/
    tasks/
    requests/
    workflows/
    employees/
    assets/
    operations/
    reports/
    settings/
  api/
    tasks/
    requests/
    approvals/
    workflows/
    employees/
    assets/
    operations/
    reports/
    search/
    auth/
lib/
  domain/                business logic per entity (requests.ts, tasks.ts, workflows.ts,
                          approvals.ts, permissions.ts, notifications.ts, activity.ts)
  supabase/              server client (service-role), browser client (auth only)
  realtime/              broadcast helpers
  validation/            zod schemas, shared between route handlers and frontend forms
components/
  ui/                    shadcn primitives
  <feature>/             feature-specific components (tasks/, requests/, dashboard/, ...)
supabase/
  migrations/            versioned SQL migrations
scripts/
  seed.ts                seeds AlpenTech Industries fictional data
```

---

## 12. Suggested Build Order

Matches the MVP scope in idea.md §27, sequenced so each phase produces something demoable:

1. **Foundation** — Supabase project, schema/migrations for companies/departments/locations/profiles, Supabase Auth signup with role picker, seed script skeleton.
2. **Tasks** — CRUD, statuses, priorities, comments, activity log (simplest entity, exercises the whole stack end-to-end).
3. **Requests + Approvals** — creation, categories, lifecycle, approval flow; ties into Tasks via `related_request`.
4. **Workflow engine** — generic instance/step runner; seed the Employee Onboarding, Equipment Request, and Maintenance workflow templates from idea.md §12–14.
5. **Employees + Assets** — profiles-as-employee views, asset registry, assignment; connects to Tasks/Requests already built.
6. **Operations** — higher-level grouping over tasks/requests/employees/assets.
7. **Dashboard/Overview** — personal + company sections, summary cards, attention-required widgets (built last since it aggregates everything above).
8. **Reports + Search** — cross-cutting, built once enough data/entities exist to make them meaningful.
9. **Realtime + Notifications polish** — layered on top once the core flows work via plain refetching.

This ordering is a starting point for the implementation plan, not a rigid phase gate.
