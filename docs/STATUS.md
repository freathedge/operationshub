# Project Status

Last updated: 2026-09-22

**How to use this file:** one entry per phase (or per standalone piece of follow-up work), moved between columns as it progresses. Backlog → In Progress → Review → Finished. An item only moves to **Finished** once its branch is merged into `main` — an open PR belongs in **Review**, no matter how complete the code is. Keep entries short: one line of description, links to the relevant plan/spec, and the branch/PR if one exists. Whoever picks up work in this repo (human or agent) should update this file as part of that work, not as an afterthought.

---

## Backlog

Not started yet. See `docs/superpowers/plans/2026-08-26-remaining-phases-outline.md` for the full breakdown of each.

- **Phase 7 — Dashboard/Overview**: replaces the Foundation placeholder dashboard with the real one, built from a shadcn/ui dashboard block (see `docs/architecture.md` §3).
- **Phase 8 — Reports & Search**: operational metrics, global search.
- **Phase 9 — Realtime & Notifications Polish**: notification bell UI, audit pass on Realtime/activity-log/notification coverage.

## In Progress

_(nothing right now)_

## Review

_(nothing right now)_

## Finished

- **Phase 6 — Operations**: higher-level grouping object linking tasks/requests/assets/employees to a larger initiative, with a company-wide-visible operation detail page showing linked-item lists and task-completion progress. Spec: `docs/superpowers/specs/2026-09-13-phase6-operations-design.md`. Plan: `docs/superpowers/plans/2026-09-13-phase6-operations.md`.
  - Full-branch review caught three places where the plan had quietly diverged from the spec, none of which a per-task review could see: the detail page had no edit control, so operations were write-once and `completed`/`cancelled` were unreachable while `PATCH /api/operations/[id]` sat unused; the entity-side operation display was gated behind an elevated-role check, hiding it from regular employees and contradicting the spec's company-wide-visibility pillar; and link/unlink logged activity only on the operation, never on the entity. All three fixed before merge.
  - Also fixed before merge: `createOperation`/`updateOperation` accepted a `departmentId` from any company. The plan validated `ownerId` but not `departmentId`, and with RLS disabled the domain layer is the only boundary.
  - Includes one commit outside the plan's scope (`9343d70`, test-only): the `completeAssetAssignmentTask` and `findWorkflowStepByTaskId` teardowns from Phase 5 never deleted `tasks`/`workflow_instance_steps`/`workflow_templates` and checked no `error` field. Since supabase-js returns `{ error }` rather than throwing, those deletes failed silently and left orphans that broke every integration run after the first.
  - Deferred (not blockers): the same missing cross-company `department_id` validation still exists in `lib/domain/profiles.ts` (:139, :170), `requests.ts:84`, `tasks.ts:95` and `assets.ts:106` — Phase 2/3/5 code, **security-relevant and worth its own ticket**; API field-level validation detail is discarded in ~15 form components across five phases (`typeof body.error === "string"` against an object payload — one codebase-wide fix, not 15 patches); `activity_log` rows accumulate unbounded across integration test runs; the detail page renders progress as a text percentage rather than the progress bar the spec asks for (no `Progress` primitive installed yet); `lib/domain/operations.ts` is the largest domain file at ~400 lines and link/unlink would extract cleanly into `operations-links.ts`.
  - Merged to `main` via PR #8 (`149968a`).

- **Phase 5 — Employees & Assets**: operational employee profiles, asset registry; completing the Equipment workflow's final task now creates and assigns a real asset; HR/admin can invite a new employee, which starts the Employee Onboarding workflow. Spec: `docs/superpowers/specs/2026-09-03-phase5-employees-assets-design.md`. Plan: `docs/superpowers/plans/2026-09-03-phase5-employees-assets.md`.
  - Full-branch code review found one Important gap (`canAssignAsset`/`canChangeAssetStatus` missing company-scoping) and one Minor gap (task-detail asset form reachable before `in_progress`) — both fixed before merge.
  - Deferred (not blockers): `createEmployee` invites the auth user before creating the profile, so a later `createProfile` failure (e.g. duplicate `employee_number`) leaves an orphaned, profile-less auth user; `AssetStatusControl`/`changeAssetStatus` allow any status → any status with no state machine, unlike tasks/requests (accepted as YAGNI in the design spec).
  - Supabase Auth's SMTP was custom-configured against a verified Resend sending domain after merge, resolving the invite-email limitation noted during review; `lib/domain/employees.test.ts`'s two invite tests were updated to use `@mailinator.com` (real MX) instead of `@example.com` (no MX, hard-bounces regardless of sender config).
  - Merged to `main` via PR #6 (`956284c`).

- **Phase 4 — Workflow Engine**: generic workflow template/instance runner; auto-starts Equipment/Maintenance workflows on request approval, seeds Employee Onboarding (not yet startable — needs Phase 5). Spec: `docs/superpowers/specs/2026-08-28-phase4-workflow-engine-design.md`. Plan: `docs/superpowers/plans/2026-08-28-phase4-workflow-engine.md`.
  - Deferred to Phase 5+ (not blockers): cancelling a workflow-generated task strands its instance (no terminate/skip handling); an approving manager can lose request-detail visibility once a second (workflow) approval lands on the same request; no end-to-end test exercises a mixed task→approval→task template; `advanceWorkflow`'s multi-write sequence is non-transactional (matches the rest of the codebase's existing pattern).
  - Merged to `main` via PR #5 (`5289d2d`).

- **Phase 3 — Requests & Approvals**: request lifecycle, approvals, notifications. Builds on `tasks` (via `related_request_id`), the `comments`/`activity_log` generic modules, the permissions pattern, and the broadcast pattern from Phase 2. Spec: `docs/superpowers/specs/2026-08-27-phase3-requests-design.md`. Plan: `docs/superpowers/plans/2026-08-27-phase3-requests.md`.
  - Merged to `main` via PR #4 (`9925f16`).

- **Phase 2 — Tasks**: task CRUD, comments, activity log, attachments, first Realtime broadcast usage. Spec: `docs/superpowers/specs/2026-08-27-phase2-tasks-design.md`. Plan: `docs/superpowers/plans/2026-08-27-phase2-tasks.md`.
  - Deferred to Phase 3+ (not blockers): `listTasks`/`canViewTask` visibility-logic duplication, short signed-download-URL TTL, `deleteTask` not cleaning up child comments/activity/attachments.
  - Merged to `main` via PR #3 (`7df922a`).

- **Foundation phase** — Next.js 16 + hosted Supabase scaffold: schema (companies/departments/locations/profiles), Supabase Auth signup (with role picker) + login, session middleware, authenticated app shell, seed script for AlpenTech Industries. Plan: `docs/superpowers/plans/2026-08-26-foundation.md`. Spec: `docs/architecture.md`.
  - Includes follow-up UX added after the initial review: back links on `/login`/`/signup`, an `/auth/confirmed` email-confirmation page, and password confirmation + a strength meter on signup.
  - Merged to `main` via PR #1 (`bf345b4`), plus a follow-up fix (`nativeButton={false}` on the link-rendered CTA buttons) via PR #2 (`5589282`).
