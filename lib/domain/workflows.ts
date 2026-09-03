import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { findEarliestProfileByRole, type Profile } from "@/lib/domain/profiles";
import { logActivity } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import { createNotification } from "@/lib/domain/notifications";
import { NotFoundError, UnprocessableRequestError, ForbiddenError } from "@/lib/domain/errors";
import type { RequestCategory } from "@/lib/domain/request-status";
import type { Role } from "@/lib/validation/auth";
import { loadRequestOrThrow } from "@/lib/domain/requests";
import { canViewWorkflowInstance } from "@/lib/domain/permissions";

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

  // Generate the first step's entity BEFORE the workflow_instance_steps rows exist.
  // A task-type step's generated task references instance.id via a real FK
  // (tasks.related_workflow_instance_id), so the instance row must already exist —
  // but if generation fails (e.g. no profile with the step's required role), we must
  // not leave a workflow instance stranded with zero in_progress steps (advanceWorkflow
  // would then find nothing to advance and silently no-op forever). Since no steps have
  // been inserted yet at this point, deleting the instance row on failure is a clean,
  // single-row rollback with no orphaned children.
  const firstStep = templateSteps[0];
  let generated: { generatedTaskId: string | null; generatedApprovalId: string | null };
  try {
    generated = await generateStepEntity(profile, instance, firstStep);
  } catch (generateError) {
    await supabase.from("workflow_instances").delete().eq("id", instance.id);
    throw generateError;
  }

  const { error: stepsError } = await supabase.from("workflow_instance_steps").insert(
    templateSteps.map((step) => ({
      instance_id: instance.id,
      template_step_id: step.id,
      step_order: step.stepOrder,
      status: step.stepOrder === firstStep.stepOrder ? "in_progress" : "pending",
      generated_task_id:
        step.stepOrder === firstStep.stepOrder ? generated.generatedTaskId : null,
      generated_approval_id:
        step.stepOrder === firstStep.stepOrder ? generated.generatedApprovalId : null,
    }))
  );
  if (stepsError) throw stepsError;

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

async function loadInstanceOrThrow(instanceId: string): Promise<WorkflowInstance> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workflow_instances")
    .select(WORKFLOW_INSTANCE_COLUMNS)
    .eq("id", instanceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFoundError("Workflow instance not found");
  return toWorkflowInstance(data);
}

async function loadInstanceSteps(instanceId: string): Promise<WorkflowInstanceStep[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workflow_instance_steps")
    .select(WORKFLOW_INSTANCE_STEP_COLUMNS)
    .eq("instance_id", instanceId)
    .order("step_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toWorkflowInstanceStep);
}

async function loadApproverIdForRequest(requestId: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("approvals")
    .select("approver_id")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.approver_id ?? null;
}

export async function getWorkflowInstanceForRequest(
  requestId: string
): Promise<WorkflowInstance | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workflow_instances")
    .select(WORKFLOW_INSTANCE_COLUMNS)
    .eq("related_request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toWorkflowInstance(data);
}

export async function findWorkflowStepByApprovalId(
  approvalId: string
): Promise<WorkflowInstanceStep | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workflow_instance_steps")
    .select(WORKFLOW_INSTANCE_STEP_COLUMNS)
    .eq("generated_approval_id", approvalId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toWorkflowInstanceStep(data);
}

export async function findWorkflowTemplateByTriggerCategory(
  companyId: string,
  category: RequestCategory
): Promise<WorkflowTemplate | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("workflow_templates")
    .select(WORKFLOW_TEMPLATE_COLUMNS)
    .eq("company_id", companyId)
    .eq("trigger_category", category)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toWorkflowTemplate(data);
}

export async function advanceWorkflow(profile: Profile, instanceId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const instance = await loadInstanceOrThrow(instanceId);
  if (instance.status !== "in_progress") return;

  const { data: currentStepRow, error: currentStepError } = await supabase
    .from("workflow_instance_steps")
    .select("id, step_order")
    .eq("instance_id", instanceId)
    .eq("status", "in_progress")
    .maybeSingle();
  if (currentStepError) throw currentStepError;
  if (!currentStepRow) return;

  const { error: completeCurrentError } = await supabase
    .from("workflow_instance_steps")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", currentStepRow.id);
  if (completeCurrentError) throw completeCurrentError;

  const { data: nextTemplateStepRow, error: nextTemplateStepError } = await supabase
    .from("workflow_template_steps")
    .select(WORKFLOW_TEMPLATE_STEP_COLUMNS)
    .eq("template_id", instance.templateId)
    .eq("step_order", currentStepRow.step_order + 1)
    .maybeSingle();
  if (nextTemplateStepError) throw nextTemplateStepError;

  if (nextTemplateStepRow) {
    const nextStep = toWorkflowTemplateStep(nextTemplateStepRow);
    const generated = await generateStepEntity(profile, instance, nextStep);
    const { error: nextStepUpdateError } = await supabase
      .from("workflow_instance_steps")
      .update({
        status: "in_progress",
        generated_task_id: generated.generatedTaskId,
        generated_approval_id: generated.generatedApprovalId,
      })
      .eq("instance_id", instanceId)
      .eq("step_order", nextStep.stepOrder);
    if (nextStepUpdateError) throw nextStepUpdateError;
  } else {
    const { error: completeInstanceError } = await supabase
      .from("workflow_instances")
      .update({ status: "completed" })
      .eq("id", instanceId);
    if (completeInstanceError) throw completeInstanceError;

    if (instance.relatedRequestId) {
      const { error: requestUpdateError } = await supabase
        .from("requests")
        .update({ status: "completed" })
        .eq("id", instance.relatedRequestId);
      if (requestUpdateError) throw requestUpdateError;

      const template = await loadTemplateById(instance.templateId);
      await logActivity(
        "request",
        instance.relatedRequestId,
        profile.id,
        `Workflow "${template.name}" completed`
      );
    }
  }

  try {
    await broadcastChange(instance.companyId, "workflows", { type: "workflow_updated" });
  } catch (broadcastError) {
    console.error("broadcastChange failed:", broadcastError);
  }
}

export interface WorkflowProgressStep extends WorkflowInstanceStep {
  title: string;
  description: string | null;
  stepType: "task" | "approval";
  responsibleRole: Role | null;
  responsibleDepartmentName: string | null;
}

export interface WorkflowProgress {
  instance: WorkflowInstance;
  steps: WorkflowProgressStep[];
}

export async function getWorkflowProgress(
  profile: Profile,
  instanceId: string
): Promise<WorkflowProgress> {
  const instance = await loadInstanceOrThrow(instanceId);

  if (instance.relatedRequestId) {
    const request = await loadRequestOrThrow(instance.relatedRequestId);
    const approverId = await loadApproverIdForRequest(instance.relatedRequestId);
    if (!canViewWorkflowInstance(profile, instance, request, approverId)) {
      throw new ForbiddenError("You cannot view this workflow instance");
    }
  } else if (!canViewWorkflowInstance(profile, instance, null, null)) {
    throw new ForbiddenError("You cannot view this workflow instance");
  }

  const [instanceSteps, templateSteps] = await Promise.all([
    loadInstanceSteps(instanceId),
    loadTemplateSteps(instance.templateId),
  ]);
  const templateStepsById = new Map(templateSteps.map((step) => [step.id, step]));

  const steps: WorkflowProgressStep[] = instanceSteps.map((instanceStep) => {
    const templateStep = templateStepsById.get(instanceStep.templateStepId);
    if (!templateStep) {
      throw new NotFoundError(`Template step ${instanceStep.templateStepId} not found`);
    }
    return {
      ...instanceStep,
      title: templateStep.title,
      description: templateStep.description,
      stepType: templateStep.stepType,
      responsibleRole: templateStep.responsibleRole,
      responsibleDepartmentName: templateStep.responsibleDepartmentName,
    };
  });

  return { instance, steps };
}
