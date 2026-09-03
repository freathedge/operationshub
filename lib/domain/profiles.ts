import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/validation/auth";

export type ProfileStatus = "active" | "inactive";
export const PROFILE_STATUSES: ProfileStatus[] = ["active", "inactive"];

export interface Profile {
  id: string;
  authUserId: string;
  companyId: string;
  fullName: string;
  role: Role;
  departmentId: string | null;
  managerId: string | null;
  positionTitle: string | null;
  employeeNumber: string | null;
  locationId: string | null;
  status: ProfileStatus;
}

interface ProfileRow {
  id: string;
  auth_user_id: string;
  company_id: string;
  full_name: string;
  role: Role;
  department_id: string | null;
  manager_id: string | null;
  position_title: string | null;
  employee_number: string | null;
  location_id: string | null;
  status: ProfileStatus;
}

function toProfile(row: ProfileRow): Profile {
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
    status: row.status,
  };
}

const PROFILE_COLUMNS =
  "id, auth_user_id, company_id, full_name, role, department_id, manager_id, position_title, employee_number, location_id, status";

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
  authUserId: string;
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
      auth_user_id: input.authUserId,
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
