import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile, getProfileById, type Profile } from "@/lib/domain/profiles";
import { createEmployee, getEmployeeProfile, listEmployees, updateEmployee } from "@/lib/domain/employees";
import { ForbiddenError } from "@/lib/domain/errors";

const createInvitationMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    invitations: { createInvitation: createInvitationMock },
  }),
}));

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("createEmployee", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  let hrProfile: Profile;
  let employeeProfile: Profile;

  beforeEach(() => {
    createInvitationMock.mockReset();
  });

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

    hrProfile = await createProfile({
      authUserId: `test-hr-${crypto.randomUUID()}`,
      companyId,
      fullName: "HR Person",
      role: "hr",
    });
  });

  afterAll(async () => {
    await supabase.from("companies").delete().eq("slug", "test-co-create-employee");
  });

  it("rejects a caller without hr/admin", async () => {
    employeeProfile = await createProfile({
      authUserId: `test-not-hr-${crypto.randomUUID()}`,
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

  it("creates a pending profile, sends a Clerk invitation with the profile id, and starts onboarding by default", async () => {
    createInvitationMock.mockReset();
    createInvitationMock.mockResolvedValue({ id: "inv_123" });

    const newHireEmail = `new-hire-${crypto.randomUUID()}@example.com`;
    const employee = await createEmployee(hrProfile, {
      email: newHireEmail,
      fullName: "New Hire",
      role: "employee",
      positionTitle: "Support Specialist",
    });

    expect(employee.fullName).toBe("New Hire");
    expect(employee.positionTitle).toBe("Support Specialist");
    expect(employee.authUserId).toBeNull();

    expect(createInvitationMock).toHaveBeenCalledWith({
      emailAddress: newHireEmail,
      publicMetadata: { pendingProfileId: employee.id },
    });

    const fetched = await getProfileById(employee.id);
    expect(fetched?.id).toBe(employee.id);

    const { data: instances, error: instancesError } = await supabase
      .from("workflow_instances")
      .select("id, related_employee_id")
      .eq("related_employee_id", employee.id);
    if (instancesError) throw instancesError;
    expect(instances).toHaveLength(1);
  });

  it("deletes the just-created profile and rethrows when the Clerk invitation fails", async () => {
    createInvitationMock.mockReset();
    createInvitationMock.mockRejectedValue(new Error("Clerk rate limit exceeded"));

    const newHireEmail = `new-hire-invite-fails-${crypto.randomUUID()}@example.com`;

    await expect(
      createEmployee(hrProfile, {
        email: newHireEmail,
        fullName: "Orphaned Hire",
        role: "employee",
      })
    ).rejects.toThrow("Clerk rate limit exceeded");

    expect(createInvitationMock).toHaveBeenCalledTimes(1);
    const orphanedProfileId = createInvitationMock.mock.calls[0][0].publicMetadata
      .pendingProfileId as string;

    const leftoverProfile = await getProfileById(orphanedProfileId);
    expect(leftoverProfile).toBeNull();
  });

  it("does not start onboarding when startOnboarding is false", async () => {
    createInvitationMock.mockReset();
    createInvitationMock.mockResolvedValue({ id: "inv_456" });

    const newHireEmail = `new-hire-no-onboarding-${crypto.randomUUID()}@example.com`;
    const employee = await createEmployee(hrProfile, {
      email: newHireEmail,
      fullName: "No Onboarding Hire",
      role: "employee",
      startOnboarding: false,
    });

    const { data: instances, error: instancesError } = await supabase
      .from("workflow_instances")
      .select("id")
      .eq("related_employee_id", employee.id);
    if (instancesError) throw instancesError;
    expect(instances).toHaveLength(0);
  });
});

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)(
  "getEmployeeProfile / updateEmployee / listEmployees",
  () => {
    const supabase = createSupabaseAdminClient();
    let companyId: string;
    const createdAuthUserIds: string[] = [];
    let hr: Profile;
    let target: Profile;

    beforeAll(async () => {
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .upsert(
          { name: "Test Co (employee-profile)", slug: "test-co-employee-profile" },
          { onConflict: "slug" }
        )
        .select("id")
        .single();
      if (companyError) throw companyError;
      companyId = company.id;

      const { data: hrAuthUser, error: hrAuthError } = await supabase.auth.admin.createUser({
        email: `employee-profile-hr-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
      if (hrAuthError || !hrAuthUser.user) throw hrAuthError;
      createdAuthUserIds.push(hrAuthUser.user.id);
      hr = await createProfile({ authUserId: hrAuthUser.user.id, companyId, fullName: "HR", role: "hr" });

      const { data: targetAuthUser, error: targetAuthError } = await supabase.auth.admin.createUser({
        email: `employee-profile-target-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
      if (targetAuthError || !targetAuthUser.user) throw targetAuthError;
      createdAuthUserIds.push(targetAuthUser.user.id);
      target = await createProfile({
        authUserId: targetAuthUser.user.id,
        companyId,
        fullName: "Target Employee",
        role: "employee",
      });

      const { error: taskError } = await supabase.from("tasks").insert({
        company_id: companyId,
        title: "Open task for target",
        status: "todo",
        assignee_id: target.id,
      });
      if (taskError) throw taskError;

      const { data: template, error: templateError } = await supabase
        .from("workflow_templates")
        .insert({ company_id: companyId, slug: "employee-profile-test", name: "Employee Profile Test" })
        .select("id")
        .single();
      if (templateError) throw templateError;
      const { error: instanceError } = await supabase.from("workflow_instances").insert({
        company_id: companyId,
        template_id: template.id,
        related_employee_id: target.id,
        status: "in_progress",
      });
      if (instanceError) throw instanceError;
    });

    afterAll(async () => {
      await supabase.from("tasks").delete().eq("company_id", companyId);
      await supabase.from("workflow_instances").delete().eq("company_id", companyId);
      await supabase.from("workflow_templates").delete().eq("company_id", companyId);
      await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
      for (const id of createdAuthUserIds) {
        await supabase.auth.admin.deleteUser(id);
      }
      await supabase.from("companies").delete().eq("slug", "test-co-employee-profile");
    });

    it("aggregates open task count, active workflow count, and returns the profile and activity", async () => {
      const result = await getEmployeeProfile(hr, target.id);
      expect(result.profile.id).toBe(target.id);
      expect(result.counts.openTasks).toBe(1);
      expect(result.counts.requests).toBe(0);
      expect(result.counts.activeWorkflows).toBe(1);
      expect(result.counts.assets).toBe(0);
      expect(Array.isArray(result.activity)).toBe(true);
    });

    it("denies a stranger from viewing the profile", async () => {
      const { data: strangerAuthUser, error: strangerAuthError } = await supabase.auth.admin.createUser({
        email: `employee-profile-stranger-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
      if (strangerAuthError || !strangerAuthUser.user) throw strangerAuthError;
      createdAuthUserIds.push(strangerAuthUser.user.id);
      const stranger = await createProfile({
        authUserId: strangerAuthUser.user.id,
        companyId,
        fullName: "Stranger",
        role: "employee",
      });

      await expect(getEmployeeProfile(stranger, target.id)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("updates an employee and logs activity", async () => {
      const updated = await updateEmployee(hr, target.id, { positionTitle: "Support Lead" });
      expect(updated.positionTitle).toBe("Support Lead");

      const { activity } = await getEmployeeProfile(hr, target.id);
      expect(activity.some((entry) => entry.message.includes("updated"))).toBe(true);
    });

    it("lists employees for the company", async () => {
      const employees = await listEmployees(hr, {});
      expect(employees.some((e) => e.id === target.id)).toBe(true);
    });
  }
);
