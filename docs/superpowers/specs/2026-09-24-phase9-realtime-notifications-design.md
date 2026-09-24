# Phase 9 — Realtime & Notifications Polish — Design

Date: 2026-09-24
Outline section: `docs/superpowers/plans/2026-08-26-remaining-phases-outline.md` § Phase 9
Product source: `docs/idea.md` §18 (Activity History) and §19 (Notifications)

---

## 1. Goal

Close out the demo per the outline: a real notification bell UI, and an audit pass confirming every central view is live-updating and every entity type has activity history. No new domain concepts — `lib/domain/notifications.ts` (`createNotification`/`listNotifications`) and the broadcast pattern (`lib/realtime/broadcast.ts`) both already exist from Phase 3/2; this phase is the UI for notifications plus closing gaps the audit finds, not new infrastructure.

Direct code inspection (not guesswork) found three concrete gaps, detailed in §3–§5:

1. Of idea.md §19's 9 example notification events, only 2 have a `createNotification` call site today (`approval_required`, `request_status_changed` — both from Phase 3/4). The other 7 have none.
2. `operations/[id]`, `assets/[id]`, `employees/[id]` have no live-refresh — only their list views do (`OperationListView`/`AssetListView`/`EmployeeListView` each call `useBroadcastListener`; none of the three detail pages do).
3. `workflows/[id]` renders no activity-log timeline at all, unlike every other entity's detail page (tasks/requests/assets/employees/operations all do).

## 2. Decisions taken during brainstorming

**"Task overdue" and "workflow blocked" are computed at read time, not pushed as `notifications` rows.** This project has no scheduled-job infrastructure (no `pg_cron`, no cron migration anywhere in `supabase/migrations/`) and `workflow_instances`/`workflow_instance_steps` have no `blocked` status in their schema. Rather than introduce a new infrastructure pattern for two events, both are derived: a task is "overdue" when `due_date < now()` and its status isn't `completed`/`cancelled` (same predicate `taskStatistics` in `lib/domain/reports.ts` already uses); a workflow instance is "blocked" when its current `in_progress` step's `created_at` is older than a threshold with no progress. Neither produces a `notifications` row — they're presentational-only (a badge/banner), matching how `reports.ts`'s `overdue` count already works without any notification involved.

**"Workflow blocked" threshold: 3 days**, applied uniformly to both step types (task-backed and approval-backed) via the step's own `created_at` — not the underlying task's `due_date`, because approval steps have no due date at all (`approvals` has no due-date column) and a uniform rule needs a field both step types actually have. 3 days is a reasonable default for a demo; it isn't derived from any requirement in idea.md, so it's a named constant (`WORKFLOW_STEP_STALE_DAYS`), not a hardcoded literal, and easy to change if wrong.

**"Comment added" notification target is looked up per entity type in the existing comment API routes, not inside `lib/domain/comments.ts`.** `comments.ts` is deliberately generic (`entityType`/`entityId`, no knowledge of what "owner" means for a given type — confirmed by reading it: it has zero references to `tasks`/`requests`/`operations`). Each of the three existing comment routes (`app/api/tasks/[id]/comments`, `app/api/requests/[id]/comments`, `app/api/operations/[id]/comments`) already loads the full entity before calling `addComment` (to run its own permission check), so each already has the field needed to resolve a notification target without an extra query: `task.assigneeId`, `targetRequest.createdBy`, `operation.ownerId`. Assets and employees have no comment routes today (confirmed: `find app/api -path "*comments*"` returns only tasks/requests/operations) — "comment added" notifications are scoped to those three entity types, matching what's actually commentable.

**"Workflow step completed" notifies `instance.relatedEmployeeId`.** Read `startWorkflow` directly: it already resolves and stores `relatedEmployeeId` on every instance — either the caller-supplied `context.employeeId` (onboarding) or the linked request's `created_by` (equipment/maintenance) — so it's always populated and already means "the person this workflow instance is for," in both cases. No fallback logic needed; the field already carries the fallback.

**Notification bell placement: `SiteHeader`.** Confirmed by reading `components/site-header.tsx`: it currently renders only a `SidebarTrigger` in an otherwise-empty header bar — the obvious, currently-unused slot for a persistent, page-independent element, and consistent with the layout's existing pattern of passing derived profile data down as props (`AppSidebar` already receives `user`/`canViewReports` this way from `app/(app)/layout.tsx`).

**Bell UI is a plain-fetch client component, not React Query**, even though `QueryProvider` exists in this codebase. Checked directly: `QueryProvider` in `app/(app)/layout.tsx` wraps only `{children}` inside `<main>` — `SiteHeader` (and `AppSidebar`, which hosts `CommandSearch`) render outside it. `CommandSearch` (Phase 8) already established the precedent for header/sidebar-level client widgets in this codebase: plain `fetch` + `useState`, no React Query. The bell follows the same precedent rather than restructuring the provider tree for one component.

## 3. Notification event coverage — domain layer

Four call sites added, each using `createNotification(profileId, entityType, entityId, type, message)` exactly as the three existing call sites already do — no signature change to `notifications.ts`.

| idea.md §19 event | Call site | Target | `type` |
|---|---|---|---|
| new task assigned | `assignTask` (`lib/domain/tasks.ts`), and `createTask` when `input.assigneeId` is set | the (new) assignee, skipped if they're also the actor | `"task_assigned"` |
| asset assigned | `assignAsset` (`lib/domain/assets.ts`) | `targetEmployeeId`, skipped if they're also the actor | `"asset_assigned"` |
| comment added | `POST /api/tasks/[id]/comments`, `POST /api/requests/[id]/comments`, `POST /api/operations/[id]/comments` | per §2: `task.assigneeId` / `targetRequest.createdBy` / `operation.ownerId` — skipped when null, or equal to `profile.id` (don't notify yourself) | `"comment_added"` |
| workflow step completed | `advanceWorkflow` (`lib/domain/workflows.ts`), right after the current step is marked `completed` (before generating the next step) | `instance.relatedEmployeeId` — skipped if null | `"workflow_step_completed"` |

Already covered, unchanged:
- **approval required** — `requests.ts` (submit) and `workflows.ts` (`generateStepEntity`, approval-type step).
- **request status changed** / **request rejected** — `approvals.ts`'s `decideApproval` already notifies `request.createdBy` on every decision with type `"request_status_changed"`; "rejected" is a value of `decision`, not a separate code path, so it's already covered.

Not implemented (per §2): **task overdue**, **workflow blocked** — computed/presentational only, see §5.

Message text for each new call site follows the existing convention exactly (see `lib/domain/requests.ts:214`, `lib/domain/approvals.ts:130`): `"${actor.fullName} ..."` for actor-attributed events (assignment, comment), a plain factual sentence for system-driven ones (workflow step completion) — e.g. `"You were assigned to task "${task.title}""`, `"${profile.fullName} commented on "${task.title}""`, `"Step "${step.title}" completed"`.

## 4. Notifications — API and bell UI

**Domain layer addition** — `lib/domain/notifications.ts` gains two functions, both scoped to the notification's own `profileId` (a notification has no company-wide visibility; ownership is the only check needed, so no new `permissions.ts` capability function):

```ts
export async function markNotificationRead(profile: Profile, notificationId: string): Promise<Notification>;
export async function markAllNotificationsRead(profile: Profile): Promise<void>;
```

`markNotificationRead` loads the row, throws `NotFoundError` if missing, throws `ForbiddenError` if `row.profile_id !== profile.id` (same ownership-check shape as every other domain function in this codebase), then sets `read_at = now()`. `markAllNotificationsRead` is a single `update ... where profile_id = $1 and read_at is null` — no row-by-row loop.

**API routes**, following the exact pattern of `app/api/dashboard/personal/route.ts` (auth check → domain call → `toErrorResponse` on failure):
- `GET /api/notifications` — returns `{ notifications: Notification[], unreadCount: number }` for `getCurrentProfile()`.
- `PATCH /api/notifications/[id]/read` — no body; calls `markNotificationRead`.
- `POST /api/notifications/read-all` — no body; calls `markAllNotificationsRead`.

**`components/notification-bell.tsx`** (client component), rendered from `SiteHeader` (which becomes `async`, calling `getCurrentProfile()` the same way `app/(app)/layout.tsx` already does, and passing `profileId` down — not the full profile, since the bell only needs an id to build its channel name):
- Bell icon (`lucide-react`'s `Bell` — `lucide-react` is already a direct dependency, `package.json:26`) with a small numeric badge when `unreadCount > 0`, inside a shadcn `Popover` (or `DropdownMenu` — implementer's call at plan time; both are already installed) matching `NavUser`'s existing trigger-button styling.
- On mount: `fetch("/api/notifications")`, store `{ notifications, unreadCount }` in state.
- `useBroadcastListener(`profile:${profileId}:notifications`, refetch)` — the exact channel `broadcastToProfile` already writes to (`lib/realtime/broadcast.ts`); no new broadcast helper needed.
- Each row: message text, relative timestamp, click → `router.push` to `/{entityType}s/{entityId}`* + `PATCH /api/notifications/[id]/read` + optimistic local state update (avoids a second round-trip before navigating away).
- A "Mark all as read" action calls the `read-all` endpoint and clears `unreadCount` optimistically.

\* `entityType` values seen in existing `createNotification` calls are singular (`"request"`) — route mapping is `{ request: "/requests", task: "/tasks", asset: "/assets", operation: "/operations" }` (comment/assignment/workflow-step notifications only ever target these four types per §3's table).

## 5. Overdue / blocked — computed indicators

No new domain functions with side effects; both are pure derivations added where the relevant entity is already rendered.

- **Task overdue**: `components/tasks/task-list-view.tsx`'s row rendering (and the task detail page) gets a small "Overdue" badge when `dueDate` is in the past and `status` is not `completed`/`cancelled` — the same predicate `taskStatistics` already computes server-side for the reports page, reimplemented client-side as a small pure function (`isTaskOverdue(task)`) next to the component, since it's a presentational concern on already-fetched data, not a new query.
- **Workflow blocked**: `WorkflowStepper` (`components/workflows/workflow-stepper.tsx`) shows a "Blocked" indicator on the current `in_progress` step when `now() - step.createdAt > WORKFLOW_STEP_STALE_DAYS` (3 days, per §2). `getWorkflowProgress` already returns each step's `createdAt` (`WORKFLOW_INSTANCE_STEP_COLUMNS` includes it) — no change needed to `lib/domain/workflows.ts` itself, only to the stepper component consuming that data.

## 6. Realtime audit — detail-page live refresh

Three new components, each a direct copy of `components/tasks/task-realtime-refresh.tsx`'s shape (client component, `useBroadcastListener` + `router.refresh()`, rendered `null`), wired into their detail pages the same way `TaskRealtimeRefresh`/`RequestRealtimeRefresh`/`WorkflowRealtimeRefresh` already are:

| Component | Channel | Wired into |
|---|---|---|
| `OperationRealtimeRefresh` | `company:${companyId}:operations` | `app/(app)/operations/[id]/page.tsx` |
| `AssetRealtimeRefresh` | `company:${companyId}:assets` | `app/(app)/assets/[id]/page.tsx` |
| `EmployeeRealtimeRefresh` | `company:${companyId}:employees` | `app/(app)/employees/[id]/page.tsx` |

Channel names match each entity's existing list-view subscription exactly (`operation-list-view.tsx`/`asset-list-view.tsx`/`employee-list-view.tsx` already listen on these same three channels) — no new broadcast call sites needed; `assignAsset`'s existing `broadcastChange(profile.companyId, "assets", ...)` and equivalent operation/employee mutations already fire on this channel today, the detail pages just weren't listening.

## 7. Activity-log audit — workflow instance timeline

There is no shared `ActivityLog` component — each detail page independently calls `listActivity(entityType, entityId)` server-side (`lib/domain/activity.ts`) and inline-renders the result as a `<ul>` (confirmed in `app/(app)/tasks/[id]/page.tsx`: `listActivity("task", task.id)` fetched alongside comments/attachments via `Promise.all`, then mapped into `<li>`s under an "Activity" heading). `app/(app)/workflows/[id]/page.tsx` gets the same treatment: fetch `listActivity("workflow", progress.instance.id)` and render it with the same heading/list markup as the other detail pages, copied rather than extracted into a shared component — matching this codebase's existing per-page duplication of that markup rather than introducing a new abstraction for it now.

`logActivity` is already called against `entityType: "request"` for workflow-instance-completion (`lib/domain/workflows.ts:532`, "Workflow completed") — but never against `entityType: "workflow"` for anything, because nothing currently reads `activity_log` filtered to `"workflow"`. This phase adds:
- `advanceWorkflow` also calls `logActivity("workflow", instance.id, profile.id, ...)` at each step transition (step completed, next step started, or instance completed) — the request-side log entry (existing) stays as-is; this is an addition, not a replacement, since a workflow instance and its related request are two different detail pages that each want their own timeline.
- `startWorkflow` calls `logActivity("workflow", instance.id, profile.id, "Workflow started")`.

## 8. Testing

Following this repo's existing split (`test:unit` / `test:integration`):

**Integration** (extending `lib/domain/tasks.test.ts`, `lib/domain/assets.test.ts`, `lib/domain/workflows.test.ts`, plus a new `lib/domain/notifications.test.ts`):
- Each of the 4 new `createNotification` call sites: a real fixture scenario asserts the right row lands for the right profile, with the self-notification skip verified (actor assigns to themselves → no notification) and the null-target skip verified (comment on an unassigned task → no notification, no throw).
- `markNotificationRead`: happy path sets `read_at`; a different profile's notification → `ForbiddenError`; unknown id → `NotFoundError`.
- `markAllNotificationsRead`: multiple unread rows all get `read_at` set in one call; a read notification from another profile is untouched.
- `advanceWorkflow`'s new `logActivity("workflow", ...)` calls: assert an entry appears for `entityType: "workflow"` at each transition, independently of the existing request-side entries.

**Component**:
- `notification-bell.tsx`: renders unread badge from initial fetch, refetches on broadcast (mocking `useBroadcastListener` the same way `command-search.test.tsx` mocks `fetch`/`next/navigation`), mark-as-read updates local state and calls the right endpoint, mark-all clears the badge.
- `isTaskOverdue` (pure function): a small table-driven unit test — past due + open status → true; past due + completed → false; no due date → false.
- `WorkflowStepper`: existing test file gains a case for the "Blocked" indicator appearing when a fixture step's `createdAt` is older than `WORKFLOW_STEP_STALE_DAYS`, and not appearing for a fresh step.
- The three new `*RealtimeRefresh` components: same test shape as `task-realtime-refresh.test.tsx` (if one exists; if not, matching `TaskRealtimeRefresh`'s implementation this closely means the plan should check whether that component has a test at all before deciding these three need one — trivial glue code some of this codebase's other `*RealtimeRefresh` components may not test individually).

## 9. Out of scope

- Any push-based (i.e. `notifications`-row-producing) implementation of "task overdue" or "workflow blocked" — per §2, both are computed/presentational only. If real overdue *alerting* (e.g. a daily digest) is ever wanted, that's a new scheduled-job capability for this project and its own spec, not a Phase 9 add-on.
- Comment-added notifications for assets/employees — neither has a comments feature today; adding comments to either is out of scope for this phase (it would be its own small feature, not a notifications-polish item).
- A dedicated `/notifications` full-page view — the outline and idea.md §19 both describe a "bell," not an inbox page; the dropdown's ~20-item list is enough for this phase (matches Phase 8's own precedent of not building UI beyond what's asked).
- Notification preferences/muting, digest emails, or push notifications outside the in-app bell.
- Changing `notifications.type`'s existing string values (`"approval_required"`, `"request_status_changed"`) — only new values are added, alongside them.
