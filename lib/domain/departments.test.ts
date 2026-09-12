import { afterAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listDepartments } from "@/lib/domain/departments";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("listDepartments", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;

  afterAll(async () => {
    await supabase.from("companies").delete().eq("slug", "test-co-departments");
  });

  it("lists a company's departments alphabetically", async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert(
        { name: "Test Co (departments)", slug: "test-co-departments" },
        { onConflict: "slug" }
      )
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { error: departmentsError } = await supabase
      .from("departments")
      .upsert(
        [
          { company_id: companyId, name: "Zeta" },
          { company_id: companyId, name: "Alpha" },
        ],
        { onConflict: "company_id,name" }
      );
    if (departmentsError) throw departmentsError;

    const departments = await listDepartments(companyId);
    expect(departments.map((d) => d.name)).toEqual(["Alpha", "Zeta"]);
  });
});
