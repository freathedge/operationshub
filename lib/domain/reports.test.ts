import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile, type Profile } from "@/lib/domain/profiles";
import { requestsByDepartment, taskStatistics } from "@/lib/domain/reports";
import { ForbiddenError } from "@/lib/domain/errors";

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
