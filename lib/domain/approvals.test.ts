import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile } from "@/lib/domain/profiles";
import type { Profile } from "@/lib/domain/profiles";
import { createRequest, submitRequest } from "@/lib/domain/requests";
import { decideApproval, getApprovalForRequest } from "@/lib/domain/approvals";
import { listNotifications } from "@/lib/domain/notifications";
import { ForbiddenError, InvalidTransitionError, NotFoundError } from "@/lib/domain/errors";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)(
  "decideApproval / getApprovalForRequest",
  () => {
    const supabase = createSupabaseAdminClient();
    let companyId: string;
    const createdAuthUserIds: string[] = [];
    let requester: Profile;
    let opsManager: Profile;

    beforeAll(async () => {
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .upsert({ name: "Test Co (approvals)", slug: "test-co-approvals" }, { onConflict: "slug" })
        .select("id")
        .single();
      if (companyError) throw companyError;
      companyId = company.id;

      async function createTestProfile(fullName: string, role: Profile["role"]) {
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email: `approvals-test-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
        if (authError || !authUser.user) throw authError;
        createdAuthUserIds.push(authUser.user.id);
        return createProfile({ authUserId: authUser.user.id, companyId, fullName, role });
      }

      requester = await createTestProfile("Requester", "employee");
      opsManager = await createTestProfile("Ops Manager", "operations_manager");
    });

    afterAll(async () => {
      await supabase.from("notifications").delete().eq("entity_type", "request");
      await supabase.from("requests").delete().eq("company_id", companyId);
      await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
      for (const id of createdAuthUserIds) {
        await supabase.auth.admin.deleteUser(id);
      }
      await supabase.from("companies").delete().eq("slug", "test-co-approvals");
    });

    it("approves a request, updates its status, and notifies the requester", async () => {
      const draft = await createRequest(requester, { title: "Approve me", category: "general" });
      const submitted = await submitRequest(requester, draft.id);

      const approval = await getApprovalForRequest(submitted.id);
      expect(approval?.status).toBe("pending");

      const decided = await decideApproval(opsManager, approval!.id, "approved", "Looks good");
      expect(decided.status).toBe("approved");
      expect(decided.decidedAt).not.toBeNull();
      expect(decided.comment).toBe("Looks good");

      const updatedApproval = await getApprovalForRequest(submitted.id);
      expect(updatedApproval?.status).toBe("approved");

      const notifications = await listNotifications(requester.id);
      expect(
        notifications.some(
          (n) => n.entityId === submitted.id && n.type === "request_status_changed"
        )
      ).toBe(true);
    });

    it("rejects a request and marks it terminal", async () => {
      const draft = await createRequest(requester, { title: "Reject me", category: "general" });
      const submitted = await submitRequest(requester, draft.id);
      const approval = await getApprovalForRequest(submitted.id);

      const decided = await decideApproval(opsManager, approval!.id, "rejected");
      expect(decided.status).toBe("rejected");
    });

    it("denies a decision from someone who is not the approver or elevated", async () => {
      const draft = await createRequest(requester, {
        title: "Unauthorized decision",
        category: "general",
      });
      const submitted = await submitRequest(requester, draft.id);
      const approval = await getApprovalForRequest(submitted.id);

      await expect(
        decideApproval(requester, approval!.id, "approved")
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("rejects deciding an approval that has already been decided", async () => {
      const draft = await createRequest(requester, {
        title: "Already decided",
        category: "general",
      });
      const submitted = await submitRequest(requester, draft.id);
      const approval = await getApprovalForRequest(submitted.id);

      await decideApproval(opsManager, approval!.id, "approved");
      await expect(
        decideApproval(opsManager, approval!.id, "rejected")
      ).rejects.toBeInstanceOf(InvalidTransitionError);
    });

    it("throws NotFoundError for a nonexistent approval", async () => {
      await expect(
        decideApproval(opsManager, crypto.randomUUID(), "approved")
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("returns null from getApprovalForRequest for a request with no approval yet", async () => {
      const draft = await createRequest(requester, { title: "Still draft", category: "general" });
      const approval = await getApprovalForRequest(draft.id);
      expect(approval).toBeNull();
    });

    it("denies an elevated-role profile from a different company from deciding the approval", async () => {
      const draft = await createRequest(requester, {
        title: "Cross-company decision",
        category: "general",
      });
      const submitted = await submitRequest(requester, draft.id);
      const approval = await getApprovalForRequest(submitted.id);

      const { data: otherCompany, error: otherCompanyError } = await supabase
        .from("companies")
        .upsert(
          { name: "Test Co (approvals, other)", slug: "test-co-approvals-other" },
          { onConflict: "slug" }
        )
        .select("id")
        .single();
      if (otherCompanyError) throw otherCompanyError;

      const { data: otherAuthUser, error: otherAuthError } = await supabase.auth.admin.createUser({
        email: `approvals-test-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
      if (otherAuthError || !otherAuthUser.user) throw otherAuthError;

      const otherOpsManager = await createProfile({
        authUserId: otherAuthUser.user.id,
        companyId: otherCompany.id,
        fullName: "Other Co Ops Manager",
        role: "operations_manager",
      });

      await expect(
        decideApproval(otherOpsManager, approval!.id, "approved")
      ).rejects.toBeInstanceOf(ForbiddenError);

      await supabase.from("profiles").delete().eq("id", otherOpsManager.id);
      await supabase.auth.admin.deleteUser(otherAuthUser.user.id);
      await supabase.from("companies").delete().eq("id", otherCompany.id);
    });
  }
);
