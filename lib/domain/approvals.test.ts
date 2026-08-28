import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile } from "@/lib/domain/profiles";
import type { Profile } from "@/lib/domain/profiles";
import { createRequest, submitRequest } from "@/lib/domain/requests";
import { decideApproval, getApprovalForRequest, reassignApproval } from "@/lib/domain/approvals";
import { listNotifications } from "@/lib/domain/notifications";
import {
  ForbiddenError,
  InvalidTransitionError,
  NotFoundError,
  UnprocessableRequestError,
} from "@/lib/domain/errors";
import { findWorkflowTemplateByTriggerCategory, startWorkflow } from "@/lib/domain/workflows";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)(
  "decideApproval / getApprovalForRequest",
  () => {
    const supabase = createSupabaseAdminClient();
    let companyId: string;
    const createdAuthUserIds: string[] = [];
    let requester: Profile;
    let opsManager: Profile;
    let opsManagerPeer: Profile;
    let manager: Profile;

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
      opsManagerPeer = await createTestProfile("Ops Manager Peer", "operations_manager");
      manager = await createTestProfile("Manager", "manager");
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

    it("auto-starts the matching workflow when the original approval for an equipment request is approved", async () => {
      const { data: template, error: templateError } = await supabase
        .from("workflow_templates")
        .upsert(
          {
            company_id: companyId,
            slug: "approvals-hook-equipment-test",
            name: "Approvals Hook Equipment Test",
            trigger_category: "equipment",
          },
          { onConflict: "company_id,slug" }
        )
        .select("id")
        .single();
      if (templateError) throw templateError;
      await supabase.from("workflow_template_steps").upsert(
        {
          template_id: template.id,
          step_order: 1,
          step_type: "task",
          title: "Only step",
          responsible_department_name: null,
        },
        { onConflict: "template_id,step_order" }
      );

      const request = await createRequest(requester, {
        title: "New laptop",
        category: "equipment",
      });
      const submitted = await submitRequest(requester, request.id);
      const { data: approvalRow, error: approvalError } = await supabase
        .from("approvals")
        .select("id")
        .eq("request_id", submitted.id)
        .single();
      if (approvalError) throw approvalError;

      await decideApproval(opsManager, approvalRow.id, "approved");

      const { data: instances, error: instancesError } = await supabase
        .from("workflow_instances")
        .select("id, template_id")
        .eq("related_request_id", submitted.id);
      if (instancesError) throw instancesError;
      expect(instances).toHaveLength(1);
      expect(instances![0].template_id).toBe(template.id);

      await supabase.from("workflow_instances").delete().eq("related_request_id", submitted.id);
    });

    it("does not start a workflow for a category with no matching template", async () => {
      const request = await createRequest(requester, { title: "Access request", category: "access" });
      const submitted = await submitRequest(requester, request.id);
      const { data: approvalRow, error: approvalError } = await supabase
        .from("approvals")
        .select("id")
        .eq("request_id", submitted.id)
        .single();
      if (approvalError) throw approvalError;

      await decideApproval(opsManager, approvalRow.id, "approved");

      const template = await findWorkflowTemplateByTriggerCategory(companyId, "access");
      expect(template).toBeNull();
      const { data: instances, error: instancesError } = await supabase
        .from("workflow_instances")
        .select("id")
        .eq("related_request_id", submitted.id);
      if (instancesError) throw instancesError;
      expect(instances).toHaveLength(0);
    });

    it("advances the workflow, instead of resetting request status, when a workflow-generated approval is decided", async () => {
      const { data: template, error: templateError } = await supabase
        .from("workflow_templates")
        .upsert(
          {
            company_id: companyId,
            slug: "approvals-hook-step-test",
            name: "Approvals Hook Step Test",
          },
          { onConflict: "company_id,slug" }
        )
        .select("id")
        .single();
      if (templateError) throw templateError;
      await supabase.from("workflow_template_steps").upsert(
        {
          template_id: template.id,
          step_order: 1,
          step_type: "approval",
          title: "Only approval step",
          responsible_role: "operations_manager",
        },
        { onConflict: "template_id,step_order" }
      );

      const request = await createRequest(requester, { title: "Step approval test", category: "general" });
      const instance = await startWorkflow(requester, "approvals-hook-step-test", {
        requestId: request.id,
      });
      const { data: stepRow, error: stepError } = await supabase
        .from("workflow_instance_steps")
        .select("generated_approval_id")
        .eq("instance_id", instance.id)
        .single();
      if (stepError) throw stepError;

      await decideApproval(opsManager, stepRow.generated_approval_id!, "approved");

      const { data: instanceRow, error: instanceError } = await supabase
        .from("workflow_instances")
        .select("status")
        .eq("id", instance.id)
        .single();
      if (instanceError) throw instanceError;
      expect(instanceRow.status).toBe("completed");

      const { data: requestRow, error: requestError } = await supabase
        .from("requests")
        .select("status")
        .eq("id", request.id)
        .single();
      if (requestError) throw requestError;
      expect(requestRow.status).toBe("completed");

      await supabase.from("workflow_instances").delete().eq("id", instance.id);
    });

    it("reassigns to a same-role peer, keeps status pending, and notifies the new approver", async () => {
      const draft = await createRequest(requester, { title: "Reassign me", category: "general" });
      const submitted = await submitRequest(requester, draft.id);
      const approval = await getApprovalForRequest(submitted.id);

      const reassigned = await reassignApproval(
        opsManager,
        approval!.id,
        opsManagerPeer.id,
        "You're better suited to review this"
      );
      expect(reassigned.status).toBe("pending");
      expect(reassigned.approverId).toBe(opsManagerPeer.id);

      const updatedApproval = await getApprovalForRequest(submitted.id);
      expect(updatedApproval?.approverId).toBe(opsManagerPeer.id);

      const notifications = await listNotifications(opsManagerPeer.id);
      expect(
        notifications.some(
          (n) => n.entityId === submitted.id && n.type === "approval_required"
        )
      ).toBe(true);
    });

    it("denies reassignment to someone with a different role", async () => {
      const draft = await createRequest(requester, {
        title: "Reassign role mismatch",
        category: "general",
      });
      const submitted = await submitRequest(requester, draft.id);
      const approval = await getApprovalForRequest(submitted.id);

      await expect(
        reassignApproval(opsManager, approval!.id, manager.id)
      ).rejects.toBeInstanceOf(UnprocessableRequestError);
    });

    it("denies reassignment from someone who is not the approver or elevated", async () => {
      const draft = await createRequest(requester, {
        title: "Unauthorized reassignment",
        category: "general",
      });
      const submitted = await submitRequest(requester, draft.id);
      const approval = await getApprovalForRequest(submitted.id);

      await expect(
        reassignApproval(requester, approval!.id, opsManagerPeer.id)
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("rejects reassigning an approval that has already been decided", async () => {
      const draft = await createRequest(requester, {
        title: "Already decided reassignment",
        category: "general",
      });
      const submitted = await submitRequest(requester, draft.id);
      const approval = await getApprovalForRequest(submitted.id);

      await decideApproval(opsManager, approval!.id, "approved");
      await expect(
        reassignApproval(opsManager, approval!.id, opsManagerPeer.id)
      ).rejects.toBeInstanceOf(InvalidTransitionError);
    });

    it("throws NotFoundError for a nonexistent approval", async () => {
      await expect(
        reassignApproval(opsManager, crypto.randomUUID(), opsManagerPeer.id)
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("throws NotFoundError when the new approver does not exist", async () => {
      const draft = await createRequest(requester, {
        title: "Reassign to missing approver",
        category: "general",
      });
      const submitted = await submitRequest(requester, draft.id);
      const approval = await getApprovalForRequest(submitted.id);

      await expect(
        reassignApproval(opsManager, approval!.id, crypto.randomUUID())
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("rejects reassigning an approval to its current approver", async () => {
      const draft = await createRequest(requester, {
        title: "Reassign to self",
        category: "general",
      });
      const submitted = await submitRequest(requester, draft.id);
      const approval = await getApprovalForRequest(submitted.id);

      await expect(
        reassignApproval(opsManager, approval!.id, opsManager.id)
      ).rejects.toBeInstanceOf(UnprocessableRequestError);
    });
  }
);
