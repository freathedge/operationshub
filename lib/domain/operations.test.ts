import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile, type Profile } from "@/lib/domain/profiles";
import { createTask } from "@/lib/domain/tasks";
import { createOperation, getOperation } from "@/lib/domain/operations";
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
    await supabase.from("tasks").delete().eq("company_id", companyId);
    await supabase.from("operations").delete().eq("company_id", companyId);
    await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
    for (const id of createdAuthUserIds) {
      await supabase.auth.admin.deleteUser(id);
    }
    await supabase.from("companies").delete().eq("slug", "test-co-operations");
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
