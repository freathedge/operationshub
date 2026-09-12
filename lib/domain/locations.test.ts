import { afterAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listLocations } from "@/lib/domain/locations";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("listLocations", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;

  afterAll(async () => {
    await supabase.from("companies").delete().eq("slug", "test-co-locations");
  });

  it("lists a company's locations alphabetically", async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert(
        { name: "Test Co (locations)", slug: "test-co-locations" },
        { onConflict: "slug" }
      )
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { error: locationsError } = await supabase
      .from("locations")
      .upsert(
        [
          { company_id: companyId, name: "Vienna" },
          { company_id: companyId, name: "Graz" },
        ],
        { onConflict: "company_id,name" }
      );
    if (locationsError) throw locationsError;

    const locations = await listLocations(companyId);
    expect(locations.map((l) => l.name)).toEqual(["Graz", "Vienna"]);
  });
});
