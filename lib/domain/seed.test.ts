import { describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  seedFoundationData,
  ALPENTECH_DEPARTMENTS,
  ALPENTECH_LOCATIONS,
} from "@/lib/domain/seed";

describe("seedFoundationData", () => {
  it("creates AlpenTech Industries with its departments and locations, and is idempotent", async () => {
    const supabase = createSupabaseAdminClient();

    const first = await seedFoundationData();
    const second = await seedFoundationData();
    expect(second.companyId).toBe(first.companyId);

    const { data: departments, error: departmentsError } = await supabase
      .from("departments")
      .select("name")
      .eq("company_id", first.companyId);
    if (departmentsError) throw departmentsError;
    expect(departments?.map((d) => d.name).sort()).toEqual(
      [...ALPENTECH_DEPARTMENTS].sort()
    );

    const { data: locations, error: locationsError } = await supabase
      .from("locations")
      .select("name")
      .eq("company_id", first.companyId);
    if (locationsError) throw locationsError;
    expect(locations?.map((l) => l.name).sort()).toEqual(
      [...ALPENTECH_LOCATIONS].sort()
    );
  });
});
