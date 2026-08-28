import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile } from "@/lib/domain/profiles";
import type { Profile } from "@/lib/domain/profiles";
import { createRequest } from "@/lib/domain/requests";
import {
  advanceWorkflow,
  findWorkflowStepByApprovalId,
  findWorkflowTemplateByTriggerCategory,
  getWorkflowInstanceForRequest,
  getWorkflowProgress,
  listWorkflowTemplates,
  startWorkflow,
} from "@/lib/domain/workflows";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("workflow engine", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  let departmentId: string;
  const createdAuthUserIds: string[] = [];
  let employee: Profile;
  let itProfile: Profile;
  let taskOnlyTemplateId: string;
  let approvalFirstTemplateId: string;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (workflows)", slug: "test-co-workflows" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: department, error: departmentError } = await supabase
      .from("departments")
      .upsert(
        { company_id: companyId, name: "Ops (workflows test)" },
        { onConflict: "company_id,name" }
      )
      .select("id")
      .single();
    if (departmentError) throw departmentError;
    departmentId = department.id;

    async function createTestProfile(fullName: string, role: Profile["role"]) {
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: `workflows-test-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
      if (authError || !authUser.user) throw authError;
      createdAuthUserIds.push(authUser.user.id);
      return createProfile({ authUserId: authUser.user.id, companyId, fullName, role });
    }

    employee = await createTestProfile("Employee (workflows)", "employee");
    itProfile = await createTestProfile("IT Person (workflows)", "it");

    const { data: taskOnlyTemplate, error: taskOnlyError } = await supabase
      .from("workflow_templates")
      .insert({ company_id: companyId, slug: "task-only-test", name: "Task Only Test" })
      .select("id")
      .single();
    if (taskOnlyError) throw taskOnlyError;
    taskOnlyTemplateId = taskOnlyTemplate.id;
    const { error: taskOnlyStepsError } = await supabase.from("workflow_template_steps").insert([
      {
        template_id: taskOnlyTemplateId,
        step_order: 1,
        step_type: "task",
        title: "First task step",
        responsible_department_name: "Ops (workflows test)",
      },
      {
        template_id: taskOnlyTemplateId,
        step_order: 2,
        step_type: "task",
        title: "Second task step",
        responsible_department_name: "Ops (workflows test)",
      },
    ]);
    if (taskOnlyStepsError) throw taskOnlyStepsError;

    const { data: approvalFirstTemplate, error: approvalFirstError } = await supabase
      .from("workflow_templates")
      .insert({
        company_id: companyId,
        slug: "approval-first-test",
        name: "Approval First Test",
        trigger_category: "equipment",
      })
      .select("id")
      .single();
    if (approvalFirstError) throw approvalFirstError;
    approvalFirstTemplateId = approvalFirstTemplate.id;
    const { error: approvalFirstStepsError } = await supabase
      .from("workflow_template_steps")
      .insert({
        template_id: approvalFirstTemplateId,
        step_order: 1,
        step_type: "approval",
        title: "First approval step",
        responsible_role: "it",
      });
    if (approvalFirstStepsError) throw approvalFirstStepsError;
  });

  afterAll(async () => {
    // startWorkflow generates tasks/approvals that reference workflow_instances and
    // workflow_instance_steps (no ON DELETE CASCADE from tasks/approvals side), so those
    // must be torn down before the instances/templates they reference, or the deletes
    // below silently no-op and leave orphaned rows in the shared database.
    const { data: instances } = await supabase
      .from("workflow_instances")
      .select("id")
      .eq("company_id", companyId);
    const instanceIds = (instances ?? []).map((instance) => instance.id);

    if (instanceIds.length > 0) {
      const { data: instanceSteps } = await supabase
        .from("workflow_instance_steps")
        .select("generated_task_id, generated_approval_id")
        .in("instance_id", instanceIds);
      const generatedTaskIds = (instanceSteps ?? [])
        .map((step) => step.generated_task_id)
        .filter((id): id is string => id !== null);
      const generatedApprovalIds = (instanceSteps ?? [])
        .map((step) => step.generated_approval_id)
        .filter((id): id is string => id !== null);

      await supabase.from("workflow_instance_steps").delete().in("instance_id", instanceIds);
      if (generatedTaskIds.length > 0) {
        await supabase.from("tasks").delete().in("id", generatedTaskIds);
      }
      if (generatedApprovalIds.length > 0) {
        await supabase.from("approvals").delete().in("id", generatedApprovalIds);
      }
    }

    await supabase.from("workflow_instances").delete().eq("company_id", companyId);
    await supabase
      .from("workflow_template_steps")
      .delete()
      .in("template_id", [taskOnlyTemplateId, approvalFirstTemplateId]);
    await supabase
      .from("workflow_templates")
      .delete()
      .in("id", [taskOnlyTemplateId, approvalFirstTemplateId]);
    await supabase.from("requests").delete().eq("company_id", companyId);
    await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
    for (const id of createdAuthUserIds) {
      await supabase.auth.admin.deleteUser(id);
    }
    await supabase.from("companies").delete().eq("slug", "test-co-workflows");
  });

  describe("startWorkflow", () => {
    it("lists templates for a company", async () => {
      const templates = await listWorkflowTemplates(companyId);
      expect(templates.map((t) => t.slug).sort()).toEqual(
        ["approval-first-test", "task-only-test"].sort()
      );
    });

    it("throws NotFoundError for an unknown template slug", async () => {
      await expect(startWorkflow(employee, "no-such-template", {})).rejects.toBeInstanceOf(
        NotFoundError
      );
    });

    it("creates all steps and generates the first step's task, unassigned with the department set", async () => {
      const instance = await startWorkflow(employee, "task-only-test", {});
      expect(instance.status).toBe("in_progress");
      expect(instance.relatedRequestId).toBeNull();

      const { data: steps, error } = await supabase
        .from("workflow_instance_steps")
        .select("step_order, status, generated_task_id")
        .eq("instance_id", instance.id)
        .order("step_order", { ascending: true });
      if (error) throw error;
      expect(steps).toHaveLength(2);
      expect(steps![0].status).toBe("in_progress");
      expect(steps![0].generated_task_id).not.toBeNull();
      expect(steps![1].status).toBe("pending");
      expect(steps![1].generated_task_id).toBeNull();

      const { data: task, error: taskError } = await supabase
        .from("tasks")
        .select("assignee_id, department_id, related_workflow_instance_id")
        .eq("id", steps![0].generated_task_id!)
        .single();
      if (taskError) throw taskError;
      expect(task.assignee_id).toBeNull();
      expect(task.department_id).toBe(departmentId);
      expect(task.related_workflow_instance_id).toBe(instance.id);
    });

    it("generates the first step's approval when the template starts with one, and sets the request in_progress", async () => {
      const request = await createRequest(employee, { title: "New laptop", category: "equipment" });

      const instance = await startWorkflow(employee, "approval-first-test", {
        requestId: request.id,
      });
      expect(instance.relatedRequestId).toBe(request.id);

      const { data: step, error } = await supabase
        .from("workflow_instance_steps")
        .select("status, generated_approval_id")
        .eq("instance_id", instance.id)
        .eq("step_order", 1)
        .single();
      if (error) throw error;
      expect(step.status).toBe("in_progress");
      expect(step.generated_approval_id).not.toBeNull();

      const { data: approval, error: approvalError } = await supabase
        .from("approvals")
        .select("approver_id, request_id, status")
        .eq("id", step.generated_approval_id!)
        .single();
      if (approvalError) throw approvalError;
      expect(approval.approver_id).toBe(itProfile.id);
      expect(approval.request_id).toBe(request.id);
      expect(approval.status).toBe("pending");

      const { data: updatedRequest, error: requestError } = await supabase
        .from("requests")
        .select("status")
        .eq("id", request.id)
        .single();
      if (requestError) throw requestError;
      expect(updatedRequest.status).toBe("in_progress");
    });
  });

  describe("advanceWorkflow / getWorkflowProgress / finders", () => {
    it("advances to the next step, generating its entity, when the current step's generated task completes", async () => {
      const instance = await startWorkflow(employee, "task-only-test", {});
      const { data: firstStepBefore, error: firstStepError } = await supabase
        .from("workflow_instance_steps")
        .select("id, generated_task_id")
        .eq("instance_id", instance.id)
        .eq("step_order", 1)
        .single();
      if (firstStepError) throw firstStepError;

      await advanceWorkflow(employee, instance.id);

      const { data: steps, error: stepsError } = await supabase
        .from("workflow_instance_steps")
        .select("step_order, status, generated_task_id")
        .eq("instance_id", instance.id)
        .order("step_order", { ascending: true });
      if (stepsError) throw stepsError;
      expect(steps![0].status).toBe("completed");
      expect(steps![0].generated_task_id).toBe(firstStepBefore.generated_task_id);
      expect(steps![1].status).toBe("in_progress");
      expect(steps![1].generated_task_id).not.toBeNull();

      const { data: instanceRow, error: instanceError } = await supabase
        .from("workflow_instances")
        .select("status")
        .eq("id", instance.id)
        .single();
      if (instanceError) throw instanceError;
      expect(instanceRow.status).toBe("in_progress");
    });

    it("completes the instance and the linked request once the last step advances", async () => {
      const request = await createRequest(employee, {
        title: "Broken monitor",
        category: "equipment",
      });
      const instance = await startWorkflow(employee, "approval-first-test", {
        requestId: request.id,
      });

      await advanceWorkflow(employee, instance.id);

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
    });

    it("is a no-op when the instance is already completed", async () => {
      const request = await createRequest(employee, { title: "No-op test", category: "equipment" });
      const instance = await startWorkflow(employee, "approval-first-test", {
        requestId: request.id,
      });
      await advanceWorkflow(employee, instance.id);
      await expect(advanceWorkflow(employee, instance.id)).resolves.toBeUndefined();

      const { data: instanceRow, error } = await supabase
        .from("workflow_instances")
        .select("status")
        .eq("id", instance.id)
        .single();
      if (error) throw error;
      expect(instanceRow.status).toBe("completed");
    });

    it("returns progress with step titles/types from the template, and enforces view permission", async () => {
      const instance = await startWorkflow(employee, "task-only-test", {});
      // Instance has no linked request, so per canViewWorkflowInstance (Task 9) only
      // COMPANY_WIDE_VIEW_ROLES can view it — use itProfile, not employee.
      const progress = await getWorkflowProgress(itProfile, instance.id);
      expect(progress.instance.id).toBe(instance.id);
      expect(progress.steps).toHaveLength(2);
      expect(progress.steps[0].title).toBe("First task step");
      expect(progress.steps[0].stepType).toBe("task");
      expect(progress.steps[0].responsibleDepartmentName).toBe("Ops (workflows test)");
    });

    it("denies getWorkflowProgress to an unrelated employee when the instance is linked to a request", async () => {
      const request = await createRequest(employee, { title: "Denied view", category: "equipment" });
      const instance = await startWorkflow(employee, "approval-first-test", {
        requestId: request.id,
      });

      const { data: strangerAuthUser, error: strangerAuthError } =
        await supabase.auth.admin.createUser({
          email: `workflows-test-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
      if (strangerAuthError || !strangerAuthUser.user) throw strangerAuthError;
      createdAuthUserIds.push(strangerAuthUser.user.id);
      const stranger = await createProfile({
        authUserId: strangerAuthUser.user.id,
        companyId,
        fullName: "Stranger (workflows)",
        role: "employee",
      });

      await expect(getWorkflowProgress(stranger, instance.id)).rejects.toBeInstanceOf(
        ForbiddenError
      );
    });

    it("finds the workflow step generated for a given approval id, or null", async () => {
      const request = await createRequest(employee, { title: "Finder test", category: "equipment" });
      const instance = await startWorkflow(employee, "approval-first-test", {
        requestId: request.id,
      });
      const { data: step, error } = await supabase
        .from("workflow_instance_steps")
        .select("generated_approval_id")
        .eq("instance_id", instance.id)
        .single();
      if (error) throw error;

      const found = await findWorkflowStepByApprovalId(step.generated_approval_id!);
      expect(found?.instanceId).toBe(instance.id);

      const notFound = await findWorkflowStepByApprovalId(crypto.randomUUID());
      expect(notFound).toBeNull();
    });

    it("finds a template by trigger category, or null when none matches", async () => {
      const found = await findWorkflowTemplateByTriggerCategory(companyId, "equipment");
      expect(found?.slug).toBe("approval-first-test");

      const notFound = await findWorkflowTemplateByTriggerCategory(companyId, "hr");
      expect(notFound).toBeNull();
    });

    it("finds the workflow instance for a request, or null", async () => {
      const request = await createRequest(employee, { title: "Lookup test", category: "equipment" });
      const instance = await startWorkflow(employee, "approval-first-test", {
        requestId: request.id,
      });

      const found = await getWorkflowInstanceForRequest(request.id);
      expect(found?.id).toBe(instance.id);

      const otherRequest = await createRequest(employee, { title: "No workflow", category: "hr" });
      const notFound = await getWorkflowInstanceForRequest(otherRequest.id);
      expect(notFound).toBeNull();
    });
  });
});
