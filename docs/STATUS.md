# Project Status

Last updated: 2026-08-27

**How to use this file:** one entry per phase (or per standalone piece of follow-up work), moved between columns as it progresses. Backlog → In Progress → Review → Finished. An item only moves to **Finished** once its branch is merged into `main` — an open PR belongs in **Review**, no matter how complete the code is. Keep entries short: one line of description, links to the relevant plan/spec, and the branch/PR if one exists. Whoever picks up work in this repo (human or agent) should update this file as part of that work, not as an afterthought.

---

## Backlog

Not started yet. See `docs/superpowers/plans/2026-08-26-remaining-phases-outline.md` for the full breakdown of each.

- **Phase 3 — Requests & Approvals**: request lifecycle, approvals, notifications.
- **Phase 4 — Workflow Engine**: generic workflow template/instance runner; seeds Onboarding/Equipment/Maintenance workflows.
- **Phase 5 — Employees & Assets**: operational employee profiles, asset registry.
- **Phase 6 — Operations**: higher-level grouping over tasks/requests/assets/employees.
- **Phase 7 — Dashboard/Overview**: replaces the Foundation placeholder dashboard with the real one, built from a shadcn/ui dashboard block (see `docs/architecture.md` §3).
- **Phase 8 — Reports & Search**: operational metrics, global search.
- **Phase 9 — Realtime & Notifications Polish**: notification bell UI, audit pass on Realtime/activity-log/notification coverage.

## In Progress

_(nothing right now)_

## Review

- **Phase 2 — Tasks**: task CRUD, comments, activity log, attachments, first Realtime broadcast usage. Spec: `docs/superpowers/specs/2026-08-27-phase2-tasks-design.md`. Plan: `docs/superpowers/plans/2026-08-27-phase2-tasks.md`.
  - Branch `worktree-phase2-tasks-plan`, pushed; PR pending (open at https://github.com/freathedge/operationshub/pull/new/worktree-phase2-tasks-plan).
  - Deferred to Phase 3+ (not blockers, see PR description): `listTasks`/`canViewTask` visibility-logic duplication, short signed-download-URL TTL, `deleteTask` not cleaning up child comments/activity/attachments.

## Finished

- **Foundation phase** — Next.js 16 + hosted Supabase scaffold: schema (companies/departments/locations/profiles), Supabase Auth signup (with role picker) + login, session middleware, authenticated app shell, seed script for AlpenTech Industries. Plan: `docs/superpowers/plans/2026-08-26-foundation.md`. Spec: `docs/architecture.md`.
  - Includes follow-up UX added after the initial review: back links on `/login`/`/signup`, an `/auth/confirmed` email-confirmation page, and password confirmation + a strength meter on signup.
  - Merged to `main` via PR #1 (`bf345b4`), plus a follow-up fix (`nativeButton={false}` on the link-rendered CTA buttons) via PR #2 (`5589282`).
