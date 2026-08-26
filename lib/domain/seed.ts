import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const ALPENTECH_SLUG = "alpentech-industries";

export const ALPENTECH_DEPARTMENTS = [
  "Engineering",
  "Production",
  "Operations",
  "IT",
  "HR",
  "Finance",
  "Procurement",
  "Sales",
];

export const ALPENTECH_LOCATIONS = ["Vienna", "Graz", "Linz"];

export async function seedFoundationData(): Promise<{ companyId: string }> {
  const supabase = createSupabaseAdminClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .upsert(
      { name: "AlpenTech Industries", slug: ALPENTECH_SLUG },
      { onConflict: "slug" }
    )
    .select("id")
    .single();
  if (companyError) throw companyError;

  const { error: departmentsError } = await supabase
    .from("departments")
    .upsert(
      ALPENTECH_DEPARTMENTS.map((name) => ({ company_id: company.id, name })),
      { onConflict: "company_id,name" }
    );
  if (departmentsError) throw departmentsError;

  const { error: locationsError } = await supabase
    .from("locations")
    .upsert(
      ALPENTECH_LOCATIONS.map((name) => ({ company_id: company.id, name })),
      { onConflict: "company_id,name" }
    );
  if (locationsError) throw locationsError;

  return { companyId: company.id };
}
