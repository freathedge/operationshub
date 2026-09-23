import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile, type Profile } from "@/lib/domain/profiles";
import { requestsByDepartment, taskStatistics } from "@/lib/domain/reports";
import { ForbiddenError } from "@/lib/domain/errors";
import { avgRequestCompletionTime, workflowCompletionRate } from "@/lib/domain/reports";
import { transitionRequestStatus } from "@/lib/domain/requests";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("requestsByDepartment / taskStatistics", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  let departmentId: string;
  const createdAuthUserIds: string[] = [];
  let opsManager: Profile;
  let employee: Profile;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (reports)", slug: "test-co-reports" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: department, error: departmentError } = await supabase
      .from("departments")
      .insert({ company_id: companyId, name: "IT" })
      .select("id")
      .single();
    if (departmentError) throw departmentError;
    departmentId = department.id;

    const { data: opsManagerAuthUser, error: opsManagerAuthError } =
      await supabase.auth.admin.createUser({
        email: `reports-test-ops-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
    if (opsManagerAuthError || !opsManagerAuthUser.user) throw opsManagerAuthError;
    createdAuthUserIds.push(opsManagerAuthUser.user.id);
    opsManager = await createProfile({
      authUserId: opsManagerAuthUser.user.id,
      companyId,
      fullName: "Ops Manager",
      role: "operations_manager",
    });

    const { data: employeeAuthUser, error: employeeAuthError } =
      await supabase.auth.admin.createUser({
        email: `reports-test-employee-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
    if (employeeAuthError || !employeeAuthUser.user) throw employeeAuthError;
    createdAuthUserIds.push(employeeAuthUser.user.id);
    employee = await createProfile({
      authUserId: employeeAuthUser.user.id,
      companyId,
      fullName: "Regular Employee",
      role: "employee",
    });
  });

  afterAll(async () => {
    const { error: tasksDeleteError } = await supabase
      .from("tasks")
      .delete()
      .eq("company_id", companyId);
    if (tasksDeleteError) throw tasksDeleteError;

    const { error: requestsDeleteError } = await supabase
      .from("requests")
      .delete()
      .eq("company_id", companyId);
    if (requestsDeleteError) throw requestsDeleteError;

    const { error: departmentsDeleteError } = await supabase
      .from("departments")
      .delete()
      .eq("company_id", companyId);
    if (departmentsDeleteError) throw departmentsDeleteError;

    const { error: profilesDeleteError } = await supabase
      .from("profiles")
      .delete()
      .eq("company_id", companyId);
    if (profilesDeleteError) throw profilesDeleteError;

    for (const authUserId of createdAuthUserIds) {
      await supabase.auth.admin.deleteUser(authUserId);
    }
  });

  it("throws ForbiddenError for a non-elevated role", async () => {
    await expect(requestsByDepartment(employee)).rejects.toThrow(ForbiddenError);
    await expect(taskStatistics(employee)).rejects.toThrow(ForbiddenError);
  });

  it("counts open requests grouped by department, excluding completed/rejected", async () => {
    const { error } = await supabase.from("requests").insert([
      { company_id: companyId, title: "Open 1", category: "equipment", status: "under_review", department_id: departmentId },
      { company_id: companyId, title: "Open 2", category: "equipment", status: "approved", department_id: departmentId },
      { company_id: companyId, title: "Completed", category: "equipment", status: "completed", department_id: departmentId },
      { company_id: companyId, title: "Rejected", category: "equipment", status: "rejected", department_id: departmentId },
    ]);
    if (error) throw error;

    const result = await requestsByDepartment(opsManager);
    const itRow = result.find((row) => row.departmentId === departmentId);
    expect(itRow).toBeDefined();
    expect(itRow?.count).toBe(2);
    expect(itRow?.departmentName).toBe("IT");
  });

  it("computes open/completed/overdue task counts", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from("tasks").insert([
      { company_id: companyId, title: "Open task", status: "todo", priority: "medium" },
      { company_id: companyId, title: "Completed task", status: "completed", priority: "medium" },
      { company_id: companyId, title: "Overdue task", status: "todo", priority: "medium", due_date: yesterday },
    ]);
    if (error) throw error;

    const result = await taskStatistics(opsManager);
    expect(result.open).toBeGreaterThanOrEqual(2); // "Open task" + "Overdue task" (overdue is also open)
    expect(result.completed).toBeGreaterThanOrEqual(1);
    expect(result.overdue).toBeGreaterThanOrEqual(1);
  });
});

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("avgRequestCompletionTime / workflowCompletionRate", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  const createdAuthUserIds: string[] = [];
  let opsManager: Profile;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (reports completion)", slug: "test-co-reports-completion" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: opsManagerAuthUser, error: opsManagerAuthError } =
      await supabase.auth.admin.createUser({
        email: `reports-completion-test-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
    if (opsManagerAuthError || !opsManagerAuthUser.user) throw opsManagerAuthError;
    createdAuthUserIds.push(opsManagerAuthUser.user.id);
    opsManager = await createProfile({
      authUserId: opsManagerAuthUser.user.id,
      companyId,
      fullName: "Ops Manager Two",
      role: "operations_manager",
    });
  });

  afterAll(async () => {
    const { error: activityDeleteError } = await supabase
      .from("activity_log")
      .delete()
      .eq("actor_id", opsManager.id);
    if (activityDeleteError) throw activityDeleteError;

    const { error: requestsDeleteError } = await supabase
      .from("requests")
      .delete()
      .eq("company_id", companyId);
    if (requestsDeleteError) throw requestsDeleteError;

    const { error: workflowInstancesDeleteError } = await supabase
      .from("workflow_instances")
      .delete()
      .eq("company_id", companyId);
    if (workflowInstancesDeleteError) throw workflowInstancesDeleteError;

    const { error: workflowTemplatesDeleteError } = await supabase
      .from("workflow_templates")
      .delete()
      .eq("company_id", companyId);
    if (workflowTemplatesDeleteError) throw workflowTemplatesDeleteError;

    const { error: profilesDeleteError } = await supabase
      .from("profiles")
      .delete()
      .eq("company_id", companyId);
    if (profilesDeleteError) throw profilesDeleteError;

    for (const authUserId of createdAuthUserIds) {
      await supabase.auth.admin.deleteUser(authUserId);
    }
  });

  it("computes average completion time per category from activity_log, excluding requests never completed", async () => {
    const { data: completedRequest, error: completedRequestError } = await supabase
      .from("requests")
      .insert({
        company_id: companyId,
        title: "Completed equipment request",
        category: "equipment",
        status: "in_progress",
        created_by: opsManager.id,
      })
      .select("id")
      .single();
    if (completedRequestError) throw completedRequestError;

    await transitionRequestStatus(opsManager, completedRequest.id, "completed");

    const { error: openRequestError } = await supabase.from("requests").insert({
      company_id: companyId,
      title: "Still-open equipment request",
      category: "equipment",
      status: "under_review",
      created_by: opsManager.id,
    });
    if (openRequestError) throw openRequestError;

    const result = await avgRequestCompletionTime(opsManager);
    const equipmentRow = result.find((row) => row.category === "equipment");
    expect(equipmentRow).toBeDefined();
    expect(equipmentRow?.sampleSize).toBe(1);
    expect(equipmentRow?.avgDays).toBeGreaterThanOrEqual(0);
  });

  it("computes completion rate per template, excluding templates with zero instances", async () => {
    const { data: template, error: templateError } = await supabase
      .from("workflow_templates")
      .insert({ company_id: companyId, slug: "test-template", name: "Test Template" })
      .select("id")
      .single();
    if (templateError) throw templateError;

    const { error: instancesError } = await supabase.from("workflow_instances").insert([
      { company_id: companyId, template_id: template.id, status: "completed" },
      { company_id: companyId, template_id: template.id, status: "completed" },
      { company_id: companyId, template_id: template.id, status: "in_progress" },
    ]);
    if (instancesError) throw instancesError;

    const { data: emptyTemplate, error: emptyTemplateError } = await supabase
      .from("workflow_templates")
      .insert({ company_id: companyId, slug: "empty-template", name: "Empty Template" })
      .select("id")
      .single();
    if (emptyTemplateError) throw emptyTemplateError;

    const result = await workflowCompletionRate(opsManager);
    const testRow = result.find((row) => row.templateId === template.id);
    expect(testRow).toBeDefined();
    expect(testRow?.totalInstances).toBe(3);
    expect(testRow?.completionRate).toBeCloseTo(2 / 3, 5);
    expect(result.find((row) => row.templateId === emptyTemplate.id)).toBeUndefined();
  });
});
