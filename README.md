# Operations Hub

Operations Hub is an internal ops tool for a fictional company, AlpenTech
Industries: employee/asset/request/task management with real Clerk signup
(visitors pick which role to explore — Employee, Manager, Operations
Manager, IT, HR, or Admin) and seeded demo data. Built with Next.js (App
Router), Clerk (identity/session), and a hosted Supabase project (Postgres
only). See `docs/architecture.md` for the full spec and
`docs/superpowers/plans/` for the phase-by-phase implementation plans.

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
