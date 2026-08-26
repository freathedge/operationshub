import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ALPENTECH_SLUG } from "@/lib/domain/seed";

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
    .eq("slug", ALPENTECH_SLUG)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error(`Default company '${ALPENTECH_SLUG}' not found. Run \`pnpm seed\` first.`);
  }

  return data;
}
