import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface Department {
  id: string;
  name: string;
}

export interface DepartmentDetail extends Department {
  companyId: string;
}

export async function listDepartments(companyId: string): Promise<Department[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("departments")
    .select("id, name")
    .eq("company_id", companyId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getDepartmentById(id: string): Promise<DepartmentDetail | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("departments")
    .select("id, name, company_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, name: data.name, companyId: data.company_id };
}
