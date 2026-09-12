import { createProfile, type Profile } from "@/lib/domain/profiles";
import { logActivity } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import { startWorkflow } from "@/lib/domain/workflows";
import { canCreateEmployee } from "@/lib/domain/permissions";
import { ForbiddenError } from "@/lib/domain/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CreateEmployeeInput } from "@/lib/validation/employees";

export type Employee = Profile;

export async function createEmployee(
  profile: Profile,
  input: CreateEmployeeInput
): Promise<Employee> {
  if (!canCreateEmployee(profile)) {
    throw new ForbiddenError("You cannot create employees");
  }

  const supabase = createSupabaseAdminClient();
  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    input.email
  );
  if (inviteError || !invited.user) {
    throw inviteError ?? new Error("Failed to invite employee");
  }

  const employee = await createProfile({
    authUserId: invited.user.id,
    companyId: profile.companyId,
    fullName: input.fullName,
    role: input.role,
    departmentId: input.departmentId ?? null,
    managerId: input.managerId ?? null,
    locationId: input.locationId ?? null,
    positionTitle: input.positionTitle ?? null,
    employeeNumber: input.employeeNumber ?? null,
  });

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
