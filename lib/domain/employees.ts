import {
  createProfile,
  deleteProfile,
  getProfileById,
  listProfilesByCompany,
  updateProfile,
  type Profile,
} from "@/lib/domain/profiles";
import { logActivity, listActivity, type ActivityEntry } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import { startWorkflow } from "@/lib/domain/workflows";
import { canCreateEmployee, canUpdateEmployee, canViewEmployeeProfile, canManageEmployeeAccount } from "@/lib/domain/permissions";
import { ForbiddenError, NotFoundError, InvalidTransitionError, UnprocessableRequestError } from "@/lib/domain/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { clerkClient } from "@clerk/nextjs/server";
import type { CreateEmployeeInput, EmployeeFilters, UpdateEmployeeInput } from "@/lib/validation/employees";

export type Employee = Profile;

export type EmployeeAccountInfo =
  | { linked: true; email: string }
  | { linked: false; invitedEmail: string | null };

interface ClerkEmailAddress {
  id: string;
  emailAddress: string;
}

interface ClerkUserLike {
  id: string;
  primaryEmailAddressId: string | null;
  emailAddresses: ClerkEmailAddress[];
}

function extractPrimaryEmail(user: ClerkUserLike): string {
  return (
    user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId)?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    ""
  );
}

export async function getAccountInfoForEmployees(
  profile: Profile,
  employees: Employee[]
): Promise<Map<string, EmployeeAccountInfo>> {
  const result = new Map<string, EmployeeAccountInfo>();
  if (!canManageEmployeeAccount(profile)) {
    return result;
  }

  const linked = employees.filter((employee) => employee.authUserId !== null);
  const pending = employees.filter((employee) => employee.authUserId === null);

  for (const employee of pending) {
    result.set(employee.id, { linked: false, invitedEmail: employee.invitedEmail });
  }

  if (linked.length > 0) {
    const clerk = await clerkClient();
    const authUserIds = linked.map((employee) => employee.authUserId as string);
    const { data: users } = await clerk.users.getUserList({
      userId: authUserIds,
      limit: authUserIds.length,
    });
    const emailByAuthUserId = new Map(users.map((user) => [user.id, extractPrimaryEmail(user)]));
    for (const employee of linked) {
      const email = emailByAuthUserId.get(employee.authUserId as string);
      if (email !== undefined) {
        result.set(employee.id, { linked: true, email });
      }
    }
  }

  return result;
}

export async function createEmployee(
  profile: Profile,
  input: CreateEmployeeInput
): Promise<Employee> {
  if (!canCreateEmployee(profile)) {
    throw new ForbiddenError("You cannot create employees");
  }

  const employee = await createProfile({
    companyId: profile.companyId,
    fullName: input.fullName,
    role: input.role,
    departmentId: input.departmentId ?? null,
    managerId: input.managerId ?? null,
    locationId: input.locationId ?? null,
    positionTitle: input.positionTitle ?? null,
    employeeNumber: input.employeeNumber ?? null,
    invitedEmail: input.email,
  });

  const clerk = await clerkClient();
  try {
    await clerk.invitations.createInvitation({
      emailAddress: input.email,
      publicMetadata: { pendingProfileId: employee.id },
    });
  } catch (error) {
    await deleteProfile(employee.id);
    throw error;
  }

  await logActivity(
    "profile",
    employee.id,
    profile.id,
    `${profile.fullName} added ${employee.fullName} as a new employee`
  );

  if (input.startOnboarding ?? true) {
    try {
      await startWorkflow(profile, "employee-onboarding", { employeeId: employee.id });
    } catch (workflowError) {
      console.error("startWorkflow failed:", workflowError);
    }
  }

  try {
    await broadcastChange(profile.companyId, "employees", { type: "employee_created" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }

  return employee;
}

export async function resendEmployeeInvite(profile: Profile, employeeId: string): Promise<void> {
  if (!canManageEmployeeAccount(profile)) {
    throw new ForbiddenError("You cannot manage employee accounts");
  }
  const target = await getProfileById(employeeId);
  if (!target || target.companyId !== profile.companyId) {
    throw new NotFoundError("Employee not found");
  }
  if (target.authUserId) {
    throw new InvalidTransitionError("This employee has already linked their account");
  }
  if (!target.invitedEmail) {
    throw new UnprocessableRequestError("No invited email on file for this employee");
  }

  const clerk = await clerkClient();
  await clerk.invitations.createInvitation({
    emailAddress: target.invitedEmail,
    publicMetadata: { pendingProfileId: target.id },
    ignoreExisting: true,
  });

  await logActivity(
    "profile",
    employeeId,
    profile.id,
    `${profile.fullName} resent an invitation to ${target.fullName}`
  );
  try {
    await broadcastChange(profile.companyId, "employees", { type: "employee_invite_resent" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }
}

export interface EmployeeCounts {
  openTasks: number;
  requests: number;
  activeWorkflows: number;
  assets: number;
}

export interface EmployeeProfile {
  profile: Employee;
  counts: EmployeeCounts;
  activity: ActivityEntry[];
}

export async function getEmployeeProfile(
  profile: Profile,
  employeeId: string
): Promise<EmployeeProfile> {
  const target = await getProfileById(employeeId);
  if (!target || target.companyId !== profile.companyId) {
    throw new NotFoundError("Employee not found");
  }
  if (!canViewEmployeeProfile(profile, target)) {
    throw new ForbiddenError("You cannot view this employee");
  }

  const supabase = createSupabaseAdminClient();
  const [openTasksResult, requestsResult, workflowsResult, assetsResult, activity] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("assignee_id", employeeId)
        .not("status", "in", "(completed,cancelled)"),
      supabase
        .from("requests")
        .select("id", { count: "exact", head: true })
        .eq("created_by", employeeId),
      supabase
        .from("workflow_instances")
        .select("id", { count: "exact", head: true })
        .eq("related_employee_id", employeeId)
        .eq("status", "in_progress"),
      supabase
        .from("assets")
        .select("id", { count: "exact", head: true })
        .eq("assigned_to", employeeId),
      listActivity("profile", employeeId),
    ]);

  if (openTasksResult.error) throw openTasksResult.error;
  if (requestsResult.error) throw requestsResult.error;
  if (workflowsResult.error) throw workflowsResult.error;
  if (assetsResult.error) throw assetsResult.error;

  return {
    profile: target,
    counts: {
      openTasks: openTasksResult.count ?? 0,
      requests: requestsResult.count ?? 0,
      activeWorkflows: workflowsResult.count ?? 0,
      assets: assetsResult.count ?? 0,
    },
    activity,
  };
}

export async function updateEmployee(
  profile: Profile,
  employeeId: string,
  input: UpdateEmployeeInput
): Promise<Employee> {
  if (!canUpdateEmployee(profile)) {
    throw new ForbiddenError("You cannot update employees");
  }
  const target = await getProfileById(employeeId);
  if (!target || target.companyId !== profile.companyId) {
    throw new NotFoundError("Employee not found");
  }

  const updated = await updateProfile(employeeId, input);

  let message = `${profile.fullName} updated ${target.fullName}'s profile`;
  if (input.role !== undefined && input.role !== target.role) {
    message = `${profile.fullName} changed ${target.fullName}'s role from ${target.role} to ${input.role}`;
  } else if (input.status !== undefined && input.status !== target.status) {
    message =
      input.status === "inactive"
        ? `${profile.fullName} deactivated ${target.fullName}'s account`
        : `${profile.fullName} reactivated ${target.fullName}'s account`;
  }
  await logActivity("profile", employeeId, profile.id, message);

  try {
    await broadcastChange(profile.companyId, "employees", { type: "employee_updated" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }
  return updated;
}

export async function listEmployees(profile: Profile, filters: EmployeeFilters): Promise<Employee[]> {
  return listProfilesByCompany(profile.companyId, filters);
}
