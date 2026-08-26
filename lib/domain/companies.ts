import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface Company {
  id: string;
  name: string;
  slug: string;
}

export async function getDefaultCompany(): Promise<Company> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("slug", "alpentech-industries")
    .single();

  if (error || !data) {
    throw new Error(
      "Default company 'alpentech-industries' not found. Run the seed script (Task 15) first."
    );
  }

  return data;
}
