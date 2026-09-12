import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface Location {
  id: string;
  name: string;
}

export async function listLocations(companyId: string): Promise<Location[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("locations")
    .select("id, name")
    .eq("company_id", companyId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
