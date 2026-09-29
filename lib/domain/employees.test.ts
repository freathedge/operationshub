import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile, getProfileById, type Profile } from "@/lib/domain/profiles";
import {
  createEmployee,
  getAccountInfoForEmployees,
  getEmployeeProfile,
  listEmployees,
  resendEmployeeInvite,
  updateEmployee,
} from "@/lib/domain/employees";
import { ForbiddenError } from "@/lib/domain/errors";

const createInvitationMock = vi.fn();
const getUserListMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    invitations: { createInvitation: createInvitationMock },
    users: { getUserList: getUserListMock },
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

  it("stores the invited email on the profile for a later resend", async () => {
    createInvitationMock.mockReset();
    createInvitationMock.mockResolvedValue({ id: "inv_789" });

    const newHireEmail = `new-hire-invited-email-${crypto.randomUUID()}@example.com`;
    const employee = await createEmployee(hrProfile, {
      email: newHireEmail,
      fullName: "Invited Email Hire",
      role: "employee",
      startOnboarding: false,
    });

    expect(employee.invitedEmail).toBe(newHireEmail);
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

    it("logs a role-change-specific activity message", async () => {
      await updateEmployee(hr, target.id, { role: "manager" });
      const { activity } = await getEmployeeProfile(hr, target.id);
      expect(
        activity.some((entry) =>
          entry.message.includes(`changed ${target.fullName}'s role from employee to manager`)
        )
      ).toBe(true);
    });

    it("logs a deactivate-specific activity message", async () => {
      await updateEmployee(hr, target.id, { status: "inactive" });
      const { activity } = await getEmployeeProfile(hr, target.id);
      expect(
        activity.some((entry) => entry.message.includes(`deactivated ${target.fullName}'s account`))
      ).toBe(true);

      // restore for any later test in this file that assumes an active target
      await updateEmployee(hr, target.id, { status: "active" });
    });

    it("logs a reactivate-specific activity message", async () => {
      await updateEmployee(hr, target.id, { status: "inactive" });
      await updateEmployee(hr, target.id, { status: "active" });
      const { activity } = await getEmployeeProfile(hr, target.id);
      expect(
        activity.some((entry) => entry.message.includes(`reactivated ${target.fullName}'s account`))
      ).toBe(true);
    });
  }
);

describe("getAccountInfoForEmployees", () => {
  beforeEach(() => {
    getUserListMock.mockReset();
  });

  function makeEmployee(overrides: Partial<Profile> = {}): Profile {
    return {
      id: "employee-1",
      authUserId: null,
      companyId: "company-1",
      fullName: "Test Employee",
      role: "employee",
      departmentId: null,
      managerId: null,
      positionTitle: null,
      employeeNumber: null,
      locationId: null,
      relatedOperationId: null,
      status: "active",
      invitedEmail: null,
      ...overrides,
    };
  }

  const hr: Profile = {
    id: "hr-1",
    authUserId: "auth-hr-1",
    companyId: "company-1",
    fullName: "HR Person",
    role: "hr",
    departmentId: null,
    managerId: null,
    positionTitle: null,
    employeeNumber: null,
    locationId: null,
    relatedOperationId: null,
    status: "active",
    invitedEmail: null,
  };

  const stranger: Profile = { ...hr, id: "stranger-1", role: "employee" };

  it("returns an empty map for a caller without canManageEmployeeAccount, without calling Clerk", async () => {
    const employees = [makeEmployee({ authUserId: "auth-1" })];
    const result = await getAccountInfoForEmployees(stranger, employees);
    expect(result.size).toBe(0);
    expect(getUserListMock).not.toHaveBeenCalled();
  });

  it("returns invitedEmail for a pending employee, without calling Clerk", async () => {
    const employees = [makeEmployee({ id: "pending-1", authUserId: null, invitedEmail: "pending@example.com" })];
    const result = await getAccountInfoForEmployees(hr, employees);
    expect(result.get("pending-1")).toEqual({ linked: false, invitedEmail: "pending@example.com" });
    expect(getUserListMock).not.toHaveBeenCalled();
  });

  it("makes exactly one Clerk call for multiple linked employees and maps each back by profile id", async () => {
    getUserListMock.mockResolvedValue({
      data: [
        {
          id: "auth-1",
          primaryEmailAddressId: "email-1",
          emailAddresses: [{ id: "email-1", emailAddress: "alice@example.com" }],
        },
        {
          id: "auth-2",
          primaryEmailAddressId: "email-2",
          emailAddresses: [{ id: "email-2", emailAddress: "bob@example.com" }],
        },
      ],
    });

    const employees = [
      makeEmployee({ id: "linked-1", authUserId: "auth-1" }),
      makeEmployee({ id: "linked-2", authUserId: "auth-2" }),
    ];
    const result = await getAccountInfoForEmployees(hr, employees);

    expect(getUserListMock).toHaveBeenCalledTimes(1);
    expect(getUserListMock).toHaveBeenCalledWith({ userId: ["auth-1", "auth-2"], limit: 2 });
    expect(result.get("linked-1")).toEqual({ linked: true, email: "alice@example.com" });
    expect(result.get("linked-2")).toEqual({ linked: true, email: "bob@example.com" });
  });

  it("mixes linked and pending employees correctly in one call", async () => {
    getUserListMock.mockResolvedValue({
      data: [
        {
          id: "auth-1",
          primaryEmailAddressId: "email-1",
          emailAddresses: [{ id: "email-1", emailAddress: "alice@example.com" }],
        },
      ],
    });

    const employees = [
      makeEmployee({ id: "linked-1", authUserId: "auth-1" }),
      makeEmployee({ id: "pending-1", authUserId: null, invitedEmail: "pending@example.com" }),
    ];
    const result = await getAccountInfoForEmployees(hr, employees);

    expect(result.get("linked-1")).toEqual({ linked: true, email: "alice@example.com" });
    expect(result.get("pending-1")).toEqual({ linked: false, invitedEmail: "pending@example.com" });
  });
});

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("resendEmployeeInvite", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  let hr: Profile;

  beforeEach(() => {
    createInvitationMock.mockReset();
  });

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert(
        { name: "Test Co (resend-invite)", slug: "test-co-resend-invite" },
        { onConflict: "slug" }
      )
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    hr = await createProfile({
      authUserId: `test-hr-resend-${crypto.randomUUID()}`,
      companyId,
      fullName: "HR Person",
      role: "hr",
    });
  });

  afterAll(async () => {
    await supabase.from("companies").delete().eq("slug", "test-co-resend-invite");
  });

  it("rejects a caller without hr/admin", async () => {
    const nonHr = await createProfile({
      authUserId: `test-not-hr-resend-${crypto.randomUUID()}`,
      companyId,
      fullName: "Not HR",
      role: "employee",
    });
    const pending = await createProfile({
      companyId,
      fullName: "Pending Hire",
      role: "employee",
      invitedEmail: "pending@example.com",
    });

    await expect(resendEmployeeInvite(nonHr, pending.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects when the employee has already linked their account", async () => {
    const linked = await createProfile({
      authUserId: `test-linked-${crypto.randomUUID()}`,
      companyId,
      fullName: "Already Linked",
      role: "employee",
      invitedEmail: "already-linked@example.com",
    });

    await expect(resendEmployeeInvite(hr, linked.id)).rejects.toThrow(
      "This employee has already linked their account"
    );
    expect(createInvitationMock).not.toHaveBeenCalled();
  });

  it("rejects when there is no invited email on file", async () => {
    const pendingNoEmail = await createProfile({
      companyId,
      fullName: "No Email On File",
      role: "employee",
    });

    await expect(resendEmployeeInvite(hr, pendingNoEmail.id)).rejects.toThrow(
      "No invited email on file for this employee"
    );
    expect(createInvitationMock).not.toHaveBeenCalled();
  });

  it("resends the invitation with ignoreExisting and logs activity", async () => {
    createInvitationMock.mockResolvedValue({ id: "inv_resend_1" });
    const pending = await createProfile({
      companyId,
      fullName: "Pending Resend",
      role: "employee",
      invitedEmail: "pending-resend@example.com",
    });

    await resendEmployeeInvite(hr, pending.id);

    expect(createInvitationMock).toHaveBeenCalledWith({
      emailAddress: "pending-resend@example.com",
      publicMetadata: { pendingProfileId: pending.id },
      ignoreExisting: true,
    });

    const { activity } = await getEmployeeProfile(hr, pending.id);
    expect(
      activity.some((entry) => entry.message.includes(`resent an invitation to ${pending.fullName}`))
    ).toBe(true);
  });
});
