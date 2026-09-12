import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile, getProfileByAuthUserId, type Profile } from "@/lib/domain/profiles";
import { createEmployee } from "@/lib/domain/employees";
import { ForbiddenError } from "@/lib/domain/errors";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("createEmployee", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  const createdAuthUserIds: string[] = [];
  let hrProfile: Profile;
  let employeeProfile: Profile;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert(
        { name: "Test Co (create-employee)", slug: "test-co-create-employee" },
        { onConflict: "slug" }
      )
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { error: departmentError } = await supabase
      .from("departments")
      .upsert(
        { company_id: companyId, name: "IT (create-employee)" },
        { onConflict: "company_id,name" }
      )
      .select("id")
      .single();
    if (departmentError) throw departmentError;

    const { data: template, error: templateError } = await supabase
      .from("workflow_templates")
      .upsert(
        { company_id: companyId, slug: "employee-onboarding", name: "Employee Onboarding" },
        { onConflict: "company_id,slug" }
      )
      .select("id")
      .single();
    if (templateError) throw templateError;

    const { error: stepError } = await supabase.from("workflow_template_steps").upsert(
      {
        template_id: template.id,
        step_order: 1,
        step_type: "task",
        title: "Create company account",
        responsible_department_name: "IT (create-employee)",
      },
      { onConflict: "template_id,step_order" }
    );
    if (stepError) throw stepError;
  });

  afterAll(async () => {
    await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
    for (const id of createdAuthUserIds) {
      await supabase.auth.admin.deleteUser(id);
    }
    await supabase.from("companies").delete().eq("slug", "test-co-create-employee");
  });

  it("rejects a caller without hr/admin", async () => {
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: `create-employee-test-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (authError || !authUser.user) throw authError;
    createdAuthUserIds.push(authUser.user.id);
    employeeProfile = await createProfile({
      authUserId: authUser.user.id,
      companyId,
      fullName: "Not HR",
      role: "employee",
    });

    await expect(
      createEmployee(employeeProfile, {
        email: `new-hire-${crypto.randomUUID()}@example.com`,
        fullName: "New Hire",
        role: "employee",
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("invites the employee, creates their profile, and starts onboarding by default", async () => {
    const { data: hrAuthUser, error: hrAuthError } = await supabase.auth.admin.createUser({
      email: `create-employee-hr-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (hrAuthError || !hrAuthUser.user) throw hrAuthError;
    createdAuthUserIds.push(hrAuthUser.user.id);
    hrProfile = await createProfile({
      authUserId: hrAuthUser.user.id,
      companyId,
      fullName: "HR Person",
      role: "hr",
    });

    const newHireEmail = `new-hire-${crypto.randomUUID()}@example.com`;
    const employee = await createEmployee(hrProfile, {
      email: newHireEmail,
      fullName: "New Hire",
      role: "employee",
      positionTitle: "Support Specialist",
    });
    createdAuthUserIds.push(employee.authUserId);

    expect(employee.fullName).toBe("New Hire");
    expect(employee.positionTitle).toBe("Support Specialist");

    const fetched = await getProfileByAuthUserId(employee.authUserId);
    expect(fetched?.id).toBe(employee.id);

    const { data: instances, error: instancesError } = await supabase
      .from("workflow_instances")
      .select("id, related_employee_id")
      .eq("related_employee_id", employee.id);
    if (instancesError) throw instancesError;
    expect(instances).toHaveLength(1);
  });

  it("does not start onboarding when startOnboarding is false", async () => {
    const newHireEmail = `new-hire-no-onboarding-${crypto.randomUUID()}@example.com`;
    const employee = await createEmployee(hrProfile, {
      email: newHireEmail,
      fullName: "No Onboarding Hire",
      role: "employee",
      startOnboarding: false,
    });
    createdAuthUserIds.push(employee.authUserId);

    const { data: instances, error: instancesError } = await supabase
      .from("workflow_instances")
      .select("id")
      .eq("related_employee_id", employee.id);
    if (instancesError) throw instancesError;
    expect(instances).toHaveLength(0);
  });
});
