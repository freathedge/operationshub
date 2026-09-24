# Clerk Auth Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Supabase Auth with Clerk for sign-up, sign-in, and session management, while leaving companies/departments/`profiles`/roles/`lib/domain/permissions.ts` untouched in Supabase Postgres.

**Architecture:** `clerkMiddleware()` replaces the Supabase session-refresh proxy; `lib/auth/session.ts` and every route/page that resolves the current user swap `supabase.auth.getUser()` for Clerk's `auth()`/`currentUser()`. `profiles.auth_user_id` becomes a nullable `text` column holding Clerk user ids. Self-signup gets a Clerk `<SignUp>` step followed by a same-app role-picker step (unchanged shape, new identity source). Employee invites move to Clerk's `invitations` API with `publicMetadata` carrying the pre-created profile's id, linked back via a new `user.created` webhook once the invite is accepted.

**Tech Stack:** Next.js 16.3.3 (App Router), React 19.2.8, `@clerk/nextjs` (new), `@clerk/ui` (new, shadcn theme), Supabase Postgres (unchanged), vitest 4.1.11, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-24-clerk-auth-migration-design.md`

## Global Constraints

- Never expose `CLERK_SECRET_KEY` or `CLERK_WEBHOOK_SIGNING_SECRET` in client code — only `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` may reach the browser.
- Next.js 15+: `auth()` is async — always `await auth()`.
- `ClerkProvider` goes inside `<body>`, not wrapping `<html>` (per `app/layout.tsx`'s existing structure).
- `proxy.ts`'s `config.matcher` must include `'/__clerk/:path*'` after the existing catch-all.
- No RLS is in use anywhere in this project (`docs/architecture.md` §2/§5) — authorization stays exclusively in the domain layer (`lib/domain/permissions.ts`), which this plan does not touch.
- Pre-production cutover: no existing Supabase Auth user data is migrated. `scripts/seed.ts` seeds companies/departments/workflow templates only — it does not create auth users — so it needs no changes.
- Companies/Organizations: out of scope. Do not introduce Clerk Organizations anywhere in this plan.
- Every task's commit message follows this repo's Conventional Commits convention (see `CLAUDE.md`) and ends with the attribution line already configured for this session.

## Review Focus

- **Webhook payload from an untrusted sender**: `app/api/webhooks/clerk/route.ts` must reject requests that fail `verifyWebhook()` (invalid/missing Svix signature) with a 400 before touching any data — a forged `user.created` event must not be able to link an attacker-controlled Clerk user id onto an arbitrary pending profile.
- **Double-linking a profile**: if Clerk redelivers a `user.created` webhook (it retries on non-2xx), or two different webhook deliveries reference the same `pendingProfileId`, the second call must not silently overwrite an already-linked profile's `auth_user_id`. Task 3's `linkProfileToAuthUser` guards with `WHERE auth_user_id IS NULL`.
- **Self-signup with an email Clerk already knows** (e.g. someone re-attempts signup, or an admin invited them and they try self-signup first): Clerk itself rejects duplicate-email signups with its own UI error — no app-level duplicate check is needed, but `/api/auth/complete-signup`'s existing 409-on-existing-profile guard (Task 5) must still hold so a second call for the same Clerk user id can't create two profiles.
- **A pending (unclaimed) employee profile appearing in employee lists**: `listEmployees`/`getEmployeeProfile` (`lib/domain/employees.ts`) query `profiles` with no `auth_user_id IS NOT NULL` filter — a newly invited employee with `auth_user_id = null` will already appear in listings today (this matches current pre-migration behavior, where the profile is also created before the invite is opened) — Task 2's test pins that this is unchanged, not a regression.
- **Malformed or missing `publicMetadata.pendingProfileId` on a `user.created` event** (e.g. a self-signup's webhook fires with no metadata at all): the webhook handler must treat this as a no-op success (200), not an error — Task 3's test covers this explicitly.

---

## File Structure

**New files:**
- `supabase/migrations/<timestamp>_profiles_auth_user_id_clerk.sql` — schema migration
- `app/api/webhooks/clerk/route.ts` + `.test.ts` — links pending employee profiles to Clerk users
- `app/(marketing)/signup/complete/page.tsx` — role-picker step shown after Clerk's `<SignUp>` completes
- `components/auth/complete-signup-form.tsx` + `.test.tsx` — the role-picker form (replaces the role field + fetch logic currently embedded in `signup-form.tsx`)

**Modified files:**
- `proxy.ts` — Supabase session refresh → `clerkMiddleware()`
- `app/layout.tsx` — wrap `<body>` in `<ClerkProvider>`, import `@clerk/ui`'s shadcn theme CSS
- `app/globals.css` — `@import '@clerk/ui/themes/shadcn.css'`
- `lib/auth/session.ts` + `.test.ts` — `auth()` instead of `supabase.auth.getUser()`
- `lib/domain/profiles.ts` + tests — `authUserId: string | null`, new `linkProfileToAuthUser()`
- `lib/domain/employees.ts` + `.test.ts` — Clerk `invitations.createInvitation()` instead of `supabase.auth.admin.inviteUserByEmail()`
- `app/(marketing)/signup/page.tsx` — renders Clerk's `<SignUp>`
- `app/(marketing)/login/page.tsx` — renders Clerk's `<SignIn>`
- `app/(app)/layout.tsx` + `.test.tsx` — `auth()`/`currentUser()` instead of Supabase
- `app/(app)/settings/page.tsx` + `.test.tsx` — same swap
- `components/nav-user.tsx` + `.test.tsx` — logout handler uses Clerk's `useClerk().signOut()`
- `.env.local.example` — add the three new Clerk env vars
- `package.json` — add `@clerk/nextjs`, `@clerk/ui`

**Deleted files:**
- `app/auth/confirmed/page.tsx` (Clerk's `<SignUp>` handles email verification itself)
- `app/auth/accept-invite/page.tsx`, `components/auth/accept-invite-form.tsx`, `components/auth/accept-invite-form.test.tsx` (Clerk's `<SignUp>` auto-detects invitation tickets)
- `components/auth/login-form.tsx`, `components/auth/login-form.test.tsx`
- `components/auth/signup-form.tsx`, `components/auth/signup-form.test.tsx` (split into Clerk's `<SignUp>` + the new `complete-signup-form.tsx`)

---

### Task 1: Install Clerk and add environment configuration

**Files:**
- Modify: `package.json`
- Modify: `.env.local.example`

**Interfaces:**
- Produces: `@clerk/nextjs` and `@clerk/ui` available as dependencies for every later task.

- [ ] **Step 1: Install the packages**

Run: `pnpm add @clerk/nextjs @clerk/ui`

- [ ] **Step 2: Add the new env vars to the example file**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SIGNING_SECRET=
```

- [ ] **Step 3: Ask the user for the real values**

Per this project's Clerk setup convention, do not read or print `.env.local`. Ask the user to add their real `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and (once Task 3's webhook endpoint is registered in the Clerk Dashboard) `CLERK_WEBHOOK_SIGNING_SECRET` to `.env.local` themselves.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml .env.local.example
git commit -m "chore: add clerk dependencies and env var placeholders"
```

---

### Task 2: Migrate `profiles.auth_user_id` to a nullable Clerk-compatible column

**Files:**
- Create: `supabase/migrations/<timestamp>_profiles_auth_user_id_clerk.sql` (use the current UTC timestamp in `YYYYMMDDHHMMSS` format, matching `supabase/migrations/20260826221742_create_profiles.sql`'s naming)
- Modify: `lib/domain/profiles.ts`
- Modify: `lib/domain/profiles.test.ts` (integration test, gated by `SUPABASE_SERVICE_ROLE_KEY`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `Profile.authUserId: string | null` (was `string`); `createProfile(input: { authUserId?: string | null; ... })` (was required); new `linkProfileToAuthUser(profileId: string, authUserId: string): Promise<Profile>`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/<timestamp>_profiles_auth_user_id_clerk.sql
alter table profiles drop constraint profiles_auth_user_id_fkey;
alter table profiles alter column auth_user_id type text using auth_user_id::text;
alter table profiles alter column auth_user_id drop not null;
```

- [ ] **Step 2: Apply it to the local/dev Supabase project**

Run: `npx supabase db push` (or the project's existing migration-apply command — check `README.md` for the exact one this project uses if `db push` isn't it)

- [ ] **Step 3: Write the failing test for `linkProfileToAuthUser`**

Add to `lib/domain/profiles.test.ts` (in the existing integration describe block that creates a `companyId` — reuse its `beforeAll` setup):

```ts
it("links a pending profile to a Clerk user id, and is a no-op if already linked", async () => {
  const pending = await createProfile({
    companyId,
    fullName: "Pending Hire",
    role: "employee",
  });
  expect(pending.authUserId).toBeNull();

  const linked = await linkProfileToAuthUser(pending.id, "user_clerk123");
  expect(linked.authUserId).toBe("user_clerk123");

  // Re-linking with a different id must not overwrite the first link.
  const relinkAttempt = await linkProfileToAuthUser(pending.id, "user_clerk456");
  expect(relinkAttempt.authUserId).toBe("user_clerk123");
});
```

Add `linkProfileToAuthUser` to the test file's imports from `@/lib/domain/profiles`.

- [ ] **Step 4: Run it to confirm it fails**

Run: `pnpm test:integration -- lib/domain/profiles.test.ts -t "links a pending profile"`
Expected: FAIL — `linkProfileToAuthUser is not a function` (or a TypeScript error, since it doesn't exist yet)

- [ ] **Step 5: Update `Profile`/`ProfileRow`/`createProfile` and add `linkProfileToAuthUser`**

In `lib/domain/profiles.ts`:

```ts
export interface Profile {
  id: string;
  authUserId: string | null;
  companyId: string;
  fullName: string;
  role: Role;
  departmentId: string | null;
  managerId: string | null;
  positionTitle: string | null;
  employeeNumber: string | null;
  locationId: string | null;
  relatedOperationId: string | null;
  status: ProfileStatus;
}

interface ProfileRow {
  id: string;
  auth_user_id: string | null;
  company_id: string;
  full_name: string;
  role: Role;
  department_id: string | null;
  manager_id: string | null;
  position_title: string | null;
  employee_number: string | null;
  location_id: string | null;
  related_operation_id: string | null;
  status: ProfileStatus;
}
```

Change `createProfile`'s input type and insert call:

```ts
export async function createProfile(input: {
  authUserId?: string | null;
  companyId: string;
  fullName: string;
  role: Role;
  departmentId?: string | null;
  managerId?: string | null;
  locationId?: string | null;
  positionTitle?: string | null;
  employeeNumber?: string | null;
}): Promise<Profile> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .insert({
      auth_user_id: input.authUserId ?? null,
      company_id: input.companyId,
      full_name: input.fullName,
      role: input.role,
      department_id: input.departmentId ?? null,
      manager_id: input.managerId ?? null,
      location_id: input.locationId ?? null,
      position_title: input.positionTitle ?? null,
      employee_number: input.employeeNumber ?? null,
    })
    .select(PROFILE_COLUMNS)
    .single();

  if (error) throw error;
  return toProfile(data);
}
```

Add the new function (near `updateProfile`):

```ts
export async function linkProfileToAuthUser(
  profileId: string,
  authUserId: string
): Promise<Profile> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ auth_user_id: authUserId })
    .eq("id", profileId)
    .is("auth_user_id", null)
    .select(PROFILE_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const existing = await getProfileById(profileId);
    if (!existing) throw new Error(`Profile ${profileId} not found`);
    return existing;
  }
  return toProfile(data);
}
```

- [ ] **Step 6: Run the test to confirm it passes**

Run: `pnpm test:integration -- lib/domain/profiles.test.ts -t "links a pending profile"`
Expected: PASS

- [ ] **Step 7: Run the full existing `profiles.test.ts` suite to confirm no regressions**

Run: `pnpm test:integration -- lib/domain/profiles.test.ts`
Expected: PASS (all tests, including pre-existing ones)

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations lib/domain/profiles.ts lib/domain/profiles.test.ts
git commit -m "feat: make profiles.auth_user_id nullable and Clerk-compatible"
```

---

### Task 3: Clerk middleware, provider, and shadcn theming

**Files:**
- Modify: `proxy.ts`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `@clerk/nextjs` (Task 1).
- Produces: every Server Component/Route Handler in the app can now call `auth()`/`currentUser()` from `@clerk/nextjs/server`.

- [ ] **Step 1: Replace `proxy.ts`**

```ts
import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
```

This keeps the existing static-asset exclusion, and adds the two matcher entries Clerk requires. No `auth.protect()` calls are added here — matching this project's existing pattern (and Clerk's current recommendation) of checking auth per-resource (`getCurrentProfile()` in each route/page), not in middleware.

- [ ] **Step 2: Wrap `app/layout.tsx` in `ClerkProvider` with the shadcn theme**

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Operations Hub",
  description: "The internal operations platform for AlpenTech Industries.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ClerkProvider appearance={{ theme: shadcn }}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <TooltipProvider>{children}</TooltipProvider>
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Import the shadcn theme CSS**

Add near the top of `app/globals.css` (check the file's existing `@import`s first and place this alongside them):

```css
@import "@clerk/ui/themes/shadcn.css";
```

- [ ] **Step 4: Verify the app still builds**

Run: `pnpm build`
Expected: succeeds (this task adds no new routes to break; it only changes the root shell). Note: `next dev`/`next build` will log a Clerk warning about missing publishable/secret keys until Task 1 Step 3's real keys are in `.env.local` — that's expected at this point in the plan.

- [ ] **Step 5: Commit**

```bash
git add proxy.ts app/layout.tsx app/globals.css
git commit -m "feat: wire up clerk middleware, provider, and shadcn theme"
```

---

### Task 4: Clerk webhook — link pending employee profiles

**Files:**
- Create: `app/api/webhooks/clerk/route.ts`
- Create: `app/api/webhooks/clerk/route.test.ts`

**Interfaces:**
- Consumes: `linkProfileToAuthUser` (Task 2), `verifyWebhook` from `@clerk/nextjs/webhooks`.
- Produces: `POST /api/webhooks/clerk` — the endpoint to register in the Clerk Dashboard.

- [ ] **Step 1: Write the failing tests**

```ts
// app/api/webhooks/clerk/route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyWebhookMock = vi.fn();
vi.mock("@clerk/nextjs/webhooks", () => ({
  verifyWebhook: (req: Request) => verifyWebhookMock(req),
}));

const linkProfileToAuthUserMock = vi.fn();
vi.mock("@/lib/domain/profiles", () => ({
  linkProfileToAuthUser: (profileId: string, authUserId: string) =>
    linkProfileToAuthUserMock(profileId, authUserId),
}));

import { POST } from "@/app/api/webhooks/clerk/route";

function req() {
  return new Request("http://localhost/api/webhooks/clerk", { method: "POST" });
}

beforeEach(() => {
  verifyWebhookMock.mockReset();
  linkProfileToAuthUserMock.mockReset();
});

describe("POST /api/webhooks/clerk", () => {
  it("returns 400 when signature verification fails", async () => {
    verifyWebhookMock.mockRejectedValue(new Error("invalid signature"));
    const response = await POST(req());
    expect(response.status).toBe(400);
    expect(linkProfileToAuthUserMock).not.toHaveBeenCalled();
  });

  it("links a pending profile when user.created carries pendingProfileId metadata", async () => {
    verifyWebhookMock.mockResolvedValue({
      type: "user.created",
      data: { id: "user_clerk123", public_metadata: { pendingProfileId: "profile-1" } },
    });
    const response = await POST(req());
    expect(response.status).toBe(200);
    expect(linkProfileToAuthUserMock).toHaveBeenCalledWith("profile-1", "user_clerk123");
  });

  it("is a no-op (200) for user.created with no pendingProfileId metadata", async () => {
    verifyWebhookMock.mockResolvedValue({
      type: "user.created",
      data: { id: "user_clerk123", public_metadata: {} },
    });
    const response = await POST(req());
    expect(response.status).toBe(200);
    expect(linkProfileToAuthUserMock).not.toHaveBeenCalled();
  });

  it("is a no-op (200) for event types other than user.created", async () => {
    verifyWebhookMock.mockResolvedValue({
      type: "user.updated",
      data: { id: "user_clerk123", public_metadata: { pendingProfileId: "profile-1" } },
    });
    const response = await POST(req());
    expect(response.status).toBe(200);
    expect(linkProfileToAuthUserMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm test:unit -- app/api/webhooks/clerk/route.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/webhooks/clerk/route'`

- [ ] **Step 3: Implement the route**

```ts
// app/api/webhooks/clerk/route.ts
import { NextResponse } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { linkProfileToAuthUser } from "@/lib/domain/profiles";

export async function POST(request: Request) {
  let event;
  try {
    event = await verifyWebhook(request);
  } catch (error) {
    console.error("Clerk webhook verification failed", error);
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  if (event.type === "user.created") {
    const pendingProfileId = event.data.public_metadata?.pendingProfileId;
    if (typeof pendingProfileId === "string") {
      await linkProfileToAuthUser(pendingProfileId, event.data.id);
    }
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
```

- [ ] **Step 4: Run to confirm all four tests pass**

Run: `pnpm test:unit -- app/api/webhooks/clerk/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/webhooks/clerk
git commit -m "feat: add clerk user.created webhook to link pending employee profiles"
```

**Note for a human before this ships**: this endpoint must be registered as a webhook in the Clerk Dashboard (subscribed to `user.created`), and its Signing Secret copied into `CLERK_WEBHOOK_SIGNING_SECRET` (Task 1 Step 3) — this can't be done from the CLI/codebase alone.

---

### Task 5: `lib/auth/session.ts` and employee-invite flow on Clerk

**Files:**
- Modify: `lib/auth/session.ts`
- Modify: `lib/auth/session.test.ts`
- Modify: `lib/domain/employees.ts`
- Modify: `lib/domain/employees.test.ts`

**Interfaces:**
- Consumes: `auth()` from `@clerk/nextjs/server`, `linkProfileToAuthUser`/`createProfile` (Task 2), `clerkClient` from `@clerk/nextjs/server`.
- Produces: `getCurrentProfile(): Promise<Profile | null>` (signature unchanged — every existing caller keeps working).

- [ ] **Step 1: Write the failing test for the new `getCurrentProfile`**

Replace `lib/auth/session.test.ts`'s contents:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

const getProfileByAuthUserIdMock = vi.fn();
vi.mock("@/lib/domain/profiles", () => ({
  getProfileByAuthUserId: (id: string) => getProfileByAuthUserIdMock(id),
}));

import { getCurrentProfile } from "@/lib/auth/session";

beforeEach(() => {
  authMock.mockReset();
  getProfileByAuthUserIdMock.mockReset();
});

describe("getCurrentProfile", () => {
  it("returns null when there is no authenticated user", async () => {
    authMock.mockResolvedValue({ userId: null });
    const result = await getCurrentProfile();
    expect(result).toBeNull();
  });

  it("returns null when the user has no profile yet", async () => {
    authMock.mockResolvedValue({ userId: "user_clerk123" });
    getProfileByAuthUserIdMock.mockResolvedValue(null);
    const result = await getCurrentProfile();
    expect(result).toBeNull();
  });

  it("returns the profile for the authenticated user", async () => {
    authMock.mockResolvedValue({ userId: "user_clerk123" });
    getProfileByAuthUserIdMock.mockResolvedValue({ id: "profile-1", authUserId: "user_clerk123" });
    const result = await getCurrentProfile();
    expect(result).toEqual({ id: "profile-1", authUserId: "user_clerk123" });
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm test:unit -- lib/auth/session.test.ts`
Expected: FAIL — old test body still calls `@/lib/supabase/server`, which no longer matches the new implementation once Step 3 lands. Confirm the *current* (pre-edit) implementation fails this *new* test first.

- [ ] **Step 3: Implement**

```ts
// lib/auth/session.ts
import { auth } from "@clerk/nextjs/server";
import { getProfileByAuthUserId, type Profile } from "@/lib/domain/profiles";

export async function getCurrentProfile(): Promise<Profile | null> {
  const { userId } = await auth();
  if (!userId) return null;
  return getProfileByAuthUserId(userId);
}
```

- [ ] **Step 4: Run to confirm it passes**

Run: `pnpm test:unit -- lib/auth/session.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for the invite flow**

In `lib/domain/employees.test.ts`, this project's existing `createEmployee` describe block is gated with `describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)` and hits real Supabase (for Postgres writes) and real Supabase Auth admin (for the invite itself, via `supabase.auth.admin.inviteUserByEmail`/`createUser`). Keep the real-Postgres parts; replace the real-Supabase-Auth-admin invite/user-creation calls with a mocked Clerk client, since Clerk's invitation API is rate-limited (100/hr) and shouldn't be hit from tests.

Add near the top of the file, before the `describe` block:

```ts
const createInvitationMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    invitations: { createInvitation: createInvitationMock },
  }),
}));
```

Replace the `hrAuthUser`/`createUser` setup (the HR profile no longer needs a *real* Supabase auth user — any non-null string works as its `authUserId` now that the column is a plain `text` field with no FK):

```ts
beforeAll(async () => {
  // ...existing companyId/departmentId setup...

  hrProfile = await createProfile({
    authUserId: `test-hr-${crypto.randomUUID()}`,
    companyId,
    fullName: "HR Person",
    role: "hr",
  });
});
```

Remove `createdAuthUserIds`/`hrAuthUser`/`supabase.auth.admin.createUser` entirely (no longer needed — nothing here creates real Supabase Auth users anymore). Replace the `"invites the employee..."` test:

```ts
it("creates a pending profile, sends a Clerk invitation with the profile id, and starts onboarding by default", async () => {
  createInvitationMock.mockReset();
  createInvitationMock.mockResolvedValue({ id: "inv_123" });

  const newHireEmail = `new-hire-${crypto.randomUUID()}@example.com`;
  const employee = await createEmployee(hrProfile, {
    email: newHireEmail,
    fullName: "New Hire",
    role: "employee",
    positionTitle: "Support Specialist",
  });

  expect(employee.fullName).toBe("New Hire");
  expect(employee.positionTitle).toBe("Support Specialist");
  expect(employee.authUserId).toBeNull();

  expect(createInvitationMock).toHaveBeenCalledWith({
    emailAddress: newHireEmail,
    publicMetadata: { pendingProfileId: employee.id },
  });

  const fetched = await getProfileById(employee.id);
  expect(fetched?.id).toBe(employee.id);

  const { data: instances, error: instancesError } = await supabase
    .from("workflow_instances")
    .select("id, related_employee_id")
    .eq("related_employee_id", employee.id);
  if (instancesError) throw instancesError;
  expect(instances).toHaveLength(1);
});
```

Add `getProfileById` to the file's existing `@/lib/domain/profiles` import. Update the `"does not start onboarding..."` test the same way (drop `createdAuthUserIds.push(employee.authUserId)`, since that array no longer exists).

- [ ] **Step 6: Run to confirm it fails**

Run: `pnpm test:integration -- lib/domain/employees.test.ts -t "creates a pending profile"`
Expected: FAIL — `createEmployee` still calls the old Supabase invite path.

- [ ] **Step 7: Implement the new `createEmployee`**

```ts
// lib/domain/employees.ts — replace the invite block
import { clerkClient } from "@clerk/nextjs/server";

export async function createEmployee(
  profile: Profile,
  input: CreateEmployeeInput
): Promise<Employee> {
  if (!canCreateEmployee(profile)) {
    throw new ForbiddenError("You cannot create employees");
  }

  const employee = await createProfile({
    companyId: profile.companyId,
    fullName: input.fullName,
    role: input.role,
    departmentId: input.departmentId ?? null,
    managerId: input.managerId ?? null,
    locationId: input.locationId ?? null,
    positionTitle: input.positionTitle ?? null,
    employeeNumber: input.employeeNumber ?? null,
  });

  const clerk = await clerkClient();
  await clerk.invitations.createInvitation({
    emailAddress: input.email,
    publicMetadata: { pendingProfileId: employee.id },
  });

  await logActivity(
    "profile",
    employee.id,
    profile.id,
    `${profile.fullName} added ${employee.fullName} as a new employee`
  );

  if (input.startOnboarding ?? true) {
    try {
      await startWorkflow(profile, "employee-onboarding", { employeeId: employee.id });
    } catch (workflowError) {
      console.error("startWorkflow failed:", workflowError);
    }
  }

  try {
    await broadcastChange(profile.companyId, "employees", { type: "employee_created" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }

  return employee;
}
```

Remove the now-unused `createSupabaseAdminClient` import if nothing else in the file needs it (check: `getEmployeeProfile` still uses it for the counts queries — keep the import, just drop the invite-specific admin usage).

- [ ] **Step 8: Run to confirm the new tests pass**

Run: `pnpm test:integration -- lib/domain/employees.test.ts`
Expected: PASS (all tests in the file, including the untouched `updateEmployee`/`listEmployees`/`getEmployeeProfile` ones)

- [ ] **Step 9: Commit**

```bash
git add lib/auth/session.ts lib/auth/session.test.ts lib/domain/employees.ts lib/domain/employees.test.ts
git commit -m "feat: read sessions from clerk and invite employees via clerk"
```

---

### Task 6: Self-signup — Clerk `<SignUp>` + role-picker completion step

**Files:**
- Modify: `app/(marketing)/signup/page.tsx`
- Modify: `app/(marketing)/login/page.tsx`
- Create: `app/(marketing)/signup/complete/page.tsx`
- Create: `components/auth/complete-signup-form.tsx`
- Create: `components/auth/complete-signup-form.test.tsx`
- Modify: `app/api/auth/complete-signup/route.ts`
- Modify: `app/api/auth/complete-signup/route.test.ts`
- Delete: `components/auth/login-form.tsx`, `components/auth/login-form.test.tsx`
- Delete: `components/auth/signup-form.tsx`, `components/auth/signup-form.test.tsx`
- Delete: `app/auth/confirmed/page.tsx`
- Delete: `app/auth/accept-invite/page.tsx`, `components/auth/accept-invite-form.tsx`, `components/auth/accept-invite-form.test.tsx`

**Interfaces:**
- Consumes: `auth()` (Task 5's pattern), `completeSignupSchema` (`lib/validation/auth.ts`, unchanged), `getDefaultCompany`/`createProfile` (unchanged).
- Produces: `/signup` → Clerk `<SignUp>` → `/signup/complete` (role picker) → `/dashboard`. `/login` → Clerk `<SignIn>` → `/dashboard`.

- [ ] **Step 1: Write the failing test for the rewritten `complete-signup` route**

Rewrite `app/api/auth/complete-signup/route.test.ts` to mock `@clerk/nextjs/server`'s `auth()` instead of `@/lib/supabase/server`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));
vi.mock("@/lib/domain/profiles", () => ({
  getProfileByAuthUserId: vi.fn(),
  createProfile: vi.fn(),
}));
vi.mock("@/lib/domain/companies", () => ({
  getDefaultCompany: vi.fn(),
}));

import { getProfileByAuthUserId, createProfile } from "@/lib/domain/profiles";
import { getDefaultCompany } from "@/lib/domain/companies";
import { POST } from "@/app/api/auth/complete-signup/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/auth/complete-signup", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  authMock.mockReset();
  vi.mocked(getProfileByAuthUserId).mockReset();
  vi.mocked(createProfile).mockReset();
  vi.mocked(getDefaultCompany).mockReset();
});

describe("POST /api/auth/complete-signup", () => {
  it("returns 401 when there is no authenticated user", async () => {
    authMock.mockResolvedValue({ userId: null });
    const response = await POST(jsonRequest({ fullName: "Max", role: "employee" }));
    expect(response.status).toBe(401);
  });

  it("creates a profile for an authenticated user without one yet", async () => {
    authMock.mockResolvedValue({ userId: "user_clerk123" });
    vi.mocked(getProfileByAuthUserId).mockResolvedValue(null);
    vi.mocked(getDefaultCompany).mockResolvedValue({
      id: "company-1",
      name: "AlpenTech Industries",
      slug: "alpentech-industries",
    });
    vi.mocked(createProfile).mockResolvedValue({
      id: "profile-1",
      authUserId: "user_clerk123",
      companyId: "company-1",
      fullName: "Max",
      role: "employee",
      departmentId: null,
      managerId: null,
      positionTitle: null,
      employeeNumber: null,
      locationId: null,
      relatedOperationId: null,
      status: "active" as const,
    });

    const response = await POST(jsonRequest({ fullName: "Max", role: "employee" }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.profile.fullName).toBe("Max");
  });

  it("returns 409 when a profile already exists", async () => {
    authMock.mockResolvedValue({ userId: "user_clerk123" });
    vi.mocked(getProfileByAuthUserId).mockResolvedValue({
      id: "profile-1",
      authUserId: "user_clerk123",
      companyId: "company-1",
      fullName: "Max",
      role: "employee",
      departmentId: null,
      managerId: null,
      positionTitle: null,
      employeeNumber: null,
      locationId: null,
      relatedOperationId: null,
      status: "active" as const,
    });

    const response = await POST(jsonRequest({ fullName: "Max", role: "employee" }));
    expect(response.status).toBe(409);
  });

  it("returns 400 for an invalid role", async () => {
    authMock.mockResolvedValue({ userId: "user_clerk123" });
    vi.mocked(getProfileByAuthUserId).mockResolvedValue(null);
    const response = await POST(jsonRequest({ fullName: "Max", role: "ceo" }));
    expect(response.status).toBe(400);
  });

  it("returns 500 with a JSON body when a domain call throws", async () => {
    authMock.mockResolvedValue({ userId: "user_clerk123" });
    vi.mocked(getProfileByAuthUserId).mockResolvedValue(null);
    vi.mocked(getDefaultCompany).mockRejectedValue(new Error("boom"));
    const response = await POST(jsonRequest({ fullName: "Max", role: "employee" }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Internal server error");
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm test:unit -- app/api/auth/complete-signup/route.test.ts`
Expected: FAIL — route still imports `@/lib/supabase/server`.

- [ ] **Step 3: Rewrite the route**

```ts
// app/api/auth/complete-signup/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { completeSignupSchema } from "@/lib/validation/auth";
import { createProfile, getProfileByAuthUserId } from "@/lib/domain/profiles";
import { getDefaultCompany } from "@/lib/domain/companies";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const existing = await getProfileByAuthUserId(userId);
    if (existing) {
      return NextResponse.json({ error: "Profile already exists" }, { status: 409 });
    }

    const body = await request.json();
    const parsed = completeSignupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const company = await getDefaultCompany();
    const profile = await createProfile({
      authUserId: userId,
      companyId: company.id,
      fullName: parsed.data.fullName,
      role: parsed.data.role,
    });

    return NextResponse.json({ profile }, { status: 201 });
  } catch (error) {
    console.error("complete-signup failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run to confirm it passes**

Run: `pnpm test:unit -- app/api/auth/complete-signup/route.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for the new role-picker form**

```tsx
// components/auth/complete-signup-form.test.tsx
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompleteSignupForm } from "@/components/auth/complete-signup-form";

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("CompleteSignupForm", () => {
  it("submits full name and role, then redirects to /dashboard on success", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    render(<CompleteSignupForm />);

    await userEvent.type(screen.getByLabelText("Full name"), "Max Mustermann");
    await userEvent.selectOptions(screen.getByLabelText("Explore as"), "employee");
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/complete-signup",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ fullName: "Max Mustermann", role: "employee" }),
      })
    );
    expect(pushMock).toHaveBeenCalledWith("/dashboard");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("shows an error message when the request fails", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Profile already exists" }),
    });
    render(<CompleteSignupForm />);

    await userEvent.type(screen.getByLabelText("Full name"), "Max Mustermann");
    await userEvent.selectOptions(screen.getByLabelText("Explore as"), "employee");
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText("Profile already exists")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run to confirm it fails**

Run: `pnpm test:unit -- components/auth/complete-signup-form.test.tsx`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 7: Implement the form** (role picker + full-name field, extracted from today's `signup-form.tsx`, minus the Supabase `signUp` call and the password fields)

```tsx
// components/auth/complete-signup-form.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { completeSignupSchema, type CompleteSignupInput } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ROLE_OPTIONS: { value: CompleteSignupInput["role"]; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "operations_manager", label: "Operations Manager" },
  { value: "it", label: "IT" },
  { value: "hr", label: "HR" },
  { value: "admin", label: "Admin" },
];

export function CompleteSignupForm() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CompleteSignupInput>({ resolver: zodResolver(completeSignupSchema) });

  async function onSubmit(values: CompleteSignupInput) {
    setSubmitError(null);
    const response = await fetch("/api/auth/complete-signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      let message = "Failed to complete signup";
      try {
        const body = await response.json();
        if (typeof body.error === "string") message = body.error;
      } catch {
        // non-JSON error body — keep the fallback message
      }
      setSubmitError(message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 max-w-sm">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" {...register("fullName")} />
        {errors.fullName && <p className="text-sm text-red-600">{errors.fullName.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="role">Explore as</Label>
        <select
          id="role"
          defaultValue=""
          {...register("role")}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <option value="" disabled>
            Choose a role
          </option>
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {errors.role && <p className="text-sm text-red-600">{errors.role.message}</p>}
      </div>

      {submitError && <p className="text-sm text-red-600">{submitError}</p>}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Continuing..." : "Continue"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 8: Run to confirm it passes**

Run: `pnpm test:unit -- components/auth/complete-signup-form.test.tsx`
Expected: PASS

- [ ] **Step 9: Wire up the pages**

```tsx
// app/(marketing)/signup/page.tsx
import { SignUp } from "@clerk/nextjs";
import { BackLink } from "@/components/back-link";

export default function SignupPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="absolute left-6 top-6">
        <BackLink href="/" />
      </div>
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <SignUp fallbackRedirectUrl="/signup/complete" />
    </main>
  );
}
```

```tsx
// app/(marketing)/login/page.tsx
import { SignIn } from "@clerk/nextjs";
import { BackLink } from "@/components/back-link";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="absolute left-6 top-6">
        <BackLink href="/" />
      </div>
      <h1 className="text-2xl font-semibold">Log in</h1>
      <SignIn fallbackRedirectUrl="/dashboard" />
    </main>
  );
}
```

```tsx
// app/(marketing)/signup/complete/page.tsx
import { BackLink } from "@/components/back-link";
import { CompleteSignupForm } from "@/components/auth/complete-signup-form";

export default function CompleteSignupPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="absolute left-6 top-6">
        <BackLink href="/signup" />
      </div>
      <h1 className="text-2xl font-semibold">One more step</h1>
      <p className="max-w-sm text-center text-muted-foreground">
        Tell us your name and pick a role to explore Operations Hub with.
      </p>
      <CompleteSignupForm />
    </main>
  );
}
```

`SignUp`'s `fallbackRedirectUrl="/signup/complete"` also covers the invitation-acceptance path (Task 5): Clerk's `<SignUp>` auto-detects an invitation ticket in the URL and, once the invited person sets a password, redirects them the same way a fresh signup would — landing on `/signup/complete` too. That's fine for invited employees: `POST /api/auth/complete-signup` will find their profile already exists (created by `createEmployee` in Task 5) via `getProfileByAuthUserId`... **except** their profile's `auth_user_id` is only set by the Task 4 webhook, which fires asynchronously and may not have completed yet by the time the invited user's browser hits `/signup/complete`. Do not build a UI workaround for this race in this task — flag it in the PR description as a known gap for human follow-up (e.g. redirect invited users to `/dashboard` directly with a "give it a moment" message, or have `/signup/complete` poll). This plan's scope is the identity swap, not resolving every async UX edge case.

- [ ] **Step 10: Delete the superseded files**

```bash
git rm components/auth/login-form.tsx components/auth/login-form.test.tsx
git rm components/auth/signup-form.tsx components/auth/signup-form.test.tsx
git rm app/auth/confirmed/page.tsx
git rm app/auth/accept-invite/page.tsx components/auth/accept-invite-form.tsx components/auth/accept-invite-form.test.tsx
```

- [ ] **Step 11: Run the full unit suite to confirm nothing else references the deleted files**

Run: `pnpm test:unit`
Expected: PASS, no import errors

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: replace signup/login pages with clerk components"
```

---

### Task 7: App shell auth checks and sidebar logout

**Files:**
- Modify: `app/(app)/layout.tsx`
- Modify: `app/(app)/layout.test.tsx`
- Modify: `app/(app)/settings/page.tsx`
- Modify: `app/(app)/settings/page.test.tsx`
- Modify: `components/nav-user.tsx`
- Modify: `components/nav-user.test.tsx`

**Interfaces:**
- Consumes: `auth()`/`currentUser()` from `@clerk/nextjs/server`, `useClerk()` from `@clerk/nextjs`.
- Produces: no change to any exported signature other props already depend on (`AppLayout({ children })`, `NavUser({ user })`).

- [ ] **Step 1: Write the failing test for `AppLayout`**

Replace `app/(app)/layout.test.tsx`'s Supabase mock with a Clerk one:

```ts
const authMock = vi.fn();
const currentUserMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
  currentUser: () => currentUserMock(),
}));
```

Update each test: `getUserMock.mockResolvedValue({ data: { user: null } })` → `authMock.mockResolvedValue({ userId: null })`; `getUserMock.mockResolvedValue({ data: { user: { id: "auth-1" } } })` → `authMock.mockResolvedValue({ userId: "auth-1" })` plus, for the rendering test only, `currentUserMock.mockResolvedValue({ emailAddresses: [{ emailAddress: "max@alpentech.example" }] })`. Remove the `@/lib/supabase/server` mock entirely.

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm test:unit -- "app/(app)/layout.test.tsx"`
Expected: FAIL — implementation still imports `@/lib/supabase/server`.

- [ ] **Step 3: Rewrite `app/(app)/layout.tsx`**

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getProfileByAuthUserId } from "@/lib/domain/profiles";
import { canViewCompanyOverview } from "@/lib/domain/permissions";
import { QueryProvider } from "@/components/providers/query-provider";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const profile = await getProfileByAuthUserId(userId);
  if (!profile) {
    redirect("/signup");
  }

  const user = await currentUser();
  const cookieStore = await cookies();
  const sidebarDefaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider
      defaultOpen={sidebarDefaultOpen}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar
        variant="inset"
        user={{
          name: profile.fullName,
          email: user?.primaryEmailAddress?.emailAddress ?? "",
          role: profile.role,
        }}
        canViewReports={canViewCompanyOverview(profile)}
      />
      <SidebarInset>
        <SiteHeader />
        <main className="flex-1 p-6">
          <QueryProvider>{children}</QueryProvider>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

- [ ] **Step 4: Run to confirm it passes**

Run: `pnpm test:unit -- "app/(app)/layout.test.tsx"`
Expected: PASS

- [ ] **Step 5: Same swap for `app/(app)/settings/page.tsx`**, mirroring Steps 1–4 in its own test file:

```tsx
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getProfileByAuthUserId } from "@/lib/domain/profiles";
import { BackLink } from "@/components/back-link";
import { ThemeToggle } from "@/components/settings/theme-toggle";

export default async function SettingsPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const profile = await getProfileByAuthUserId(userId);
  if (!profile) {
    redirect("/signup");
  }

  const user = await currentUser();

  return (
    <div>
      <BackLink href="/dashboard" />
      <h1 className="text-2xl font-semibold mb-4 mt-2">Settings</h1>
      <div className="flex flex-col gap-6 max-w-md">
        <div>
          <p className="text-sm text-muted-foreground">Name</p>
          <p>{profile.fullName}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Role</p>
          <p>{profile.role}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Email</p>
          <p>{user?.primaryEmailAddress?.emailAddress ?? ""}</p>
        </div>
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-sm font-medium">Theme</p>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
```

Apply the same test-file mock swap as Step 1 (replace the Supabase mock with `auth`/`currentUser` mocks) before making this change, run it red, then green, following the same TDD cycle as Steps 1–4.

**Deviation from the spec's literal wording**: the spec (§4) says `<UserButton>` "replaces the sign-out affordance in the sidebar's user menu." This task instead keeps `NavUser`'s existing custom dropdown (name, role, email, Settings link, Log out) and only swaps its `signOut` call to Clerk's — it does not render Clerk's `<UserButton>` component. Rationale: `NavUser` already has clear, tested sign-out/settings controls (role display included, which `<UserButton>` doesn't show), and the Clerk setup convention's own guidance is "if clear auth controls already exist, reuse or adapt them instead of duplicating them." Swapping in `<UserButton>` wholesale would lose the role display and require re-theming/re-testing a Clerk-native component for no functional gain. Flag this choice in the PR description so a human can confirm they're fine with it.

- [ ] **Step 6: Write the failing test for `NavUser`'s logout**

In `components/nav-user.test.tsx`, replace:

```ts
const signOutMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { signOut: signOutMock },
  }),
}));
```

with:

```ts
const signOutMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut: signOutMock }),
}));
```

The existing `"signs the user out and redirects to /login when Log out is clicked"` test's assertions (`expect(signOutMock).toHaveBeenCalled()`, `expect(pushMock).toHaveBeenCalledWith("/login")`, `expect(refreshMock).toHaveBeenCalled()`) stay as-is.

- [ ] **Step 7: Run to confirm it fails**

Run: `pnpm test:unit -- components/nav-user.test.tsx`
Expected: FAIL — component still imports `@/lib/supabase/browser`.

- [ ] **Step 8: Update `components/nav-user.tsx`**

Replace the import and `handleLogout`:

```tsx
import { useClerk } from "@clerk/nextjs"
// ...
export function NavUser({ user }: { user: CurrentUserSummary }) {
  const { isMobile } = useSidebar()
  const router = useRouter()
  const { signOut } = useClerk()

  async function handleLogout() {
    await signOut()
    router.push("/login")
    router.refresh()
  }
  // ...rest of the component is unchanged
```

Remove the now-unused `createSupabaseBrowserClient` import.

- [ ] **Step 9: Run to confirm it passes**

Run: `pnpm test:unit -- components/nav-user.test.tsx`
Expected: PASS

- [ ] **Step 10: Run the full unit suite**

Run: `pnpm test:unit`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add "app/(app)/layout.tsx" "app/(app)/layout.test.tsx" "app/(app)/settings/page.tsx" "app/(app)/settings/page.test.tsx" components/nav-user.tsx components/nav-user.test.tsx
git commit -m "feat: read the app shell's session and profile from clerk"
```

---

### Task 8: Whole-branch verification

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Run the full unit suite**

Run: `pnpm test:unit`
Expected: PASS, 0 failures

- [ ] **Step 2: Run the full integration suite** (requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`, per this repo's existing convention)

Run: `pnpm test:integration`
Expected: PASS, 0 failures

- [ ] **Step 3: Type-check and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no new errors beyond this repo's two known pre-existing ones (`hooks/use-mobile.ts`, `lib/realtime/use-broadcast-listener.ts` — see `docs/STATUS.md`'s Phase 8 entry)

- [ ] **Step 4: Production build**

Run: `pnpm build`
Expected: succeeds cleanly

- [ ] **Step 5: Grep for any remaining Supabase-Auth-for-identity usage**

Run: `grep -rn "auth\.\(getUser\|getSession\|signIn\|signUp\|signOut\|admin\)" --include="*.ts" --include="*.tsx" lib app components | grep -v test | grep -v node_modules`
Expected: no matches — every remaining `createSupabaseBrowserClient`/`createSupabaseAdminClient` usage in the codebase should now be for Storage or Postgres, never `.auth.*`

- [ ] **Step 6: Flag for human follow-up (do not attempt to close these in this plan)**

- No manual browser click-through was possible in this environment (consistent with every prior phase in this project) — this replaces the entire auth surface, so a human pass is especially important before merge: sign up fresh, pick a role, log out, log back in, and have an admin invite a test employee end-to-end (including registering the Task 4 webhook in the Clerk Dashboard and confirming the invited user's profile actually gets linked).
- Confirm Clerk's free-tier limits are adequate for this demo app (flagged as an open question in the spec, not yet verified).
- The `/signup/complete` race noted in Task 6 Step 9 (invited user hitting the role-picker page before the webhook has linked their profile) needs a human decision on UX, not a code fix baked into this plan.
