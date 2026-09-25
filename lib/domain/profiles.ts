import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/validation/auth";
import { PROFILE_STATUSES, type ProfileStatus } from "@/lib/domain/profile-status";

export { PROFILE_STATUSES, type ProfileStatus };

export interface Profile {
  id: string;
  authUserId: string | null;
  companyId: string;
  fullName: string;
  role: Role;
  departmentId: string | null;
  managerId: string | null;
  positionTitle: string | null;
  employeeNumber: string | null;
  locationId: string | null;
  relatedOperationId: string | null;
  status: ProfileStatus;
}

interface ProfileRow {
  id: string;
  auth_user_id: string | null;
  company_id: string;
  full_name: string;
  role: Role;
  department_id: string | null;
  manager_id: string | null;
  position_title: string | null;
  employee_number: string | null;
  location_id: string | null;
  related_operation_id: string | null;
  status: ProfileStatus;
}

export function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    companyId: row.company_id,
    fullName: row.full_name,
    role: row.role,
    departmentId: row.department_id,
    managerId: row.manager_id,
    positionTitle: row.position_title,
    employeeNumber: row.employee_number,
    locationId: row.location_id,
    relatedOperationId: row.related_operation_id,
    status: row.status,
  };
}

export const PROFILE_COLUMNS =
  "id, auth_user_id, company_id, full_name, role, department_id, manager_id, position_title, employee_number, location_id, related_operation_id, status";

export async function getProfileByAuthUserId(
  authUserId: string
): Promise<Profile | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return toProfile(data);
}

export async function getProfileById(id: string): Promise<Profile | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return toProfile(data);
}

export async function listProfilesByRole(
  companyId: string,
  role: Role,
  excludeProfileId: string
): Promise<Pick<Profile, "id" | "fullName">[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("company_id", companyId)
    .eq("role", role)
    .neq("id", excludeProfileId)
    .order("full_name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id, fullName: row.full_name }));
}

export async function findEarliestProfileByRole(
  companyId: string,
  role: Role
): Promise<Profile | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("company_id", companyId)
    .eq("role", role)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return getProfileById(data.id);
}

export async function createProfile(input: {
  authUserId?: string | null;
  companyId: string;
  fullName: string;
  role: Role;
  departmentId?: string | null;
  managerId?: string | null;
  locationId?: string | null;
  positionTitle?: string | null;
  employeeNumber?: string | null;
}): Promise<Profile> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .insert({
      auth_user_id: input.authUserId ?? null,
      company_id: input.companyId,
      full_name: input.fullName,
      role: input.role,
      department_id: input.departmentId ?? null,
      manager_id: input.managerId ?? null,
      location_id: input.locationId ?? null,
      position_title: input.positionTitle ?? null,
      employee_number: input.employeeNumber ?? null,
    })
    .select(PROFILE_COLUMNS)
    .single();

  if (error) throw error;
  return toProfile(data);
}

export async function linkProfileToAuthUser(
  profileId: string,
  authUserId: string
): Promise<Profile> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ auth_user_id: authUserId })
    .eq("id", profileId)
    .is("auth_user_id", null)
    .select(PROFILE_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const existing = await getProfileById(profileId);
    if (!existing) throw new Error(`Profile ${profileId} not found`);
    return existing;
  }
  return toProfile(data);
}

export async function deleteProfile(id: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("profiles").delete().eq("id", id);
  if (error) throw error;
}

export async function updateProfile(
  id: string,
  updates: {
    positionTitle?: string | null;
    employeeNumber?: string | null;
    departmentId?: string | null;
    managerId?: string | null;
    locationId?: string | null;
    relatedOperationId?: string | null;
    status?: ProfileStatus;
  }
): Promise<Profile> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({
      ...(updates.positionTitle !== undefined && { position_title: updates.positionTitle }),
      ...(updates.employeeNumber !== undefined && { employee_number: updates.employeeNumber }),
      ...(updates.departmentId !== undefined && { department_id: updates.departmentId }),
      ...(updates.managerId !== undefined && { manager_id: updates.managerId }),
      ...(updates.locationId !== undefined && { location_id: updates.locationId }),
      ...(updates.relatedOperationId !== undefined && {
        related_operation_id: updates.relatedOperationId,
      }),
      ...(updates.status !== undefined && { status: updates.status }),
    })
    .eq("id", id)
    .select(PROFILE_COLUMNS)
    .single();
  if (error) throw error;
  return toProfile(data);
}

export async function listProfilesByCompany(
  companyId: string,
  filters: { departmentId?: string; status?: ProfileStatus }
): Promise<Profile[]> {
  const supabase = createSupabaseAdminClient();
  let query = supabase.from("profiles").select(PROFILE_COLUMNS).eq("company_id", companyId);
  if (filters.departmentId) query = query.eq("department_id", filters.departmentId);
  if (filters.status) query = query.eq("status", filters.status);
  const { data, error } = await query.order("full_name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toProfile);
}
