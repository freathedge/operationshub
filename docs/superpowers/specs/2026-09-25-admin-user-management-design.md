# Admin User Management on `/employees` — Design

Date: 2026-09-25
Source: `docs/STATUS.md` backlog item "Admin user management on `/employees`"
Architecture: `docs/architecture.md`

---

## 1. Goal

Let `hr`/`admin` users see and manage account-level information for an employee — email address, Clerk invite/link status, role, and active/inactive status — from the `/employees` list and detail pages, alongside the operational fields Phase 5 already added. Today, `profiles` has no email column and the app never reads anything back from Clerk after the initial invite; an admin has no way to see whether an invited employee ever accepted, what their email is, or to change their role or account status without going into the Supabase dashboard directly.

This is architectural: it adds a new external read path (live Clerk Backend API calls from request handlers), a new permission concept, and new admin-facing mutations with real consequences — not a change to an existing flow.

## 2. Decisions taken during brainstorming

**Deactivate is app-level only.** "Deactivate" flips `profiles.status` to `"inactive"` (the column and badge already exist — this just adds the first write path to it). No Clerk-side ban/lock. If existing permission checks elsewhere in the app don't already respect `status`, that's a separate, pre-existing gap — out of scope here.

**A linked employee's email is fetched live from Clerk, never stored.** No sync webhook, no drift risk. `profiles.auth_user_id IS NULL` means "invitation sent, not yet accepted" (no Clerk user exists yet) — show "Invitation pending", and once `auth_user_id` is set, fetch that Clerk user's primary email address on each request.
- **List page:** batch-fetch every visible row's linked `auth_user_id` in one Clerk call (`clerk.users.getUserList({ userId: [...] })`), not one call per row — avoids N+1 Backend API calls.
- **Detail page:** a single `clerk.users.getUser(authUserId)` call when linked.

**A pending employee's invited email IS stored — a small, narrowly-scoped exception to the above.** Checking Clerk's actual Backend API during planning surfaced a real gap: the email address passed to `createEmployee` is currently used only to create the initial Clerk invitation, then discarded — nothing persists it anywhere. For an employee who hasn't linked yet, there is no Clerk user object to read an email back from at all, so **Resend invite** would have no address to resend to. Fix: add `profiles.invited_email` (nullable text), set once by `createEmployee` at invite time, read only by **Resend invite** (and shown alongside the "Invitation pending" badge, since it's useful context regardless). This does not contradict the "fetch live, never synced" decision above — that decision is specifically about a *linked* user's current email, which can change in Clerk after the fact and must never drift out of sync with a stored copy; an invited-but-not-yet-accepted address is fixed at invite time by Clerk's own design (you cannot change a pending invitation's email, only revoke and re-invite), so there's nothing to keep in sync.

**Permission: reuse the existing `hr`/`admin` set.** New function `canManageEmployeeAccount(profile)` — `EMPLOYEE_MANAGER_ROLES` (`lib/domain/permissions.ts`), the same set that already governs `canCreateEmployee`/`canUpdateEmployee`. No new role concept. Gates: visibility of the new email/invite-status column and detail-page controls, and all three new mutations (role change, deactivate/reactivate, resend invite).

**No self-action guard.** An hr/admin user can change their own role or deactivate their own account through this UI, same as any other employee's.

**Email/invite-status visibility is narrower than the rest of the employee list.** `/employees` is already visible to all `COMPANY_WIDE_VIEW_ROLES` (`operations_manager`, `it`, `hr`, `admin`). The new email/invite-status column is gated separately by `canManageEmployeeAccount` (`hr`/`admin` only) — other company-wide-view roles see the list exactly as it looks today, with no new column at all (not blanked out — absent).

**Role and status changes reuse the existing `updateEmployee` path; resend invite is new.** `lib/domain/employees.ts` already has a permission-gated `updateEmployee` function and a working `PATCH /api/employees/[id]` route (`canUpdateEmployee` = same `hr`/`admin` set), and `updateEmployeeSchema` already accepts `status`. Nothing in the UI calls this route today — it's unused infrastructure from Phase 5. Rather than building two new parallel domain functions:
- `updateEmployeeSchema` gains an optional `role` field (reusing the existing `Role` enum from `lib/validation/auth.ts`).
- `updateEmployee`'s activity-log message is sharpened to describe *what* changed when `role` and/or `status` are present in the input (e.g. `"${actor} changed ${target}'s role from X to Y"`, `"${actor} deactivated ${target}'s account"`), instead of the current generic `"updated X's profile"` — sensitive account-level changes deserve a specific audit trail; other fields (department, position, etc.) keep the existing generic message.
- **Resend invite** has no existing analog and needs a new domain function `resendEmployeeInvite(actingProfile, employeeId)`: gated by `canManageEmployeeAccount`, valid only when `auth_user_id IS NULL` (else a domain error — already linked), reads `profiles.invited_email` (per the note above), calls `clerk.invitations.createInvitation({ emailAddress, publicMetadata: { pendingProfileId: employeeId }, ignoreExisting: true })`, logs activity, broadcasts. Confirmed against Clerk's actual Backend API docs: `createInvitation` normally errors when the email already has a pending invitation, but `ignoreExisting: true` bypasses exactly that check — no need to look up and revoke the old invitation first.

## 3. File structure

| File | Change |
|---|---|
| `supabase/migrations/<timestamp>_add_profiles_invited_email.sql` | New — `alter table profiles add column invited_email text;` (nullable, no backfill — existing rows simply have `null`, meaning "no known invited address," which only affects Resend Invite for employees invited before this migration; they'd need re-inviting through a fresh flow if ever needed, out of scope to backfill). |
| `lib/domain/profiles.ts` | Modify — add `invitedEmail: string | null` to the `Profile` interface, `ProfileRow`, `toProfile`, `PROFILE_COLUMNS`, and `createProfile`'s input/insert (`invited_email`). |
| `lib/domain/permissions.ts` | Modify — add `canManageEmployeeAccount(profile)` using `EMPLOYEE_MANAGER_ROLES`. |
| `lib/validation/employees.ts` | Modify — add optional `role` to `updateEmployeeSchema`. |
| `lib/domain/employees.ts` | Modify — `createEmployee` passes `input.email` through to `createProfile` as `invitedEmail`. Sharpen `updateEmployee`'s activity message for `role`/`status` changes. Add `resendEmployeeInvite(actingProfile, employeeId)`. Add a Clerk-account-info helper used by both the list and detail reads (e.g. `getEmployeeAccountInfo` for a single employee, and a batch variant for the list — exact function shape is an implementation-time call, not fixed here). |
| `app/api/employees/[id]/resend-invite/route.ts` | New — `POST`, thin wrapper over `resendEmployeeInvite`. |
| `app/api/employees/route.ts` (list) or a new endpoint | Modify or new — the list response needs each row's account info (email/invite status) when the caller has `canManageEmployeeAccount`; implementer decides whether this folds into the existing `GET /api/employees` response (gated field, omitted for callers without the permission) or a separate endpoint — no strong reason to prefer either at spec level, but avoid a second per-row round-trip from the client. |
| `app/api/employees/[id]/route.ts` | Unchanged — existing `PATCH` already accepts `updateEmployeeSchema`, which now includes `role`. |
| `components/employees/employee-list-view.tsx` | Modify — new "Account" column (email or "Invitation pending" badge), rendered only when the caller has `canManageEmployeeAccount`. |
| `components/employees/employee-account-control.tsx` | New — detail-page component (visible only to hr/admin) showing email/invite status plus: a role `Select` (shadcn, matching the just-finished UI sweep's conventions), an active/inactive toggle, and a "Resend invite" button (hidden once linked). Calls the `PATCH` route for role/status, the new `POST resend-invite` route for invites. |
| `app/(app)/employees/[id]/page.tsx` | Modify — render `EmployeeAccountControl` when `canManageEmployeeAccount(profile)`, alongside the existing `EmployeeOperationControl`. |
| Tests | New/modified alongside every file above, following this repo's existing `*.test.ts(x)` conventions — domain function tests mock the Clerk client; component tests exercise the three new UI interactions. |

## 4. Testing approach

- `lib/domain/permissions.test.ts`: `canManageEmployeeAccount` — true for hr/admin, false otherwise.
- `lib/domain/employees.test.ts`: `updateEmployee` — role change produces the specific activity message; status change produces the specific activity message; other-field-only updates keep the generic message. `resendEmployeeInvite` — permission-gated, rejects when already linked, calls Clerk's invitation API (mocked), logs activity, broadcasts.
- `components/employees/employee-account-control.test.tsx`: role-change interaction, deactivate/reactivate interaction, resend-invite interaction (including the button being absent/disabled once linked).
- `components/employees/employee-list-view.test.tsx`: the new Account column renders for a caller with `canManageEmployeeAccount` and is absent otherwise.
- No end-to-end test against a real Clerk instance — all Clerk calls are mocked, matching how `createEmployee`'s existing Clerk call is already tested today.

## 5. Out of scope

- Any Clerk-side account suspension/ban (deactivate is app-level only, per §2).
- Syncing a *linked* employee's current email into `profiles` (fetched live, per §2) — `invited_email` only stores the fixed, one-time address a still-pending invite was sent to, not an ongoing sync of anyone's real email.
- Self-action guards (allowed, per §2).
- Email/invite-status visibility for roles outside `hr`/`admin` (per §2).
- Any change to the existing `createEmployee` invite flow, the `user.created` webhook, or the onboarding workflow.
- A generic "edit employee" UI beyond what's needed for role/status (department, position, etc. already have no edit UI today and stay that way).
