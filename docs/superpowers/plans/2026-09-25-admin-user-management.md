# Admin User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `hr`/`admin` users see an employee's email/invite status and change their role or active/inactive status from `/employees`, and resend a Clerk invitation for an employee who hasn't linked their account yet.

**Architecture:** A new `profiles.invited_email` column plugs the one real gap found during planning (the invited address is otherwise discarded after the initial invite). Role and status changes reuse the existing, currently-unused `updateEmployee`/`PATCH /api/employees/[id]` path. A new `resendEmployeeInvite` domain function and `POST /api/employees/[id]/resend-invite` route handle invites. A new `getAccountInfoForEmployees` domain function batches Clerk `users.getUserList` lookups for linked employees (one call, not N) and reads `invited_email` directly for pending ones — no data is synced or cached, every read is live. A new `EmployeeAccountControl` component (visible only to `hr`/`admin`) exposes all three actions on the detail page; the list page gets a permission-gated "Account" column.

**Tech Stack:** Next.js 16 (App Router), React 19, `@clerk/nextjs` v7.9.6 (`clerkClient` from `@clerk/nextjs/server`), Supabase Postgres, Zod, vitest + `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-09-25-admin-user-management-design.md`

## Global Constraints

- No Clerk-side account suspension/ban — "deactivate" only flips `profiles.status`.
- A *linked* employee's email is always fetched live from Clerk on each request — never stored, never synced.
- `profiles.invited_email` is the one narrow exception: set once at invite time, read only for a still-pending employee (no linked Clerk account exists yet to read an email from).
- New permission `canManageEmployeeAccount` reuses `EMPLOYEE_MANAGER_ROLES` (`hr`, `admin`) — the same set as `canCreateEmployee`/`canUpdateEmployee`. No new role concept.
- No self-action guard — an hr/admin user can act on their own row.
- The new email/invite-status column and all three actions are gated separately from `/employees`'s existing company-wide visibility — only `hr`/`admin` see them, not every `COMPANY_WIDE_VIEW_ROLES` member.
- `clerk.invitations.createInvitation` takes `ignoreExisting: true` to resend without first revoking the prior pending invitation (confirmed against Clerk's Backend API docs during planning — this is not a guess).
- `next build`, `tsc --noEmit`, and `pnpm lint` must stay clean by the final whole-branch verification task; per-task verification runs scoped tests (matching this project's established convention from prior phases).

## Review Focus

- **Role change and status change must produce distinct, correct activity messages, not the generic one.** `updateEmployee` already exists and is tested with the generic "updated X's profile" message; sharpening it for `role`/`status` must not silently regress the generic case for other fields (department, position, etc.). Pinned in Task 4.
- **`resendEmployeeInvite` must reject when already linked, and must use the stored `invited_email`, not `profile.email` (which doesn't exist) or a hallucinated lookup.** A caller resending an invite for a linked employee, or one with no `invited_email` on file (pre-migration data), must get a clear, correctly-typed error, not a crash or a silent no-op. Pinned in Task 4.
- **The batch Clerk lookup (`getAccountInfoForEmployees`) must make exactly one `users.getUserList` call regardless of list size, and must return an empty map (not throw, not partially populate) for a caller without `canManageEmployeeAccount`.** A wrong implementation here either leaks account data to unauthorized roles or reintroduces the N+1 Clerk-call problem the design specifically avoids. Pinned in Task 4 and re-verified from the API route side in Task 5.
- **The 31-file test ripple in Task 1 must actually make every touched file compile and pass, not just the ones directly relevant to this feature.** A missed file surfaces as a `tsc` failure that could be misattributed to a later task. Pinned in Task 1's own verification step (a full `tsc --noEmit` before the task is considered done, not deferred to the end).
- **The "Account" column and `EmployeeAccountControl` must be invisible, not merely inert, for roles outside `hr`/`admin`.** A caller without `canManageEmployeeAccount` should see the exact same `/employees` list and detail page as before this plan — no partially-rendered controls, no visible-but-disabled buttons. Pinned in Tasks 6 and 8.

---

### Task 1: Schema + `Profile` type plumbing for `invited_email`

**Files:**
- Create: `supabase/migrations/20260925000000_add_profiles_invited_email.sql`
- Modify: `lib/supabase/database.types.ts`
- Modify: `lib/domain/profiles.ts`
- Modify (batched, identical one-line edit in each): `lib/domain/permissions.test.ts`, `app/(app)/settings/page.test.tsx`, `app/(app)/reports/page.test.tsx`, `app/api/tasks/route.test.ts`, `app/api/tasks/[id]/route.test.ts`, `app/api/tasks/[id]/complete-with-asset/route.test.ts`, `app/api/tasks/[id]/comments/route.test.ts`, `app/api/auth/complete-signup/route.test.ts`, `app/api/tasks/[id]/attachments/route.test.ts`, `app/api/workflows/templates/route.test.ts`, `app/api/workflows/instances/route.test.ts`, `app/api/operations/route.test.ts`, `app/api/workflows/instances/[id]/route.test.ts`, `app/api/operations/[id]/route.test.ts`, `app/api/operations/[id]/comments/route.test.ts`, `app/api/operations/[id]/link/route.test.ts`, `app/api/requests/route.test.ts`, `app/api/requests/[id]/route.test.ts`, `app/api/requests/[id]/comments/route.test.ts`, `app/api/requests/[id]/attachments/route.test.ts`, `app/api/profiles/route.test.ts`, `app/api/approvals/route.test.ts`, `app/api/approvals/[id]/decide/route.test.ts`, `app/api/approvals/[id]/reassign/route.test.ts`, `app/api/assets/route.test.ts`, `app/api/assets/[id]/route.test.ts`, `app/api/notifications/read-all/route.test.ts`, `app/api/notifications/route.test.ts`, `app/api/notifications/[id]/read/route.test.ts`, `app/api/employees/route.test.ts`, `app/api/employees/[id]/route.test.ts`

**Interfaces:**
- Produces: `Profile.invitedEmail: string | null` — every later task that constructs or reads a `Profile` uses this exact field name.

**Context:** Adding a required (but nullable) field to the shared `Profile` interface means every test file that hand-constructs a full `Profile` object (not via `createProfile`) needs one new line, or it fails to compile. This was checked exhaustively during planning — the 31 files listed above are *every* such file in the codebase (confirmed by grepping for the interface's other required-nullable fields, `relatedOperationId`/`status`, which appear together, once per file, in exactly this set). `lib/domain/profiles.test.ts` was checked and excluded: its two matches are `updateProfile(...)` call arguments (a different, all-optional type), not `Profile` object construction, so it needs no change.

- [ ] **Step 1: Write the migration**

```sql
alter table profiles add column invited_email text;
```

- [ ] **Step 2: Run the migration against the local/dev Supabase instance**

Run: `supabase migration up` (or this project's established equivalent — check `package.json` scripts for a `db:migrate`-style alias before assuming the raw CLI command)
Expected: migration applies with no errors.

- [ ] **Step 3: Update `lib/supabase/database.types.ts`'s `profiles` table type**

In the `profiles` table's `Row`, add (alphabetically, between `id` and `location_id`):

```ts
          id: string
          invited_email: string | null
          location_id: string | null
```

In `Insert`, add (same position):

```ts
          id?: string
          invited_email?: string | null
          location_id?: string | null
```

In `Update`, add (same position):

```ts
          id?: string
          invited_email?: string | null
          location_id?: string | null
```

- [ ] **Step 4: Update `lib/domain/profiles.ts`**

Add to the `Profile` interface (after `id`, before `companyId` — matching this interface's existing field order, which doesn't strictly follow the DB column order):

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
  invitedEmail: string | null;
}
```

Add to `ProfileRow`:

```ts
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
  invited_email: string | null;
}
```

Add to `toProfile`:

```ts
export function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    companyId: row.company_id,
    fullName: row.full_name,
    role: row.role,
    departmentId: row.department_id,
    managerId: row.manager_id,
    positionTitle: row.position_title,
    employeeNumber: row.employee_number,
    locationId: row.location_id,
    relatedOperationId: row.related_operation_id,
    status: row.status,
    invitedEmail: row.invited_email,
  };
}
```

Add to `PROFILE_COLUMNS`:

```ts
export const PROFILE_COLUMNS =
  "id, auth_user_id, company_id, full_name, role, department_id, manager_id, position_title, employee_number, location_id, related_operation_id, status, invited_email";
```

Add `invitedEmail` to `createProfile`'s input type and insert call:

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
  invitedEmail?: string | null;
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
      invited_email: input.invitedEmail ?? null,
    })
    .select(PROFILE_COLUMNS)
    .single();

  if (error) throw error;
  return toProfile(data);
}
```

Add `role` to `updateProfile`'s `updates` parameter type and update object (this is *also* needed for Task 4's role-change support, but belongs here since it's the same "extend the shape `Profile`/`updateProfile` accept" change):

```ts
export async function updateProfile(
  id: string,
  updates: {
    positionTitle?: string | null;
    employeeNumber?: string | null;
    departmentId?: string | null;
    managerId?: string | null;
    locationId?: string | null;
    relatedOperationId?: string | null;
    status?: ProfileStatus;
    role?: Role;
  }
): Promise<Profile> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({
      ...(updates.positionTitle !== undefined && { position_title: updates.positionTitle }),
      ...(updates.employeeNumber !== undefined && { employee_number: updates.employeeNumber }),
      ...(updates.departmentId !== undefined && { department_id: updates.departmentId }),
      ...(updates.managerId !== undefined && { manager_id: updates.managerId }),
      ...(updates.locationId !== undefined && { location_id: updates.locationId }),
      ...(updates.relatedOperationId !== undefined && {
        related_operation_id: updates.relatedOperationId,
      }),
      ...(updates.status !== undefined && { status: updates.status }),
      ...(updates.role !== undefined && { role: updates.role }),
    })
    .eq("id", id)
    .select(PROFILE_COLUMNS)
    .single();
  if (error) throw error;
  return toProfile(data);
}
```

Note: `Role` is already imported in this file (`import type { Role } from "@/lib/validation/auth";`) — no new import needed.

- [ ] **Step 5: Run this file's own test suite**

Run: `pnpm vitest run lib/domain/profiles.test.ts`
Expected: PASS (this file wasn't touched, but confirms the `Profile`/`updateProfile` changes didn't break its existing `updateProfile` tests).

- [ ] **Step 6: Fix the 31-file test ripple**

In every file listed above, find the line `relatedOperationId: null,` immediately followed by a `status: "active"` line (either `status: "active",` or `status: "active" as const,` — both forms occur), and insert `invitedEmail: null,` (matching that file's own trailing-comma/no-`as const` style — the `.tsx` page-test files use `status: "active",` with no `as const`; every `.ts` route-test file uses `status: "active" as const,`) immediately after `relatedOperationId: null,`, before `status`. For example, in a `.ts` route test:

```ts
  relatedOperationId: null,
  invitedEmail: null,
  status: "active" as const,
```

Two files (`app/(app)/reports/page.test.tsx` and `app/api/auth/complete-signup/route.test.ts`) have this pattern *twice* (two separate profile fixtures in the same file) — fix both occurrences in each.

- [ ] **Step 7: Run the full type check and unit suite**

Run: `pnpm tsc --noEmit`
Expected: zero errors introduced by this task (the one pre-existing, unrelated `app/layout.tsx(24,50)` error is expected and not yours to fix).

Run: `pnpm test:unit`
Expected: all tests pass, same count as before this task (this is a type-only ripple — no behavior changed).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260925000000_add_profiles_invited_email.sql lib/supabase/database.types.ts lib/domain/profiles.ts lib/domain/permissions.test.ts "app/(app)/settings/page.test.tsx" "app/(app)/reports/page.test.tsx" app/api/tasks/route.test.ts "app/api/tasks/[id]/route.test.ts" "app/api/tasks/[id]/complete-with-asset/route.test.ts" "app/api/tasks/[id]/comments/route.test.ts" app/api/auth/complete-signup/route.test.ts "app/api/tasks/[id]/attachments/route.test.ts" app/api/workflows/templates/route.test.ts app/api/workflows/instances/route.test.ts app/api/operations/route.test.ts "app/api/workflows/instances/[id]/route.test.ts" "app/api/operations/[id]/route.test.ts" "app/api/operations/[id]/comments/route.test.ts" "app/api/operations/[id]/link/route.test.ts" app/api/requests/route.test.ts "app/api/requests/[id]/route.test.ts" "app/api/requests/[id]/comments/route.test.ts" "app/api/requests/[id]/attachments/route.test.ts" app/api/profiles/route.test.ts app/api/approvals/route.test.ts "app/api/approvals/[id]/decide/route.test.ts" "app/api/approvals/[id]/reassign/route.test.ts" app/api/assets/route.test.ts "app/api/assets/[id]/route.test.ts" app/api/notifications/read-all/route.test.ts app/api/notifications/route.test.ts "app/api/notifications/[id]/read/route.test.ts" app/api/employees/route.test.ts "app/api/employees/[id]/route.test.ts"
git commit -m "$(cat <<'EOF'
feat: add profiles.invited_email column and Profile type plumbing

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Permission — `canManageEmployeeAccount`

**Files:**
- Modify: `lib/domain/permissions.ts`
- Modify: `lib/domain/permissions.test.ts`

**Interfaces:**
- Consumes: `Profile.invitedEmail` from Task 1 (only via the already-updated `makeProfile` test helper — this task doesn't read the field itself).
- Produces: `canManageEmployeeAccount(profile: Profile): boolean` — Task 4 (domain layer) and Task 6/7/8 (UI/pages) import this.

- [ ] **Step 1: Write the failing test**

In `lib/domain/permissions.test.ts`, add `canManageEmployeeAccount` to the import list (alphabetically, after `canLinkEntityToOperation`), and add this test block after the existing `describe("canCreateEmployee / canUpdateEmployee", ...)` block:

```ts
describe("canManageEmployeeAccount", () => {
  it("allows hr and admin, denies everyone else", () => {
    expect(canManageEmployeeAccount(makeProfile({ role: "hr" }))).toBe(true);
    expect(canManageEmployeeAccount(makeProfile({ role: "admin" }))).toBe(true);
    expect(canManageEmployeeAccount(makeProfile({ role: "operations_manager" }))).toBe(false);
    expect(canManageEmployeeAccount(makeProfile({ role: "it" }))).toBe(false);
    expect(canManageEmployeeAccount(makeProfile({ role: "manager" }))).toBe(false);
    expect(canManageEmployeeAccount(makeProfile({ role: "employee" }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/domain/permissions.test.ts`
Expected: FAIL with "canManageEmployeeAccount is not defined" (or a TypeScript import error, depending on how vitest surfaces it)

- [ ] **Step 3: Write the implementation**

In `lib/domain/permissions.ts`, add immediately after `canUpdateEmployee`:

```ts
export function canManageEmployeeAccount(profile: Profile): boolean {
  return EMPLOYEE_MANAGER_ROLES.has(profile.role);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/domain/permissions.test.ts`
Expected: PASS (all tests in this file, including the new one)

- [ ] **Step 5: Commit**

```bash
git add lib/domain/permissions.ts lib/domain/permissions.test.ts
git commit -m "$(cat <<'EOF'
feat: add canManageEmployeeAccount permission

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Validation — `role` on `updateEmployeeSchema`

**Files:**
- Modify: `lib/validation/employees.ts`
- Modify: `lib/validation/employees.test.ts`

**Interfaces:**
- Produces: `UpdateEmployeeInput.role?: Role` — Task 4's `updateEmployee` and Task 7's `EmployeeAccountControl` (via the `PATCH` route) both send/expect this field.

- [ ] **Step 1: Write the failing test**

In `lib/validation/employees.test.ts`, add this test to the `describe("updateEmployeeSchema", ...)` block:

```ts
  it("accepts a role change", () => {
    const result = updateEmployeeSchema.safeParse({ role: "manager" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid role", () => {
    const result = updateEmployeeSchema.safeParse({ role: "ceo" });
    expect(result.success).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/validation/employees.test.ts`
Expected: FAIL — `role` is not a recognized key on `updateEmployeeSchema` yet, so `{ role: "manager" }` fails validation (Zod's default is to strip/reject unknown keys depending on schema mode; either way the first new test's `expect(result.success).toBe(true)` fails)

- [ ] **Step 3: Write the implementation**

In `lib/validation/employees.ts`, add `role` to `updateEmployeeSchema` (reusing the already-imported `roleSchema`):

```ts
export const updateEmployeeSchema = z.object({
  positionTitle: z.string().max(200).optional(),
  employeeNumber: z.string().max(50).optional(),
  departmentId: z.string().uuid().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  status: profileStatusSchema.optional(),
  role: roleSchema.optional(),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/validation/employees.test.ts`
Expected: PASS (all tests in this file)

- [ ] **Step 5: Commit**

```bash
git add lib/validation/employees.ts lib/validation/employees.test.ts
git commit -m "$(cat <<'EOF'
feat: accept role on updateEmployeeSchema

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Domain layer — `employees.ts` additions

**Files:**
- Modify: `lib/domain/employees.ts`
- Modify: `lib/domain/employees.test.ts`

**Interfaces:**
- Consumes: `canManageEmployeeAccount` (Task 2), `UpdateEmployeeInput.role` (Task 3), `Profile.invitedEmail`/`updateProfile`'s `role` support (Task 1).
- Produces: `EmployeeAccountInfo` type, `getAccountInfoForEmployees(profile, employees): Promise<Map<string, EmployeeAccountInfo>>`, `resendEmployeeInvite(profile, employeeId): Promise<void>` — Task 5 (API routes) and Task 7/8 (UI) all consume these exact names.

**Context:** This file's existing tests (`lib/domain/employees.test.ts`) are integration tests gated by `describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)` — they hit a real Supabase instance and mock only the Clerk client via a top-level `vi.mock("@clerk/nextjs/server", ...)`. New tests in this task follow the same pattern, extending that same mock to also cover `users.getUser`/`users.getUserList`.

#### Part A — `createEmployee` stores `invitedEmail`

- [ ] **Step 1: Write the failing test**

In `lib/domain/employees.test.ts`, add this test to the `describe.skipIf(...)("createEmployee", ...)` block, after the existing "creates a pending profile..." test:

```ts
  it("stores the invited email on the profile for a later resend", async () => {
    createInvitationMock.mockReset();
    createInvitationMock.mockResolvedValue({ id: "inv_789" });

    const newHireEmail = `new-hire-invited-email-${crypto.randomUUID()}@example.com`;
    const employee = await createEmployee(hrProfile, {
      email: newHireEmail,
      fullName: "Invited Email Hire",
      role: "employee",
      startOnboarding: false,
    });

    expect(employee.invitedEmail).toBe(newHireEmail);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/domain/employees.test.ts`
Expected: FAIL — `employee.invitedEmail` is `null` (not yet set by `createEmployee`)

- [ ] **Step 3: Write the implementation**

In `lib/domain/employees.ts`'s `createEmployee`, add `invitedEmail: input.email` to the `createProfile` call:

```ts
  const employee = await createProfile({
    companyId: profile.companyId,
    fullName: input.fullName,
    role: input.role,
    departmentId: input.departmentId ?? null,
    managerId: input.managerId ?? null,
    locationId: input.locationId ?? null,
    positionTitle: input.positionTitle ?? null,
    employeeNumber: input.employeeNumber ?? null,
    invitedEmail: input.email,
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/domain/employees.test.ts`
Expected: PASS (all tests in this file)

- [ ] **Step 5: Commit**

```bash
git add lib/domain/employees.ts lib/domain/employees.test.ts
git commit -m "$(cat <<'EOF'
feat: store the invited email when creating an employee

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

#### Part B — `updateEmployee`'s sharpened activity messages

- [ ] **Step 1: Write the failing tests**

In `lib/domain/employees.test.ts`, add these tests to the `describe.skipIf(...)("getEmployeeProfile / updateEmployee / listEmployees", ...)` block, after the existing "updates an employee and logs activity" test:

```ts
    it("logs a role-change-specific activity message", async () => {
      await updateEmployee(hr, target.id, { role: "manager" });
      const { activity } = await getEmployeeProfile(hr, target.id);
      expect(
        activity.some((entry) =>
          entry.message.includes(`changed ${target.fullName}'s role from employee to manager`)
        )
      ).toBe(true);
    });

    it("logs a deactivate-specific activity message", async () => {
      await updateEmployee(hr, target.id, { status: "inactive" });
      const { activity } = await getEmployeeProfile(hr, target.id);
      expect(
        activity.some((entry) => entry.message.includes(`deactivated ${target.fullName}'s account`))
      ).toBe(true);

      // restore for any later test in this file that assumes an active target
      await updateEmployee(hr, target.id, { status: "active" });
    });

    it("logs a reactivate-specific activity message", async () => {
      await updateEmployee(hr, target.id, { status: "inactive" });
      await updateEmployee(hr, target.id, { status: "active" });
      const { activity } = await getEmployeeProfile(hr, target.id);
      expect(
        activity.some((entry) => entry.message.includes(`reactivated ${target.fullName}'s account`))
      ).toBe(true);
    });
```

Note: the existing "updates an employee and logs activity" test (unchanged by this task) already pins that a plain `positionTitle` update keeps the generic `"updated ... profile"` message — that test's continued passing is itself the regression check for the generic path.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run lib/domain/employees.test.ts`
Expected: FAIL — all three new tests fail because every `updateEmployee` call currently logs the generic `"updated X's profile"` message regardless of what changed

- [ ] **Step 3: Write the implementation**

In `lib/domain/employees.ts`, replace `updateEmployee`'s body:

```ts
export async function updateEmployee(
  profile: Profile,
  employeeId: string,
  input: UpdateEmployeeInput
): Promise<Employee> {
  if (!canUpdateEmployee(profile)) {
    throw new ForbiddenError("You cannot update employees");
  }
  const target = await getProfileById(employeeId);
  if (!target || target.companyId !== profile.companyId) {
    throw new NotFoundError("Employee not found");
  }

  const updated = await updateProfile(employeeId, input);

  let message = `${profile.fullName} updated ${target.fullName}'s profile`;
  if (input.role !== undefined && input.role !== target.role) {
    message = `${profile.fullName} changed ${target.fullName}'s role from ${target.role} to ${input.role}`;
  } else if (input.status !== undefined && input.status !== target.status) {
    message =
      input.status === "inactive"
        ? `${profile.fullName} deactivated ${target.fullName}'s account`
        : `${profile.fullName} reactivated ${target.fullName}'s account`;
  }
  await logActivity("profile", employeeId, profile.id, message);

  try {
    await broadcastChange(profile.companyId, "employees", { type: "employee_updated" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }
  return updated;
}
```

(If both `role` and `status` are present in the same call, the role message wins — the UI built in Task 7 never sends both together, so this ordering is a deliberate simplification, not an oversight.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run lib/domain/employees.test.ts`
Expected: PASS (all tests in this file)

- [ ] **Step 5: Commit**

```bash
git add lib/domain/employees.ts lib/domain/employees.test.ts
git commit -m "$(cat <<'EOF'
feat: sharpen updateEmployee's activity message for role/status changes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

#### Part C — `EmployeeAccountInfo` + `getAccountInfoForEmployees`

- [ ] **Step 1: Extend the Clerk mock**

In `lib/domain/employees.test.ts`, replace the top-level Clerk mock to also cover `users`:

```ts
const createInvitationMock = vi.fn();
const getUserListMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    invitations: { createInvitation: createInvitationMock },
    users: { getUserList: getUserListMock },
  }),
}));
```

- [ ] **Step 2: Write the failing tests**

Add a new top-level `describe` block (this doesn't need `SUPABASE_SERVICE_ROLE_KEY` — it only needs a `Profile` fixture and the mocked Clerk client, so it's a plain unit-style block, not gated by `describe.skipIf`):

```ts
describe("getAccountInfoForEmployees", () => {
  beforeEach(() => {
    getUserListMock.mockReset();
  });

  function makeEmployee(overrides: Partial<Profile> = {}): Profile {
    return {
      id: "employee-1",
      authUserId: null,
      companyId: "company-1",
      fullName: "Test Employee",
      role: "employee",
      departmentId: null,
      managerId: null,
      positionTitle: null,
      employeeNumber: null,
      locationId: null,
      relatedOperationId: null,
      status: "active",
      invitedEmail: null,
      ...overrides,
    };
  }

  const hr: Profile = {
    id: "hr-1",
    authUserId: "auth-hr-1",
    companyId: "company-1",
    fullName: "HR Person",
    role: "hr",
    departmentId: null,
    managerId: null,
    positionTitle: null,
    employeeNumber: null,
    locationId: null,
    relatedOperationId: null,
    status: "active",
    invitedEmail: null,
  };

  const stranger: Profile = { ...hr, id: "stranger-1", role: "employee" };

  it("returns an empty map for a caller without canManageEmployeeAccount, without calling Clerk", async () => {
    const employees = [makeEmployee({ authUserId: "auth-1" })];
    const result = await getAccountInfoForEmployees(stranger, employees);
    expect(result.size).toBe(0);
    expect(getUserListMock).not.toHaveBeenCalled();
  });

  it("returns invitedEmail for a pending employee, without calling Clerk", async () => {
    const employees = [makeEmployee({ id: "pending-1", authUserId: null, invitedEmail: "pending@example.com" })];
    const result = await getAccountInfoForEmployees(hr, employees);
    expect(result.get("pending-1")).toEqual({ linked: false, invitedEmail: "pending@example.com" });
    expect(getUserListMock).not.toHaveBeenCalled();
  });

  it("makes exactly one Clerk call for multiple linked employees and maps each back by profile id", async () => {
    getUserListMock.mockResolvedValue({
      data: [
        {
          id: "auth-1",
          primaryEmailAddressId: "email-1",
          emailAddresses: [{ id: "email-1", emailAddress: "alice@example.com" }],
        },
        {
          id: "auth-2",
          primaryEmailAddressId: "email-2",
          emailAddresses: [{ id: "email-2", emailAddress: "bob@example.com" }],
        },
      ],
    });

    const employees = [
      makeEmployee({ id: "linked-1", authUserId: "auth-1" }),
      makeEmployee({ id: "linked-2", authUserId: "auth-2" }),
    ];
    const result = await getAccountInfoForEmployees(hr, employees);

    expect(getUserListMock).toHaveBeenCalledTimes(1);
    expect(getUserListMock).toHaveBeenCalledWith({ userId: ["auth-1", "auth-2"], limit: 2 });
    expect(result.get("linked-1")).toEqual({ linked: true, email: "alice@example.com" });
    expect(result.get("linked-2")).toEqual({ linked: true, email: "bob@example.com" });
  });

  it("mixes linked and pending employees correctly in one call", async () => {
    getUserListMock.mockResolvedValue({
      data: [
        {
          id: "auth-1",
          primaryEmailAddressId: "email-1",
          emailAddresses: [{ id: "email-1", emailAddress: "alice@example.com" }],
        },
      ],
    });

    const employees = [
      makeEmployee({ id: "linked-1", authUserId: "auth-1" }),
      makeEmployee({ id: "pending-1", authUserId: null, invitedEmail: "pending@example.com" }),
    ];
    const result = await getAccountInfoForEmployees(hr, employees);

    expect(result.get("linked-1")).toEqual({ linked: true, email: "alice@example.com" });
    expect(result.get("pending-1")).toEqual({ linked: false, invitedEmail: "pending@example.com" });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run lib/domain/employees.test.ts`
Expected: FAIL — `getAccountInfoForEmployees` is not defined

- [ ] **Step 4: Write the implementation**

In `lib/domain/employees.ts`, add near the top (after the `Employee` type alias) and import `canManageEmployeeAccount`:

```ts
import { canCreateEmployee, canUpdateEmployee, canViewEmployeeProfile, canManageEmployeeAccount } from "@/lib/domain/permissions";
```

```ts
export type EmployeeAccountInfo =
  | { linked: true; email: string }
  | { linked: false; invitedEmail: string | null };

interface ClerkEmailAddress {
  id: string;
  emailAddress: string;
}

interface ClerkUserLike {
  id: string;
  primaryEmailAddressId: string | null;
  emailAddresses: ClerkEmailAddress[];
}

function extractPrimaryEmail(user: ClerkUserLike): string {
  return (
    user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId)?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    ""
  );
}

export async function getAccountInfoForEmployees(
  profile: Profile,
  employees: Employee[]
): Promise<Map<string, EmployeeAccountInfo>> {
  const result = new Map<string, EmployeeAccountInfo>();
  if (!canManageEmployeeAccount(profile)) {
    return result;
  }

  const linked = employees.filter((employee) => employee.authUserId !== null);
  const pending = employees.filter((employee) => employee.authUserId === null);

  for (const employee of pending) {
    result.set(employee.id, { linked: false, invitedEmail: employee.invitedEmail });
  }

  if (linked.length > 0) {
    const clerk = await clerkClient();
    const authUserIds = linked.map((employee) => employee.authUserId as string);
    const { data: users } = await clerk.users.getUserList({
      userId: authUserIds,
      limit: authUserIds.length,
    });
    const emailByAuthUserId = new Map(users.map((user) => [user.id, extractPrimaryEmail(user)]));
    for (const employee of linked) {
      const email = emailByAuthUserId.get(employee.authUserId as string);
      if (email !== undefined) {
        result.set(employee.id, { linked: true, email });
      }
    }
  }

  return result;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run lib/domain/employees.test.ts`
Expected: PASS (all tests in this file)

- [ ] **Step 6: Commit**

```bash
git add lib/domain/employees.ts lib/domain/employees.test.ts
git commit -m "$(cat <<'EOF'
feat: add getAccountInfoForEmployees, batching Clerk lookups

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

#### Part D — `resendEmployeeInvite`

- [ ] **Step 1: Write the failing tests**

In `lib/domain/employees.test.ts`, add a new `describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("resendEmployeeInvite", ...)` block. This needs its own company/hr/pending-employee fixtures (a pending employee has no `auth_user_id`, so it can't reuse the `getEmployeeProfile / updateEmployee / listEmployees` block's `target`, which is already linked):

```ts
describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("resendEmployeeInvite", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  let hr: Profile;

  beforeEach(() => {
    createInvitationMock.mockReset();
  });

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert(
        { name: "Test Co (resend-invite)", slug: "test-co-resend-invite" },
        { onConflict: "slug" }
      )
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    hr = await createProfile({
      authUserId: `test-hr-resend-${crypto.randomUUID()}`,
      companyId,
      fullName: "HR Person",
      role: "hr",
    });
  });

  afterAll(async () => {
    await supabase.from("companies").delete().eq("slug", "test-co-resend-invite");
  });

  it("rejects a caller without hr/admin", async () => {
    const nonHr = await createProfile({
      authUserId: `test-not-hr-resend-${crypto.randomUUID()}`,
      companyId,
      fullName: "Not HR",
      role: "employee",
    });
    const pending = await createProfile({
      companyId,
      fullName: "Pending Hire",
      role: "employee",
      invitedEmail: "pending@example.com",
    });

    await expect(resendEmployeeInvite(nonHr, pending.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects when the employee has already linked their account", async () => {
    const linked = await createProfile({
      authUserId: `test-linked-${crypto.randomUUID()}`,
      companyId,
      fullName: "Already Linked",
      role: "employee",
      invitedEmail: "already-linked@example.com",
    });

    await expect(resendEmployeeInvite(hr, linked.id)).rejects.toThrow(
      "This employee has already linked their account"
    );
    expect(createInvitationMock).not.toHaveBeenCalled();
  });

  it("rejects when there is no invited email on file", async () => {
    const pendingNoEmail = await createProfile({
      companyId,
      fullName: "No Email On File",
      role: "employee",
    });

    await expect(resendEmployeeInvite(hr, pendingNoEmail.id)).rejects.toThrow(
      "No invited email on file for this employee"
    );
    expect(createInvitationMock).not.toHaveBeenCalled();
  });

  it("resends the invitation with ignoreExisting and logs activity", async () => {
    createInvitationMock.mockResolvedValue({ id: "inv_resend_1" });
    const pending = await createProfile({
      companyId,
      fullName: "Pending Resend",
      role: "employee",
      invitedEmail: "pending-resend@example.com",
    });

    await resendEmployeeInvite(hr, pending.id);

    expect(createInvitationMock).toHaveBeenCalledWith({
      emailAddress: "pending-resend@example.com",
      publicMetadata: { pendingProfileId: pending.id },
      ignoreExisting: true,
    });

    const { activity } = await getEmployeeProfile(hr, pending.id);
    expect(
      activity.some((entry) => entry.message.includes(`resent an invitation to ${pending.fullName}`))
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run lib/domain/employees.test.ts`
Expected: FAIL — `resendEmployeeInvite` is not defined

- [ ] **Step 3: Write the implementation**

In `lib/domain/employees.ts`, add `InvalidTransitionError` and `UnprocessableRequestError` to the existing errors import:

```ts
import { ForbiddenError, NotFoundError, InvalidTransitionError, UnprocessableRequestError } from "@/lib/domain/errors";
```

Add the function (after `resendEmployeeInvite`'s natural location — near `createEmployee`, since it's the other Clerk-invitation-writing function):

```ts
export async function resendEmployeeInvite(profile: Profile, employeeId: string): Promise<void> {
  if (!canManageEmployeeAccount(profile)) {
    throw new ForbiddenError("You cannot manage employee accounts");
  }
  const target = await getProfileById(employeeId);
  if (!target || target.companyId !== profile.companyId) {
    throw new NotFoundError("Employee not found");
  }
  if (target.authUserId) {
    throw new InvalidTransitionError("This employee has already linked their account");
  }
  if (!target.invitedEmail) {
    throw new UnprocessableRequestError("No invited email on file for this employee");
  }

  const clerk = await clerkClient();
  await clerk.invitations.createInvitation({
    emailAddress: target.invitedEmail,
    publicMetadata: { pendingProfileId: target.id },
    ignoreExisting: true,
  });

  await logActivity(
    "profile",
    employeeId,
    profile.id,
    `${profile.fullName} resent an invitation to ${target.fullName}`
  );
  try {
    await broadcastChange(profile.companyId, "employees", { type: "employee_invite_resent" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run lib/domain/employees.test.ts`
Expected: PASS (all tests in this file)

- [ ] **Step 5: Run this file's full suite once more and typecheck**

Run: `pnpm vitest run lib/domain/employees.test.ts && npx tsc --noEmit`
Expected: PASS; zero new `tsc` errors.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/employees.ts lib/domain/employees.test.ts
git commit -m "$(cat <<'EOF'
feat: add resendEmployeeInvite

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: API routes

**Files:**
- Modify: `app/api/employees/route.ts`
- Modify: `app/api/employees/route.test.ts`
- Create: `app/api/employees/[id]/resend-invite/route.ts`
- Create: `app/api/employees/[id]/resend-invite/route.test.ts`

**Interfaces:**
- Consumes: `getAccountInfoForEmployees`, `resendEmployeeInvite` (Task 4).
- Produces: `GET /api/employees` now returns `{ employees: (Employee & { account: EmployeeAccountInfo | null })[] }`. `POST /api/employees/[id]/resend-invite` — Task 7's `EmployeeAccountControl` calls this exact path.

#### Part A — Enrich `GET /api/employees`

- [ ] **Step 1: Write the failing test**

In `app/api/employees/route.test.ts`, add `getAccountInfoForEmployees` to the mocked `@/lib/domain/employees` module:

```ts
vi.mock("@/lib/domain/employees", () => ({
  createEmployee: vi.fn(),
  listEmployees: vi.fn(),
  getAccountInfoForEmployees: vi.fn(),
}));
```

Add `getAccountInfoForEmployees` to the import and the `beforeEach` reset:

```ts
import { createEmployee, listEmployees, getAccountInfoForEmployees } from "@/lib/domain/employees";
```

```ts
beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(createEmployee).mockReset();
  vi.mocked(listEmployees).mockReset();
  vi.mocked(getAccountInfoForEmployees).mockReset();
});
```

Add this test to `describe("GET /api/employees", ...)`:

```ts
  it("attaches account info per employee from getAccountInfoForEmployees", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(listEmployees).mockResolvedValue([
      { id: "employee-1" } as never,
      { id: "employee-2" } as never,
    ]);
    vi.mocked(getAccountInfoForEmployees).mockResolvedValue(
      new Map([["employee-1", { linked: true, email: "a@example.com" }]])
    );

    const response = await GET(new Request("http://localhost/api/employees"));
    const body = await response.json();

    expect(body.employees[0]).toEqual(
      expect.objectContaining({ id: "employee-1", account: { linked: true, email: "a@example.com" } })
    );
    expect(body.employees[1]).toEqual(expect.objectContaining({ id: "employee-2", account: null }));
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run app/api/employees/route.test.ts`
Expected: FAIL — the current `GET` handler doesn't call `getAccountInfoForEmployees` or attach `account` to each employee, so `body.employees[0].account` is `undefined`, not the expected object

- [ ] **Step 3: Write the implementation**

In `app/api/employees/route.ts`, update the import and the `GET` handler:

```ts
import { createEmployee, listEmployees, getAccountInfoForEmployees } from "@/lib/domain/employees";
```

```ts
  try {
    const employees = await listEmployees(profile, parsed.data);
    const accounts = await getAccountInfoForEmployees(profile, employees);
    const employeesWithAccounts = employees.map((employee) => ({
      ...employee,
      account: accounts.get(employee.id) ?? null,
    }));
    return NextResponse.json({ employees: employeesWithAccounts });
  } catch (error) {
    return toErrorResponse(error);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run app/api/employees/route.test.ts`
Expected: PASS (all tests in this file). Note the existing "returns employees scoped by the caller's filters" test mocks `listEmployees` to resolve `[]` and never sets up `getAccountInfoForEmployees` — with `vi.fn()` default behavior (resolves `undefined`), `accounts.get(...)` would throw on a `Map` call against `undefined`. Fix that existing test by adding `vi.mocked(getAccountInfoForEmployees).mockResolvedValue(new Map());` to it, since an empty employee list still calls `getAccountInfoForEmployees([])` and needs a resolved `Map` back.

- [ ] **Step 5: Commit**

```bash
git add app/api/employees/route.ts app/api/employees/route.test.ts
git commit -m "$(cat <<'EOF'
feat: attach account info to GET /api/employees

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

#### Part B — `POST /api/employees/[id]/resend-invite`

- [ ] **Step 1: Write the failing test**

Create `app/api/employees/[id]/resend-invite/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/employees", () => ({
  resendEmployeeInvite: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { resendEmployeeInvite } from "@/lib/domain/employees";
import { POST } from "@/app/api/employees/[id]/resend-invite/route";
import { ForbiddenError, InvalidTransitionError, NotFoundError } from "@/lib/domain/errors";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "HR Person",
  role: "hr" as const,
  departmentId: null,
  managerId: null,
  positionTitle: null,
  employeeNumber: null,
  locationId: null,
  relatedOperationId: null,
  invitedEmail: null,
  status: "active" as const,
};

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(resendEmployeeInvite).mockReset();
});

describe("POST /api/employees/[id]/resend-invite", () => {
  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await POST(new Request("http://localhost", { method: "POST" }), params("employee-1"));
    expect(response.status).toBe(401);
  });

  it("resends the invite and returns 200", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(resendEmployeeInvite).mockResolvedValue(undefined);

    const response = await POST(new Request("http://localhost", { method: "POST" }), params("employee-1"));
    expect(response.status).toBe(200);
    expect(resendEmployeeInvite).toHaveBeenCalledWith(PROFILE, "employee-1");
  });

  it("maps a ForbiddenError to 403", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(resendEmployeeInvite).mockRejectedValue(new ForbiddenError("no"));

    const response = await POST(new Request("http://localhost", { method: "POST" }), params("employee-1"));
    expect(response.status).toBe(403);
  });

  it("maps a NotFoundError to 404", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(resendEmployeeInvite).mockRejectedValue(new NotFoundError("no"));

    const response = await POST(new Request("http://localhost", { method: "POST" }), params("missing"));
    expect(response.status).toBe(404);
  });

  it("maps an InvalidTransitionError (already linked) to 400", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(resendEmployeeInvite).mockRejectedValue(new InvalidTransitionError("already linked"));

    const response = await POST(new Request("http://localhost", { method: "POST" }), params("employee-1"));
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run app/api/employees/[id]/resend-invite/route.test.ts`
Expected: FAIL — the route file doesn't exist yet

- [ ] **Step 3: Write the implementation**

Create `app/api/employees/[id]/resend-invite/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { resendEmployeeInvite } from "@/lib/domain/employees";
import { toErrorResponse } from "@/lib/api/error-response";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  try {
    await resendEmployeeInvite(profile, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run app/api/employees/[id]/resend-invite/route.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/api/employees/[id]/resend-invite/route.ts" "app/api/employees/[id]/resend-invite/route.test.ts"
git commit -m "$(cat <<'EOF'
feat: add POST /api/employees/[id]/resend-invite

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `EmployeeListView`'s "Account" column

**Files:**
- Modify: `components/employees/employee-list-view.tsx`
- Modify: `components/employees/employee-list-view.test.tsx`
- Modify: `app/(app)/employees/page.tsx`

**Interfaces:**
- Consumes: `canManageEmployeeAccount` (Task 2), the enriched `GET /api/employees` response (Task 5).
- Produces: `EmployeeListView`'s new `canManageAccount: boolean` prop — the page passes this; no other task consumes it.

- [ ] **Step 1: Write the failing tests**

In `components/employees/employee-list-view.test.tsx`, replace the `beforeEach`'s fetch mock to include `account`, and add two new tests:

```ts
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        employees: [
          {
            id: "employee-1",
            fullName: "Ada Lovelace",
            positionTitle: "Engineer",
            departmentId: null,
            status: "active",
            account: { linked: true, email: "ada@example.com" },
          },
        ],
      }),
    })
  );
});

describe("EmployeeListView", () => {
  it("renders the fetched employees", async () => {
    renderWithClient(<EmployeeListView companyId="company-1" canManageAccount={false} />);
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("shows the Account column and email when canManageAccount is true", async () => {
    renderWithClient(<EmployeeListView companyId="company-1" canManageAccount={true} />);
    expect(await screen.findByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();
  });

  it("hides the Account column when canManageAccount is false", async () => {
    renderWithClient(<EmployeeListView companyId="company-1" canManageAccount={false} />);
    await screen.findByText("Ada Lovelace");
    expect(screen.queryByText("Account")).not.toBeInTheDocument();
    expect(screen.queryByText("ada@example.com")).not.toBeInTheDocument();
  });

  it("shows an Invitation pending badge for a pending employee", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          employees: [
            {
              id: "employee-2",
              fullName: "Pending Hire",
              positionTitle: null,
              departmentId: null,
              status: "active",
              account: { linked: false, invitedEmail: "pending@example.com" },
            },
          ],
        }),
      })
    );
    renderWithClient(<EmployeeListView companyId="company-1" canManageAccount={true} />);
    expect(await screen.findByText("Invitation pending")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run components/employees/employee-list-view.test.tsx`
Expected: FAIL — `EmployeeListView` doesn't accept a `canManageAccount` prop yet, and there's no "Account" column or email/pending-badge rendering

- [ ] **Step 3: Write the implementation**

In `components/employees/employee-list-view.tsx`, update the interface, props, and table:

```tsx
interface EmployeeAccountInfo {
  linked: boolean;
  email?: string;
  invitedEmail?: string | null;
}

interface EmployeeListItem {
  id: string;
  fullName: string;
  positionTitle: string | null;
  departmentId: string | null;
  status: "active" | "inactive";
  account: EmployeeAccountInfo | null;
}

const STATUS_OPTIONS = ["active", "inactive"];

export function EmployeeListView({
  companyId,
  canManageAccount,
}: {
  companyId: string;
  canManageAccount: boolean;
}) {
```

Replace the `<TableHeader>`/`<TableRow>` header and body to add the conditional column:

```tsx
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Status</TableHead>
                  {canManageAccount && <TableHead>Account</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell>
                      <Link href={`/employees/${employee.id}`} className="hover:underline">
                        {employee.fullName}
                      </Link>
                    </TableCell>
                    <TableCell>{employee.positionTitle ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{employee.status}</Badge>
                    </TableCell>
                    {canManageAccount && (
                      <TableCell>
                        {employee.account?.linked ? (
                          employee.account.email
                        ) : (
                          <Badge variant="outline">Invitation pending</Badge>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canManageAccount ? 4 : 3} className="text-center text-muted-foreground">
                      No employees found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run components/employees/employee-list-view.test.tsx`
Expected: PASS (all tests in this file)

- [ ] **Step 5: Update `app/(app)/employees/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/session";
import { canCreateEmployee, canManageEmployeeAccount } from "@/lib/domain/permissions";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EmployeeListView } from "@/components/employees/employee-list-view";

export default async function EmployeesPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const canCreate = canCreateEmployee(profile);

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/dashboard" />
      <PageHeader
        title="Employees"
        action={
          canCreate ? (
            <Button render={<Link href="/employees/new" />} nativeButton={false}>
              New employee
            </Button>
          ) : undefined
        }
      />
      <EmployeeListView companyId={profile.companyId} canManageAccount={canManageEmployeeAccount(profile)} />
    </div>
  );
}
```

- [ ] **Step 6: Run the full employees-domain test suite**

Run: `pnpm vitest run components/employees "app/(app)/employees"`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add components/employees/employee-list-view.tsx components/employees/employee-list-view.test.tsx "app/(app)/employees/page.tsx"
git commit -m "$(cat <<'EOF'
feat: add gated Account column to EmployeeListView

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `EmployeeAccountControl` component

**Files:**
- Create: `components/employees/employee-account-control.tsx`
- Create: `components/employees/employee-account-control.test.tsx`

**Interfaces:**
- Consumes: `EmployeeAccountInfo` shape (matching Task 4's domain type, redeclared client-side per this codebase's existing convention of not sharing types across the client/server boundary — see e.g. `EmployeeListItem` in Task 6, which redeclares rather than imports the domain `Employee` type).
- Produces: nothing consumed by other tasks except Task 8, which renders this component.

- [ ] **Step 1: Write the failing test**

Create `components/employees/employee-account-control.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { EmployeeAccountControl } from "@/components/employees/employee-account-control";

beforeEach(() => {
  refreshMock.mockReset();
});

describe("EmployeeAccountControl", () => {
  it("shows the email for a linked employee and no resend-invite button", async () => {
    vi.stubGlobal("fetch", vi.fn());
    render(
      <EmployeeAccountControl
        employeeId="employee-1"
        currentRole="employee"
        currentStatus="active"
        account={{ linked: true, email: "ada@example.com" }}
      />
    );

    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resend invite/i })).not.toBeInTheDocument();
  });

  it("shows Invitation pending and a resend-invite button for a pending employee", async () => {
    vi.stubGlobal("fetch", vi.fn());
    render(
      <EmployeeAccountControl
        employeeId="employee-1"
        currentRole="employee"
        currentStatus="active"
        account={{ linked: false, invitedEmail: "pending@example.com" }}
      />
    );

    expect(screen.getByText("Invitation pending")).toBeInTheDocument();
    expect(screen.getByText(/pending@example.com/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resend invite/i })).toBeInTheDocument();
  });

  it("changes the role via PATCH and refreshes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EmployeeAccountControl
        employeeId="employee-1"
        currentRole="employee"
        currentStatus="active"
        account={{ linked: true, email: "ada@example.com" }}
      />
    );

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "Manager" }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/employees/employee-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ role: "manager" }),
      })
    );
  });

  it("toggles status to inactive via PATCH and refreshes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EmployeeAccountControl
        employeeId="employee-1"
        currentRole="employee"
        currentStatus="active"
        account={{ linked: true, email: "ada@example.com" }}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /deactivate/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/employees/employee-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "inactive" }),
      })
    );
  });

  it("shows Reactivate for an inactive employee", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(
      <EmployeeAccountControl
        employeeId="employee-1"
        currentRole="employee"
        currentStatus="inactive"
        account={{ linked: true, email: "ada@example.com" }}
      />
    );
    expect(screen.getByRole("button", { name: /reactivate/i })).toBeInTheDocument();
  });

  it("resends the invite via POST and shows confirmation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EmployeeAccountControl
        employeeId="employee-1"
        currentRole="employee"
        currentStatus="active"
        account={{ linked: false, invitedEmail: "pending@example.com" }}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /resend invite/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/employees/employee-1/resend-invite", { method: "POST" });
    expect(await screen.findByText(/invitation resent/i)).toBeInTheDocument();
  });

  it("shows an error message when a request fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({ error: "Something went wrong" }) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EmployeeAccountControl
        employeeId="employee-1"
        currentRole="employee"
        currentStatus="active"
        account={{ linked: true, email: "ada@example.com" }}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /deactivate/i }));

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run components/employees/employee-account-control.test.tsx`
Expected: FAIL — the component file doesn't exist yet

- [ ] **Step 3: Write the implementation**

Create `components/employees/employee-account-control.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/lib/validation/auth";
import type { ProfileStatus } from "@/lib/domain/profile-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type EmployeeAccountInfo =
  | { linked: true; email: string }
  | { linked: false; invitedEmail?: string | null };

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager" },
  { value: "operations_manager", label: "Operations Manager" },
  { value: "it", label: "IT" },
  { value: "hr", label: "HR" },
  { value: "admin", label: "Admin" },
];

export function EmployeeAccountControl({
  employeeId,
  currentRole,
  currentStatus,
  account,
}: {
  employeeId: string;
  currentRole: Role;
  currentStatus: ProfileStatus;
  account: EmployeeAccountInfo;
}) {
  const router = useRouter();
  const [isSubmittingRole, setIsSubmittingRole] = useState(false);
  const [isSubmittingStatus, setIsSubmittingStatus] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeRole(role: Role) {
    if (role === currentRole) return;
    setIsSubmittingRole(true);
    setError(null);
    const response = await fetch(`/api/employees/${employeeId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    });
    setIsSubmittingRole(false);
    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to change role");
      return;
    }
    router.refresh();
  }

  async function toggleStatus() {
    const nextStatus: ProfileStatus = currentStatus === "active" ? "inactive" : "active";
    setIsSubmittingStatus(true);
    setError(null);
    const response = await fetch(`/api/employees/${employeeId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    setIsSubmittingStatus(false);
    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to update status");
      return;
    }
    router.refresh();
  }

  async function resendInvite() {
    setIsResending(true);
    setError(null);
    const response = await fetch(`/api/employees/${employeeId}/resend-invite`, { method: "POST" });
    setIsResending(false);
    if (!response.ok) {
      const body = await response.json();
      setError(typeof body.error === "string" ? body.error : "Failed to resend invite");
      return;
    }
    setResendSent(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Email</p>
          {account.linked ? (
            <p>{account.email}</p>
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant="outline">Invitation pending</Badge>
              {account.invitedEmail && (
                <span className="text-sm text-muted-foreground">sent to {account.invitedEmail}</span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="employee-role">Role</Label>
          <Select
            value={currentRole}
            onValueChange={(value) => {
              if (value) changeRole(value as Role);
            }}
            disabled={isSubmittingRole}
          >
            <SelectTrigger id="employee-role" className="w-56">
              <SelectValue>
                {(value: Role | null) =>
                  value ? (ROLE_OPTIONS.find((option) => option.value === value)?.label ?? value) : ""
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Button variant="outline" disabled={isSubmittingStatus} onClick={toggleStatus}>
            {currentStatus === "active" ? "Deactivate" : "Reactivate"}
          </Button>
        </div>

        {!account.linked && (
          <div className="flex items-center gap-2">
            <Button variant="outline" disabled={isResending} onClick={resendInvite}>
              Resend invite
            </Button>
            {resendSent && <span className="text-sm text-muted-foreground">Invitation resent.</span>}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run components/employees/employee-account-control.test.tsx`
Expected: PASS (all 8 tests)

- [ ] **Step 5: Run `tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: zero new errors (the `Select`'s `onValueChange`/`SelectValue` children function must follow the established `value | null` convention from the UI-sweep plan exactly as shown above, or this will fail).

- [ ] **Step 6: Commit**

```bash
git add components/employees/employee-account-control.tsx components/employees/employee-account-control.test.tsx
git commit -m "$(cat <<'EOF'
feat: add EmployeeAccountControl component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Wire `EmployeeAccountControl` into the detail page

**Files:**
- Modify: `app/(app)/employees/[id]/page.tsx`

**Interfaces:**
- Consumes: `canManageEmployeeAccount` (Task 2), `getAccountInfoForEmployees` (Task 4), `EmployeeAccountControl` (Task 7).

No page-level test file exists for this page today (confirmed during planning) and this plan doesn't add one, matching this repo's established convention for simple server-component pages.

- [ ] **Step 1: Update `app/(app)/employees/[id]/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { getEmployeeProfile, getAccountInfoForEmployees } from "@/lib/domain/employees";
import { canLinkEntityToOperation, canManageEmployeeAccount } from "@/lib/domain/permissions";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmployeeOperationControl } from "@/components/employees/employee-operation-control";
import { EmployeeAccountControl } from "@/components/employees/employee-account-control";
import { EmployeeRealtimeRefresh } from "@/components/employees/employee-realtime-refresh";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login");
  }

  const { id } = await params;

  let result;
  try {
    result = await getEmployeeProfile(profile, id);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) {
      notFound();
    }
    throw error;
  }

  const { profile: employee, counts, activity } = result;
  const canManageAccount = canManageEmployeeAccount(profile);
  const account = canManageAccount
    ? (await getAccountInfoForEmployees(profile, [employee])).get(employee.id) ?? null
    : null;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <EmployeeRealtimeRefresh companyId={profile.companyId} />
      <BackLink href="/employees" />

      <PageHeader
        title={employee.fullName}
        subtitle={`${employee.positionTitle ?? "No position set"} · ${employee.status}`}
      />

      <Card>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-md border p-4">
              <p className="text-sm text-muted-foreground">Open tasks</p>
              <p className="text-2xl font-semibold">{counts.openTasks}</p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-sm text-muted-foreground">Requests</p>
              <p className="text-2xl font-semibold">{counts.requests}</p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-sm text-muted-foreground">Active workflows</p>
              <p className="text-2xl font-semibold">{counts.activeWorkflows}</p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-sm text-muted-foreground">Assets</p>
              <p className="text-2xl font-semibold">{counts.assets}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {canManageAccount && account && (
        <EmployeeAccountControl
          employeeId={employee.id}
          currentRole={employee.role}
          currentStatus={employee.status}
          account={account}
        />
      )}

      <EmployeeOperationControl
        employeeId={employee.id}
        relatedOperationId={employee.relatedOperationId}
        canManage={canLinkEntityToOperation(profile)}
      />

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {activity.map((entry) => (
              <li key={entry.id}>{entry.message}</li>
            ))}
            {activity.length === 0 && <li>No activity yet.</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Run `tsc --noEmit`**

Run: `npx tsc --noEmit`
Expected: zero new errors — in particular, confirm `EmployeeAccountInfo`'s two independent declarations (the domain one in `lib/domain/employees.ts` from Task 4, and the component one in `components/employees/employee-account-control.tsx` from Task 7) are structurally compatible, since this page passes the domain-shaped value directly into the component's prop without an explicit cast. They are: domain's `{ linked: false; invitedEmail: string | null }` is assignable to the component's `{ linked: false; invitedEmail?: string | null }` (a non-optional property satisfies an optional one).

- [ ] **Step 3: Run the full employees-domain test suite**

Run: `pnpm vitest run components/employees "app/(app)/employees"`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/employees/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
feat: wire EmployeeAccountControl into the employee detail page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Whole-branch verification

**Files:** none (verification only), plus `docs/STATUS.md`

- [ ] **Step 1: Run the full unit + integration test suite**

Run: `pnpm test:unit && pnpm test:integration`
Expected: PASS, 0 failures.

- [ ] **Step 2: Run the TypeScript compiler**

Run: `npx tsc --noEmit`
Expected: clean except the one pre-existing, unrelated `app/layout.tsx(24,50)` error (confirm it's still the *only* one — if the count is higher than 1, something from this plan introduced a real error and must be fixed before proceeding).

- [ ] **Step 3: Run the linter**

Run: `pnpm lint`
Expected: no new errors (this repo has 3 known pre-existing errors in files this plan never touches — `components/notification-bell.tsx`, `hooks/use-mobile.ts`, `lib/realtime/use-broadcast-listener.ts` — confirm the count and file list match exactly, not more).

- [ ] **Step 4: Run a production build**

Run: `pnpm build`
Expected: succeeds cleanly.

- [ ] **Step 5: Manually verify the migration applied and the app boots against it**

Since this plan adds a real schema column, confirm `supabase migration list` (or the project's equivalent status command) shows `20260925000000_add_profiles_invited_email` as applied wherever integration tests just ran against.

- [ ] **Step 6: Flag for human follow-up**

No manual browser click-through was possible in this environment (same limitation as every prior phase in this project) — an hr/admin pass through `/employees` (viewing the new Account column, changing a role, deactivating and reactivating an employee, resending an invite to a real pending invitee and confirming the email arrives) is especially important before merging, since this plan touches Clerk's real invitation-sending behavior in a way unit/integration tests can't fully exercise (mocked Clerk calls prove the request shape is correct, not that Clerk actually delivers the email).

- [ ] **Step 7: Update `docs/STATUS.md`**

Move the "Admin user management on `/employees`" entry from Backlog to Review, following this file's existing entry format (see the most recent Finished entries for the pattern: what changed, what review found, test/build status, and the human-follow-up flag from Step 6).
