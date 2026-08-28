import { describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  seedFoundationData,
  seedWorkflowTemplates,
  ALPENTECH_DEPARTMENTS,
  ALPENTECH_LOCATIONS,
} from "@/lib/domain/seed";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("seedFoundationData", () => {
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

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("seedWorkflowTemplates", () => {
  it("seeds the three workflow templates with their steps, and is idempotent", async () => {
    const supabase = createSupabaseAdminClient();
    const { companyId } = await seedFoundationData();

    await seedWorkflowTemplates(companyId);
    await seedWorkflowTemplates(companyId);

    const { data: templates, error: templatesError } = await supabase
      .from("workflow_templates")
      .select("id, slug, trigger_category")
      .eq("company_id", companyId);
    if (templatesError) throw templatesError;
    expect(templates?.map((t) => t.slug).sort()).toEqual(
      ["employee-onboarding", "equipment-request", "maintenance"].sort()
    );

    const equipmentTemplate = templates!.find((t) => t.slug === "equipment-request")!;
    expect(equipmentTemplate.trigger_category).toBe("equipment");
    const onboardingTemplate = templates!.find((t) => t.slug === "employee-onboarding")!;
    expect(onboardingTemplate.trigger_category).toBeNull();

    const { data: equipmentSteps, error: stepsError } = await supabase
      .from("workflow_template_steps")
      .select("step_order, step_type, title, responsible_role, responsible_department_name")
      .eq("template_id", equipmentTemplate.id)
      .order("step_order", { ascending: true });
    if (stepsError) throw stepsError;
    expect(equipmentSteps?.map((s) => s.title)).toEqual([
      "IT Review",
      "Procurement",
      "Ordered",
      "Delivered",
      "Asset Assigned",
    ]);
    expect(equipmentSteps?.[0]).toMatchObject({
      step_type: "approval",
      responsible_role: "it",
      responsible_department_name: null,
    });
    expect(equipmentSteps?.[1]).toMatchObject({
      step_type: "task",
      responsible_role: null,
      responsible_department_name: "Procurement",
    });
  });
});
