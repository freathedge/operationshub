import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { seedDemoActivity, DEMO_EMPLOYEE_MARKER_PREFIX } from "@/lib/domain/seed";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("seedDemoActivity", () => {
  const supabase = createSupabaseAdminClient();
  const testSlug = "test-co-demo-activity";
  let companyId: string;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (demo activity)", slug: testSlug }, { onConflict: "slug" })
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;
  });

  afterAll(async () => {
    const { error: tasksDeleteError } = await supabase
      .from("tasks")
      .delete()
      .eq("company_id", companyId);
    if (tasksDeleteError) throw tasksDeleteError;

    const { error: requestsDeleteError } = await supabase
      .from("requests")
      .delete()
      .eq("company_id", companyId);
    if (requestsDeleteError) throw requestsDeleteError;

    const { error: profilesDeleteError } = await supabase
      .from("profiles")
      .delete()
      .eq("company_id", companyId);
    if (profilesDeleteError) throw profilesDeleteError;
  });

  it("is idempotent: running it twice does not double the demo employee or task/request count", async () => {
    const first = await seedDemoActivity(testSlug);
    expect(first.employeesCreated).toBe(6);
    expect(first.tasksCreated).toBeGreaterThan(0);
    expect(first.requestsCreated).toBeGreaterThan(0);

    const second = await seedDemoActivity(testSlug);
    expect(second.employeesCreated).toBe(0); // second run finds the existing DEMO-* profiles, creates none
    expect(second.tasksCreated).toBe(0); // second run finds existing "[Demo]"-titled tasks, creates none
    expect(second.requestsCreated).toBe(0);

    const { data: demoProfiles, error: demoProfilesError } = await supabase
      .from("profiles")
      .select("id")
      .eq("company_id", companyId)
      .like("employee_number", `${DEMO_EMPLOYEE_MARKER_PREFIX}%`);
    if (demoProfilesError) throw demoProfilesError;
    // Exactly the employees created by the FIRST run — not double.
    expect(demoProfiles?.length).toBe(6);
  });
});
