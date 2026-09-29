# Operations Hub

Operations Hub is an internal operations platform for a fictional
mid-sized industrial company, **AlpenTech Industries** (~200 employees, 3
locations, 8 departments). It brings the scattered internal processes a
growing company usually runs over email, chat, and spreadsheets — "I need
a new laptop", "who approves this purchase", "is onboarding done for the
new hire" — into one structured system: **request → approval → tasks →
completion**, fully traceable, with a clear owner and next step at every
stage.

It's a portfolio/demo project, not a product meant to onboard real
companies: a single fictional tenant, seeded with realistic demo data, and
open signup where every visitor picks which role they want to explore
(Employee, Manager, Operations Manager, IT, HR, or Admin) instead of
logging into a fixed demo account. See `docs/idea.md` for the full product
concept and `docs/architecture.md` for the technical design this app
implements.

## What it does

Six connected modules, plus a workflow engine that ties them together:

- **Requests** — employees submit internal requests (equipment, software,
  access, maintenance, purchase, HR, general, other) without needing to
  know which department handles them. A request moves through
  `Draft → Submitted → Under Review → Approved/Rejected → In Progress →
  Completed`, gathering **approvals** along the way (manager, IT, finance,
  procurement, HR — each with its own pending/approved/rejected state and
  optional comment).
- **Tasks** — the unit of actual work. A task has a title, description,
  status (`Todo → In Progress → Blocked → Completed`, or `Cancelled`),
  priority (Low/Medium/High/Critical), assignee, due date, comments,
  attachments, and can be linked to the request, workflow, employee,
  asset, or operation it belongs to. Tasks are created manually or
  generated automatically by a workflow step.
- **Workflows** — generic, repeatable multi-step processes (e.g. Employee
  Onboarding, Equipment Request, Maintenance) that a **workflow template**
  defines and a **workflow instance** runs: each step automatically
  generates a task or an approval, and completing it advances the
  instance to the next step, with a visible overall progress indicator.
- **Employees** — operational profiles (position, department, location,
  manager, status) showing each person's open tasks, requests, active
  workflows, and assigned assets at a glance. Not an HR/payroll system —
  just the operational context. HR/admin can invite a new employee, which
  kicks off the Employee Onboarding workflow automatically.
- **Assets** — the company's equipment registry (laptops, monitors,
  phones, vehicles, production/office equipment), each with a status
  (`Available / Assigned / Maintenance / Retired / Lost`), an assignee,
  and its own activity history. Completing an Equipment Request's final
  task creates and assigns the real asset.
- **Operations** — a higher-level grouping for larger initiatives (e.g.
  "Office Relocation — Vienna") that link together multiple tasks,
  requests, assets, and employees under one status/priority/timeline, for
  a view above individual tasks.

Cutting across all of them:

- **Dashboard (`/dashboard`)** — the landing page after login. A personal
  section for every role (My Tasks, Pending Approvals, Open Requests,
  Active Workflows, Recent Activity, Upcoming deadlines), plus a
  company-wide section for Operations Manager/Admin (totals, items
  needing attention, active operations with progress, department
  activity). Every card links through to the underlying filtered list.
- **Reports (`/reports`, Operations Manager/Admin only)** — charts on
  operational performance: task/request volume and status, average
  request completion time by category, requests by department, and
  similar aggregate metrics — to spot bottlenecks, not to be a full BI
  tool.
- **Activity history** — every request, task, workflow, employee, asset,
  and operation has an audit-friendly timeline of what happened and when.
- **Notifications** — an in-app bell with unread count and mark-as-read,
  fed live (no polling) for events like a new task assignment, an
  approval becoming required, a request status change, a workflow step
  completing or blocking, or a comment being added.
- **Global search (`⌘K` / `Ctrl+K`)** — searches across tasks, requests,
  assets, employees, and operations from anywhere in the app, tagging
  each result by type.
- **Settings (`/settings`)** — currently a read-only view of the signed-in
  user's profile (name, role, email) and a light/dark theme toggle;
  self-service editing of account details is a known backlog item (see
  `docs/STATUS.md`).

### Roles

Six roles, each layering on more capability rather than exposing every
feature to everyone (`lib/domain/permissions.ts` is the single source of
truth): **Employee** (own tasks/requests, participate in workflows) →
**Manager** (team tasks, approve requests, team visibility) →
**Operations Manager** (manage operations/workflows company-wide, assign
tasks, reports access) and, in parallel, **IT** (IT requests/tasks/assets,
onboarding participation) and **HR** (employee records, initiate
onboarding, HR requests/workflows) → **Admin** (everything, plus
platform/user/department configuration).

### Pages at a glance

| Route | Purpose |
|---|---|
| `/` | Public landing page |
| `/signup`, `/signup/complete` | Clerk sign-up, then role picker to create the demo profile |
| `/login` | Clerk sign-in |
| `/dashboard` | Personal + (for elevated roles) company overview |
| `/tasks`, `/tasks/new`, `/tasks/[id]` | Task list, creation, detail |
| `/requests`, `/requests/new`, `/requests/[id]` | Request list, creation, detail (with approvals) |
| `/approvals` | Pending/all approvals list, scoped by role |
| `/workflows`, `/workflows/[id]` | Workflow instance list and detail (step progress) |
| `/employees`, `/employees/new`, `/employees/[id]` | Employee directory, invite, profile |
| `/assets`, `/assets/new`, `/assets/[id]` | Asset registry, creation, detail |
| `/operations`, `/operations/new`, `/operations/[id]` | Operations list, creation, detail (linked items) |
| `/reports` | Operational charts (Operations Manager/Admin) |
| `/settings` | Profile view + theme toggle |

## Tech stack

| Area | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript (strict) |
| Auth | [Clerk](https://clerk.com) — sign-in/sign-up UI, sessions, invitations |
| Database | Supabase Postgres (service-role access only; RLS disabled, REST API is the sole authorization boundary) |
| Storage | Supabase Storage — task/request file attachments via signed URLs |
| Realtime | Supabase Realtime — broadcast-only "something changed" signals that trigger a refetch, never a second data path |
| API layer | REST via Next.js Route Handlers, validated with Zod |
| Data fetching | React Query (TanStack Query) |
| UI | shadcn/ui + Tailwind, built from shadcn's pre-made blocks where one fits |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Deployment | Vercel |
| DB migrations | Supabase CLI migrations |

Full architecture rationale (data model, RBAC design, realtime pattern,
project structure): `docs/architecture.md`. Current build status by phase:
`docs/STATUS.md`.

## Prerequisites

- Node.js v22+
- pnpm (v10.x) — `corepack enable` will pick up the version pinned in
  `package.json`'s `packageManager` field.
- Access to the project's hosted Supabase instance (no local Docker/CLI dev
  stack is used — all environments, including tests, talk to the same
  hosted project via the credentials below).

## Environment variables

Copy `.env.local.example` to `.env.local` and fill in the six values:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SIGNING_SECRET=
```

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — used by the
  browser client (`lib/supabase/browser.ts`) for Realtime pub/sub
  subscriptions and Storage signed-URL uploads. Identity/session is handled
  entirely by Clerk, not Supabase Auth. Safe to expose to the browser.
- `SUPABASE_SERVICE_ROLE_KEY` — used **server-side only** by the admin
  client (`lib/supabase/admin.ts`, guarded by `import "server-only"`) that
  the domain layer (`lib/domain/**`) uses for all Postgres table access.
  Required to run `pnpm seed` and the integration tests (see below). Never
  commit this value or ship it to the browser.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk's publishable key, used by
  `<ClerkProvider>` and Clerk's `<SignIn>`/`<SignUp>` components in the
  browser. Safe to expose to the browser.
- `CLERK_SECRET_KEY` — used **server-side only** by `clerkMiddleware()`
  (`proxy.ts`) and every `auth()`/`currentUser()`/`clerkClient()` call.
  Never commit this value or ship it to the browser.
- `CLERK_WEBHOOK_SIGNING_SECRET` — used **server-side only** by
  `app/api/webhooks/clerk/route.ts` to verify incoming webhook signatures
  (via `verifyWebhook()`). Never commit this value or ship it to the
  browser.

**Required deploy-time step — Clerk webhook:** `POST /api/webhooks/clerk`
must be registered as a webhook endpoint in the Clerk Dashboard, subscribed
to the `user.created` event, for every origin the app is reachable from.
This is dashboard-only configuration, not part of this repo. Copy that
endpoint's Signing Secret into `CLERK_WEBHOOK_SIGNING_SECRET`. Without this,
admin-invited employees who accept their invite never get their pending
`profiles` row linked to their Clerk user id — they stay unable to sign in
to an existing profile.

## Development

```bash
pnpm install
pnpm seed   # see below — run once against a fresh project before first use
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Seeding

```bash
pnpm seed
```

Populates the hosted Supabase project with AlpenTech Industries and its
departments/locations (`lib/domain/seed.ts`). Run it once against a fresh
project, before the first signup — `POST /api/auth/complete-signup` looks
up this seeded company via `getDefaultCompany()` and fails until it exists.
It's idempotent (safe to run again; it upserts on the company's slug and
department/location names).

The script is run as `tsx --conditions=react-server scripts/seed.ts`. The
`--conditions=react-server` flag is required: `lib/supabase/admin.ts` starts
with `import "server-only"`, which only resolves to its no-op build under
the `react-server` export condition (the one Next's RSC bundler sets).
Plain `tsx`/Node doesn't set that condition by default, so without the flag
the import throws before any seed logic runs.

## Testing

```bash
pnpm test              # everything
pnpm test:unit         # no Supabase credentials required
pnpm test:integration  # hits the live Supabase project
```

`lib/domain/profiles.test.ts`, `lib/domain/seed.test.ts`, and
`scripts/seed.smoke.test.ts` are integration tests: they exercise real
behavior against the hosted Supabase project using
`SUPABASE_SERVICE_ROLE_KEY`, creating and cleaning up real rows (and, for
`profiles.test.ts`, real `auth.users`). They're guarded with
`describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)` and skip cleanly
if that key isn't set — `pnpm test:unit` excludes them explicitly so the
rest of the suite runs without live credentials. There is no CI workflow
file yet; running `pnpm test` (or the split scripts) locally before pushing
is the current verification step.

## Build

```bash
pnpm build
pnpm start
```

## Lint

```bash
pnpm lint
```
