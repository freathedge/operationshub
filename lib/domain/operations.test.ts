import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile, type Profile } from "@/lib/domain/profiles";
import { createTask } from "@/lib/domain/tasks";
import { createRequest } from "@/lib/domain/requests";
import { createAsset } from "@/lib/domain/assets";
import { createOperation, getOperation, linkEntity, unlinkEntity, updateOperation, listOperations, type Operation } from "@/lib/domain/operations";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("createOperation / getOperation", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  const createdAuthUserIds: string[] = [];
  let opsManagerProfile: Profile;
  let employeeProfile: Profile;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (operations)", slug: "test-co-operations" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: opsManagerAuthUser, error: opsManagerAuthError } =
      await supabase.auth.admin.createUser({
        email: `operations-test-manager-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
    if (opsManagerAuthError || !opsManagerAuthUser.user) throw opsManagerAuthError;
    createdAuthUserIds.push(opsManagerAuthUser.user.id);
    opsManagerProfile = await createProfile({
      authUserId: opsManagerAuthUser.user.id,
      companyId,
      fullName: "Ops Manager",
      role: "operations_manager",
    });

    const { data: employeeAuthUser, error: employeeAuthError } =
      await supabase.auth.admin.createUser({
        email: `operations-test-employee-${crypto.randomUUID()}@example.com`,
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
  });

  afterAll(async () => {
    const { error: tasksDeleteError } = await supabase
      .from("tasks")
      .delete()
      .eq("company_id", companyId);
    if (tasksDeleteError) throw tasksDeleteError;

    const { error: operationsDeleteError } = await supabase
      .from("operations")
      .delete()
      .eq("company_id", companyId);
    if (operationsDeleteError) throw operationsDeleteError;

    const { error: profilesDeleteError } = await supabase
      .from("profiles")
      .delete()
      .in("auth_user_id", createdAuthUserIds);
    if (profilesDeleteError) throw profilesDeleteError;

    for (const id of createdAuthUserIds) {
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(id);
      if (authDeleteError) throw authDeleteError;
    }

    const { error: companyDeleteError } = await supabase
      .from("companies")
      .delete()
      .eq("slug", "test-co-operations");
    if (companyDeleteError) throw companyDeleteError;
  });

  it("rejects operation creation from a non-elevated role", async () => {
    await expect(
      createOperation(employeeProfile, { title: "Rejected Operation" })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("creates an operation, defaulting owner to the creator", async () => {
    const operation = await createOperation(opsManagerProfile, { title: "Vienna Office Relocation" });
    expect(operation.ownerId).toBe(opsManagerProfile.id);
    expect(operation.status).toBe("planning");
    expect(operation.priority).toBe("medium");
  });

  it("creates an operation with an explicit owner in the same company", async () => {
    const operation = await createOperation(opsManagerProfile, {
      title: "Production Line 3 Maintenance",
      ownerId: employeeProfile.id,
      priority: "high",
    });
    expect(operation.ownerId).toBe(employeeProfile.id);
    expect(operation.priority).toBe("high");
  });

  it("rejects an owner from a different company", async () => {
    const { data: otherCompany, error: otherCompanyError } = await supabase
      .from("companies")
      .upsert({ name: "Other Co", slug: "test-co-operations-other" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (otherCompanyError) throw otherCompanyError;

    const { data: otherAuthUser, error: otherAuthError } = await supabase.auth.admin.createUser({
      email: `operations-test-other-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (otherAuthError || !otherAuthUser.user) throw otherAuthError;
    const otherProfile = await createProfile({
      authUserId: otherAuthUser.user.id,
      companyId: otherCompany.id,
      fullName: "Other Company Employee",
      role: "employee",
    });

    await expect(
      createOperation(opsManagerProfile, { title: "Cross-company", ownerId: otherProfile.id })
    ).rejects.toBeInstanceOf(NotFoundError);

    await supabase.auth.admin.deleteUser(otherAuthUser.user.id);
    await supabase.from("profiles").delete().eq("id", otherProfile.id);
    await supabase.from("companies").delete().eq("id", otherCompany.id);
  });

  it("rejects a department from a different company", async () => {
    const { data: otherCompany, error: otherCompanyError } = await supabase
      .from("companies")
      .upsert({ name: "Other Co 3", slug: "test-co-operations-other-3" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (otherCompanyError) throw otherCompanyError;

    const { data: otherDepartment, error: otherDepartmentError } = await supabase
      .from("departments")
      .upsert(
        { company_id: otherCompany.id, name: "Other Dept" },
        { onConflict: "company_id,name" }
      )
      .select("id")
      .single();
    if (otherDepartmentError) throw otherDepartmentError;

    await expect(
      createOperation(opsManagerProfile, {
        title: "Cross-company department",
        departmentId: otherDepartment.id,
      })
    ).rejects.toBeInstanceOf(NotFoundError);

    await supabase.from("departments").delete().eq("id", otherDepartment.id);
    await supabase.from("companies").delete().eq("id", otherCompany.id);
  });

  it("throws NotFoundError for an unknown operation id", async () => {
    await expect(getOperation(opsManagerProfile, crypto.randomUUID())).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it("denies viewing an operation from a different company", async () => {
    const operation = await createOperation(opsManagerProfile, { title: "Visibility Test" });
    const { data: otherCompany, error: otherCompanyError } = await supabase
      .from("companies")
      .upsert({ name: "Other Co 2", slug: "test-co-operations-other-2" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (otherCompanyError) throw otherCompanyError;
    const { data: otherAuthUser, error: otherAuthError } = await supabase.auth.admin.createUser({
      email: `operations-test-other2-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (otherAuthError || !otherAuthUser.user) throw otherAuthError;
    const otherProfile = await createProfile({
      authUserId: otherAuthUser.user.id,
      companyId: otherCompany.id,
      fullName: "Other Company Employee 2",
      role: "employee",
    });

    await expect(getOperation(otherProfile, operation.id)).rejects.toBeInstanceOf(ForbiddenError);

    await supabase.auth.admin.deleteUser(otherAuthUser.user.id);
    await supabase.from("profiles").delete().eq("id", otherProfile.id);
    await supabase.from("companies").delete().eq("id", otherCompany.id);
  });

  it("computes progress from linked tasks only", async () => {
    const operation = await createOperation(opsManagerProfile, { title: "Progress Test" });
    const taskA = await createTask(opsManagerProfile, { title: "Task A" });
    const taskB = await createTask(opsManagerProfile, { title: "Task B" });
    await supabase.from("tasks").update({ related_operation_id: operation.id }).eq("id", taskA.id);
    await supabase.from("tasks").update({ related_operation_id: operation.id }).eq("id", taskB.id);
    await supabase.from("tasks").update({ status: "completed" }).eq("id", taskA.id);

    const detail = await getOperation(opsManagerProfile, operation.id);
    expect(detail.progress).toEqual({ completedTasks: 1, totalTasks: 2 });
    expect(detail.tasks).toHaveLength(2);
    expect(detail.requests).toEqual([]);
    expect(detail.assets).toEqual([]);
    expect(detail.employees).toEqual([]);
  });
});

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("updateOperation / listOperations", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  let departmentId: string;
  const createdAuthUserIds: string[] = [];
  let opsManagerProfile: Profile;
  let employeeProfile: Profile;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert(
        { name: "Test Co (operations-update)", slug: "test-co-operations-update" },
        { onConflict: "slug" }
      )
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: department, error: departmentError } = await supabase
      .from("departments")
      .upsert(
        { company_id: companyId, name: "Ops (operations-update)" },
        { onConflict: "company_id,name" }
      )
      .select("id")
      .single();
    if (departmentError) throw departmentError;
    departmentId = department.id;

    const { data: opsManagerAuthUser, error: opsManagerAuthError } =
      await supabase.auth.admin.createUser({
        email: `operations-update-manager-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
    if (opsManagerAuthError || !opsManagerAuthUser.user) throw opsManagerAuthError;
    createdAuthUserIds.push(opsManagerAuthUser.user.id);
    opsManagerProfile = await createProfile({
      authUserId: opsManagerAuthUser.user.id,
      companyId,
      fullName: "Ops Manager",
      role: "operations_manager",
    });

    const { data: employeeAuthUser, error: employeeAuthError } =
      await supabase.auth.admin.createUser({
        email: `operations-update-employee-${crypto.randomUUID()}@example.com`,
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
  });

  afterAll(async () => {
    const { error: operationsDeleteError } = await supabase
      .from("operations")
      .delete()
      .eq("company_id", companyId);
    if (operationsDeleteError) throw operationsDeleteError;

    const { error: profilesDeleteError } = await supabase
      .from("profiles")
      .delete()
      .in("auth_user_id", createdAuthUserIds);
    if (profilesDeleteError) throw profilesDeleteError;

    for (const id of createdAuthUserIds) {
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(id);
      if (authDeleteError) throw authDeleteError;
    }

    const { error: companyDeleteError } = await supabase
      .from("companies")
      .delete()
      .eq("slug", "test-co-operations-update");
    if (companyDeleteError) throw companyDeleteError;
  });

  it("rejects an update from a non-elevated role", async () => {
    const operation = await createOperation(opsManagerProfile, { title: "Reject Update Test" });
    await expect(
      updateOperation(employeeProfile, operation.id, { status: "in_progress" })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("updates status, priority, and department", async () => {
    const operation = await createOperation(opsManagerProfile, { title: "Update Test" });
    const updated = await updateOperation(opsManagerProfile, operation.id, {
      status: "in_progress",
      priority: "critical",
      departmentId,
    });
    expect(updated.status).toBe("in_progress");
    expect(updated.priority).toBe("critical");
    expect(updated.departmentId).toBe(departmentId);
  });

  it("clears a nullable field when explicitly set to null", async () => {
    const operation = await createOperation(opsManagerProfile, {
      title: "Nullable Test",
      departmentId,
    });
    const updated = await updateOperation(opsManagerProfile, operation.id, { departmentId: null });
    expect(updated.departmentId).toBeNull();
  });

  it("rejects a department from a different company", async () => {
    const operation = await createOperation(opsManagerProfile, {
      title: "Cross-company Department Update Test",
    });
    const { data: otherCompany, error: otherCompanyError } = await supabase
      .from("companies")
      .upsert(
        { name: "Other Co (operations-update)", slug: "test-co-operations-update-other" },
        { onConflict: "slug" }
      )
      .select("id")
      .single();
    if (otherCompanyError) throw otherCompanyError;

    const { data: otherDepartment, error: otherDepartmentError } = await supabase
      .from("departments")
      .upsert(
        { company_id: otherCompany.id, name: "Other Dept" },
        { onConflict: "company_id,name" }
      )
      .select("id")
      .single();
    if (otherDepartmentError) throw otherDepartmentError;

    await expect(
      updateOperation(opsManagerProfile, operation.id, { departmentId: otherDepartment.id })
    ).rejects.toBeInstanceOf(NotFoundError);

    await supabase.from("departments").delete().eq("id", otherDepartment.id);
    await supabase.from("companies").delete().eq("id", otherCompany.id);
  });

  it("lists operations filtered by status and department", async () => {
    await createOperation(opsManagerProfile, { title: "Planning Op" });
    const inProgressOp = await createOperation(opsManagerProfile, { title: "In Progress Op", departmentId });
    await updateOperation(opsManagerProfile, inProgressOp.id, { status: "in_progress" });

    const inProgress = await listOperations(opsManagerProfile, { status: "in_progress" });
    expect(inProgress.every((o) => o.status === "in_progress")).toBe(true);
    expect(inProgress.some((o) => o.id === inProgressOp.id)).toBe(true);

    const byDepartment = await listOperations(opsManagerProfile, { departmentId });
    expect(byDepartment.every((o) => o.departmentId === departmentId)).toBe(true);
  });
});

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("linkEntity / unlinkEntity", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  const createdAuthUserIds: string[] = [];
  let opsManagerProfile: Profile;
  let employeeProfile: Profile;
  let operationA: Operation;
  let operationB: Operation;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (operations-link)", slug: "test-co-operations-link" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: opsManagerAuthUser, error: opsManagerAuthError } =
      await supabase.auth.admin.createUser({
        email: `operations-link-manager-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
    if (opsManagerAuthError || !opsManagerAuthUser.user) throw opsManagerAuthError;
    createdAuthUserIds.push(opsManagerAuthUser.user.id);
    opsManagerProfile = await createProfile({
      authUserId: opsManagerAuthUser.user.id,
      companyId,
      fullName: "Ops Manager",
      role: "operations_manager",
    });

    const { data: employeeAuthUser, error: employeeAuthError } =
      await supabase.auth.admin.createUser({
        email: `operations-link-employee-${crypto.randomUUID()}@example.com`,
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

    operationA = await createOperation(opsManagerProfile, { title: "Operation A" });
    operationB = await createOperation(opsManagerProfile, { title: "Operation B" });
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

    const { error: assetsDeleteError } = await supabase
      .from("assets")
      .delete()
      .eq("company_id", companyId);
    if (assetsDeleteError) throw assetsDeleteError;

    const { error: operationsDeleteError } = await supabase
      .from("operations")
      .delete()
      .eq("company_id", companyId);
    if (operationsDeleteError) throw operationsDeleteError;

    const { error: profilesDeleteError } = await supabase
      .from("profiles")
      .delete()
      .in("auth_user_id", createdAuthUserIds);
    if (profilesDeleteError) throw profilesDeleteError;

    for (const id of createdAuthUserIds) {
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(id);
      if (authDeleteError) throw authDeleteError;
    }

    const { error: companyDeleteError } = await supabase
      .from("companies")
      .delete()
      .eq("slug", "test-co-operations-link");
    if (companyDeleteError) throw companyDeleteError;
  });

  it("rejects linking from a non-elevated role", async () => {
    const task = await createTask(opsManagerProfile, { title: "Reject Link Test" });
    await expect(
      linkEntity(employeeProfile, operationA.id, "task", task.id)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("links a task, request, asset, and employee, then unlinks each", async () => {
    const task = await createTask(opsManagerProfile, { title: "Linkable Task" });
    await linkEntity(opsManagerProfile, operationA.id, "task", task.id);
    const afterLinkTask = await getOperation(opsManagerProfile, operationA.id);
    expect(afterLinkTask.tasks.map((t) => t.id)).toContain(task.id);

    const request = await createRequest(opsManagerProfile, {
      title: "Linkable Request",
      category: "general",
    });
    await linkEntity(opsManagerProfile, operationA.id, "request", request.id);
    const afterLinkRequest = await getOperation(opsManagerProfile, operationA.id);
    expect(afterLinkRequest.requests.map((r) => r.id)).toContain(request.id);

    const asset = await createAsset(opsManagerProfile, {
      name: "Linkable Laptop",
      category: "laptop",
    });
    await linkEntity(opsManagerProfile, operationA.id, "asset", asset.id);
    const afterLinkAsset = await getOperation(opsManagerProfile, operationA.id);
    expect(afterLinkAsset.assets.map((a) => a.id)).toContain(asset.id);

    await linkEntity(opsManagerProfile, operationA.id, "employee", employeeProfile.id);
    const afterLinkEmployee = await getOperation(opsManagerProfile, operationA.id);
    expect(afterLinkEmployee.employees.map((e) => e.id)).toContain(employeeProfile.id);

    await unlinkEntity(opsManagerProfile, operationA.id, "task", task.id);
    await unlinkEntity(opsManagerProfile, operationA.id, "request", request.id);
    await unlinkEntity(opsManagerProfile, operationA.id, "asset", asset.id);
    await unlinkEntity(opsManagerProfile, operationA.id, "employee", employeeProfile.id);
    const afterUnlink = await getOperation(opsManagerProfile, operationA.id);
    expect(afterUnlink.tasks).toHaveLength(0);
    expect(afterUnlink.requests).toHaveLength(0);
    expect(afterUnlink.assets).toHaveLength(0);
    expect(afterUnlink.employees).toHaveLength(0);
  }, 15000);

  it("rejects unlinking an entity that belongs to a different operation", async () => {
    const task = await createTask(opsManagerProfile, { title: "Cross-Operation Task" });
    await linkEntity(opsManagerProfile, operationA.id, "task", task.id);

    await expect(
      unlinkEntity(opsManagerProfile, operationB.id, "task", task.id)
    ).rejects.toBeInstanceOf(NotFoundError);

    const stillLinked = await getOperation(opsManagerProfile, operationA.id);
    expect(stillLinked.tasks.map((t) => t.id)).toContain(task.id);
  });

  it("rejects linking a task from a different company", async () => {
    const { data: otherCompany, error: otherCompanyError } = await supabase
      .from("companies")
      .upsert({ name: "Other Co 3", slug: "test-co-operations-link-other" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (otherCompanyError) throw otherCompanyError;
    const { data: otherTask, error: otherTaskError } = await supabase
      .from("tasks")
      .insert({ company_id: otherCompany.id, title: "Other company task", status: "todo" })
      .select("id")
      .single();
    if (otherTaskError) throw otherTaskError;

    await expect(
      linkEntity(opsManagerProfile, operationA.id, "task", otherTask.id)
    ).rejects.toBeInstanceOf(NotFoundError);

    await supabase.from("tasks").delete().eq("id", otherTask.id);
    await supabase.from("companies").delete().eq("id", otherCompany.id);
  });
});
