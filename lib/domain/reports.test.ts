import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile, type Profile } from "@/lib/domain/profiles";
import { requestsByDepartment, taskStatistics } from "@/lib/domain/reports";
import { ForbiddenError } from "@/lib/domain/errors";
import { avgRequestCompletionTime, workflowCompletionRate } from "@/lib/domain/reports";
import { transitionRequestStatus } from "@/lib/domain/requests";
import { getTaskRequestTrends } from "@/lib/domain/reports";

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

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("getTaskRequestTrends", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  let otherCompanyId: string;
  const createdAuthUserIds: string[] = [];
  let opsManager: Profile;
  let employee: Profile;

  function mondayStartOf(date: Date): string {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = d.getUTCDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (trends)", slug: "test-co-trends" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: otherCompany, error: otherCompanyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (trends, other)", slug: "test-co-trends-other" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (otherCompanyError) throw otherCompanyError;
    otherCompanyId = otherCompany.id;

    const { data: opsManagerAuthUser, error: opsManagerAuthError } =
      await supabase.auth.admin.createUser({
        email: `trends-test-ops-${crypto.randomUUID()}@example.com`,
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
        email: `trends-test-employee-${crypto.randomUUID()}@example.com`,
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
      .in("company_id", [companyId, otherCompanyId]);
    if (tasksDeleteError) throw tasksDeleteError;

    const { error: requestsDeleteError } = await supabase
      .from("requests")
      .delete()
      .in("company_id", [companyId, otherCompanyId]);
    if (requestsDeleteError) throw requestsDeleteError;

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
    await expect(getTaskRequestTrends(employee, 6)).rejects.toThrow(ForbiddenError);
  });

  it("returns exactly `weeks` buckets, zero-filled, ending with the current week", async () => {
    const result = await getTaskRequestTrends(opsManager, 6);
    expect(result).toHaveLength(6);
    expect(result[5].weekStart).toBe(mondayStartOf(new Date()));
    for (const bucket of result) {
      expect(bucket.completedTasks).toBeGreaterThanOrEqual(0);
      expect(bucket.newRequests).toBeGreaterThanOrEqual(0);
    }
  });

  it("counts a task completed today in the current week's bucket, and a request created today in the current week's bucket", async () => {
    const { error: taskError } = await supabase.from("tasks").insert({
      company_id: companyId,
      title: "Trend task",
      status: "completed",
      priority: "medium",
      completed_at: new Date().toISOString(),
    });
    if (taskError) throw taskError;

    const { error: requestError } = await supabase.from("requests").insert({
      company_id: companyId,
      title: "Trend request",
      category: "general",
      status: "submitted",
      created_at: new Date().toISOString(),
    });
    if (requestError) throw requestError;

    const result = await getTaskRequestTrends(opsManager, 6);
    const currentWeek = result[5];
    expect(currentWeek.completedTasks).toBeGreaterThanOrEqual(1);
    expect(currentWeek.newRequests).toBeGreaterThanOrEqual(1);
  });

  it("places a task completed at the very start of a week (Monday 00:00 UTC) in that week, not the previous one", async () => {
    const thisMonday = new Date(`${mondayStartOf(new Date())}T00:00:00.000Z`);
    const { error: taskError } = await supabase.from("tasks").insert({
      company_id: companyId,
      title: "Boundary task",
      status: "completed",
      priority: "medium",
      completed_at: thisMonday.toISOString(),
    });
    if (taskError) throw taskError;

    const result = await getTaskRequestTrends(opsManager, 6);
    expect(result[5].completedTasks).toBeGreaterThanOrEqual(1);
    // The previous week's bucket must NOT have picked this up.
    const previousWeekStart = new Date(thisMonday);
    previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);
    expect(result[4].weekStart).toBe(previousWeekStart.toISOString().slice(0, 10));
  });

  it("never counts another company's tasks or requests", async () => {
    const { error: taskError } = await supabase.from("tasks").insert({
      company_id: otherCompanyId,
      title: "Other company task",
      status: "completed",
      priority: "medium",
      completed_at: new Date().toISOString(),
    });
    if (taskError) throw taskError;

    const { error: requestError } = await supabase.from("requests").insert({
      company_id: otherCompanyId,
      title: "Other company request",
      category: "general",
      status: "submitted",
      created_at: new Date().toISOString(),
    });
    if (requestError) throw requestError;

    const beforeResult = await getTaskRequestTrends(opsManager, 6);
    const afterResult = await getTaskRequestTrends(opsManager, 6);
    expect(afterResult[5].completedTasks).toBe(beforeResult[5].completedTasks);
    expect(afterResult[5].newRequests).toBe(beforeResult[5].newRequests);
  });
});
