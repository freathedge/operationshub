import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile } from "@/lib/domain/profiles";
import type { Profile } from "@/lib/domain/profiles";
import { createNotification, listNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/domain/notifications";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)(
  "createNotification / listNotifications",
  () => {
    const supabase = createSupabaseAdminClient();
    let companyId: string;
    const createdAuthUserIds: string[] = [];
    let recipient: Profile;
    let stranger: Profile;
    const entityId = crypto.randomUUID();

    beforeAll(async () => {
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .upsert(
          { name: "Test Co (notifications)", slug: "test-co-notifications" },
          { onConflict: "slug" }
        )
        .select("id")
        .single();
      if (companyError) throw companyError;
      companyId = company.id;

      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: `notifications-test-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
      if (authError || !authUser.user) throw authError;
      createdAuthUserIds.push(authUser.user.id);

      recipient = await createProfile({
        authUserId: authUser.user.id,
        companyId,
        fullName: "Notifications Test User",
        role: "employee",
      });

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
    });

    afterAll(async () => {
      await supabase.from("notifications").delete().eq("profile_id", recipient.id);
      await supabase.from("notifications").delete().eq("profile_id", stranger.id);
      await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
      for (const id of createdAuthUserIds) {
        await supabase.auth.admin.deleteUser(id);
      }
      await supabase.from("companies").delete().eq("slug", "test-co-notifications");
    });

    it("creates a notification and lists it back for the recipient", async () => {
      const notification = await createNotification(
        recipient.id,
        "request",
        entityId,
        "approval_required",
        "Please review this request"
      );

      expect(notification.profileId).toBe(recipient.id);
      expect(notification.type).toBe("approval_required");
      expect(notification.readAt).toBeNull();

      const notifications = await listNotifications(recipient.id);
      expect(notifications.map((n) => n.id)).toContain(notification.id);
    });

    it("orders notifications newest first", async () => {
      const first = await createNotification(
        recipient.id,
        "request",
        entityId,
        "request_status_changed",
        "First"
      );
      const second = await createNotification(
        recipient.id,
        "request",
        entityId,
        "request_status_changed",
        "Second"
      );

      const notifications = await listNotifications(recipient.id);
      const firstIndex = notifications.findIndex((n) => n.id === first.id);
      const secondIndex = notifications.findIndex((n) => n.id === second.id);
      expect(secondIndex).toBeLessThan(firstIndex);
    });

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
  }
);
