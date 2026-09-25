# UI Sweep — Design

Date: 2026-09-25
Source: `docs/STATUS.md` backlog item "UI sweep — all screens on shadcn/ui"
Architecture: `docs/architecture.md`

---

## 1. Goal

Bring every remaining screen in `app/(app)/` up to the same shadcn/ui-based visual system the dashboard (Phase 7) and reports (Phase 8) pages already established, and finish the raw-HTML-control cleanup the original backlog entry named.

The backlog entry's own description is stale: the sidebar-shell and later phases already installed 18 shadcn primitives (`select`, `dialog`, `sheet`, `tabs`, `checkbox` via registry though currently unused, `dropdown-menu`, `command`, `skeleton`, etc.) and the dashboard/reports pages already use `Card`-based, container-query layouts. What's actually still inconsistent, found by reading the current code:

- **18 files** use a raw HTML `<select>` (27 occurrences) instead of the already-installed shadcn `Select`.
- **1 file** (`components/employees/employee-form.tsx`) uses a raw `<input type="checkbox">` instead of shadcn's `Checkbox`.
- **List pages** (tasks, requests, operations, employees, assets, approvals, workflows) render their filter toolbar + table directly on the page background in a bare `<div>` — no `Card`, no subtitle, inconsistent with the dashboard's card-heavy style.
- **Detail pages** (task/[id], request/[id], operation/[id], employee/[id], asset/[id], workflow instance detail) use hand-rolled `<section><h2>` blocks for Activity/Comments/Attachments instead of `Card`.
- **Form pages** (new/edit task, request, operation, employee, asset) render the form directly on the page background, no `Card`.
- **The settings page** shows plain key/value text rows with no `Card` structure at all.
- **Every page** hand-copies the same `<h1 className="text-2xl font-semibold mb-4 mt-2">Title</h1>` pattern.

This is architectural because it restructures the layout of every screen in the app and introduces a new shared component (`PageHeader`) that every page adopts — not a single bounded flow.

## 2. Decisions taken during brainstorming

**Full scope.** Covers list pages, detail pages, form pages, and the settings page — not just the component swap.

**New shared component: `PageHeader`** (`components/page-header.tsx`). Props: `{ title: string; subtitle?: string; action?: React.ReactNode }`. Renders the title (`text-2xl font-semibold`), an optional muted subtitle line, and an optional right-aligned action slot (e.g. a list page's "New X" button). Replaces the hand-copied `<h1>` pattern on every page. `BackLink` stays where it is today, above `PageHeader`, unchanged.

**Select swap.** Every raw `<select>`/`<option>` becomes shadcn's `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem`. Radix `Select` cannot use an empty-string item value, so placeholder options like "All statuses"/"All priorities" get a sentinel value (`"all"`) that the surrounding state/query logic maps back to `""`/`undefined` — filtering behavior does not change.

**Checkbox swap.** `employee-form.tsx`'s raw checkbox becomes shadcn's `Checkbox`, wired through `Controller` (react-hook-form's `register()` does not work directly against a non-native input).

**List pages get a `Card`.** `PageHeader` (title + "New X" as `action`) sits outside the `Card`. A single `Card` wraps the filter toolbar (`CardHeader`) and table (`CardContent`). The existing "Showing a filtered view. Clear filter" note (shown when a page is reached via a dashboard-card link with `assigneeId`/`departmentId` params) stays above the `Card` — it's page-level context, not table content.

**Detail pages get `Card`-grouped sections.** `PageHeader` shows the entity title, with any inline status badge (e.g. Overdue) kept next to it as it is today. Status/operation controls (`TaskStatusControl`, `TaskOperationControl`, etc.) stay directly under the header, **not** wrapped in a `Card` — they're actions, not display sections. Each display section below that (Activity, Comments, Attachments — wherever a page has them) becomes its own `Card` with `CardHeader`/`CardTitle`/`CardContent`, replacing the raw `<section><h2>` blocks.

**Form pages get a `Card`.** `PageHeader` (title only, no action) followed by a single `Card` (`CardContent`) wrapping the existing form. No change to the forms' internal field layout or validation — purely the wrapper.

**Settings page becomes two `Card`s.** A "Profile" `Card` (`CardHeader` title "Profile", `CardContent` with the existing read-only Name/Role/Email rows) and an "Appearance" `Card` (`CardHeader` title "Appearance", `CardContent` with the existing `ThemeToggle`). `PageHeader` replaces the bare `<h1>`.

**Spacing.** Standardize on `gap-6` for top-level page flow (header → content) and `gap-4` inside multi-`Card` sections, matching the dashboard's existing convention — replacing today's mixed `mb-4 mt-2` / bare `flex flex-col gap-6` usage.

**Implementation sequencing — one task per domain.** The select-swap and the `Card`-wrapping touch the same files (e.g. `task-list-view.tsx` needs both), so they're done together per domain rather than as two separate passes:

1. Build `PageHeader`.
2. Tasks domain (list/detail/form + select swap).
3. Requests domain (list/detail/form + select swap, incl. `request-reassign-control`, `request-operation-control`).
4. Operations domain (list/detail/form + select swap, incl. `operation-link-picker`).
5. Employees domain (list/detail/form + select + checkbox swap).
6. Assets domain (list/detail/form + select swap, incl. `asset-assign-control`, `asset-operation-control`).
7. Approvals domain (list only — no detail/form page exists).
8. Workflows domain (list + instance detail only — no create form exists).
9. Settings page.
10. Whole-branch review + human click-through.

**Testing.** The 8 files with existing tests that drive the native `<select>` via `fireEvent.change`/`selectOptions` (`task-operation-control.test.tsx`, `complete-signup-form.test.tsx`, `operation-link-picker.test.tsx`, `request-reassign-control.test.tsx`, `request-operation-control.test.tsx`, `asset-assign-control.test.tsx`, `asset-operation-control.test.tsx`, `employee-operation-control.test.tsx`) get their assertions rewritten to drive the Radix combobox (open the trigger, click/keyboard-select the option) in the same task as their component, not deferred to a cleanup pass.

## 3. File structure

| File | Change |
|---|---|
| `components/page-header.tsx` | New — shared header component per §2. |
| `components/tasks/task-list-view.tsx`, `task-operation-control.tsx` | Modify — select swap, `Card` wrap, `PageHeader` usage on the page. |
| `app/(app)/tasks/page.tsx`, `app/(app)/tasks/[id]/page.tsx`, `app/(app)/tasks/new/page.tsx` | Modify — `PageHeader`, `Card` layout per §2. |
| `components/requests/request-list-view.tsx`, `request-operation-control.tsx`, `request-reassign-control.tsx`, `request-form.tsx` | Modify — select swap, `Card` wrap. |
| `app/(app)/requests/page.tsx`, `app/(app)/requests/[id]/page.tsx`, request new/edit pages | Modify — `PageHeader`, `Card` layout. |
| `components/operations/operation-list-view.tsx`, `operation-form.tsx`, `operation-link-picker.tsx` | Modify — select swap, `Card` wrap. |
| `app/(app)/operations/page.tsx`, `app/(app)/operations/[id]/page.tsx`, operation new/edit pages | Modify — `PageHeader`, `Card` layout. |
| `components/employees/employee-list-view.tsx`, `employee-form.tsx`, `employee-operation-control.tsx` | Modify — select swap, checkbox swap, `Card` wrap. |
| `app/(app)/employees/page.tsx`, `app/(app)/employees/[id]/page.tsx`, employee new/edit pages | Modify — `PageHeader`, `Card` layout. |
| `components/assets/asset-list-view.tsx`, `asset-form.tsx`, `asset-operation-control.tsx`, `asset-assign-control.tsx` | Modify — select swap, `Card` wrap. |
| `app/(app)/assets/page.tsx`, `app/(app)/assets/[id]/page.tsx`, asset new/edit pages | Modify — `PageHeader`, `Card` layout. |
| `components/approvals/approval-list-view.tsx` | Modify — select swap, `Card` wrap. |
| `app/(app)/approvals/page.tsx` | Modify — `PageHeader`, `Card` layout. |
| `components/workflows/workflow-instance-list-view.tsx` | Modify — select swap, `Card` wrap. |
| `app/(app)/workflows/page.tsx`, `app/(app)/workflows/[id]/page.tsx` | Modify — `PageHeader`, `Card` layout. |
| `app/(app)/settings/page.tsx` | Modify — two-`Card` layout per §2. |
| `components/auth/complete-signup-form.tsx` | Modify — select swap only (not an `app/(app)/` page; out of the layout-pass scope, in scope for the component swap). |
| The 8 test files named in §2 | Modify — Radix-combobox-driven assertions. |

Exact detail/new/edit route file paths are confirmed against the actual `app/(app)/<domain>/` tree at implementation time (some domains may not have a separate `/edit` route — e.g. edits may happen inline on the detail page); the plan should verify each domain's real route set rather than assume symmetry with tasks.

## 4. Testing approach

Following this repo's existing conventions (vitest + `@testing-library/react`):

- Component tests for `PageHeader` (renders title/subtitle/action correctly, omits subtitle/action when not passed).
- Existing list/detail/form component tests keep their non-select assertions unchanged; only the select-driving assertions in the 8 named test files change interaction style.
- No new integration tests — this is presentation-layer restructuring, not a data/permissions change. Existing integration tests are unaffected since they exercise domain functions and API routes, not component markup.
- `next build` and `tsc --noEmit` must stay clean, matching every prior phase's verification bar.
- No manual browser click-through is possible in this environment (same limitation noted in every prior phase) — flag for a human pass given this touches every screen's visual layout.

## 5. Out of scope

- Any change to permissions, data fetching, or domain logic — this is presentation-only.
- Redesigning form field layouts internally (only the outer `Card` wrapper is added).
- Adding new settings sections beyond Profile/Appearance.
- The dashboard and reports pages — already shadcn-block-based, not touched by this pass.
- `PageHeader`/`Card` layout restructuring on marketing/auth pages (`/`, `/login`, `/signup`) — not part of `app/(app)/`, out of scope for this sweep. The select swap in `complete-signup-form.tsx` (`app/(marketing)/signup/complete/`) is still in scope, since the component-swap cleanup applies to all 18 files with a raw `<select>` regardless of route group.
