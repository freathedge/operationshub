import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile } from "@/lib/domain/profiles";
import { TASK_PRIORITIES, type TaskPriority } from "@/lib/domain/task-status";
import type { RequestCategory, RequestStatus } from "@/lib/domain/request-status";
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
  createsAsset?: boolean;
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
        createsAsset: true,
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
        creates_asset: step.createsAsset ?? false,
      })),
      { onConflict: "template_id,step_order" }
    );
    if (stepsError) throw stepsError;
  }
}

export const DEMO_EMPLOYEE_MARKER_PREFIX = "DEMO-";
const DEMO_WEEKS = 14;

interface DemoEmployeeSeed {
  employeeNumber: string;
  fullName: string;
  role: Role;
  department: string;
}

const DEMO_EMPLOYEES: DemoEmployeeSeed[] = [
  { employeeNumber: "DEMO-01", fullName: "Lena Fischer", role: "employee", department: "Engineering" },
  { employeeNumber: "DEMO-02", fullName: "Markus Weber", role: "employee", department: "Production" },
  { employeeNumber: "DEMO-03", fullName: "Sophie Gruber", role: "employee", department: "IT" },
  { employeeNumber: "DEMO-04", fullName: "Thomas Bauer", role: "manager", department: "Operations" },
  { employeeNumber: "DEMO-05", fullName: "Anna Hofer", role: "employee", department: "Sales" },
  { employeeNumber: "DEMO-06", fullName: "Paul Steiner", role: "employee", department: "Procurement" },
];

const DEMO_TASK_TITLES = [
  "Replace printer toner",
  "Update onboarding checklist",
  "Restock safety equipment",
  "Review supplier contract",
  "Fix conference room projector",
  "Audit software licenses",
  "Update department wiki page",
  "Prepare monthly status report",
];

const DEMO_REQUESTS: { title: string; category: RequestCategory }[] = [
  { title: "New laptop request", category: "equipment" },
  { title: "Software license renewal", category: "software" },
  { title: "VPN access request", category: "access" },
  { title: "Office chair replacement", category: "maintenance" },
  { title: "Office supplies order", category: "purchase" },
];

const DEMO_REQUEST_STATUSES: RequestStatus[] = [
  "submitted",
  "under_review",
  "approved",
  "in_progress",
  "completed",
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export async function seedDemoActivity(
  companySlug: string = ALPENTECH_SLUG
): Promise<{
  employeesCreated: number;
  tasksCreated: number;
  requestsCreated: number;
}> {
  const supabase = createSupabaseAdminClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .eq("slug", companySlug)
    .single();
  if (companyError) throw companyError;
  const companyId = company.id;

  const { data: existingDemoProfiles, error: existingDemoError } = await supabase
    .from("profiles")
    .select("id, department_id")
    .eq("company_id", companyId)
    .like("employee_number", `${DEMO_EMPLOYEE_MARKER_PREFIX}%`);
  if (existingDemoError) throw existingDemoError;

  const { data: departments, error: departmentsError } = await supabase
    .from("departments")
    .select("id, name")
    .eq("company_id", companyId);
  if (departmentsError) throw departmentsError;
  const departmentIdByName = new Map((departments ?? []).map((d) => [d.name, d.id]));

  let demoProfiles: { id: string; departmentId: string | null }[];
  let employeesCreated = 0;
  if ((existingDemoProfiles ?? []).length > 0) {
    demoProfiles = existingDemoProfiles!.map((p) => ({ id: p.id, departmentId: p.department_id }));
  } else {
    demoProfiles = [];
    for (const seed of DEMO_EMPLOYEES) {
      const profile = await createProfile({
        companyId,
        fullName: seed.fullName,
        role: seed.role,
        departmentId: departmentIdByName.get(seed.department) ?? null,
        employeeNumber: seed.employeeNumber,
      });
      demoProfiles.push({ id: profile.id, departmentId: profile.departmentId });
      employeesCreated += 1;
    }
  }

  const { count: existingDemoTaskCount, error: existingTasksError } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .like("title", "[Demo]%");
  if (existingTasksError) throw existingTasksError;

  if ((existingDemoTaskCount ?? 0) > 0) {
    return { employeesCreated, tasksCreated: 0, requestsCreated: 0 };
  }

  const now = new Date();
  const tasksToInsert: {
    company_id: string;
    title: string;
    status: "completed";
    priority: TaskPriority;
    assignee_id: string;
    creator_id: string;
    department_id: string | null;
    completed_at: string;
    created_at: string;
  }[] = [];
  const requestsToInsert: {
    company_id: string;
    title: string;
    category: RequestCategory;
    status: RequestStatus;
    created_by: string;
    department_id: string | null;
    created_at: string;
  }[] = [];

  for (let weekOffset = DEMO_WEEKS - 1; weekOffset >= 0; weekOffset--) {
    const weekStart = new Date(now);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekOffset * 7);

    const completedTaskCount = randomInt(3, 8);
    for (let i = 0; i < completedTaskCount; i++) {
      const assignee = randomChoice(demoProfiles);
      const completedAt = new Date(weekStart);
      completedAt.setUTCDate(completedAt.getUTCDate() + randomInt(0, 6));
      const createdAt = new Date(completedAt);
      createdAt.setUTCDate(createdAt.getUTCDate() - randomInt(1, 5));

      tasksToInsert.push({
        company_id: companyId,
        title: `[Demo] ${randomChoice(DEMO_TASK_TITLES)}`,
        status: "completed",
        priority: randomChoice(TASK_PRIORITIES),
        assignee_id: assignee.id,
        creator_id: assignee.id,
        department_id: assignee.departmentId,
        completed_at: completedAt.toISOString(),
        created_at: createdAt.toISOString(),
      });
    }

    const newRequestCount = randomInt(2, 5);
    for (let i = 0; i < newRequestCount; i++) {
      const creator = randomChoice(demoProfiles);
      const createdAt = new Date(weekStart);
      createdAt.setUTCDate(createdAt.getUTCDate() + randomInt(0, 6));
      const { title, category } = randomChoice(DEMO_REQUESTS);

      requestsToInsert.push({
        company_id: companyId,
        title: `[Demo] ${title}`,
        category,
        status: randomChoice(DEMO_REQUEST_STATUSES),
        created_by: creator.id,
        department_id: creator.departmentId,
        created_at: createdAt.toISOString(),
      });
    }
  }

  const { error: tasksInsertError } = await supabase.from("tasks").insert(tasksToInsert);
  if (tasksInsertError) throw tasksInsertError;

  const { error: requestsInsertError } = await supabase.from("requests").insert(requestsToInsert);
  if (requestsInsertError) throw requestsInsertError;

  return {
    employeesCreated,
    tasksCreated: tasksToInsert.length,
    requestsCreated: requestsToInsert.length,
  };
}
