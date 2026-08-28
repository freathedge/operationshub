import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile } from "@/lib/domain/profiles";
import type { Profile } from "@/lib/domain/profiles";
import { createRequest, getRequest, listRequests, submitRequest, transitionRequestStatus } from "@/lib/domain/requests";
import { ForbiddenError, InvalidTransitionError } from "@/lib/domain/errors";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)(
  "createRequest / getRequest / listRequests",
  () => {
    const supabase = createSupabaseAdminClient();
    let companyId: string;
    let departmentAId: string;
    let departmentBId: string;
    const createdAuthUserIds: string[] = [];
    let employee: Profile;
    let managerA: Profile;
    let opsManager: Profile;

    beforeAll(async () => {
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .upsert({ name: "Test Co (requests)", slug: "test-co-requests" }, { onConflict: "slug" })
        .select("id")
        .single();
      if (companyError) throw companyError;
      companyId = company.id;

      const { data: departments, error: departmentsError } = await supabase
        .from("departments")
        .upsert(
          [
            { company_id: companyId, name: "Dept A (requests test)" },
            { company_id: companyId, name: "Dept B (requests test)" },
          ],
          { onConflict: "company_id,name" }
        )
        .select("id, name");
      if (departmentsError) throw departmentsError;
      departmentAId = departments.find((d) => d.name === "Dept A (requests test)")!.id;
      departmentBId = departments.find((d) => d.name === "Dept B (requests test)")!.id;

      async function createTestProfile(
        fullName: string,
        role: Profile["role"],
        departmentId: string | null
      ) {
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email: `requests-test-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
        if (authError || !authUser.user) throw authError;
        createdAuthUserIds.push(authUser.user.id);
        return createProfile({
          authUserId: authUser.user.id,
          companyId,
          fullName,
          role,
          departmentId,
        });
      }

      employee = await createTestProfile("Employee A", "employee", departmentAId);
      managerA = await createTestProfile("Manager A", "manager", departmentAId);
      opsManager = await createTestProfile("Ops Manager", "operations_manager", null);
    });

    afterAll(async () => {
      await supabase.from("requests").delete().eq("company_id", companyId);
      await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
      for (const id of createdAuthUserIds) {
        await supabase.auth.admin.deleteUser(id);
      }
      await supabase.from("companies").delete().eq("slug", "test-co-requests");
    });

    it("creates a request with the creator and company set, and draft status", async () => {
      const request = await createRequest(employee, {
        title: "New laptop",
        category: "equipment",
      });
      expect(request.createdBy).toBe(employee.id);
      expect(request.companyId).toBe(companyId);
      expect(request.status).toBe("draft");
      expect(request.category).toBe("equipment");
    });

    it("lets the creator view their own draft request, but not an unrelated employee", async () => {
      const request = await createRequest(employee, {
        title: "Access request",
        category: "access",
      });

      await expect(getRequest(employee, request.id)).resolves.toMatchObject({ id: request.id });

      const stranger = await (async () => {
        const { data: authUser, error } = await supabase.auth.admin.createUser({
          email: `requests-test-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
        if (error || !authUser.user) throw error;
        createdAuthUserIds.push(authUser.user.id);
        return createProfile({
          authUserId: authUser.user.id,
          companyId,
          fullName: "Stranger",
          role: "employee",
          departmentId: departmentBId,
        });
      })();

      await expect(getRequest(stranger, request.id)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("lets a manager view requests in their department but not another department's", async () => {
      const inDept = await createRequest(employee, {
        title: "Dept A request",
        category: "general",
        departmentId: departmentAId,
      });
      const outOfDept = await createRequest(employee, {
        title: "Dept B request",
        category: "general",
        departmentId: departmentBId,
      });

      await expect(getRequest(managerA, inDept.id)).resolves.toMatchObject({ id: inDept.id });
      await expect(getRequest(managerA, outOfDept.id)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("lets an operations_manager view any request in the company", async () => {
      const request = await createRequest(employee, { title: "Any request", category: "other" });
      await expect(getRequest(opsManager, request.id)).resolves.toMatchObject({ id: request.id });
    });

    it("scopes listRequests('mine') to the caller's own requests", async () => {
      await supabase.from("requests").delete().eq("company_id", companyId);

      const own = await createRequest(employee, { title: "My request", category: "general" });
      await createRequest(managerA, { title: "Manager's request", category: "general" });

      const mine = await listRequests(employee, { scope: "mine" });
      expect(mine.map((r) => r.id)).toEqual([own.id]);
    });

    it("scopes listRequests('all') to what each role is allowed to see", async () => {
      await supabase.from("requests").delete().eq("company_id", companyId);

      await createRequest(employee, { title: "Employee's own request", category: "general" });
      await createRequest(managerA, {
        title: "Unrelated request",
        category: "general",
        departmentId: departmentBId,
      });

      const employeeRequests = await listRequests(employee, { scope: "all" });
      expect(employeeRequests.length).toBe(1);

      const opsManagerRequests = await listRequests(opsManager, { scope: "all" });
      expect(opsManagerRequests.length).toBe(2);
    });

    it("submits a request and routes approval to the requester's manager when set", async () => {
      const employeeWithManager = await (async () => {
        const { data: authUser, error } = await supabase.auth.admin.createUser({
          email: `requests-test-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
        if (error || !authUser.user) throw error;
        createdAuthUserIds.push(authUser.user.id);
        return createProfile({
          authUserId: authUser.user.id,
          companyId,
          fullName: "Employee With Manager",
          role: "employee",
          departmentId: departmentAId,
          managerId: managerA.id,
        });
      })();

      const draft = await createRequest(employeeWithManager, {
        title: "Manager-routed request",
        category: "general",
      });

      const submitted = await submitRequest(employeeWithManager, draft.id);
      expect(submitted.status).toBe("under_review");

      const { data: approval, error } = await supabase
        .from("approvals")
        .select("approver_id, status")
        .eq("request_id", draft.id)
        .single();
      if (error) throw error;
      expect(approval.approver_id).toBe(managerA.id);
      expect(approval.status).toBe("pending");
    });

    it("routes approval to the earliest-created operations_manager when the requester has no manager", async () => {
      const draft = await createRequest(employee, {
        title: "Ops-manager-routed request",
        category: "general",
      });

      const submitted = await submitRequest(employee, draft.id);
      expect(submitted.status).toBe("under_review");

      const { data: approval, error } = await supabase
        .from("approvals")
        .select("approver_id")
        .eq("request_id", draft.id)
        .single();
      if (error) throw error;
      expect(approval.approver_id).toBe(opsManager.id);
    });

    it("routes approval to the earliest-created admin when there is no manager or operations_manager", async () => {
      const { data: isolatedCompany, error: companyError } = await supabase
        .from("companies")
        .upsert(
          { name: "Test Co (requests, admin fallback)", slug: "test-co-requests-admin-fallback" },
          { onConflict: "slug" }
        )
        .select("id")
        .single();
      if (companyError) throw companyError;

      const { data: adminAuthUser, error: adminAuthError } =
        await supabase.auth.admin.createUser({
          email: `requests-test-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
      if (adminAuthError || !adminAuthUser.user) throw adminAuthError;

      const admin = await createProfile({
        authUserId: adminAuthUser.user.id,
        companyId: isolatedCompany.id,
        fullName: "Fallback Admin",
        role: "admin",
      });

      const { data: requesterAuthUser, error: requesterAuthError } =
        await supabase.auth.admin.createUser({
          email: `requests-test-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
      if (requesterAuthError || !requesterAuthUser.user) throw requesterAuthError;

      const requester = await createProfile({
        authUserId: requesterAuthUser.user.id,
        companyId: isolatedCompany.id,
        fullName: "Fallback Requester",
        role: "employee",
      });

      const draft = await createRequest(requester, {
        title: "Admin-routed request",
        category: "general",
      });
      const submitted = await submitRequest(requester, draft.id);
      expect(submitted.status).toBe("under_review");

      const { data: approval, error } = await supabase
        .from("approvals")
        .select("approver_id")
        .eq("request_id", draft.id)
        .single();
      if (error) throw error;
      expect(approval.approver_id).toBe(admin.id);

      await supabase.from("requests").delete().eq("company_id", isolatedCompany.id);
      await supabase.from("profiles").delete().eq("id", requester.id);
      await supabase.from("profiles").delete().eq("id", admin.id);
      await supabase.auth.admin.deleteUser(requesterAuthUser.user.id);
      await supabase.auth.admin.deleteUser(adminAuthUser.user.id);
      await supabase.from("companies").delete().eq("id", isolatedCompany.id);
    });

    it("throws when no manager, operations_manager, or admin exists to approve", async () => {
      const { data: emptyCompany, error: companyError } = await supabase
        .from("companies")
        .upsert(
          { name: "Test Co (requests, no approver)", slug: "test-co-requests-no-approver" },
          { onConflict: "slug" }
        )
        .select("id")
        .single();
      if (companyError) throw companyError;

      const { data: requesterAuthUser, error: requesterAuthError } =
        await supabase.auth.admin.createUser({
          email: `requests-test-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
      if (requesterAuthError || !requesterAuthUser.user) throw requesterAuthError;

      const requester = await createProfile({
        authUserId: requesterAuthUser.user.id,
        companyId: emptyCompany.id,
        fullName: "No-approver Requester",
        role: "employee",
      });

      const draft = await createRequest(requester, {
        title: "No approver available",
        category: "general",
      });

      await expect(submitRequest(requester, draft.id)).rejects.toThrow();

      await supabase.from("requests").delete().eq("company_id", emptyCompany.id);
      await supabase.from("profiles").delete().eq("id", requester.id);
      await supabase.auth.admin.deleteUser(requesterAuthUser.user.id);
      await supabase.from("companies").delete().eq("id", emptyCompany.id);
    });

    it("rejects submitting a request that is not in draft status", async () => {
      const draft = await createRequest(employee, {
        title: "Double submit test",
        category: "general",
      });
      await submitRequest(employee, draft.id);
      await expect(submitRequest(employee, draft.id)).rejects.toBeInstanceOf(
        InvalidTransitionError
      );
    });

    it("moves a request through a valid manual transition", async () => {
      const draft = await createRequest(employee, {
        title: "Transition test",
        category: "general",
      });
      const submitted = await submitRequest(employee, draft.id);
      const { data: approval, error } = await supabase
        .from("approvals")
        .select("id")
        .eq("request_id", submitted.id)
        .single();
      if (error) throw error;

      await supabase.from("approvals").update({ status: "approved" }).eq("id", approval.id);
      await supabase.from("requests").update({ status: "approved" }).eq("id", submitted.id);

      const inProgress = await transitionRequestStatus(employee, submitted.id, "in_progress");
      expect(inProgress.status).toBe("in_progress");

      const completed = await transitionRequestStatus(employee, submitted.id, "completed");
      expect(completed.status).toBe("completed");
    });

    it("rejects an invalid manual transition", async () => {
      const draft = await createRequest(employee, {
        title: "Invalid transition test",
        category: "general",
      });
      await expect(
        transitionRequestStatus(employee, draft.id, "approved")
      ).rejects.toBeInstanceOf(InvalidTransitionError);
    });

    it("denies a status change from an unrelated employee", async () => {
      const draft = await createRequest(employee, {
        title: "Unauthorized transition test",
        category: "general",
      });
      const submitted = await submitRequest(employee, draft.id);
      await supabase.from("requests").update({ status: "approved" }).eq("id", submitted.id);

      const stranger = await (async () => {
        const { data: authUser, error } = await supabase.auth.admin.createUser({
          email: `requests-test-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
        if (error || !authUser.user) throw error;
        createdAuthUserIds.push(authUser.user.id);
        return createProfile({
          authUserId: authUser.user.id,
          companyId,
          fullName: "Stranger 2",
          role: "employee",
          departmentId: departmentBId,
        });
      })();

      await expect(
        transitionRequestStatus(stranger, submitted.id, "in_progress")
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  }
);
