# Operations Hub — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js + Supabase foundation for Operations Hub: project scaffolding, core schema (companies/departments/locations/profiles), real Supabase Auth signup (with role picker) and login, an authenticated app shell, and a seed script for AlpenTech Industries.

**Architecture:** Single Next.js (App Router) project deployed as one app. Route Handlers are thin and delegate to a domain layer (`lib/domain/**`), which is the sole place that talks to Supabase Postgres, using the service-role key server-side. RLS is disabled — the domain layer is the only authorization boundary. The frontend never queries Supabase tables directly; the one exception in this phase is Supabase Auth itself (sign up / sign in / sign out are called directly from the browser, since Auth is a distinct concern from application data). Server Components (e.g. the authenticated layout) call domain-layer functions directly via in-process function calls — this is not a violation of "frontend never talks to Supabase directly," since Server Components execute on the server, same as Route Handlers; only actual browser-side code is restricted to the REST API.

**Tech Stack:** Next.js 16 (App Router, TypeScript strict, no `src/` dir), pnpm, hosted Supabase project (Postgres, Auth — no local Docker/CLI dev stack; schema changes applied via the Supabase MCP `apply_migration` tool), `@supabase/ssr` + `@supabase/supabase-js`, Zod, React Hook Form, Tailwind CSS v4, shadcn/ui, Vitest + Testing Library.

**Spec:** `docs/architecture.md`

## Global Constraints

- REST API (Next.js Route Handlers) is the sole authorization boundary. Row Level Security stays disabled on every table; the Supabase service-role key is used server-side only, never shipped to the browser.
- **RLS-disabled-by-design only holds if `anon`/`authenticated` have zero table privileges.** Supabase grants those roles full DML on `public` tables by default, expecting RLS to gate them — with RLS off and the default grants left in place, the public anon key can read/write every table directly through PostgREST, bypassing the domain layer entirely (this happened in Foundation, fixed in migration `20260826230306_revoke_anon_authenticated_table_grants.sql`). Every migration that creates a new table in a later phase must either (a) be covered by that blanket `alter default privileges` revoke — verify with the query below — or (b) explicitly re-revoke for that table. Verify after every schema change: `select table_name, grantee from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated');` must return zero rows. `service_role` is unaffected by this and keeps working normally.
- The frontend never reads or writes Supabase tables directly. Confirmed exceptions for this phase: Supabase Auth calls (sign up/in/out) from the browser client, and Server Components calling the domain layer in-process.
- Single fictional company (AlpenTech Industries) — no multi-tenant isolation logic; a `companies` table exists but is expected to hold exactly one row.
- Package manager: pnpm (v10.x). Node.js v22+ required.
- TypeScript strict mode throughout.
- This project uses a hosted Supabase project (no local Docker/CLI dev stack — Docker is not available in this environment). The project's `project_id` is `yqzcunssgvffischmwle`. Schema changes (DDL) are applied with the `mcp__plugin_supabase_supabase__apply_migration` tool (`project_id`, `name`, `query`), not the Supabase CLI. The domain layer, tests, and the running app all talk to this hosted project via the credentials in `.env.local` (already populated — see Task 4).
- **Migration filenames must match the version `apply_migration` actually assigns.** The tool stamps its own timestamp on apply — it does not use whatever prefix the local filename happens to have. After calling `apply_migration`, call `list_migrations` and rename the local file to `<version-from-list_migrations>_<name>.sql` before committing. A mismatched filename means a future `supabase db push`/`migration up` (if this project is ever linked via the CLI) won't recognize the migration as already applied and will try to re-run it, failing with "already exists" errors.
- Every task ends with a commit. Commit messages use the `feat:`/`chore:`/`test:` conventional prefix matching the task's nature.

---

## Task 1: Scaffold the Next.js project

**Files:**
- Create: entire Next.js project at repo root (`package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `public/*`, `.gitignore`, `eslint.config.mjs`)
- Modify: `app/layout.tsx` (metadata)

**Interfaces:**
- Produces: a running Next.js dev server, `pnpm build` command, import alias `@/*` resolving to the repo root.

- [ ] **Step 1: Scaffold Next.js into a temp directory and merge into the repo root**

The repo root already contains `docs/`, so `create-next-app` must be run into a fresh temp directory and merged in, rather than run in place.

```bash
pnpm create next-app@latest .next-scaffold \
  --typescript --tailwind --eslint --app \
  --no-src-dir --import-alias "@/*" --no-turbopack --no-git
cp -a .next-scaffold/. ./
rm -rf .next-scaffold
```

- [ ] **Step 2: Install the additional runtime dependencies this phase needs**

```bash
pnpm add @supabase/supabase-js @supabase/ssr zod react-hook-form @hookform/resolvers
```

- [ ] **Step 3: Update the root metadata**

Edit the `metadata` export in `app/layout.tsx` to:

```ts
export const metadata: Metadata = {
  title: "Operations Hub",
  description: "The internal operations platform for AlpenTech Industries.",
};
```

- [ ] **Step 4: Verify the project builds**

Run: `pnpm build`
Expected: build completes with no errors (the default scaffolded homepage is still present at this point — it gets replaced in Task 12).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project with TypeScript, Tailwind, ESLint"
```

---

## Task 2: Set up Vitest and Testing Library

**Files:**
- Create: `vitest.config.ts`, `vitest.setup.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `pnpm test` (runs Vitest once), `pnpm test:watch`. Test files use `@/` alias. Component test files opt into jsdom via a `// @vitest-environment jsdom` docblock at the top of the file; all other test files run in the default `node` environment.

- [ ] **Step 1: Install test dependencies**

```bash
pnpm add -D vitest @vitejs/plugin-react jsdom dotenv tsx \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Create the Vitest config**

Create `vitest.config.ts`:

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

- [ ] **Step 3: Create the setup file**

Create `vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Add test scripts to `package.json`**

Add to the `scripts` section:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Write a smoke test to verify the setup works**

Create `lib/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("vitest setup", () => {
  it("runs a basic assertion", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run the test suite**

Run: `pnpm test`
Expected: 1 test passes.

- [ ] **Step 7: Delete the smoke test and commit**

```bash
rm lib/smoke.test.ts
git add -A
git commit -m "chore: set up Vitest and Testing Library"
```

---

## Task 3: Install and configure shadcn/ui

**Files:**
- Create: `components.json`, `lib/utils.ts`, `components/ui/button.tsx`, `components/ui/input.tsx`, `components/ui/label.tsx`, `components/ui/card.tsx`

**Interfaces:**
- Produces: `Button`, `Input`, `Label`, `Card` components importable from `@/components/ui/*`.

- [ ] **Step 1: Initialize shadcn/ui with defaults**

```bash
pnpm dlx shadcn@latest init -d
```

- [ ] **Step 2: Add the base components needed for auth forms**

```bash
pnpm dlx shadcn@latest add button input label card -y
```

(The role picker in Task 12 uses a plain native `<select>` styled with Tailwind rather than shadcn's Select primitive, to keep it simple and reliably testable — so `select` is intentionally not added here.)

- [ ] **Step 3: Verify the project still builds**

Run: `pnpm build`
Expected: build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: install shadcn/ui base components"
```

---

## Task 4: Set up hosted Supabase project

**Status: already done by the controller session (not delegated to an implementer subagent).** Docker is unavailable in this environment, so the plan's original local-dev-stack approach (`supabase init` + `supabase start`) was replaced with a hosted Supabase project, created via the Supabase MCP plugin (`mcp__plugin_supabase_supabase__create_project`) directly by the controller — this required an interactive org/cost confirmation and a manual paste of the `service_role` key (never exposed via MCP tools, retrieved by the user from the Supabase dashboard), so it wasn't a good fit for a scripted implementer task.

**What exists as a result, for later tasks to rely on:**
- A hosted Supabase project named `operations-hub`, `project_id` = `yqzcunssgvffischmwle`, region `eu-central-1`.
- `.env.local` at the repo root (untracked — `create-next-app`'s default `.gitignore` already excludes `.env*.local`), populated with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — every later task in this plan that touches Supabase depends on these three variables being set. Already done; no task needs to (re)create this file.
- `.env.local.example` — still needs to be created (Step 1 below), as a checked-in template for anyone else setting up the project.

**Files:**
- Create: `.env.local.example`

- [ ] **Step 1: Create a checked-in example file**

Create `.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 2: Commit**

```bash
git add .env.local.example
git commit -m "chore: add .env.local.example for hosted Supabase setup"
```

---

## Task 5: Migration — companies, departments, locations

**Files:**
- Create: `supabase/migrations/<timestamp>_create_companies_departments_locations.sql`

**Interfaces:**
- Produces: tables `companies(id, name, slug, created_at)`, `departments(id, company_id, name, created_at)`, `locations(id, company_id, name, created_at)`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/<YYYYMMDDHHMMSS>_create_companies_departments_locations.sql` (use the current UTC timestamp for the prefix, standard Supabase migration naming) with:

```sql
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);
```

- [ ] **Step 2: Apply the migration to the hosted project**

Use the `mcp__plugin_supabase_supabase__apply_migration` tool with `project_id: "yqzcunssgvffischmwle"`, `name: "create_companies_departments_locations"`, and `query` set to the exact SQL from Step 1.
Expected: the tool call succeeds.

If this tool is not available to you, report NEEDS_CONTEXT rather than skipping this step or trying a workaround — do not fall back to `supabase` CLI commands (no local dev stack exists in this environment).

- [ ] **Step 3: Verify the tables exist**

Use the `mcp__plugin_supabase_supabase__list_tables` tool with `project_id: "yqzcunssgvffischmwle"`, `schemas: ["public"]`.
Expected: `companies`, `departments`, and `locations` all appear in the result.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add companies, departments, locations tables"
```

---

## Task 6: Migration — profiles

**Files:**
- Create: `supabase/migrations/<timestamp>_create_profiles.sql`

**Interfaces:**
- Consumes: `companies`, `departments` (Task 5), `auth.users` (built into Supabase).
- Produces: `user_role` enum (`employee | manager | operations_manager | it | hr | admin`) and `profiles(id, auth_user_id, company_id, full_name, role, department_id, manager_id, created_at)`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/<YYYYMMDDHHMMSS>_create_profiles.sql` (timestamp later than Task 5's migration file) with:

```sql
create type user_role as enum (
  'employee',
  'manager',
  'operations_manager',
  'it',
  'hr',
  'admin'
);

create table profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  full_name text not null,
  role user_role not null,
  department_id uuid references departments(id) on delete set null,
  manager_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index profiles_company_id_idx on profiles(company_id);
create index profiles_department_id_idx on profiles(department_id);
```

- [ ] **Step 2: Apply the migration to the hosted project**

Use the `mcp__plugin_supabase_supabase__apply_migration` tool with `project_id: "yqzcunssgvffischmwle"`, `name: "create_profiles"`, and `query` set to the exact SQL from Step 1.
Expected: the tool call succeeds.

If this tool is not available to you, report NEEDS_CONTEXT rather than skipping this step or trying a workaround.

- [ ] **Step 3: Verify the table exists**

Use the `mcp__plugin_supabase_supabase__list_tables` tool with `project_id: "yqzcunssgvffischmwle"`, `schemas: ["public"]`.
Expected: `profiles` appears in the result.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add profiles table with role enum"
```

---

## Task 7: Supabase client factories

**Files:**
- Create: `lib/supabase/browser.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts`

**Interfaces:**
- Produces:
  - `createSupabaseBrowserClient(): SupabaseClient` — anon key, browser-only, used for Auth calls from Client Components.
  - `createSupabaseServerClient(): Promise<SupabaseClient>` — anon key + request cookies, used in Server Components and Route Handlers to read the current session.
  - `createSupabaseAdminClient(): SupabaseClient` — service-role key, used only inside `lib/domain/**`, never imported from `app/**` client code.

- [ ] **Step 1: Create the browser client**

Create `lib/supabase/browser.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 2: Create the server client**

Create `lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component render — the middleware
            // (Task 8) is responsible for refreshing the session cookie.
          }
        },
      },
    }
  );
}
```

- [ ] **Step 3: Create the admin client**

Create `lib/supabase/admin.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

- [ ] **Step 4: Verify the project builds**

Run: `pnpm build`
Expected: build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/supabase
git commit -m "feat: add Supabase browser, server, and admin client factories"
```

---

## Task 8: Session-refresh middleware

**Files:**
- Create: `middleware.ts`

**Interfaces:**
- Consumes: none beyond env vars.
- Produces: refreshed Supabase auth cookies on every non-static request.

- [ ] **Step 1: Create the middleware**

Create `middleware.ts` at the repo root:

```ts
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 2: Verify the dev server starts cleanly**

Run: `pnpm build`
Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: add Supabase session-refresh middleware"
```

---

## Task 9: Auth validation schemas

**Files:**
- Create: `lib/validation/auth.ts`
- Test: `lib/validation/auth.test.ts`

**Interfaces:**
- Produces: `roleSchema` (Zod enum), `Role` (type), `completeSignupSchema`, `CompleteSignupInput` (type) — consumed by Task 10 (domain layer), Task 11 (API route), Task 12 (signup form).

- [ ] **Step 1: Write the failing test**

Create `lib/validation/auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { completeSignupSchema } from "@/lib/validation/auth";

describe("completeSignupSchema", () => {
  it("accepts a valid payload", () => {
    const result = completeSignupSchema.safeParse({
      fullName: "Max Mustermann",
      role: "it",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an empty full name", () => {
    const result = completeSignupSchema.safeParse({
      fullName: "",
      role: "it",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an unknown role", () => {
    const result = completeSignupSchema.safeParse({
      fullName: "Max Mustermann",
      role: "ceo",
    });

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test lib/validation/auth.test.ts`
Expected: FAIL — `lib/validation/auth` cannot be found.

- [ ] **Step 3: Implement the schema**

Create `lib/validation/auth.ts`:

```ts
import { z } from "zod";

export const roleSchema = z.enum([
  "employee",
  "manager",
  "operations_manager",
  "it",
  "hr",
  "admin",
]);

export type Role = z.infer<typeof roleSchema>;

export const completeSignupSchema = z.object({
  fullName: z.string().min(1, "Name is required").max(200),
  role: roleSchema,
});

export type CompleteSignupInput = z.infer<typeof completeSignupSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test lib/validation/auth.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/validation
git commit -m "feat: add auth validation schemas"
```

---

## Task 10: Domain layer — companies and profiles

**Files:**
- Create: `lib/domain/companies.ts`, `lib/domain/profiles.ts`
- Test: `lib/domain/profiles.test.ts`

**Interfaces:**
- Consumes: `createSupabaseAdminClient` (Task 7), `Role` (Task 9), `companies`/`profiles` tables (Tasks 5–6).
- Produces:
  - `Company { id, name, slug }`, `getDefaultCompany(): Promise<Company>`.
  - `Profile { id, authUserId, companyId, fullName, role, departmentId, managerId }`.
  - `createProfile(input: { authUserId, companyId, fullName, role }): Promise<Profile>`.
  - `getProfileByAuthUserId(authUserId: string): Promise<Profile | null>`.
  - These are consumed by Task 11 (API route) and Task 14 (app shell).

- [ ] **Step 1: Write the failing test**

Create `lib/domain/profiles.test.ts`:

```ts
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile, getProfileByAuthUserId } from "@/lib/domain/profiles";

const supabase = createSupabaseAdminClient();
let companyId: string;
const createdAuthUserIds: string[] = [];

beforeAll(async () => {
  const { data, error } = await supabase
    .from("companies")
    .upsert(
      { name: "Test Co (profiles)", slug: "test-co-profiles" },
      { onConflict: "slug" }
    )
    .select("id")
    .single();
  if (error) throw error;
  companyId = data.id;
});

afterEach(async () => {
  if (createdAuthUserIds.length === 0) return;
  await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
  for (const id of createdAuthUserIds) {
    await supabase.auth.admin.deleteUser(id);
  }
  createdAuthUserIds.length = 0;
});

describe("createProfile / getProfileByAuthUserId", () => {
  it("creates a profile and retrieves it by auth user id", async () => {
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: `profile-test-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (authError || !authUser.user) throw authError;
    createdAuthUserIds.push(authUser.user.id);

    const created = await createProfile({
      authUserId: authUser.user.id,
      companyId,
      fullName: "Test User",
      role: "employee",
    });

    expect(created.fullName).toBe("Test User");
    expect(created.role).toBe("employee");
    expect(created.departmentId).toBeNull();

    const fetched = await getProfileByAuthUserId(authUser.user.id);
    expect(fetched?.id).toBe(created.id);
  });

  it("returns null when no profile exists for the auth user id", async () => {
    const result = await getProfileByAuthUserId(crypto.randomUUID());
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test lib/domain/profiles.test.ts`
Expected: FAIL — `lib/domain/profiles` cannot be found.

- [ ] **Step 3: Implement `lib/domain/companies.ts`**

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface Company {
  id: string;
  name: string;
  slug: string;
}

export async function getDefaultCompany(): Promise<Company> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("slug", "alpentech-industries")
    .single();

  if (error) throw error;
  if (!data) {
    throw new Error(
      "Default company 'alpentech-industries' not found. Run the seed script (Task 15) first."
    );
  }

  return data;
}
```

- [ ] **Step 4: Implement `lib/domain/profiles.ts`**

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/validation/auth";

export interface Profile {
  id: string;
  authUserId: string;
  companyId: string;
  fullName: string;
  role: Role;
  departmentId: string | null;
  managerId: string | null;
}

interface ProfileRow {
  id: string;
  auth_user_id: string;
  company_id: string;
  full_name: string;
  role: Role;
  department_id: string | null;
  manager_id: string | null;
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    companyId: row.company_id,
    fullName: row.full_name,
    role: row.role,
    departmentId: row.department_id,
    managerId: row.manager_id,
  };
}

const PROFILE_COLUMNS =
  "id, auth_user_id, company_id, full_name, role, department_id, manager_id";

export async function getProfileByAuthUserId(
  authUserId: string
): Promise<Profile | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return toProfile(data);
}

export async function createProfile(input: {
  authUserId: string;
  companyId: string;
  fullName: string;
  role: Role;
}): Promise<Profile> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .insert({
      auth_user_id: input.authUserId,
      company_id: input.companyId,
      full_name: input.fullName,
      role: input.role,
    })
    .select(PROFILE_COLUMNS)
    .single();

  if (error) throw error;
  return toProfile(data);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test lib/domain/profiles.test.ts`
Expected: PASS (2 tests). Requires the local Supabase stack from Task 4 to be running.

- [ ] **Step 6: Commit**

```bash
git add lib/domain
git commit -m "feat: add companies and profiles domain layer"
```

---

## Task 11: API route — complete signup

**Files:**
- Create: `app/api/auth/complete-signup/route.ts`
- Test: `app/api/auth/complete-signup/route.test.ts`

**Interfaces:**
- Consumes: `createSupabaseServerClient` (Task 7), `completeSignupSchema` (Task 9), `getProfileByAuthUserId`/`createProfile` (Task 10), `getDefaultCompany` (Task 10).
- Produces: `POST /api/auth/complete-signup` — `201 { profile: Profile }` on success, `401` if unauthenticated, `409` if a profile already exists, `400` on invalid body. Consumed by Task 12's signup form.

- [ ] **Step 1: Write the failing test**

Create `app/api/auth/complete-signup/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("@/lib/domain/profiles", () => ({
  getProfileByAuthUserId: vi.fn(),
  createProfile: vi.fn(),
}));
vi.mock("@/lib/domain/companies", () => ({
  getDefaultCompany: vi.fn(),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
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
  vi.mocked(createSupabaseServerClient).mockReset();
  vi.mocked(getProfileByAuthUserId).mockReset();
  vi.mocked(createProfile).mockReset();
  vi.mocked(getDefaultCompany).mockReset();
});

describe("POST /api/auth/complete-signup", () => {
  it("returns 401 when there is no authenticated user", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as never);

    const response = await POST(jsonRequest({ fullName: "Max", role: "employee" }));
    expect(response.status).toBe(401);
  });

  it("creates a profile for an authenticated user without one yet", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "auth-1" } } }) },
    } as never);
    vi.mocked(getProfileByAuthUserId).mockResolvedValue(null);
    vi.mocked(getDefaultCompany).mockResolvedValue({
      id: "company-1",
      name: "AlpenTech Industries",
      slug: "alpentech-industries",
    });
    vi.mocked(createProfile).mockResolvedValue({
      id: "profile-1",
      authUserId: "auth-1",
      companyId: "company-1",
      fullName: "Max",
      role: "employee",
      departmentId: null,
      managerId: null,
    });

    const response = await POST(jsonRequest({ fullName: "Max", role: "employee" }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.profile.fullName).toBe("Max");
  });

  it("returns 409 when a profile already exists", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "auth-1" } } }) },
    } as never);
    vi.mocked(getProfileByAuthUserId).mockResolvedValue({
      id: "profile-1",
      authUserId: "auth-1",
      companyId: "company-1",
      fullName: "Max",
      role: "employee",
      departmentId: null,
      managerId: null,
    });

    const response = await POST(jsonRequest({ fullName: "Max", role: "employee" }));
    expect(response.status).toBe(409);
  });

  it("returns 400 for an invalid role", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "auth-1" } } }) },
    } as never);
    vi.mocked(getProfileByAuthUserId).mockResolvedValue(null);

    const response = await POST(jsonRequest({ fullName: "Max", role: "ceo" }));
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test app/api/auth/complete-signup/route.test.ts`
Expected: FAIL — the route module cannot be found.

- [ ] **Step 3: Implement the route**

Create `app/api/auth/complete-signup/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { completeSignupSchema } from "@/lib/validation/auth";
import { createProfile, getProfileByAuthUserId } from "@/lib/domain/profiles";
import { getDefaultCompany } from "@/lib/domain/companies";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const existing = await getProfileByAuthUserId(user.id);
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
    authUserId: user.id,
    companyId: company.id,
    fullName: parsed.data.fullName,
    role: parsed.data.role,
  });

  return NextResponse.json({ profile }, { status: 201 });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test app/api/auth/complete-signup/route.test.ts`
Expected: PASS (4 tests). Fully mocked — does not require the local Supabase stack.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth
git commit -m "feat: add complete-signup API route"
```

---

## Task 12: Landing page and signup form

**Files:**
- Create: `app/(marketing)/page.tsx`, `app/(marketing)/signup/page.tsx`, `components/auth/signup-form.tsx`
- Test: `components/auth/signup-form.test.tsx`
- Delete: `app/page.tsx` (the scaffolded default homepage — its route is replaced by `app/(marketing)/page.tsx`)

**Interfaces:**
- Consumes: `createSupabaseBrowserClient` (Task 7), `roleSchema` (Task 9), `Button`/`Input`/`Label` (Task 3), `POST /api/auth/complete-signup` (Task 11).
- Produces: `SignupForm` component; the `/` and `/signup` routes.

- [ ] **Step 1: Delete the scaffolded default homepage**

```bash
rm app/page.tsx
```

- [ ] **Step 2: Create the landing page**

Create `app/(marketing)/page.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-3xl font-semibold">Operations Hub</h1>
      <p className="max-w-md text-muted-foreground">
        A centralized internal operations platform for AlpenTech
        Industries — requests, tasks, workflows, employees, assets, and
        operations in one place.
      </p>
      <div className="flex gap-3">
        <Button render={<Link href="/signup" />}>Create an account</Button>
        <Button render={<Link href="/login" />} variant="outline">
          Log in
        </Button>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Write the failing test for the signup form**

Create `components/auth/signup-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const signUpMock = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { signUp: signUpMock },
  }),
}));

import { SignupForm } from "@/components/auth/signup-form";

beforeEach(() => {
  pushMock.mockReset();
  signUpMock.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ profile: {} }),
    })
  );
});

describe("SignupForm", () => {
  it("shows a validation error when submitted empty", async () => {
    render(<SignupForm />);
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("signs up, completes the profile, and redirects to the dashboard", async () => {
    signUpMock.mockResolvedValue({ error: null });
    render(<SignupForm />);

    await userEvent.type(screen.getByLabelText(/full name/i), "Max Mustermann");
    await userEvent.type(screen.getByLabelText(/email/i), "max@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.selectOptions(screen.getByLabelText(/explore as/i), "IT");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/dashboard"));
    expect(signUpMock).toHaveBeenCalledWith({
      email: "max@example.com",
      password: "password123",
    });
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm test components/auth/signup-form.test.tsx`
Expected: FAIL — `@/components/auth/signup-form` cannot be found.

- [ ] **Step 5: Implement the signup form**

Create `components/auth/signup-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { roleSchema } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const signupFormSchema = z.object({
  fullName: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: roleSchema,
});

type SignupFormValues = z.infer<typeof signupFormSchema>;

const ROLE_OPTIONS: { value: SignupFormValues["role"]; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "operations_manager", label: "Operations Manager" },
  { value: "it", label: "IT" },
  { value: "hr", label: "HR" },
  { value: "admin", label: "Admin" },
];

export function SignupForm() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({ resolver: zodResolver(signupFormSchema) });

  async function onSubmit(values: SignupFormValues) {
    setSubmitError(null);
    const supabase = createSupabaseBrowserClient();

    const { error: signUpError } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
    });
    if (signUpError) {
      setSubmitError(signUpError.message);
      return;
    }

    const response = await fetch("/api/auth/complete-signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fullName: values.fullName, role: values.role }),
    });

    if (!response.ok) {
      const body = await response.json();
      setSubmitError(typeof body.error === "string" ? body.error : "Failed to complete signup");
      return;
    }

    router.push("/dashboard");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 max-w-sm">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" {...register("fullName")} />
        {errors.fullName && <p className="text-sm text-red-600">{errors.fullName.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" {...register("email")} />
        {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" {...register("password")} />
        {errors.password && <p className="text-sm text-red-600">{errors.password.message}</p>}
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
        {isSubmitting ? "Creating account..." : "Create account"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 6: Create the signup page**

Create `app/(marketing)/signup/page.tsx`:

```tsx
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <SignupForm />
    </main>
  );
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm test components/auth/signup-form.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 8: Verify the project builds**

Run: `pnpm build`
Expected: build completes with no errors (note: `/login` is linked from the landing page but doesn't exist until Task 13 — this is expected and does not fail the build).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add landing page and signup form"
```

---

## Task 13: Login page and form

**Files:**
- Create: `app/(marketing)/login/page.tsx`, `components/auth/login-form.tsx`
- Test: `components/auth/login-form.test.tsx`

**Interfaces:**
- Consumes: `createSupabaseBrowserClient` (Task 7), `Button`/`Input`/`Label` (Task 3).
- Produces: `LoginForm` component; the `/login` route.

- [ ] **Step 1: Write the failing test**

Create `components/auth/login-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

const signInWithPasswordMock = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { signInWithPassword: signInWithPasswordMock },
  }),
}));

import { LoginForm } from "@/components/auth/login-form";

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  signInWithPasswordMock.mockReset();
});

describe("LoginForm", () => {
  it("shows a validation error when submitted empty", async () => {
    render(<LoginForm />);
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it("signs in and redirects to the dashboard", async () => {
    signInWithPasswordMock.mockResolvedValue({ error: null });
    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText(/email/i), "max@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/dashboard"));
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "max@example.com",
      password: "password123",
    });
  });

  it("shows the error message when sign-in fails", async () => {
    signInWithPasswordMock.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });
    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText(/email/i), "max@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Invalid login credentials")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test components/auth/login-form.test.tsx`
Expected: FAIL — `@/components/auth/login-form` cannot be found.

- [ ] **Step 3: Implement the login form**

Create `components/auth/login-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const loginFormSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export function LoginForm() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginFormSchema) });

  async function onSubmit(values: LoginFormValues) {
    setSubmitError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) {
      setSubmitError(error.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 max-w-sm">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" {...register("email")} />
        {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" {...register("password")} />
        {errors.password && <p className="text-sm text-red-600">{errors.password.message}</p>}
      </div>

      {submitError && <p className="text-sm text-red-600">{submitError}</p>}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Create the login page**

Create `app/(marketing)/login/page.tsx`:

```tsx
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Log in</h1>
      <LoginForm />
    </main>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test components/auth/login-form.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Verify the project builds**

Run: `pnpm build`
Expected: build completes with no errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add login page and form"
```

---

## Task 14: Authenticated app shell

**Files:**
- Create: `app/(app)/layout.tsx`, `app/(app)/dashboard/page.tsx`, `components/auth/logout-button.tsx`
- Test: `app/(app)/layout.test.tsx`

**Interfaces:**
- Consumes: `createSupabaseServerClient` (Task 7), `getProfileByAuthUserId` (Task 10), `createSupabaseBrowserClient` (Task 7), `Button` (Task 3).
- Produces: the `/dashboard` route, gated so unauthenticated visitors are redirected to `/login` and authenticated visitors without a profile are redirected to `/signup`.

- [ ] **Step 1: Write the failing test**

Create `app/(app)/layout.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
}));

const getUserMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

const getProfileByAuthUserIdMock = vi.fn();
vi.mock("@/lib/domain/profiles", () => ({
  getProfileByAuthUserId: (id: string) => getProfileByAuthUserIdMock(id),
}));

import AppLayout from "@/app/(app)/layout";

beforeEach(() => {
  redirectMock.mockClear();
  getUserMock.mockReset();
  getProfileByAuthUserIdMock.mockReset();
});

describe("AppLayout", () => {
  it("redirects to /login when there is no authenticated user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    await expect(AppLayout({ children: null })).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects to /signup when the user has no profile yet", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "auth-1" } } });
    getProfileByAuthUserIdMock.mockResolvedValue(null);

    await expect(AppLayout({ children: null })).rejects.toThrow("REDIRECT:/signup");
  });

  it("renders the shell with the profile's name and role", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "auth-1" } } });
    getProfileByAuthUserIdMock.mockResolvedValue({
      id: "profile-1",
      authUserId: "auth-1",
      companyId: "company-1",
      fullName: "Max Mustermann",
      role: "it",
      departmentId: null,
      managerId: null,
    });

    const element = await AppLayout({ children: "hello" });
    expect(JSON.stringify(element)).toContain("Max Mustermann");
    expect(JSON.stringify(element)).toContain('"it"');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test "app/(app)/layout.test.tsx"`
Expected: FAIL — `@/app/(app)/layout` cannot be found.

- [ ] **Step 3: Implement the logout button**

Create `components/auth/logout-button.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button variant="outline" onClick={handleLogout}>
      Log out
    </Button>
  );
}
```

- [ ] **Step 4: Implement the app shell layout**

Create `app/(app)/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfileByAuthUserId } from "@/lib/domain/profiles";
import { LogoutButton } from "@/components/auth/logout-button";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await getProfileByAuthUserId(user.id);
  if (!profile) {
    redirect("/signup");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="font-semibold">Operations Hub</span>
        <div className="flex items-center gap-4 text-sm">
          <span>
            {profile.fullName} · {profile.role}
          </span>
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 5: Create the placeholder dashboard page**

Create `app/(app)/dashboard/page.tsx`:

```tsx
export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Foundation phase complete. The real dashboard widgets are built in a
        later phase.
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test "app/(app)/layout.test.tsx"`
Expected: PASS (3 tests).

- [ ] **Step 7: Verify the project builds**

Run: `pnpm build`
Expected: build completes with no errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add authenticated app shell and placeholder dashboard"
```

---

## Task 15: Seed script — AlpenTech Industries

**Files:**
- Create: `lib/domain/seed.ts`, `scripts/seed.ts`
- Test: `lib/domain/seed.test.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `createSupabaseAdminClient` (Task 7), `companies`/`departments`/`locations` tables (Task 5).
- Produces: `seedFoundationData(): Promise<{ companyId: string }>`, `ALPENTECH_SLUG`, `ALPENTECH_DEPARTMENTS`, `ALPENTECH_LOCATIONS` — later phases' seed scripts extend this same company row.

- [ ] **Step 1: Write the failing test**

Create `lib/domain/seed.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  seedFoundationData,
  ALPENTECH_DEPARTMENTS,
  ALPENTECH_LOCATIONS,
} from "@/lib/domain/seed";

describe("seedFoundationData", () => {
  it("creates AlpenTech Industries with its departments and locations, and is idempotent", async () => {
    const supabase = createSupabaseAdminClient();

    const first = await seedFoundationData();
    const second = await seedFoundationData();
    expect(second.companyId).toBe(first.companyId);

    const { data: departments, error: departmentsError } = await supabase
      .from("departments")
      .select("name")
      .eq("company_id", first.companyId);
    if (departmentsError) throw departmentsError;
    expect(departments?.map((d) => d.name).sort()).toEqual(
      [...ALPENTECH_DEPARTMENTS].sort()
    );

    const { data: locations, error: locationsError } = await supabase
      .from("locations")
      .select("name")
      .eq("company_id", first.companyId);
    if (locationsError) throw locationsError;
    expect(locations?.map((l) => l.name).sort()).toEqual(
      [...ALPENTECH_LOCATIONS].sort()
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test lib/domain/seed.test.ts`
Expected: FAIL — `lib/domain/seed` cannot be found.

- [ ] **Step 3: Implement the seed domain function**

Create `lib/domain/seed.ts`:

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const ALPENTECH_SLUG = "alpentech-industries";

export const ALPENTECH_DEPARTMENTS = [
  "Engineering",
  "Production",
  "Operations",
  "IT",
  "HR",
  "Finance",
  "Procurement",
  "Sales",
];

export const ALPENTECH_LOCATIONS = ["Vienna", "Graz", "Linz"];

export async function seedFoundationData(): Promise<{ companyId: string }> {
  const supabase = createSupabaseAdminClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .upsert(
      { name: "AlpenTech Industries", slug: ALPENTECH_SLUG },
      { onConflict: "slug" }
    )
    .select("id")
    .single();
  if (companyError) throw companyError;

  const { error: departmentsError } = await supabase
    .from("departments")
    .upsert(
      ALPENTECH_DEPARTMENTS.map((name) => ({ company_id: company.id, name })),
      { onConflict: "company_id,name" }
    );
  if (departmentsError) throw departmentsError;

  const { error: locationsError } = await supabase
    .from("locations")
    .upsert(
      ALPENTECH_LOCATIONS.map((name) => ({ company_id: company.id, name })),
      { onConflict: "company_id,name" }
    );
  if (locationsError) throw locationsError;

  return { companyId: company.id };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test lib/domain/seed.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Create the CLI runner**

Create `scripts/seed.ts`:

```ts
import { seedFoundationData } from "@/lib/domain/seed";

seedFoundationData().then(
  ({ companyId }) => {
    console.log(`Seeded AlpenTech Industries (${companyId}).`);
    process.exit(0);
  },
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
```

- [ ] **Step 6: Add the seed script to `package.json`**

Add to the `scripts` section:

```json
"seed": "tsx scripts/seed.ts"
```

- [ ] **Step 7: Run the seed script against local Supabase**

Run: `pnpm seed`
Expected: prints `Seeded AlpenTech Industries (<uuid>).`

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add AlpenTech Industries seed script"
```

---

## End-to-End Verification

After all 15 tasks are complete:

1. Run: `pnpm test` — Expected: all tests pass.
2. Run: `pnpm build` — Expected: build completes with no errors.
3. Run: `pnpm seed` — Expected: AlpenTech Industries is seeded (idempotent if already run).
4. Run: `pnpm dev`, open `http://localhost:3000`:
   - Landing page shows "Create an account" / "Log in" buttons.
   - Sign up choosing role "IT" → redirected to `/dashboard`, header shows your name and "it".
   - Log out → redirected to `/login`.
   - Log back in with the same credentials → redirected to `/dashboard`.
   - Visiting `/dashboard` while logged out redirects to `/login`.

This closes out the Foundation phase from the spec's suggested build order (§12). The next plan (Phase 2 — Tasks) builds on `profiles`, the domain-layer pattern, and the app shell established here.
