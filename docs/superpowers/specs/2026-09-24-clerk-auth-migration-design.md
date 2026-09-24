# Clerk Auth Migration — Design

## Context

Supabase Auth is the current, shipped identity provider (Foundation phase): email/password signup with a demo role picker, session cookies via `@supabase/ssr`, and (since Phase 5) `supabase.auth.admin.inviteUserByEmail` for HR/admin-invited employees, sent through a custom Resend SMTP domain.

`docs/architecture.md` §5 flagged replacing it with [Clerk](https://clerk.com) as an undecided idea, motivated by Clerk's ready-made sign-in/sign-up UI and account management, and first-class Next.js App Router integration. This spec turns that idea into a concrete, scoped design.

## Goals

- Replace Supabase Auth with Clerk for sign-up, sign-in, and session management.
- Keep everything else about the app's identity model unchanged: companies, departments, `profiles`, roles, and `lib/domain/permissions.ts` stay exactly as they are today in Supabase Postgres.
- Preserve the existing UX shape: self-signup with a role picker; HR/admin-driven employee invites.

## Non-goals

- Clerk Organizations (companies stay a Supabase concept).
- MFA, social login, or any other Clerk feature beyond email/password sign-in.
- Any change to `lib/domain/permissions.ts` or the RBAC model.
- Migrating existing Supabase Auth users — this is a pre-production demo app (AlpenTech Industries seed data), so a clean cutover is acceptable. Existing Supabase Auth users are abandoned; everyone signs up fresh through Clerk after this ships.

## Design

### 1. Session & middleware layer

- `proxy.ts` (this project's Next.js version renames `middleware.ts` to `proxy.ts` — see `CLAUDE.md`) currently uses `@supabase/ssr`'s `createServerClient` + `supabase.auth.getUser()` to refresh the session cookie on every request. It's replaced with Clerk's `clerkMiddleware()` from `@clerk/nextjs/server`.
- `config.matcher` gains `'/__clerk/:path*'` immediately after the existing API/TRPC-style catch-all matcher, per Clerk's Next.js proxy requirements.
- `app/layout.tsx` wraps `<body>` in `<ClerkProvider>` (inside `<body>`, not wrapping `<html>`).
- `lib/auth/session.ts`'s `getCurrentProfile()` swaps `supabase.auth.getUser()` for Clerk's `await auth()` (Next.js 15+: `auth()` is async) to get the current user id, then calls the existing `getProfileByAuthUserId(userId)` unchanged. Everything downstream of `getCurrentProfile()` — every route handler, every domain function, `permissions.ts` — is untouched, since it only ever consumed a `Profile`, never a raw session object.

### 2. Self-signup + role picker

- `app/(marketing)/signup/page.tsx`'s current hand-rolled form is replaced with Clerk's `<SignUp>` component (themed via `@clerk/ui`'s shadcn theme — see §4).
- After `<SignUp>` completes, the user is redirected to a new "pick your role" step that reuses today's role-picker UI and `completeSignupSchema` validation.
- That step posts to a route replacing `/api/auth/complete-signup`: same logic as today (`getDefaultCompany()` + `createProfile()`), except the caller's identity comes from Clerk's `auth()` instead of `supabase.auth.getUser()`, and the new `profiles.auth_user_id` value is the Clerk user id.
- `app/auth/confirmed/page.tsx` (Supabase's email-confirmation landing page) is deleted — Clerk handles email verification inside its own `<SignUp>` flow, so there's no separate confirmation redirect to replicate.
- `app/(marketing)/login/page.tsx` is replaced with Clerk's `<SignIn>` component, themed the same way.

### 3. Employee invites (Phase 5 flow)

- `lib/domain/employees.ts`'s call to `supabase.auth.admin.inviteUserByEmail(...)` is replaced with Clerk's `clerkClient.invitations.createInvitation({ emailAddress, ... })`, using Clerk's own invitation email (not Resend — confirmed explicitly during design).
- **Resolved during planning**: today's Supabase flow gets the new `auth_user_id` back *synchronously* in the `inviteUserByEmail` response; Clerk's invitation flow is asynchronous (the invited person clicks the email later). Resolution: `createEmployee` still creates the `profiles` row immediately (role/department/manager are already known from the admin's input), with `auth_user_id = null`. `createInvitation` is called with `publicMetadata: { pendingProfileId: <that profile's id> }` — Clerk copies `publicMetadata` onto the invited user once they sign up (confirmed in Clerk's docs). A new webhook route (`app/api/webhooks/clerk/route.ts`, verified via `verifyWebhook()` from `@clerk/nextjs/webhooks`) listens for `user.created`, reads `public_metadata.pendingProfileId`, and links the two records. Self-signup is unaffected — its profile is created synchronously, after the Clerk user already exists, so no linkage step is needed there.

### 4. UI components & theming

- `components.json` exists (shadcn/ui is already in use across the app), so install `@clerk/ui` and apply its shadcn theme: `import { shadcn } from '@clerk/ui/themes'` passed to `<ClerkProvider appearance={{ theme: shadcn }}>`, plus `@import '@clerk/ui/themes/shadcn.css'` in global CSS. This makes `<SignIn>`, `<SignUp>`, and `<UserButton>` match the app's existing look instead of Clerk's defaults.
- `<UserButton>` replaces the sign-out affordance in the sidebar's user menu (`components/nav-user.tsx` or equivalent — confirm exact location during planning).

### 5. Data model

- `profiles.auth_user_id` (currently a Supabase `auth.users` id) becomes a Clerk user id. **Correction from the initial design**: the column is actually `uuid not null unique references auth.users(id) on delete cascade` (`supabase/migrations/20260826221742_create_profiles.sql`), not a generic string column — a schema migration is required after all. It becomes `text`, drops the `auth.users` foreign key (Clerk ids aren't Supabase UUIDs), and drops `not null` (needed for §3's invite flow below — a pre-created employee profile has no Clerk user yet until their invite is accepted). The `unique` constraint stays (Postgres allows multiple `NULL`s under a unique constraint, which is exactly what multiple pending invites need).

### 6. Environment & config

- New env vars: `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (never expose the secret key in client code).
- Existing Supabase env vars (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, etc.) stay as-is — Postgres access via the domain layer's service-role admin client is unaffected by who issues the session.

## Testing

- Existing `lib/auth/session.test.ts` gets rewritten against Clerk's `auth()` instead of a mocked Supabase client.
- `completeSignupSchema` / role-picker logic keeps its existing test coverage, adjusted for the new call site.
- `lib/domain/employees.ts`'s invite tests need a Clerk-client mock in place of the Supabase admin mock.
- No RLS/permissions tests should need to change — `permissions.ts` and its test suite are out of scope.

## Risks / open questions carried into planning

1. **Employee invite → profile linkage** (§3) — needs a concrete mechanism, not yet decided.
2. **Clerk free-tier limits** — should be confirmed against current Clerk pricing before/during setup; this is a demo app so likely fine, but not yet verified.
3. No manual browser click-through is possible in this environment (consistent with every prior phase in this project) — flag for a human pass before merge, especially given this replaces the entire auth surface.
