import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { findEarliestProfileByRole, type Profile } from "@/lib/domain/profiles";
import { logActivity } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import { createNotification } from "@/lib/domain/notifications";
import { NotFoundError, UnprocessableRequestError } from "@/lib/domain/errors";
import type { RequestCategory } from "@/lib/domain/request-status";
import type { Role } from "@/lib/validation/auth";

export interface WorkflowTemplate {
  id: string;
  companyId: string;
  slug: string;
  name: string;
  triggerCategory: RequestCategory | null;
  createdAt: string;
}

interface WorkflowTemplateRow {
  id: string;
  company_id: string;
  slug: string;
  name: string;
  trigger_category: RequestCategory | null;
  created_at: string;
}

function toWorkflowTemplate(row: WorkflowTemplateRow): WorkflowTemplate {
  return {
    id: row.id,
    companyId: row.company_id,
    slug: row.slug,
    name: row.name,
    triggerCategory: row.trigger_category,
    createdAt: row.created_at,
  };
}

const WORKFLOW_TEMPLATE_COLUMNS = "id, company_id, slug, name, trigger_category, created_at";

export interface WorkflowTemplateStep {
  id: string;
  templateId: string;
  stepOrder: number;
  stepType: "task" | "approval";
  title: string;
  description: string | null;
  responsibleRole: Role | null;
  responsibleDepartmentName: string | null;
}

interface WorkflowTemplateStepRow {
  id: string;
  template_id: string;
  step_order: number;
  step_type: "task" | "approval";
  title: string;
  description: string | null;
  responsible_role: Role | null;
  responsible_department_name: string | null;
}

function toWorkflowTemplateStep(row: WorkflowTemplateStepRow): WorkflowTemplateStep {
  return {
    id: row.id,
    templateId: row.template_id,
    stepOrder: row.step_order,
    stepType: row.step_type,
    title: row.title,
    description: row.description,
    responsibleRole: row.responsible_role,
    responsibleDepartmentName: row.responsible_department_name,
  };
}

const WORKFLOW_TEMPLATE_STEP_COLUMNS =
  "id, template_id, step_order, step_type, title, description, responsible_role, responsible_department_name";

export interface WorkflowInstance {
  id: string;
  companyId: string;
  templateId: string;
  relatedRequestId: string | null;
  status: "in_progress" | "completed";
  createdAt: string;
}

interface WorkflowInstanceRow {
  id: string;
  company_id: string;
  template_id: string;
  related_request_id: string | null;
  status: "in_progress" | "completed";
  created_at: string;
}

function toWorkflowInstance(row: WorkflowInstanceRow): WorkflowInstance {
  return {
    id: row.id,
    companyId: row.company_id,
    templateId: row.template_id,
    relatedRequestId: row.related_request_id,
    status: row.status,
    createdAt: row.created_at,
  };
}

const WORKFLOW_INSTANCE_COLUMNS =
  "id, company_id, template_id, related_request_id, status, created_at";

export interface WorkflowInstanceStep {
  id: string;
  instanceId: string;
  templateStepId: string;
  stepOrder: number;
  status: "pending" | "in_progress" | "completed";
  generatedTaskId: string | null;
  generatedApprovalId: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface WorkflowInstanceStepRow {
  id: string;
  instance_id: string;
  template_step_id: string;
  step_order: number;
  status: "pending" | "in_progress" | "completed";
  generated_task_id: string | null;
  generated_approval_id: string | null;
  created_at: string;
  completed_at: string | null;
}

function toWorkflowInstanceStep(row: WorkflowInstanceStepRow): WorkflowInstanceStep {
  return {
    id: row.id,
    instanceId: row.instance_id,
    templateStepId: row.template_step_id,
    stepOrder: row.step_order,
    status: row.status,
    generatedTaskId: row.generated_task_id,
    generatedApprovalId: row.generated_approval_id,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

const WORKFLOW_INSTANCE_STEP_COLUMNS =
  "id, instance_id, template_step_id, step_order, status, generated_task_id, generated_approval_id, created_at, completed_at";

export async function listWorkflowTemplates(companyId: string): Promise<WorkflowTemplate[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workflow_templates")
    .select(WORKFLOW_TEMPLATE_COLUMNS)
    .eq("company_id", companyId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toWorkflowTemplate);
}

async function loadTemplateBySlug(companyId: string, slug: string): Promise<WorkflowTemplate> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workflow_templates")
    .select(WORKFLOW_TEMPLATE_COLUMNS)
    .eq("company_id", companyId)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError(`Workflow template "${slug}" not found`);
  return toWorkflowTemplate(data);
}

async function loadTemplateById(templateId: string): Promise<WorkflowTemplate> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workflow_templates")
    .select(WORKFLOW_TEMPLATE_COLUMNS)
    .eq("id", templateId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError("Workflow template not found");
  return toWorkflowTemplate(data);
}

async function loadTemplateSteps(templateId: string): Promise<WorkflowTemplateStep[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workflow_template_steps")
    .select(WORKFLOW_TEMPLATE_STEP_COLUMNS)
    .eq("template_id", templateId)
    .order("step_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toWorkflowTemplateStep);
}

async function resolveDepartmentIdByName(
  companyId: string,
  name: string
): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("departments")
    .select("id")
    .eq("company_id", companyId)
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function generateStepEntity(
  profile: Profile,
  instance: WorkflowInstance,
  step: WorkflowTemplateStep
): Promise<{ generatedTaskId: string | null; generatedApprovalId: string | null }> {
  const supabase = createSupabaseAdminClient();

  if (step.stepType === "task") {
    let assigneeId: string | null = null;
    let departmentId: string | null = null;

    if (step.responsibleDepartmentName) {
      departmentId = await resolveDepartmentIdByName(
        instance.companyId,
        step.responsibleDepartmentName
      );
    } else if (step.responsibleRole) {
      const assignee = await findEarliestProfileByRole(instance.companyId, step.responsibleRole);
      if (!assignee) {
        throw new UnprocessableRequestError(
          `No profile with role "${step.responsibleRole}" found in company ${instance.companyId} for workflow step "${step.title}"`
        );
      }
      assigneeId = assignee.id;
    }

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        company_id: instance.companyId,
        title: step.title,
        description: step.description,
        status: "todo",
        creator_id: profile.id,
        assignee_id: assigneeId,
        department_id: departmentId,
        related_workflow_instance_id: instance.id,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { generatedTaskId: data.id, generatedApprovalId: null };
  }

  if (!step.responsibleRole) {
    throw new UnprocessableRequestError(
      `Approval step "${step.title}" has no responsible role configured`
    );
  }
  if (!instance.relatedRequestId) {
    throw new UnprocessableRequestError(
      `Approval step "${step.title}" requires a workflow instance linked to a request`
    );
  }

  const approver = await findEarliestProfileByRole(instance.companyId, step.responsibleRole);
  if (!approver) {
    throw new UnprocessableRequestError(
      `No profile with role "${step.responsibleRole}" found in company ${instance.companyId} for workflow step "${step.title}"`
    );
  }

  const { data, error } = await supabase
    .from("approvals")
    .insert({ request_id: instance.relatedRequestId, approver_id: approver.id, status: "pending" })
    .select("id")
    .single();
  if (error) throw error;

  await createNotification(
    approver.id,
    "request",
    instance.relatedRequestId,
    "approval_required",
    `"${step.title}" requires your approval`
  );

  return { generatedTaskId: null, generatedApprovalId: data.id };
}

export async function startWorkflow(
  profile: Profile,
  templateSlug: string,
  context: { requestId?: string }
): Promise<WorkflowInstance> {
  const template = await loadTemplateBySlug(profile.companyId, templateSlug);
  const templateSteps = await loadTemplateSteps(template.id);
  if (templateSteps.length === 0) {
    throw new UnprocessableRequestError(`Workflow template "${templateSlug}" has no steps`);
  }

  const supabase = createSupabaseAdminClient();
  const { data: instanceRow, error: instanceError } = await supabase
    .from("workflow_instances")
    .insert({
      company_id: profile.companyId,
      template_id: template.id,
      related_request_id: context.requestId ?? null,
      status: "in_progress",
    })
    .select(WORKFLOW_INSTANCE_COLUMNS)
    .single();
  if (instanceError) throw instanceError;
  const instance = toWorkflowInstance(instanceRow);

  const { error: stepsError } = await supabase.from("workflow_instance_steps").insert(
    templateSteps.map((step) => ({
      instance_id: instance.id,
      template_step_id: step.id,
      step_order: step.stepOrder,
      status: "pending",
    }))
  );
  if (stepsError) throw stepsError;

  const firstStep = templateSteps[0];
  const generated = await generateStepEntity(profile, instance, firstStep);
  const { error: firstStepUpdateError } = await supabase
    .from("workflow_instance_steps")
    .update({
      status: "in_progress",
      generated_task_id: generated.generatedTaskId,
      generated_approval_id: generated.generatedApprovalId,
    })
    .eq("instance_id", instance.id)
    .eq("step_order", firstStep.stepOrder);
  if (firstStepUpdateError) throw firstStepUpdateError;

  if (context.requestId) {
    const { error: requestUpdateError } = await supabase
      .from("requests")
      .update({ status: "in_progress" })
      .eq("id", context.requestId);
    if (requestUpdateError) throw requestUpdateError;

    await logActivity(
      "request",
      context.requestId,
      profile.id,
      `Workflow "${template.name}" started`
    );
  }

  try {
    await broadcastChange(profile.companyId, "workflows", { type: "workflow_started" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }

  return instance;
}
