# Admin Dashboard Statistics — Design

Date: 2026-09-29
Source: `docs/STATUS.md` backlog item "Admin dashboard statistics"
Architecture: `docs/architecture.md`

---

## 1. Goal

Give `operations_manager`/`admin` users a genuine trend view — something the app has never had. Today's dashboard company section and `/reports` page are both entirely snapshot data (current totals, cross-sectional groupings, all-time averages/rates) — nothing shows how activity moves week to week. This adds one new time-series metric, **completed tasks and new requests per week**, in two places: a compact widget on the dashboard (fast overview, no interaction) and a fuller version on `/reports` (more weeks of history, alongside the existing 4 sections).

This is architectural: it introduces the first time-series chart in the codebase (only bar charts exist today), a new shared aggregation function consumed by two different pages/fetch paths, and — because there is currently no demo data with historical spread to chart — a new synthetic-data seeding mechanism that writes directly to the live hosted Supabase project.

## 2. Decisions taken during brainstorming

**Time-series, not more snapshots.** The existing `/reports` page (`requestsByDepartment`, `avgRequestCompletionTime`, `taskStatistics`, `workflowCompletionRate` — all in `lib/domain/reports.ts`) and the dashboard's `CompanyOverview` are both current-state-only. This feature is explicitly the "over time" idea named in the backlog line, not an extension of the existing snapshot metrics.

**Two metrics, one chart, reused in two places.** Completed tasks per week (`tasks.completed_at`) and new requests per week (`requests.created_at`) — both already-existing, already-populated columns; no new schema needed for the metric itself. Rejected charting only one metric (completed tasks alone): tracking both "work finished" and "work arriving" in the same view is far more useful to an admin for almost no extra cost (same week-bucketing logic, one more query).

**Weekly buckets, not daily.** At this app's scale (an internal ops tool, not a high-volume ticketing system), daily buckets would be visually noisy. Weeks start Monday.

**Placement: both, sharing one aggregation function and one chart component.**
- Dashboard company section: compact widget, **fixed 6-week window**, no controls — it's an at-a-glance overview, not an analysis tool.
- `/reports`: fuller version, **fixed 12-week window**, also no range picker for this first version (YAGNI — a picker can be added later if anyone asks for it).
- Both are served by one new domain function, `getTaskRequestTrends(companyId, weeks)`, called with a different `weeks` value in each place. One new presentational chart component takes the resulting data as a prop and is rendered in both locations — no duplicated chart code.

**No new API route for the dashboard.** The dashboard's company section already fetches everything through `GET /api/dashboard/company` → `getCompanyOverview()` (`lib/domain/dashboard.ts`), consumed client-side via TanStack Query in `components/dashboard/dashboard-view.tsx`. `CompanyOverview` gains a `taskRequestTrends` field, populated inside `getCompanyOverview` by calling `getTaskRequestTrends(companyId, 6)` — it rides the existing fetch, cache, and realtime-invalidation plumbing for free. `/reports` fetches server-side directly, matching its three sibling metrics, calling `getTaskRequestTrends(companyId, 12)`.

**Zero-filled buckets, no partial-week weirdness.** A week with no completed tasks or no new requests shows `0`, not a gap in the line. The current, still-in-progress week is included and will visibly be a partial count — no special-casing it; an admin looking at "this week so far" understands that.

**Demo data is required and is its own piece of work, not an afterthought.** There is currently no seed path for tasks/requests at all (`lib/domain/seed.ts` only creates company/departments/locations/workflow-templates) and the one existing demo company ("AlpenTech Industries," on the live hosted project) has exactly 3 profiles — two are the human operator's own test accounts, one a stray manual signup — with no department assignments and no historical activity. Without new data, both new charts would render as a flat, uninteresting line. A new seed routine creates the historical tasks/requests needed to make the charts demonstrate anything.

**Demo data does not create real Clerk-linked employees.** Creating "real" employees the proper way (`createEmployee`) sends an actual Clerk invitation email — wrong for synthetic data pointed at fake addresses. Instead, the seed routine creates a small number of **ghost profiles**: `createProfile()` called directly with `authUserId: null` and no `invitedEmail`, spread across a few of AlpenTech's existing 8 departments, purely to serve as `creator_id`/`assignee_id` on synthetic tasks/requests. They're marked identifiably (`employee_number` set to a `DEMO-##` pattern) so they — and everything assigned to them — can be found and removed later without guessing. They never appear as "pending invites" to an admin using the just-shipped account-management UI in any way that suggests a real invitation is outstanding; `invited_email` being `null` means the admin-user-management UI already renders no email at all and "Resend invite" already correctly errors ("no invited email on file") rather than doing anything.

**Demo data targets the live hosted project, with explicit approval before running.** This project has no local Supabase dev stack (established in every prior phase's plan). Same precedent as the admin-user-management migration: the seed script is written, reviewed, and then run only after the human operator explicitly confirms — not executed unattended.

**Demo data content is an implementation-time choice, not fixed here.** Roughly 14 weeks of history (a bit more than the 12-week `/reports` window, so the oldest visible week isn't an artificial cliff), ~3–8 completed tasks and ~2–5 new requests per week with some randomness (not a metronome), assigned across the ghost profiles and existing departments. Exact task/request titles, status distribution for the requests (they don't need to be `completed` — only `created_at` matters for this metric), and the precise random ranges are for the implementer to fill in sensibly; this spec fixes the shape (weekly, ~14 weeks, small randomized counts, identifiable ghost data), not every literal value.

## 3. File structure

| File | Change |
|---|---|
| `lib/domain/reports.ts` | Modify — add `getTaskRequestTrends(companyId: string, weeks: number): Promise<WeeklyTrend[]>`, where `WeeklyTrend = { weekStart: string; completedTasks: number; newRequests: number }`. Two scoped queries (`tasks.completed_at`, `requests.created_at`, both `>= ` a computed cutoff, both already `company_id`-scoped columns), bucketed into Monday-start weeks in application code, zero-filled for empty weeks. |
| `lib/domain/dashboard.ts` | Modify — `CompanyOverview` gains `taskRequestTrends: WeeklyTrend[]`; `getCompanyOverview` calls `getTaskRequestTrends(profile.companyId, 6)` alongside its existing parallel queries. |
| `app/(app)/reports/page.tsx` | Modify — one more parallel fetch (`getTaskRequestTrends(profile.companyId, 12)`), one more section in the grid, alongside the existing 4. |
| `components/reports/task-request-trend-chart.tsx` | New — `"use client"`, recharts `LineChart` (two `Line`s: completed tasks, new requests) in the existing `ChartContainer`/`ChartConfig` shadcn pattern (matching `requests-by-department-chart.tsx`/`avg-completion-time-chart.tsx`'s established shape). Takes `data: WeeklyTrend[]` as a prop — no data-fetching of its own — so it can be dropped into both the dashboard widget and `/reports` unchanged. |
| `components/dashboard/company-section.tsx` | Modify — render `TaskRequestTrendChart` (compact sizing) using `overview.taskRequestTrends`, alongside the existing totals/attention/operations/department cards. |
| `lib/domain/seed.ts` or a new `scripts/seed-demo-activity.ts` | New — seeds the ~5–6 `DEMO-##`-marked ghost profiles (idempotent: skip creation if profiles with that marker already exist) and the ~14 weeks of backdated tasks/requests. Implementer decides whether this lives as an exported function alongside `seedFoundationData`/`seedWorkflowTemplates` (consistent with the existing pattern) or as a standalone script — either way, it must be safely re-runnable without duplicating data. |
| Tests | New/modified alongside the domain and component changes above, following this repo's existing conventions — `getTaskRequestTrends` gets a gated integration test (real DB, like `reports.test.ts`'s siblings) covering bucketing and zero-fill; the chart component gets a render test; the demo-seed routine is exercised at most by a smoke-level check (per this repo's existing `scripts/seed.smoke.test.ts` pattern), not a full integration test, since it's a one-off operational script, not app behavior. |

## 4. Testing approach

- `lib/domain/reports.test.ts` (or wherever `getTaskRequestTrends` lands): bucketing correctness (a task completed on a Wednesday lands in that Monday-start week), zero-fill for weeks with no activity, correct `weeks`-length output for both the 6- and 12-week callers, company-scoping (a task/request from a different company never counts).
- `lib/domain/dashboard.test.ts`: `getCompanyOverview` includes `taskRequestTrends` with the expected 6-week length.
- `components/reports/task-request-trend-chart.test.tsx`: renders both lines from a fixed data fixture.
- `app/(app)/reports/page.test.tsx`: the new section's data is fetched and passed through, matching the existing 4 sections' test pattern.
- No test asserts anything about the demo-seed script's actual output data (random counts) — only that it runs without error and is idempotent, if it gets an automated check at all.

## 5. Out of scope

- A range picker / configurable time window for either chart (fixed 6 and 12 weeks, per §2).
- Daily granularity.
- Any other new time-series metric beyond completed tasks + new requests (e.g. no "approvals over time," "asset changes over time" — can be proposed as its own follow-up if wanted later).
- Backfilling department assignments or richer data onto the 3 existing real/test AlpenTech profiles — the seed routine adds new ghost profiles, it does not touch existing ones.
- Any change to the existing 4 `/reports` sections or the rest of the dashboard company section.
- Removing/cleaning up the demo data automatically — the `DEMO-##` marker makes it identifiable for a manual cleanup later if ever wanted, but no automatic teardown is built.
