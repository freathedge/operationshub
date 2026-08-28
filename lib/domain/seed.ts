import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { RequestCategory } from "@/lib/domain/request-status";
import type { Role } from "@/lib/validation/auth";

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

interface WorkflowTemplateStepSeed {
  order: number;
  type: "task" | "approval";
  title: string;
  description: string | null;
  responsibleRole: Role | null;
  responsibleDepartmentName: string | null;
}

interface WorkflowTemplateSeed {
  slug: string;
  name: string;
  triggerCategory: RequestCategory | null;
  steps: WorkflowTemplateStepSeed[];
}

export const WORKFLOW_TEMPLATES: WorkflowTemplateSeed[] = [
  {
    slug: "equipment-request",
    name: "Equipment Request",
    triggerCategory: "equipment",
    steps: [
      {
        order: 1,
        type: "approval",
        title: "IT Review",
        description: null,
        responsibleRole: "it",
        responsibleDepartmentName: null,
      },
      {
        order: 2,
        type: "task",
        title: "Procurement",
        description: null,
        responsibleRole: null,
        responsibleDepartmentName: "Procurement",
      },
      {
        order: 3,
        type: "task",
        title: "Ordered",
        description: null,
        responsibleRole: null,
        responsibleDepartmentName: "Procurement",
      },
      {
        order: 4,
        type: "task",
        title: "Delivered",
        description: null,
        responsibleRole: null,
        responsibleDepartmentName: "Procurement",
      },
      {
        order: 5,
        type: "task",
        title: "Asset Assigned",
        description: null,
        responsibleRole: null,
        responsibleDepartmentName: "IT",
      },
    ],
  },
  {
    slug: "maintenance",
    name: "Maintenance",
    triggerCategory: "maintenance",
    steps: [
      {
        order: 1,
        type: "task",
        title: "Employee Assigned",
        description: null,
        responsibleRole: null,
        responsibleDepartmentName: "Operations",
      },
      {
        order: 2,
        type: "task",
        title: "Repair",
        description: null,
        responsibleRole: null,
        responsibleDepartmentName: "Operations",
      },
      {
        order: 3,
        type: "approval",
        title: "Verification",
        description: null,
        responsibleRole: "operations_manager",
        responsibleDepartmentName: null,
      },
    ],
  },
  {
    slug: "employee-onboarding",
    name: "Employee Onboarding",
    triggerCategory: null,
    steps: [
      {
        order: 1,
        type: "task",
        title: "Create company account",
        description: null,
        responsibleRole: null,
        responsibleDepartmentName: "IT",
      },
      {
        order: 2,
        type: "task",
        title: "Prepare laptop",
        description: null,
        responsibleRole: null,
        responsibleDepartmentName: "IT",
      },
      {
        order: 3,
        type: "task",
        title: "Prepare workspace",
        description: null,
        responsibleRole: null,
        responsibleDepartmentName: "Operations",
      },
      {
        order: 4,
        type: "task",
        title: "Welcome meeting",
        description: null,
        responsibleRole: "manager",
        responsibleDepartmentName: null,
      },
      {
        order: 5,
        type: "task",
        title: "Manager confirms",
        description: null,
        responsibleRole: "manager",
        responsibleDepartmentName: null,
      },
    ],
  },
];

export async function seedWorkflowTemplates(companyId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();

  for (const template of WORKFLOW_TEMPLATES) {
    const { data: templateRow, error: templateError } = await supabase
      .from("workflow_templates")
      .upsert(
        {
          company_id: companyId,
          slug: template.slug,
          name: template.name,
          trigger_category: template.triggerCategory,
        },
        { onConflict: "company_id,slug" }
      )
      .select("id")
      .single();
    if (templateError) throw templateError;

    const { error: stepsError } = await supabase.from("workflow_template_steps").upsert(
      template.steps.map((step) => ({
        template_id: templateRow.id,
        step_order: step.order,
        step_type: step.type,
        title: step.title,
        description: step.description,
        responsible_role: step.responsibleRole,
        responsible_department_name: step.responsibleDepartmentName,
      })),
      { onConflict: "template_id,step_order" }
    );
    if (stepsError) throw stepsError;
  }
}
