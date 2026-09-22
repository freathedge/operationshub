# Project Status

Last updated: 2026-09-22

**How to use this file:** one entry per phase (or per standalone piece of follow-up work), moved between columns as it progresses. Backlog → In Progress → Review → Finished. An item only moves to **Finished** once its branch is merged into `main` — an open PR belongs in **Review**, no matter how complete the code is. Keep entries short: one line of description, links to the relevant plan/spec, and the branch/PR if one exists. Whoever picks up work in this repo (human or agent) should update this file as part of that work, not as an afterthought.

---

## Backlog

Not started yet. See `docs/superpowers/plans/2026-08-26-remaining-phases-outline.md` for the full breakdown of each.

- **Phase 8 — Reports & Search**: operational metrics, global search.
- **Phase 9 — Realtime & Notifications Polish**: notification bell UI, audit pass on Realtime/activity-log/notification coverage.

Standalone follow-up work (not a numbered phase):

- **UI sweep — all screens on shadcn/ui**: the existing screens from Phases 2–6 still use raw `<select>` elements and hand-rolled layouts, and only six shadcn primitives are installed (badge, button, card, input, label, table). Pull in the missing primitives and rebuild those screens from shadcn blocks/primitives, per `CLAUDE.md` §UI. Gets its own spec, plan and branch after Phase 7.
- **Auth via Clerk (idea only, not decided)**: replace Supabase Auth with Clerk as the identity provider, keeping Supabase Postgres. Rationale, affected files and open questions: `docs/architecture.md` §5.

## In Progress

- **Phase 7 — Dashboard/Overview**: replaces the Foundation placeholder dashboard with the real one — personal section for everyone, company section for `operations_manager`/`admin` only — built from a shadcn/ui dashboard block. Pure aggregation, no new tables.

## Review

_(nothing right now)_

## Finished

- **Phase 6 — Operations**: higher-level grouping object linking tasks/requests/assets/employees to a larger initiative, with a company-wide-visible operation detail page showing linked-item lists and task-completion progress. Spec: `docs/superpowers/specs/2026-09-13-phase6-operations-design.md`. Plan: `docs/superpowers/plans/2026-09-13-phase6-operations.md`.
  - Full-branch review findings closed before merge: an entity's linked operation is now always shown (only attach/detach is gated), link/unlink writes activity on both sides, and the link picker, teardown, auth tests and `owner_id` handling were fixed.
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
