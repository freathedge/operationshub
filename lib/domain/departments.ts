import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface Department {
  id: string;
  name: string;
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
