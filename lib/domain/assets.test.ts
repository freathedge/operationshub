import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile, type Profile } from "@/lib/domain/profiles";
import { createRequest } from "@/lib/domain/requests";
import { startWorkflow } from "@/lib/domain/workflows";
import { updateTaskStatus } from "@/lib/domain/tasks";
import {
  assignAsset,
  changeAssetStatus,
  completeAssetAssignmentTask,
  createAsset,
  getAsset,
  listAssets,
  setAssetOperation,
} from "@/lib/domain/assets";
import { ForbiddenError, NotFoundError, UnprocessableRequestError } from "@/lib/domain/errors";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("assets", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  const createdAuthUserIds: string[] = [];
  let itProfile: Profile;
  let employeeProfile: Profile;
  let operationId: string;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (assets)", slug: "test-co-assets" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: itAuthUser, error: itAuthError } = await supabase.auth.admin.createUser({
      email: `assets-test-it-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (itAuthError || !itAuthUser.user) throw itAuthError;
    createdAuthUserIds.push(itAuthUser.user.id);
    itProfile = await createProfile({ authUserId: itAuthUser.user.id, companyId, fullName: "IT Person", role: "it" });

    const { data: employeeAuthUser, error: employeeAuthError } = await supabase.auth.admin.createUser({
      email: `assets-test-employee-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (employeeAuthError || !employeeAuthUser.user) throw employeeAuthError;
    createdAuthUserIds.push(employeeAuthUser.user.id);
    employeeProfile = await createProfile({
      authUserId: employeeAuthUser.user.id,
      companyId,
      fullName: "Regular Employee",
      role: "employee",
    });

    const { data: operation, error: operationError } = await supabase
      .from("operations")
      .insert({ company_id: companyId, title: "Test Operation (assets)", owner_id: itProfile.id })
      .select("id")
      .single();
    if (operationError) throw operationError;
    operationId = operation.id;
  });

  afterAll(async () => {
    await supabase.from("assets").delete().eq("company_id", companyId);
    await supabase.from("operations").delete().eq("id", operationId);
    await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
    for (const id of createdAuthUserIds) {
      await supabase.auth.admin.deleteUser(id);
    }
    await supabase.from("companies").delete().eq("slug", "test-co-assets");
  });

  it("rejects asset creation from a non-asset-manager role", async () => {
    await expect(
      createAsset(employeeProfile, { name: "Rejected Laptop", category: "laptop" })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("creates an asset with a sequential asset code", async () => {
    const first = await createAsset(itProfile, { name: "Laptop One", category: "laptop" });
    const second = await createAsset(itProfile, { name: "Laptop Two", category: "laptop" });

    expect(first.assetCode).toMatch(/^AST-\d{5}$/);
    expect(second.assetCode).not.toBe(first.assetCode);
    expect(first.status).toBe("available");
  });

  it("gets and lists assets, filtered by category", async () => {
    await createAsset(itProfile, { name: "Standing Desk", category: "furniture" });

    const fetched = await getAsset(itProfile, (await listAssets(itProfile, { category: "furniture" }))[0].id);
    expect(fetched.category).toBe("furniture");

    const laptops = await listAssets(itProfile, { category: "laptop" });
    expect(laptops.every((a) => a.category === "laptop")).toBe(true);
    expect(laptops.length).toBeGreaterThanOrEqual(2);
  });

  it("throws NotFoundError for an unknown asset id", async () => {
    await expect(getAsset(itProfile, crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("assigns an asset to an employee, setting status to assigned", async () => {
    const asset = await createAsset(itProfile, { name: "Assignable Laptop", category: "laptop" });
    const assigned = await assignAsset(itProfile, asset.id, employeeProfile.id);
    expect(assigned.assignedTo).toBe(employeeProfile.id);
    expect(assigned.status).toBe("assigned");
  });

  it("changes an asset's status", async () => {
    const asset = await createAsset(itProfile, { name: "Broken Laptop", category: "laptop" });
    const updated = await changeAssetStatus(itProfile, asset.id, "maintenance");
    expect(updated.status).toBe("maintenance");
  });

  it("sets and clears an asset's related operation", async () => {
    const asset = await createAsset(itProfile, { name: "Linkable Laptop", category: "laptop" });
    expect(asset.relatedOperationId).toBeNull();

    const linked = await setAssetOperation(asset.id, operationId);
    expect(linked.relatedOperationId).toBe(operationId);

    const unlinked = await setAssetOperation(asset.id, null);
    expect(unlinked.relatedOperationId).toBeNull();
  });
});

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("completeAssetAssignmentTask", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  let departmentId: string;
  const createdAuthUserIds: string[] = [];
  let itProfile: Profile;
  let requesterProfile: Profile;
  let request: { id: string; createdBy: string | null; departmentId: string | null };

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert(
        { name: "Test Co (complete-asset)", slug: "test-co-complete-asset" },
        { onConflict: "slug" }
      )
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: department, error: departmentError } = await supabase
      .from("departments")
      .upsert(
        { company_id: companyId, name: "IT (complete-asset)" },
        { onConflict: "company_id,name" }
      )
      .select("id")
      .single();
    if (departmentError) throw departmentError;
    departmentId = department.id;

    const { data: itAuthUser, error: itAuthError } = await supabase.auth.admin.createUser({
      email: `complete-asset-it-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (itAuthError || !itAuthUser.user) throw itAuthError;
    createdAuthUserIds.push(itAuthUser.user.id);
    itProfile = await createProfile({
      authUserId: itAuthUser.user.id,
      companyId,
      fullName: "IT Person (complete-asset)",
      role: "it",
      departmentId,
    });

    const { data: requesterAuthUser, error: requesterAuthError } = await supabase.auth.admin.createUser({
      email: `complete-asset-requester-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (requesterAuthError || !requesterAuthUser.user) throw requesterAuthError;
    createdAuthUserIds.push(requesterAuthUser.user.id);
    requesterProfile = await createProfile({
      authUserId: requesterAuthUser.user.id,
      companyId,
      fullName: "Requester (complete-asset)",
      role: "employee",
    });

    const createdRequest = await createRequest(requesterProfile, {
      title: "New laptop",
      category: "equipment",
    });
    request = createdRequest;

    const { data: template, error: templateError } = await supabase
      .from("workflow_templates")
      .insert({ company_id: companyId, slug: "asset-assignment-test", name: "Asset Assignment Test" })
      .select("id")
      .single();
    if (templateError) throw templateError;

    const { error: stepError } = await supabase.from("workflow_template_steps").insert({
      template_id: template.id,
      step_order: 1,
      step_type: "task",
      title: "Asset Assigned",
      responsible_department_name: "IT (complete-asset)",
      creates_asset: true,
    });
    if (stepError) throw stepError;
  });

  afterAll(async () => {
    // workflow_instance_steps.generated_task_id -> tasks and tasks.related_workflow_instance_id
    // -> workflow_instances have no ON DELETE CASCADE, and workflow_instances.template_id ->
    // workflow_templates has none either, so those three must be torn down explicitly and in
    // this order before the company delete's cascade can remove everything else (assets,
    // requests, profiles, workflow_templates, departments, locations all have company_id with
    // ON DELETE CASCADE).
    const { data: instances, error: instancesFetchError } = await supabase
      .from("workflow_instances")
      .select("id")
      .eq("company_id", companyId);
    if (instancesFetchError) throw instancesFetchError;

    const instanceIds = (instances ?? []).map((instance) => instance.id);
    if (instanceIds.length > 0) {
      const { error: stepsDeleteError } = await supabase
        .from("workflow_instance_steps")
        .delete()
        .in("instance_id", instanceIds);
      if (stepsDeleteError) throw stepsDeleteError;
    }

    const { error: tasksDeleteError } = await supabase
      .from("tasks")
      .delete()
      .eq("company_id", companyId);
    if (tasksDeleteError) throw tasksDeleteError;

    const { error: instancesDeleteError } = await supabase
      .from("workflow_instances")
      .delete()
      .eq("company_id", companyId);
    if (instancesDeleteError) throw instancesDeleteError;

    const { error: companyDeleteError } = await supabase
      .from("companies")
      .delete()
      .eq("slug", "test-co-complete-asset");
    if (companyDeleteError) throw companyDeleteError;

    for (const id of createdAuthUserIds) {
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(id);
      if (authDeleteError) throw authDeleteError;
    }
  });

  it("throws UnprocessableRequestError for a task that isn't an asset-creating step", async () => {
    const { data: plainTask, error: plainTaskError } = await supabase
      .from("tasks")
      .insert({ company_id: companyId, title: "Plain task", status: "todo", creator_id: itProfile.id })
      .select("id")
      .single();
    if (plainTaskError) throw plainTaskError;

    await expect(
      completeAssetAssignmentTask(itProfile, plainTask.id, { name: "N/A", category: "n/a" })
    ).rejects.toBeInstanceOf(UnprocessableRequestError);
  });

  it("creates and assigns the asset, completes the task, and advances the workflow to completed", async () => {
    const instance = await startWorkflow(itProfile, "asset-assignment-test", {
      requestId: request.id,
    });
    const { data: stepRow, error: stepRowError } = await supabase
      .from("workflow_instance_steps")
      .select("generated_task_id")
      .eq("instance_id", instance.id)
      .eq("step_order", 1)
      .single();
    if (stepRowError) throw stepRowError;
    const taskId = stepRow.generated_task_id as string;

    await updateTaskStatus(itProfile, taskId, "in_progress");

    const { task, asset } = await completeAssetAssignmentTask(itProfile, taskId, {
      name: "New Laptop",
      category: "laptop",
    });

    expect(task.status).toBe("completed");
    expect(asset.assignedTo).toBe(requesterProfile.id);
    expect(asset.status).toBe("assigned");
    expect(asset.departmentId).toBe(request.departmentId);

    const { data: updatedInstance, error: updatedInstanceError } = await supabase
      .from("workflow_instances")
      .select("status")
      .eq("id", instance.id)
      .single();
    if (updatedInstanceError) throw updatedInstanceError;
    expect(updatedInstance.status).toBe("completed");
  });

  it("rejects a caller who cannot complete the task, without creating an asset", async () => {
    const instance = await startWorkflow(itProfile, "asset-assignment-test", {
      requestId: request.id,
    });
    const { data: stepRow, error: stepRowError } = await supabase
      .from("workflow_instance_steps")
      .select("generated_task_id")
      .eq("instance_id", instance.id)
      .eq("step_order", 1)
      .single();
    if (stepRowError) throw stepRowError;
    const taskId = stepRow.generated_task_id as string;
    await updateTaskStatus(itProfile, taskId, "in_progress");

    const { count: assetCountBefore } = await supabase
      .from("assets")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);

    await expect(
      completeAssetAssignmentTask(requesterProfile, taskId, { name: "Should Not Exist", category: "laptop" })
    ).rejects.toBeInstanceOf(ForbiddenError);

    const { count: assetCountAfter } = await supabase
      .from("assets")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);
    expect(assetCountAfter).toBe(assetCountBefore);
  });
});
