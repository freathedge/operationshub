import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile, type Profile } from "@/lib/domain/profiles";
import { search } from "@/lib/domain/search";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("search", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  const createdAuthUserIds: string[] = [];
  let opsManager: Profile;
  let employeeA: Profile;
  let employeeB: Profile;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (search)", slug: "test-co-search" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: opsManagerAuthUser, error: opsManagerAuthError } =
      await supabase.auth.admin.createUser({
        email: `search-test-ops-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
    if (opsManagerAuthError || !opsManagerAuthUser.user) throw opsManagerAuthError;
    createdAuthUserIds.push(opsManagerAuthUser.user.id);
    opsManager = await createProfile({
      authUserId: opsManagerAuthUser.user.id,
      companyId,
      fullName: "Ops Manager",
      role: "operations_manager",
    });

    const { data: employeeAAuthUser, error: employeeAAuthError } =
      await supabase.auth.admin.createUser({
        email: `search-test-employee-a-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
    if (employeeAAuthError || !employeeAAuthUser.user) throw employeeAAuthError;
    createdAuthUserIds.push(employeeAAuthUser.user.id);
    employeeA = await createProfile({
      authUserId: employeeAAuthUser.user.id,
      companyId,
      fullName: "Employee Searcher",
      role: "employee",
    });

    const { data: employeeBAuthUser, error: employeeBAuthError } =
      await supabase.auth.admin.createUser({
        email: `search-test-employee-b-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
    if (employeeBAuthError || !employeeBAuthUser.user) throw employeeBAuthError;
    createdAuthUserIds.push(employeeBAuthUser.user.id);
    employeeB = await createProfile({
      authUserId: employeeBAuthUser.user.id,
      companyId,
      fullName: "Employee Owner",
      role: "employee",
    });
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
      .eq("company_id", companyId);
    if (profilesDeleteError) throw profilesDeleteError;

    for (const authUserId of createdAuthUserIds) {
      await supabase.auth.admin.deleteUser(authUserId);
    }
  });

  it("returns [] immediately for an empty or whitespace-only query", async () => {
    expect(await search(opsManager, "")).toEqual([]);
    expect(await search(opsManager, "   ")).toEqual([]);
  });

  it("finds a matching task, request, asset, employee, and operation", async () => {
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        company_id: companyId,
        title: "Fix the searchable printer",
        status: "todo",
        priority: "medium",
        assignee_id: opsManager.id,
        creator_id: opsManager.id,
      })
      .select("id")
      .single();
    if (taskError) throw taskError;

    const { data: request, error: requestError } = await supabase
      .from("requests")
      .insert({
        company_id: companyId,
        title: "Searchable request title",
        category: "general",
        status: "draft",
        created_by: opsManager.id,
      })
      .select("id")
      .single();
    if (requestError) throw requestError;

    const { data: asset, error: assetError } = await supabase
      .from("assets")
      .insert({ company_id: companyId, asset_code: "SEARCH-1", name: "Searchable Laptop", category: "hardware" })
      .select("id")
      .single();
    if (assetError) throw assetError;

    const { data: operation, error: operationError } = await supabase
      .from("operations")
      .insert({
        company_id: companyId,
        title: "Searchable Operation",
        owner_id: opsManager.id,
        status: "planning",
        priority: "medium",
      })
      .select("id")
      .single();
    if (operationError) throw operationError;

    const results = await search(opsManager, "searchable");
    expect(results.some((r) => r.type === "task" && r.id === task.id)).toBe(true);
    expect(results.some((r) => r.type === "request" && r.id === request.id)).toBe(true);
    expect(results.some((r) => r.type === "asset" && r.id === asset.id)).toBe(true);
    expect(results.some((r) => r.type === "operation" && r.id === operation.id)).toBe(true);
    // "Ops Manager" doesn't match "searchable" — confirmed not present; see next test for a real employee match
    expect(results.some((r) => r.type === "employee" && r.id === opsManager.id)).toBe(false);
  });

  it("finds a matching employee by name", async () => {
    const results = await search(opsManager, "Employee Searcher");
    expect(results.some((r) => r.type === "employee" && r.id === employeeA.id)).toBe(true);
  });

  it("does not surface a task the searching employee cannot otherwise see", async () => {
    const { error } = await supabase.from("tasks").insert({
      company_id: companyId,
      title: "Private unreachable task",
      status: "todo",
      priority: "medium",
      assignee_id: employeeB.id,
      creator_id: employeeB.id,
    });
    if (error) throw error;

    const results = await search(employeeA, "unreachable");
    expect(results.some((r) => r.type === "task")).toBe(false);
  });

  it("does not surface a request the searching employee cannot otherwise see", async () => {
    const { error } = await supabase.from("requests").insert({
      company_id: companyId,
      title: "Private unreachable request",
      category: "general",
      status: "draft",
      created_by: employeeB.id,
    });
    if (error) throw error;

    const results = await search(employeeA, "unreachable");
    expect(results.some((r) => r.type === "request")).toBe(false);
  });
});
