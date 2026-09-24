# Phase 9 — Realtime & Notifications Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close idea.md §18–19's gaps — a real notification bell UI, four missing notification event types, live-refresh on three detail pages that lack it, and an activity-log timeline for workflow instances — with no new infrastructure (no scheduled jobs, no new permission functions, no new tables).

**Architecture:** Every new `createNotification` call site is added directly into the existing domain function or API route that already performs the triggering mutation (matching the exact pattern `requests.ts`/`approvals.ts`/`workflows.ts` already use). "Overdue" and "blocked" are pure, presentational, client-side derivations with no database or notification involvement. The notification bell is a plain-fetch client component (no React Query) rendered from `SiteHeader`, which becomes an async Server Component.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + Realtime), Vitest + Testing Library, shadcn/ui on Base UI (`@base-ui/react`) — note `render={<Component />}` polymorphism, not `asChild`.

**Spec:** `docs/superpowers/specs/2026-09-24-phase9-realtime-notifications-design.md`

## Global Constraints

- No scheduled-job infrastructure is introduced (no `pg_cron`, no cron migration) — "task overdue" and "workflow blocked" are computed at read time only, never as `notifications` rows.
- `WORKFLOW_STEP_STALE_DAYS = 3` is the "blocked" threshold, applied uniformly to both task- and approval-backed steps via `step.createdAt` (approvals have no due-date column, so this is the only field both step types share).
- New `notifications.type` string values: `"task_assigned"`, `"asset_assigned"`, `"comment_added"`, `"workflow_step_completed"`. Existing values (`"approval_required"`, `"request_status_changed"`) are unchanged.
- Every `createNotification` call skips (does not create a row) when the target profile is null (no assignee/creator/related-employee) or is the same profile as the actor — matching this codebase's existing convention that notifications are calls to attention, not a log of every write.
- No new `lib/domain/permissions.ts` capability function — `markNotificationRead` checks ownership (`notification.profileId === profile.id`) directly, since a notification's own `profile_id` column is the only access-control fact that matters.
- The bell UI (`components/notification-bell.tsx`) uses plain `fetch` + `useState`, not `@tanstack/react-query` — it and `SiteHeader` render outside `QueryProvider` in `app/(app)/layout.tsx` (`QueryProvider` wraps only `{children}` inside `<main>`), matching `components/command-search.tsx`'s existing precedent for header/sidebar-level widgets.
- shadcn/ui in this project is `@base-ui/react`, not Radix: use `render={<Component />}` for polymorphic triggers (see `components/nav-user.tsx`), never `asChild`. Base UI's `Menu.Trigger` opens on the next animation frame, not synchronously on click — tests must `await screen.findByText(...)`/`findByRole(...)` after clicking a trigger, never a synchronous `getByText` in the same tick (see `components/nav-user.test.tsx`'s own comment on this).
- `notifications.entityType` → route mapping used by the bell: `{ request: "/requests", task: "/tasks", asset: "/assets", operation: "/operations", workflow: "/workflows" }`.

## Review Focus

- Assigning a task/asset to yourself, or commenting on your own task/request/operation, must never create a self-notification — a missed skip here is silent spam every time someone touches their own stuff.
- A request with `createdBy: null`, a task with no assignee, or a workflow instance with `relatedEmployeeId: null` must skip notification creation cleanly (no throw), not crash the mutation that triggered it.
- Profile A must never be able to mark Profile B's notification as read — `markNotificationRead` must throw `ForbiddenError`, not silently succeed or 500.
- The "Overdue"/"Blocked" indicators must not fire for terminal-state entities (a `completed`/`cancelled` task whose due date has passed; a `completed` workflow instance) even though the raw timestamp comparison would otherwise say yes.
- Clicking an already-read notification in the bell must not re-POST a read request or drive `unreadCount` below zero — idempotency on repeat clicks, not just the first one.

---

## File Structure

**New files:**
- `app/api/notifications/route.ts` + `.test.ts` — `GET`, list + unread count
- `app/api/notifications/[id]/read/route.ts` + `.test.ts` — `PATCH`, mark one read
- `app/api/notifications/read-all/route.ts` + `.test.ts` — `POST`, mark all read
- `components/notification-bell.tsx` + `.test.tsx` — the bell UI
- `components/tasks/is-task-overdue.ts` + `.test.ts` — pure overdue predicate
- `components/operations/operation-realtime-refresh.tsx` + `.test.tsx`
- `components/assets/asset-realtime-refresh.tsx` + `.test.tsx`
- `components/employees/employee-realtime-refresh.tsx` + `.test.tsx`
- `components/site-header.test.tsx`

**Modified files:**
- `lib/domain/notifications.ts` — add `markNotificationRead`, `markAllNotificationsRead`
- `lib/domain/notifications.test.ts` — tests for the above
- `lib/domain/tasks.ts` — `task_assigned` notification in `createTask`/`assignTask`
- `lib/domain/tasks.test.ts` — tests for the above
- `lib/domain/assets.ts` — `asset_assigned` notification in `assignAsset`
- `lib/domain/assets.test.ts` — tests for the above
- `app/api/tasks/[id]/comments/route.ts` / `.test.ts` — `comment_added` notification
- `app/api/requests/[id]/comments/route.ts` / `.test.ts` — `comment_added` notification
- `app/api/operations/[id]/comments/route.ts` / `.test.ts` — `comment_added` notification
- `lib/domain/workflows.ts` — `workflow_step_completed` notification + `entityType: "workflow"` activity-log entries
- `lib/domain/workflows.test.ts` — tests for the above
- `app/(app)/workflows/[id]/page.tsx` — render the workflow's activity log
- `components/tasks/task-list-view.tsx` / `.test.tsx` — Overdue badge
- `app/(app)/tasks/[id]/page.tsx` — Overdue badge
- `components/workflows/workflow-stepper.tsx` / `.test.tsx` — Blocked badge
- `app/(app)/operations/[id]/page.tsx`, `app/(app)/assets/[id]/page.tsx`, `app/(app)/employees/[id]/page.tsx` — wire in the new realtime-refresh components
- `components/site-header.tsx` — becomes async, renders `NotificationBell`

---

### Task 1: Notifications domain — mark as read

**Files:**
- Modify: `lib/domain/notifications.ts`
- Test: `lib/domain/notifications.test.ts`

**Interfaces:**
- Consumes: `Profile` (`lib/domain/profiles.ts`), `ForbiddenError`/`NotFoundError` (`lib/domain/errors.ts`)
- Produces: `markNotificationRead(profile: Profile, notificationId: string): Promise<Notification>`, `markAllNotificationsRead(profile: Profile): Promise<void>` — consumed by Task 2's API routes

- [ ] **Step 1: Write the failing tests**

Add to `lib/domain/notifications.test.ts` (inside the existing `describe.skipIf(...)` block, after the current two `it`s, and add a `stranger` fixture profile in `beforeAll` alongside `recipient`):

```ts
    let stranger: Profile;

    // inside beforeAll, after `recipient = await createProfile(...)`:
    const { data: strangerAuthUser, error: strangerAuthError } =
      await supabase.auth.admin.createUser({
        email: `notifications-test-stranger-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
    if (strangerAuthError || !strangerAuthUser.user) throw strangerAuthError;
    createdAuthUserIds.push(strangerAuthUser.user.id);
    stranger = await createProfile({
      authUserId: strangerAuthUser.user.id,
      companyId,
      fullName: "Notifications Test Stranger",
      role: "employee",
    });
```

```ts
    it("marks a notification as read, but denies a different profile's notification", async () => {
      const notification = await createNotification(
        recipient.id,
        "request",
        entityId,
        "approval_required",
        "Please review this request"
      );

      const updated = await markNotificationRead(recipient, notification.id);
      expect(updated.readAt).not.toBeNull();

      const other = await createNotification(
        recipient.id,
        "request",
        entityId,
        "approval_required",
        "Another one"
      );
      await expect(markNotificationRead(stranger, other.id)).rejects.toBeInstanceOf(
        ForbiddenError
      );
    });

    it("throws NotFoundError for an unknown notification id", async () => {
      await expect(
        markNotificationRead(recipient, crypto.randomUUID())
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("marks every unread notification as read for a profile, leaving other profiles' untouched", async () => {
      const a = await createNotification(recipient.id, "request", entityId, "approval_required", "A");
      const b = await createNotification(recipient.id, "request", entityId, "approval_required", "B");
      const strangerNotification = await createNotification(
        stranger.id,
        "request",
        entityId,
        "approval_required",
        "Not yours"
      );

      await markAllNotificationsRead(recipient);

      const recipientNotifications = await listNotifications(recipient.id);
      const found = recipientNotifications.filter((n) => [a.id, b.id].includes(n.id));
      expect(found).toHaveLength(2);
      expect(found.every((n) => n.readAt !== null)).toBe(true);

      const strangerNotifications = await listNotifications(stranger.id);
      const untouched = strangerNotifications.find((n) => n.id === strangerNotification.id);
      expect(untouched?.readAt).toBeNull();
    });
```

Update the file's imports:
```ts
import { createNotification, listNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/domain/notifications";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
```

And extend `afterAll`'s cleanup to also delete `stranger`'s notifications:
```ts
      await supabase.from("notifications").delete().eq("profile_id", recipient.id);
      await supabase.from("notifications").delete().eq("profile_id", stranger.id);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:integration -- lib/domain/notifications.test.ts`
Expected: FAIL — `markNotificationRead`/`markAllNotificationsRead` are not exported from `lib/domain/notifications.ts`.

- [ ] **Step 3: Implement the functions**

In `lib/domain/notifications.ts`, add these imports at the top:
```ts
import type { Profile } from "@/lib/domain/profiles";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";
```

Append at the end of the file:
```ts
export async function markNotificationRead(
  profile: Profile,
  notificationId: string
): Promise<Notification> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("id", notificationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError("Notification not found");

  const notification = toNotification(data);
  if (notification.profileId !== profile.id) {
    throw new ForbiddenError("You cannot mark this notification as read");
  }

  const { data: updated, error: updateError } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .select(NOTIFICATION_COLUMNS)
    .single();
  if (updateError) throw updateError;
  return toNotification(updated);
}

export async function markAllNotificationsRead(profile: Profile): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("profile_id", profile.id)
    .is("read_at", null);
  if (error) throw error;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:integration -- lib/domain/notifications.test.ts`
Expected: PASS (all 5 tests: the original 2 plus the 3 new ones)

- [ ] **Step 5: Commit**

```bash
git add lib/domain/notifications.ts lib/domain/notifications.test.ts
git commit -m "feat: add markNotificationRead and markAllNotificationsRead"
```

---

### Task 2: Notifications API routes

**Files:**
- Create: `app/api/notifications/route.ts`, `app/api/notifications/route.test.ts`
- Create: `app/api/notifications/[id]/read/route.ts`, `app/api/notifications/[id]/read/route.test.ts`
- Create: `app/api/notifications/read-all/route.ts`, `app/api/notifications/read-all/route.test.ts`

**Interfaces:**
- Consumes: `listNotifications`, `markNotificationRead`, `markAllNotificationsRead` (Task 1), `getCurrentProfile` (`lib/auth/session.ts`), `toErrorResponse` (`lib/api/error-response.ts`)
- Produces: `GET /api/notifications` → `{ notifications: Notification[], unreadCount: number }`; `PATCH /api/notifications/[id]/read` → `{ notification: Notification }`; `POST /api/notifications/read-all` → `{ ok: true }` — consumed by Task 10's bell component

- [ ] **Step 1: Write the failing tests**

`app/api/notifications/route.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/notifications", () => ({
  listNotifications: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { listNotifications } from "@/lib/domain/notifications";
import { GET } from "@/app/api/notifications/route";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "Test User",
  role: "employee" as const,
  departmentId: null,
  managerId: null,
  positionTitle: null,
  employeeNumber: null,
  locationId: null,
  relatedOperationId: null,
  status: "active" as const,
};

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(listNotifications).mockReset();
});

describe("GET /api/notifications", () => {
  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns notifications and the unread count for the caller", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(listNotifications).mockResolvedValue([
      { id: "n1", profileId: "profile-1", entityType: "task", entityId: "t1", type: "task_assigned", message: "x", readAt: null, createdAt: "2026-09-24T00:00:00.000Z" },
      { id: "n2", profileId: "profile-1", entityType: "task", entityId: "t2", type: "task_assigned", message: "y", readAt: "2026-09-24T00:00:00.000Z", createdAt: "2026-09-24T00:00:00.000Z" },
    ] as never);

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.notifications).toHaveLength(2);
    expect(body.unreadCount).toBe(1);
    expect(listNotifications).toHaveBeenCalledWith("profile-1");
  });
});
```

`app/api/notifications/[id]/read/route.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/notifications", () => ({
  markNotificationRead: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { markNotificationRead } from "@/lib/domain/notifications";
import { PATCH } from "@/app/api/notifications/[id]/read/route";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "Test User",
  role: "employee" as const,
  departmentId: null,
  managerId: null,
  positionTitle: null,
  employeeNumber: null,
  locationId: null,
  relatedOperationId: null,
  status: "active" as const,
};

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(markNotificationRead).mockReset();
});

describe("PATCH /api/notifications/[id]/read", () => {
  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await PATCH(new Request("http://localhost"), params("n1"));
    expect(response.status).toBe(401);
  });

  it("marks the notification read for the caller", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(markNotificationRead).mockResolvedValue({
      id: "n1", profileId: "profile-1", entityType: "task", entityId: "t1", type: "task_assigned", message: "x", readAt: "2026-09-24T00:00:00.000Z", createdAt: "2026-09-24T00:00:00.000Z",
    } as never);

    const response = await PATCH(new Request("http://localhost"), params("n1"));
    expect(response.status).toBe(200);
    expect(markNotificationRead).toHaveBeenCalledWith(PROFILE, "n1");
  });

  it("maps ForbiddenError to 403 and NotFoundError to 404", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);

    vi.mocked(markNotificationRead).mockRejectedValueOnce(new ForbiddenError("no"));
    expect((await PATCH(new Request("http://localhost"), params("n1"))).status).toBe(403);

    vi.mocked(markNotificationRead).mockRejectedValueOnce(new NotFoundError("no"));
    expect((await PATCH(new Request("http://localhost"), params("n1"))).status).toBe(404);
  });
});
```

`app/api/notifications/read-all/route.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/notifications", () => ({
  markAllNotificationsRead: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { markAllNotificationsRead } from "@/lib/domain/notifications";
import { POST } from "@/app/api/notifications/read-all/route";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "Test User",
  role: "employee" as const,
  departmentId: null,
  managerId: null,
  positionTitle: null,
  employeeNumber: null,
  locationId: null,
  relatedOperationId: null,
  status: "active" as const,
};

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(markAllNotificationsRead).mockReset();
});

describe("POST /api/notifications/read-all", () => {
  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await POST();
    expect(response.status).toBe(401);
  });

  it("marks all of the caller's notifications read", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(markAllNotificationsRead).mockResolvedValue(undefined);

    const response = await POST();
    expect(response.status).toBe(200);
    expect(markAllNotificationsRead).toHaveBeenCalledWith(PROFILE);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- app/api/notifications`
Expected: FAIL — the route files under `app/api/notifications/` don't exist yet.

- [ ] **Step 3: Implement the routes**

`app/api/notifications/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { listNotifications } from "@/lib/domain/notifications";
import { toErrorResponse } from "@/lib/api/error-response";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const notifications = await listNotifications(profile.id);
    const unreadCount = notifications.filter((n) => n.readAt === null).length;
    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

`app/api/notifications/[id]/read/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { markNotificationRead } from "@/lib/domain/notifications";
import { toErrorResponse } from "@/lib/api/error-response";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const notification = await markNotificationRead(profile, id);
    return NextResponse.json({ notification });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

`app/api/notifications/read-all/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { markAllNotificationsRead } from "@/lib/domain/notifications";
import { toErrorResponse } from "@/lib/api/error-response";

export async function POST() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    await markAllNotificationsRead(profile);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- app/api/notifications`
Expected: PASS (all 7 tests across the three files)

- [ ] **Step 5: Commit**

```bash
git add app/api/notifications
git commit -m "feat: add notifications list and mark-as-read API routes"
```

---

### Task 3: "new task assigned" notification

**Files:**
- Modify: `lib/domain/tasks.ts`
- Test: `lib/domain/tasks.test.ts`

**Interfaces:**
- Consumes: `createNotification` (`lib/domain/notifications.ts`)
- Produces: no new exports — `createTask`/`assignTask` keep their existing signatures

- [ ] **Step 1: Write the failing tests**

Add to `lib/domain/tasks.test.ts`, in the same `describe` block as the existing assignment tests (import `listNotifications` at the top alongside the other imports: `import { listNotifications } from "@/lib/domain/notifications";`):

```ts
    it("notifies the assignee when a task is assigned to someone else, but not on self-claim", async () => {
      const task = await createTask(employee, { title: "Notify on assign" });
      await assignTask(employee, task.id, managerA.id);

      const managerNotifications = await listNotifications(managerA.id);
      expect(
        managerNotifications.some((n) => n.entityId === task.id && n.type === "task_assigned")
      ).toBe(true);

      const unassigned = await createTask(employee, { title: "Notify self-claim" });
      await assignTask(managerA, unassigned.id, managerA.id);
      const notificationsAfterSelfClaim = await listNotifications(managerA.id);
      expect(
        notificationsAfterSelfClaim.filter(
          (n) => n.entityId === unassigned.id && n.type === "task_assigned"
        )
      ).toHaveLength(0);
    });

    it("notifies the assignee when a task is created with an assignee already set", async () => {
      const task = await createTask(employee, {
        title: "Assigned at creation",
        assigneeId: managerA.id,
      });

      const notifications = await listNotifications(managerA.id);
      expect(
        notifications.some((n) => n.entityId === task.id && n.type === "task_assigned")
      ).toBe(true);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:integration -- lib/domain/tasks.test.ts`
Expected: FAIL — no `task_assigned` notification exists yet for either scenario.

- [ ] **Step 3: Implement the notifications**

In `lib/domain/tasks.ts`, add the import:
```ts
import { createNotification } from "@/lib/domain/notifications";
```

In `createTask`, after the existing `broadcastChange` try/catch block and before `return task;`:
```ts
  if (task.assigneeId && task.assigneeId !== profile.id) {
    await createNotification(
      task.assigneeId,
      "task",
      task.id,
      "task_assigned",
      `${profile.fullName} assigned you to "${task.title}"`
    );
  }

  return task;
```

In `assignTask`, after the existing `broadcastChange` try/catch block and before `return updated;`:
```ts
  if (targetAssigneeId !== profile.id) {
    await createNotification(
      targetAssigneeId,
      "task",
      updated.id,
      "task_assigned",
      `${profile.fullName} assigned you to "${updated.title}"`
    );
  }

  return updated;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:integration -- lib/domain/tasks.test.ts`
Expected: PASS (full file, including the 2 new tests)

- [ ] **Step 5: Commit**

```bash
git add lib/domain/tasks.ts lib/domain/tasks.test.ts
git commit -m "feat: notify the assignee when a task is assigned"
```

---

### Task 4: "asset assigned" notification

**Files:**
- Modify: `lib/domain/assets.ts`
- Test: `lib/domain/assets.test.ts`

**Interfaces:**
- Consumes: `createNotification` (`lib/domain/notifications.ts`)
- Produces: no new exports

- [ ] **Step 1: Write the failing test**

Add to `lib/domain/assets.test.ts` (import `listNotifications` alongside the other imports: `import { listNotifications } from "@/lib/domain/notifications";`):

```ts
  it("notifies the employee when an asset is assigned to them", async () => {
    const asset = await createAsset(itProfile, { name: "Notify Laptop", category: "laptop" });
    await assignAsset(itProfile, asset.id, employeeProfile.id);

    const notifications = await listNotifications(employeeProfile.id);
    expect(
      notifications.some((n) => n.entityId === asset.id && n.type === "asset_assigned")
    ).toBe(true);
  });

  it("does not notify when an IT staffer assigns an asset to themselves", async () => {
    const asset = await createAsset(itProfile, { name: "Self-claim Laptop", category: "laptop" });
    await assignAsset(itProfile, asset.id, itProfile.id);

    const notifications = await listNotifications(itProfile.id);
    expect(
      notifications.filter((n) => n.entityId === asset.id && n.type === "asset_assigned")
    ).toHaveLength(0);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:integration -- lib/domain/assets.test.ts`
Expected: FAIL — no `asset_assigned` notification is created yet.

- [ ] **Step 3: Implement the notification**

In `lib/domain/assets.ts`, add the import:
```ts
import { createNotification } from "@/lib/domain/notifications";
```

In `assignAsset`, after the existing `broadcastChange` try/catch block and before `return updated;`:
```ts
  if (targetEmployeeId !== profile.id) {
    await createNotification(
      targetEmployeeId,
      "asset",
      updated.id,
      "asset_assigned",
      `${profile.fullName} assigned you the asset "${updated.name}"`
    );
  }

  return updated;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:integration -- lib/domain/assets.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/domain/assets.ts lib/domain/assets.test.ts
git commit -m "feat: notify the employee when an asset is assigned to them"
```

---

### Task 5: "comment added" notification (tasks, requests, operations)

**Files:**
- Modify: `app/api/tasks/[id]/comments/route.ts`, `app/api/tasks/[id]/comments/route.test.ts`
- Modify: `app/api/requests/[id]/comments/route.ts`, `app/api/requests/[id]/comments/route.test.ts`
- Modify: `app/api/operations/[id]/comments/route.ts`, `app/api/operations/[id]/comments/route.test.ts`

**Interfaces:**
- Consumes: `createNotification` (`lib/domain/notifications.ts`)
- Produces: no new exports

- [ ] **Step 1: Write the failing tests**

In `app/api/tasks/[id]/comments/route.test.ts`, add the mock and a new test in the `POST` describe block:
```ts
vi.mock("@/lib/domain/notifications", () => ({
  createNotification: vi.fn(),
}));
```
(add alongside the other `vi.mock` calls at the top, and add `import { createNotification } from "@/lib/domain/notifications";` plus `vi.mocked(createNotification).mockReset();` in `beforeEach`)

```ts
  it("notifies the assignee when someone else comments, but not the assignee's own comment", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getTask).mockResolvedValue({ ...TASK, assigneeId: "assignee-1" } as never);
    vi.mocked(addComment).mockResolvedValue({ id: "comment-1" } as never);

    await POST(jsonRequest({ body: "Looks good" }), params("task-1"));
    expect(createNotification).toHaveBeenCalledWith(
      "assignee-1",
      "task",
      "task-1",
      "comment_added",
      expect.stringContaining("commented")
    );

    vi.mocked(createNotification).mockClear();
    vi.mocked(getTask).mockResolvedValue({ ...TASK, assigneeId: PROFILE.id } as never);
    await POST(jsonRequest({ body: "My own comment" }), params("task-1"));
    expect(createNotification).not.toHaveBeenCalled();

    vi.mocked(createNotification).mockClear();
    vi.mocked(getTask).mockResolvedValue({ ...TASK, assigneeId: null } as never);
    await POST(jsonRequest({ body: "On an unassigned task" }), params("task-1"));
    expect(createNotification).not.toHaveBeenCalled();
  });
```

(Check the existing `POST` tests in this file for the exact shape of `jsonRequest`/`params` already defined — reuse them, don't redefine.)

`app/api/requests/[id]/comments/route.test.ts` already has `getCurrentProfile`/`getRequest`/`addComment`/`activity`/`broadcast` mocked, plus `PROFILE`, `params`, and `jsonRequest` helpers already defined — add one more mock block alongside the existing ones:
```ts
vi.mock("@/lib/domain/notifications", () => ({ createNotification: vi.fn() }));
```
and the import `import { createNotification } from "@/lib/domain/notifications";`, and add `vi.mocked(createNotification).mockReset();` to the existing `beforeEach`. Then add a new test:
```ts
  it("notifies the request's creator when someone else comments, but not their own comment", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getRequest).mockResolvedValue({
      id: "request-1",
      companyId: "company-1",
      title: "Broken monitor",
      createdBy: "creator-1",
    } as never);
    vi.mocked(addComment).mockResolvedValue({ id: "comment-1" } as never);

    await POST(jsonRequest({ body: "Update" }), params("request-1"));
    expect(createNotification).toHaveBeenCalledWith(
      "creator-1",
      "request",
      "request-1",
      "comment_added",
      expect.stringContaining("commented")
    );

    vi.mocked(createNotification).mockClear();
    vi.mocked(getRequest).mockResolvedValue({
      id: "request-1",
      companyId: "company-1",
      title: "Broken monitor",
      createdBy: PROFILE.id,
    } as never);
    await POST(jsonRequest({ body: "My own" }), params("request-1"));
    expect(createNotification).not.toHaveBeenCalled();

    vi.mocked(createNotification).mockClear();
    vi.mocked(getRequest).mockResolvedValue({
      id: "request-1",
      companyId: "company-1",
      title: "Broken monitor",
      createdBy: null,
    } as never);
    await POST(jsonRequest({ body: "No creator on record" }), params("request-1"));
    expect(createNotification).not.toHaveBeenCalled();
  });
```

`app/api/operations/[id]/comments/route.test.ts` already has `getCurrentProfile`/`loadOperationOrThrow`/`addComment`/`listComments`/`activity`/`broadcast` mocked (note: `canCommentOnOperation`, i.e. `canViewOperation`, is deliberately left unmocked in this file and runs for real against the mocked operation object — it only checks `operation.companyId === profile.companyId`, which the fixtures below already satisfy, matching this file's existing "adds the comment" test). Add:
```ts
vi.mock("@/lib/domain/notifications", () => ({ createNotification: vi.fn() }));
```
and the import `import { createNotification } from "@/lib/domain/notifications";`, and add `vi.mocked(createNotification).mockReset();` to the existing `beforeEach`. Then add a new test in the `POST` describe block:
```ts
  it("notifies the operation's owner when someone else comments, but not their own comment", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(loadOperationOrThrow).mockResolvedValue({
      id: "op-1",
      companyId: "company-1",
      title: "Q4 rollout",
      ownerId: "owner-1",
    } as never);
    vi.mocked(addComment).mockResolvedValue({ id: "comment-1" } as never);

    await POST(jsonRequest({ body: "Update" }), params("op-1"));
    expect(createNotification).toHaveBeenCalledWith(
      "owner-1",
      "operation",
      "op-1",
      "comment_added",
      expect.stringContaining("commented")
    );

    vi.mocked(createNotification).mockClear();
    vi.mocked(loadOperationOrThrow).mockResolvedValue({
      id: "op-1",
      companyId: "company-1",
      title: "Q4 rollout",
      ownerId: PROFILE.id,
    } as never);
    await POST(jsonRequest({ body: "My own" }), params("op-1"));
    expect(createNotification).not.toHaveBeenCalled();
  });
```
(Note this file's `jsonRequest` helper is defined locally inside the `POST` describe block, not at module scope like the other two comment-route test files — use it from there.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- app/api/tasks/\[id\]/comments app/api/requests/\[id\]/comments app/api/operations/\[id\]/comments`
Expected: FAIL — `createNotification` is never called by any of the three routes yet.

- [ ] **Step 3: Implement the notifications**

In `app/api/tasks/[id]/comments/route.ts`, add the import and, in `POST`, after `await logActivity(...)` and before the `broadcastChange` try block:
```ts
import { createNotification } from "@/lib/domain/notifications";
```
```ts
    if (task.assigneeId && task.assigneeId !== profile.id) {
      await createNotification(
        task.assigneeId,
        "task",
        task.id,
        "comment_added",
        `${profile.fullName} commented on "${task.title}"`
      );
    }
```

In `app/api/requests/[id]/comments/route.ts`, same import, after `await logActivity(...)`:
```ts
    if (targetRequest.createdBy && targetRequest.createdBy !== profile.id) {
      await createNotification(
        targetRequest.createdBy,
        "request",
        targetRequest.id,
        "comment_added",
        `${profile.fullName} commented on "${targetRequest.title}"`
      );
    }
```

In `app/api/operations/[id]/comments/route.ts`, same import, after `await logActivity(...)`:
```ts
    if (operation.ownerId !== profile.id) {
      await createNotification(
        operation.ownerId,
        "operation",
        operation.id,
        "comment_added",
        `${profile.fullName} commented on "${operation.title}"`
      );
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- app/api/tasks/\[id\]/comments app/api/requests/\[id\]/comments app/api/operations/\[id\]/comments`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/tasks/\[id\]/comments app/api/requests/\[id\]/comments app/api/operations/\[id\]/comments
git commit -m "feat: notify the owning profile when a task, request, or operation gets a comment"
```

---

### Task 6: "workflow step completed" notification + workflow activity log

**Files:**
- Modify: `lib/domain/workflows.ts`
- Modify: `lib/domain/workflows.test.ts`
- Modify: `app/(app)/workflows/[id]/page.tsx`

**Interfaces:**
- Consumes: `logActivity` (already imported), `createNotification` (already imported)
- Produces: no new exports — `advanceWorkflow`/`startWorkflow` keep their signatures

- [ ] **Step 1: Write the failing tests**

Add to `lib/domain/workflows.test.ts`, inside `describe("advanceWorkflow / getWorkflowProgress / finders", ...)` (import `listActivity` and `listNotifications` at the top: `import { listActivity } from "@/lib/domain/activity";` and `import { listNotifications } from "@/lib/domain/notifications";`):

```ts
    it("logs a workflow-scoped activity entry when a step completes and when the instance completes", async () => {
      const request = await createRequest(employee, {
        title: "Workflow activity log test",
        category: "equipment",
      });
      const instance = await startWorkflow(employee, "approval-first-test", {
        requestId: request.id,
      });

      await advanceWorkflow(employee, instance.id);

      const activity = await listActivity("workflow", instance.id);
      expect(activity.some((entry) => entry.message === "Workflow started")).toBe(true);
      expect(activity.some((entry) => entry.message.includes("completed"))).toBe(true);
    });

    it("notifies the instance's related employee when a step completes, but not when there is none", async () => {
      const request = await createRequest(employee, {
        title: "Workflow notification test",
        category: "equipment",
      });
      const instance = await startWorkflow(employee, "approval-first-test", {
        requestId: request.id,
      });

      await advanceWorkflow(employee, instance.id);

      const notifications = await listNotifications(employee.id);
      expect(
        notifications.some(
          (n) => n.entityId === instance.id && n.type === "workflow_step_completed"
        )
      ).toBe(true);

      const noContextInstance = await startWorkflow(employee, "task-only-test", {});
      await advanceWorkflow(employee, noContextInstance.id);
      // task-only-test's first step is a task step; advancing it just moves to step 2,
      // it doesn't complete the instance — but the *step*-completed notification should
      // still be skipped either way, since relatedEmployeeId is null with no context given.
      const notificationsAfter = await listNotifications(employee.id);
      expect(
        notificationsAfter.filter(
          (n) => n.entityId === noContextInstance.id && n.type === "workflow_step_completed"
        )
      ).toHaveLength(0);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:integration -- lib/domain/workflows.test.ts`
Expected: FAIL — no `entityType: "workflow"` activity entries and no `workflow_step_completed` notifications exist yet.

- [ ] **Step 3: Implement the changes**

In `lib/domain/workflows.ts`, in `startWorkflow`, right after the existing `if (context.requestId) { ... }` block (the one that logs `"Workflow \"${template.name}\" started"` against `entityType: "request"`) and before the `broadcastChange` try block, add:
```ts
  await logActivity("workflow", instance.id, profile.id, "Workflow started");
```

In `advanceWorkflow`, change the `currentStepRow` select to also fetch `template_step_id`:
```ts
  const { data: currentStepRow, error: currentStepError } = await supabase
    .from("workflow_instance_steps")
    .select("id, step_order, template_step_id")
    .eq("instance_id", instanceId)
    .eq("status", "in_progress")
    .maybeSingle();
```

Right after the existing `completeCurrentError` check (the block that marks the current step `completed`) and before the `nextTemplateStepRow` query, add:
```ts
  const { data: completedTemplateStepRow, error: completedTemplateStepError } = await supabase
    .from("workflow_template_steps")
    .select("title")
    .eq("id", currentStepRow.template_step_id)
    .maybeSingle();
  if (completedTemplateStepError) throw completedTemplateStepError;
  const completedStepTitle = completedTemplateStepRow?.title ?? "Step";

  await logActivity(
    "workflow",
    instance.id,
    profile.id,
    `Step "${completedStepTitle}" completed`
  );

  if (instance.relatedEmployeeId) {
    await createNotification(
      instance.relatedEmployeeId,
      "workflow",
      instance.id,
      "workflow_step_completed",
      `Step "${completedStepTitle}" completed`
    );
  }
```

Inside the `if (nextTemplateStepRow) { ... }` branch, right after the existing `nextStepUpdateError` check, add:
```ts
    await logActivity(
      "workflow",
      instance.id,
      profile.id,
      `Step "${nextStep.title}" started`
    );
```

Inside the `else { ... }` branch (instance completion), right after the existing `completeInstanceError` check and before the `if (instance.relatedRequestId) { ... }` block, add:
```ts
    await logActivity("workflow", instance.id, profile.id, "Workflow completed");
```

In `app/(app)/workflows/[id]/page.tsx`, add the import:
```ts
import { listActivity } from "@/lib/domain/activity";
```
Fetch the activity alongside loading progress, and render it below `WorkflowStepper` (matching the exact markup `app/(app)/tasks/[id]/page.tsx` already uses):
```tsx
  const activity = await listActivity("workflow", progress.instance.id);
```
```tsx
      <WorkflowStepper progress={progress} />

      <section>
        <h2 className="text-lg font-medium mb-2">Activity</h2>
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {activity.map((entry) => (
            <li key={entry.id}>{entry.message}</li>
          ))}
          {activity.length === 0 && <li>No activity yet.</li>}
        </ul>
      </section>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:integration -- lib/domain/workflows.test.ts`
Expected: PASS

Run: `npm run build`
Expected: succeeds — this catches any type error in the page's new JSX (this project has no dedicated test for `[id]` detail pages; a full `next build` is this codebase's only automated check on them, per `docs/STATUS.md`'s own note on the sidebar-shell phase).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/workflows.ts lib/domain/workflows.test.ts "app/(app)/workflows/[id]/page.tsx"
git commit -m "feat: log workflow-scoped activity and notify on step completion"
```

---

### Task 7: "Overdue" task indicator

**Files:**
- Create: `components/tasks/is-task-overdue.ts`, `components/tasks/is-task-overdue.test.ts`
- Modify: `components/tasks/task-list-view.tsx`, `components/tasks/task-list-view.test.tsx`
- Modify: `app/(app)/tasks/[id]/page.tsx`

**Interfaces:**
- Produces: `isTaskOverdue(task: { dueDate: string | null; status: string }): boolean` — a standalone client-safe module (deliberately not importing `OPEN_TASK_STATUSES` from `lib/domain/reports.ts`, since that file imports `createSupabaseAdminClient`, which must never end up in a client bundle)

- [ ] **Step 1: Write the failing test**

`components/tasks/is-task-overdue.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { isTaskOverdue } from "@/components/tasks/is-task-overdue";

describe("isTaskOverdue", () => {
  it("is true for a past due date on an open task", () => {
    expect(isTaskOverdue({ dueDate: "2020-01-01T00:00:00.000Z", status: "todo" })).toBe(true);
  });

  it("is false for a past due date on a completed task", () => {
    expect(isTaskOverdue({ dueDate: "2020-01-01T00:00:00.000Z", status: "completed" })).toBe(
      false
    );
  });

  it("is false for a past due date on a cancelled task", () => {
    expect(isTaskOverdue({ dueDate: "2020-01-01T00:00:00.000Z", status: "cancelled" })).toBe(
      false
    );
  });

  it("is false when there is no due date", () => {
    expect(isTaskOverdue({ dueDate: null, status: "todo" })).toBe(false);
  });

  it("is false for a future due date", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(isTaskOverdue({ dueDate: future, status: "todo" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- components/tasks/is-task-overdue.test.ts`
Expected: FAIL — `components/tasks/is-task-overdue.ts` does not exist.

- [ ] **Step 3: Implement the helper**

`components/tasks/is-task-overdue.ts`:
```ts
export function isTaskOverdue(task: { dueDate: string | null; status: string }): boolean {
  if (!task.dueDate) return false;
  if (task.status === "completed" || task.status === "cancelled") return false;
  return new Date(task.dueDate).getTime() < Date.now();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- components/tasks/is-task-overdue.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing component test**

Add to `components/tasks/task-list-view.test.tsx`:
```ts
  it("shows an Overdue badge for a past-due open task, but not a completed one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tasks: [
            {
              id: "task-1",
              title: "Overdue task",
              status: "todo",
              priority: "high",
              assigneeId: null,
              departmentId: null,
              dueDate: "2020-01-01T00:00:00.000Z",
            },
            {
              id: "task-2",
              title: "Done task",
              status: "completed",
              priority: "low",
              assigneeId: null,
              departmentId: null,
              dueDate: "2020-01-01T00:00:00.000Z",
            },
          ],
        }),
      })
    );

    renderWithClient(<TaskListView companyId="company-1" />);

    await screen.findByText("Overdue task");
    expect(screen.getAllByText("Overdue")).toHaveLength(1);
  });
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test:unit -- components/tasks/task-list-view.test.tsx`
Expected: FAIL — no "Overdue" badge is rendered yet.

- [ ] **Step 7: Wire the badge into task-list-view and the task detail page**

In `components/tasks/task-list-view.tsx`, add the import:
```ts
import { isTaskOverdue } from "@/components/tasks/is-task-overdue";
```
Change the "Due date" cell:
```tsx
                <TableCell>
                  {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—"}
                  {isTaskOverdue(task) && (
                    <Badge variant="destructive" className="ml-2">
                      Overdue
                    </Badge>
                  )}
                </TableCell>
```

In `app/(app)/tasks/[id]/page.tsx`, add the import:
```ts
import { isTaskOverdue } from "@/components/tasks/is-task-overdue";
import { Badge } from "@/components/ui/badge";
```
Change the title block:
```tsx
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{task.title}</h1>
          {isTaskOverdue(task) && <Badge variant="destructive">Overdue</Badge>}
        </div>
        {task.description && (
          <p className="mt-2 text-muted-foreground">{task.description}</p>
        )}
      </div>
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm run test:unit -- components/tasks/`
Expected: PASS

Run: `npm run build`
Expected: succeeds

- [ ] **Step 9: Commit**

```bash
git add components/tasks/is-task-overdue.ts components/tasks/is-task-overdue.test.ts components/tasks/task-list-view.tsx components/tasks/task-list-view.test.tsx "app/(app)/tasks/[id]/page.tsx"
git commit -m "feat: show an Overdue badge on past-due, still-open tasks"
```

---

### Task 8: "Blocked" workflow step indicator

**Files:**
- Modify: `components/workflows/workflow-stepper.tsx`, `components/workflows/workflow-stepper.test.tsx`

**Interfaces:**
- Produces: no new exports — `WorkflowStepper`'s props are unchanged

- [ ] **Step 1: Write the failing tests**

In `components/workflows/workflow-stepper.test.tsx`, change the import line to include `vi` and `afterEach`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
```
Add at the end of the file:
```ts
describe("WorkflowStepper blocked indicator", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a Blocked badge on an in-progress step older than 3 days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T00:00:00.000Z"));
    render(<WorkflowStepper progress={PROGRESS} />);
    expect(screen.getByText("Blocked")).toBeInTheDocument();
  });

  it("does not show Blocked for a step created less than 3 days ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T12:00:00.000Z"));
    render(<WorkflowStepper progress={PROGRESS} />);
    expect(screen.queryByText("Blocked")).not.toBeInTheDocument();
  });
});
```

(`PROGRESS.steps[1]` — "Procurement" — is `in_progress` with `createdAt: "2026-08-28T01:00:00.000Z"`, so this reuses the file's existing fixture unchanged.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- components/workflows/workflow-stepper.test.tsx`
Expected: FAIL — no "Blocked" text is rendered yet.

- [ ] **Step 3: Implement the indicator**

In `components/workflows/workflow-stepper.tsx`, add below the existing `formatLabel`/`stepBadgeVariant` helpers:
```tsx
const WORKFLOW_STEP_STALE_DAYS = 3;

function isStepBlocked(step: { status: "pending" | "in_progress" | "completed"; createdAt: string }): boolean {
  if (step.status !== "in_progress") return false;
  const ageMs = Date.now() - new Date(step.createdAt).getTime();
  return ageMs > WORKFLOW_STEP_STALE_DAYS * 24 * 60 * 60 * 1000;
}
```
Change the step's badge line:
```tsx
              <Badge variant={stepBadgeVariant(step.status)}>{formatLabel(step.status)}</Badge>
              {isStepBlocked(step) && <Badge variant="destructive">Blocked</Badge>}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- components/workflows/workflow-stepper.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/workflows/workflow-stepper.tsx components/workflows/workflow-stepper.test.tsx
git commit -m "feat: show a Blocked badge on a stalled workflow step"
```

---

### Task 9: Realtime refresh audit (operations, assets, employees detail pages)

**Files:**
- Create: `components/operations/operation-realtime-refresh.tsx`, `components/operations/operation-realtime-refresh.test.tsx`
- Create: `components/assets/asset-realtime-refresh.tsx`, `components/assets/asset-realtime-refresh.test.tsx`
- Create: `components/employees/employee-realtime-refresh.tsx`, `components/employees/employee-realtime-refresh.test.tsx`
- Modify: `app/(app)/operations/[id]/page.tsx`, `app/(app)/assets/[id]/page.tsx`, `app/(app)/employees/[id]/page.tsx`

**Interfaces:**
- Consumes: `useBroadcastListener` (`lib/realtime/use-broadcast-listener.ts`)
- Produces: `OperationRealtimeRefresh({ companyId }: { companyId: string })`, `AssetRealtimeRefresh({ companyId }: { companyId: string })`, `EmployeeRealtimeRefresh({ companyId }: { companyId: string })` — each a `null`-rendering client component, matching `components/tasks/task-realtime-refresh.tsx`'s exact shape

- [ ] **Step 1: Write the failing tests**

`components/operations/operation-realtime-refresh.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

let capturedOnMessage: (() => void) | null = null;
vi.mock("@/lib/realtime/use-broadcast-listener", () => ({
  useBroadcastListener: (_channel: string, onMessage: () => void) => {
    capturedOnMessage = onMessage;
  },
}));

import { OperationRealtimeRefresh } from "@/components/operations/operation-realtime-refresh";

describe("OperationRealtimeRefresh", () => {
  it("refreshes the router when a broadcast is received", () => {
    render(<OperationRealtimeRefresh companyId="company-1" />);
    capturedOnMessage?.();
    expect(refreshMock).toHaveBeenCalled();
  });
});
```

`components/assets/asset-realtime-refresh.test.tsx` — identical shape, importing `AssetRealtimeRefresh` from `@/components/assets/asset-realtime-refresh`.

`components/employees/employee-realtime-refresh.test.tsx` — identical shape, importing `EmployeeRealtimeRefresh` from `@/components/employees/employee-realtime-refresh`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- components/operations/operation-realtime-refresh.test.tsx components/assets/asset-realtime-refresh.test.tsx components/employees/employee-realtime-refresh.test.tsx`
Expected: FAIL — none of the three components exist yet.

- [ ] **Step 3: Implement the components**

`components/operations/operation-realtime-refresh.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { useBroadcastListener } from "@/lib/realtime/use-broadcast-listener";

export function OperationRealtimeRefresh({ companyId }: { companyId: string }) {
  const router = useRouter();
  useBroadcastListener(`company:${companyId}:operations`, () => {
    router.refresh();
  });
  return null;
}
```

`components/assets/asset-realtime-refresh.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { useBroadcastListener } from "@/lib/realtime/use-broadcast-listener";

export function AssetRealtimeRefresh({ companyId }: { companyId: string }) {
  const router = useRouter();
  useBroadcastListener(`company:${companyId}:assets`, () => {
    router.refresh();
  });
  return null;
}
```

`components/employees/employee-realtime-refresh.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { useBroadcastListener } from "@/lib/realtime/use-broadcast-listener";

export function EmployeeRealtimeRefresh({ companyId }: { companyId: string }) {
  const router = useRouter();
  useBroadcastListener(`company:${companyId}:employees`, () => {
    router.refresh();
  });
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- components/operations/operation-realtime-refresh.test.tsx components/assets/asset-realtime-refresh.test.tsx components/employees/employee-realtime-refresh.test.tsx`
Expected: PASS

- [ ] **Step 5: Wire the components into their detail pages**

In `app/(app)/operations/[id]/page.tsx`, add the import `import { OperationRealtimeRefresh } from "@/components/operations/operation-realtime-refresh";` and, right after `<div className="flex flex-col gap-6 max-w-2xl">` and before `<BackLink href="/operations" />`:
```tsx
      <OperationRealtimeRefresh companyId={profile.companyId} />
```

In `app/(app)/assets/[id]/page.tsx`, add the import `import { AssetRealtimeRefresh } from "@/components/assets/asset-realtime-refresh";` and, right after `<div className="flex flex-col gap-6 max-w-2xl">` and before `<BackLink href="/assets" />`:
```tsx
      <AssetRealtimeRefresh companyId={profile.companyId} />
```

In `app/(app)/employees/[id]/page.tsx`, add the import `import { EmployeeRealtimeRefresh } from "@/components/employees/employee-realtime-refresh";` and, right after `<div className="flex flex-col gap-6 max-w-2xl">` and before `<BackLink href="/employees" />`:
```tsx
      <EmployeeRealtimeRefresh companyId={profile.companyId} />
```

- [ ] **Step 6: Verify the build**

Run: `npm run build`
Expected: succeeds (no dedicated page-level test exists for these `[id]` pages in this codebase — a clean build is the check, matching Task 6's precedent)

- [ ] **Step 7: Commit**

```bash
git add components/operations/operation-realtime-refresh.tsx components/operations/operation-realtime-refresh.test.tsx components/assets/asset-realtime-refresh.tsx components/assets/asset-realtime-refresh.test.tsx components/employees/employee-realtime-refresh.tsx components/employees/employee-realtime-refresh.test.tsx "app/(app)/operations/[id]/page.tsx" "app/(app)/assets/[id]/page.tsx" "app/(app)/employees/[id]/page.tsx"
git commit -m "feat: live-refresh operation, asset, and employee detail pages"
```

---

### Task 10: Notification bell UI

**Files:**
- Create: `components/notification-bell.tsx`, `components/notification-bell.test.tsx`
- Modify: `components/site-header.tsx`
- Create: `components/site-header.test.tsx`

**Interfaces:**
- Consumes: `GET /api/notifications`, `PATCH /api/notifications/[id]/read`, `POST /api/notifications/read-all` (Task 2), `Notification` type (`lib/domain/notifications.ts`), `useBroadcastListener`, `getCurrentProfile`
- Produces: `NotificationBell({ profileId }: { profileId: string })`

- [ ] **Step 1: Write the failing component tests**

`components/notification-bell.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => ({ on: () => ({ subscribe: vi.fn() }) }),
    removeChannel: vi.fn(),
  }),
}));

import { NotificationBell } from "@/components/notification-bell";

const NOTIFICATION = {
  id: "n1",
  profileId: "profile-1",
  entityType: "task",
  entityId: "task-1",
  type: "task_assigned",
  message: 'You were assigned to "Fix printer"',
  readAt: null,
  createdAt: "2026-09-24T00:00:00.000Z",
};

function stubNotificationsFetch(notifications: unknown[], unreadCount: number) {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url === "/api/notifications") {
      return Promise.resolve({
        ok: true,
        json: async () => ({ notifications, unreadCount }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("NotificationBell", () => {
  it("shows the unread count badge from the initial fetch", async () => {
    stubNotificationsFetch([NOTIFICATION], 1);
    render(<NotificationBell profileId="profile-1" />);
    expect(await screen.findByText("1")).toBeInTheDocument();
  });

  it("shows no unread badge when there are no unread notifications", async () => {
    stubNotificationsFetch([], 0);
    render(<NotificationBell profileId="profile-1" />);
    await screen.findByRole("button", { name: "Notifications" });
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("marks a notification read and navigates to it on click", async () => {
    const fetchMock = stubNotificationsFetch([NOTIFICATION], 1);
    render(<NotificationBell profileId="profile-1" />);

    await userEvent.click(await screen.findByRole("button", { name: "Notifications" }));
    await userEvent.click(await screen.findByText(/Fix printer/));

    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/n1/read", { method: "PATCH" });
    expect(pushMock).toHaveBeenCalledWith("/tasks/task-1");
  });

  it("does not re-mark an already-read notification on a second click", async () => {
    const readNotification = { ...NOTIFICATION, readAt: "2026-09-24T00:00:00.000Z" };
    const fetchMock = stubNotificationsFetch([readNotification], 0);
    render(<NotificationBell profileId="profile-1" />);

    await userEvent.click(await screen.findByRole("button", { name: "Notifications" }));
    await userEvent.click(await screen.findByText(/Fix printer/));

    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/notifications/n1/read",
      expect.anything()
    );
    expect(pushMock).toHaveBeenCalledWith("/tasks/task-1");
  });

  it("marks all notifications read via 'Mark all as read'", async () => {
    const fetchMock = stubNotificationsFetch([NOTIFICATION], 1);
    render(<NotificationBell profileId="profile-1" />);

    await userEvent.click(await screen.findByRole("button", { name: "Notifications" }));
    await userEvent.click(await screen.findByText("Mark all as read"));

    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/read-all", { method: "POST" });
  });
});
```

`components/site-header.test.tsx` (no jsdom needed — matches `app/(app)/layout.test.tsx`'s own precedent of inspecting the returned element tree from an async Server Component directly, rather than rendering it):
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { SiteHeader } from "@/components/site-header";

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
});

describe("SiteHeader", () => {
  it("passes the current profile's id to the notification bell", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "profile-1" } as never);
    const element = await SiteHeader();
    expect(JSON.stringify(element)).toContain('"profileId":"profile-1"');
  });

  it("renders no notification bell when there is no current profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const element = await SiteHeader();
    expect(JSON.stringify(element)).not.toContain("profileId");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- components/notification-bell.test.tsx components/site-header.test.tsx`
Expected: FAIL — `components/notification-bell.tsx` doesn't exist, and `SiteHeader` isn't async / doesn't accept this shape yet.

- [ ] **Step 3: Implement the bell component**

`components/notification-bell.tsx`:
```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBroadcastListener } from "@/lib/realtime/use-broadcast-listener";
import type { Notification } from "@/lib/domain/notifications";

const ENTITY_ROUTES: Record<string, string> = {
  request: "/requests",
  task: "/tasks",
  asset: "/assets",
  operation: "/operations",
  workflow: "/workflows",
};

export function NotificationBell({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refetch = useCallback(async () => {
    const response = await fetch("/api/notifications");
    if (!response.ok) return;
    const body = await response.json();
    setNotifications(body.notifications as Notification[]);
    setUnreadCount(body.unreadCount as number);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useBroadcastListener(`profile:${profileId}:notifications`, refetch);

  async function handleSelect(notification: Notification) {
    if (notification.readAt === null) {
      setNotifications((current) =>
        current.map((n) =>
          n.id === notification.id ? { ...n, readAt: new Date().toISOString() } : n
        )
      );
      setUnreadCount((count) => Math.max(0, count - 1));
      await fetch(`/api/notifications/${notification.id}/read`, { method: "PATCH" });
    }
    const basePath = ENTITY_ROUTES[notification.entityType];
    if (basePath) {
      router.push(`${basePath}/${notification.entityId}`);
    }
  }

  async function handleMarkAllRead() {
    setNotifications((current) =>
      current.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }))
    );
    setUnreadCount(0);
    await fetch("/api/notifications/read-all", { method: "POST" });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label="Notifications"
          />
        }
      >
        <BellIcon />
        {unreadCount > 0 && (
          <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 min-w-4 px-1">
            {unreadCount}
          </Badge>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-80" align="end" sideOffset={4}>
        <DropdownMenuLabel className="flex items-center justify-between">
          Notifications
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-xs font-normal text-primary hover:underline"
            >
              Mark all as read
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 && (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            No notifications yet.
          </div>
        )}
        {notifications.map((notification) => (
          <DropdownMenuItem key={notification.id} onClick={() => handleSelect(notification)}>
            <span
              className={
                notification.readAt === null ? "font-medium" : "text-muted-foreground"
              }
            >
              {notification.message}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

Replace the full contents of `components/site-header.tsx`:
```tsx
import { SidebarTrigger } from "@/components/ui/sidebar"
import { getCurrentProfile } from "@/lib/auth/session"
import { NotificationBell } from "@/components/notification-bell"

export async function SiteHeader() {
  const profile = await getCurrentProfile()

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <div className="ml-auto">
          {profile && <NotificationBell profileId={profile.id} />}
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- components/notification-bell.test.tsx components/site-header.test.tsx`
Expected: PASS

- [ ] **Step 5: Verify the build and existing layout test**

Run: `npm run test:unit -- "app/(app)/layout.test.tsx"`
Expected: PASS unchanged (it never renders `SiteHeader` itself — it asserts on `AppSidebar`'s props via `JSON.stringify`, so `SiteHeader` becoming async doesn't affect it)

Run: `npm run build`
Expected: succeeds

- [ ] **Step 6: Commit**

```bash
git add components/notification-bell.tsx components/notification-bell.test.tsx components/site-header.tsx components/site-header.test.tsx
git commit -m "feat: add the notification bell to the app header"
```

---

## Final Verification

After Task 10, run the full suite before requesting whole-branch review:

```bash
npm run test:unit
npm run test:integration
npm run build
```

All three must be clean (matching every prior phase's own final-verification bar per `docs/STATUS.md`). No manual browser click-through is expected to be possible in this environment (no browser-automation tool) — flag that in `docs/STATUS.md` for a human pass, same as every prior phase.
