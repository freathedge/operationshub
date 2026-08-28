import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile } from "@/lib/domain/profiles";
import type { Profile } from "@/lib/domain/profiles";
import { createNotification, listNotifications } from "@/lib/domain/notifications";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)(
  "createNotification / listNotifications",
  () => {
    const supabase = createSupabaseAdminClient();
    let companyId: string;
    const createdAuthUserIds: string[] = [];
    let recipient: Profile;
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
    });

    afterAll(async () => {
      await supabase.from("notifications").delete().eq("profile_id", recipient.id);
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
  }
);
