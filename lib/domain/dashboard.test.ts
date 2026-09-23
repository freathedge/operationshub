import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile, type Profile } from "@/lib/domain/profiles";
import { getCompanyOverview, getPersonalOverview } from "@/lib/domain/dashboard";
import { ForbiddenError } from "@/lib/domain/errors";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("getPersonalOverview", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  let otherCompanyId: string;
  const createdAuthUserIds: string[] = [];
  let me: Profile;
  let coworker: Profile;
  // Populated by the "counts each distinct active workflow" test; torn down in afterAll
  // since workflow_instance_steps.generated_task_id has no ON DELETE cascade from tasks.
  const workflowInstanceIdsToCleanUp: string[] = [];
  const workflowTemplateIdsToCleanUp: string[] = [];
  // Populated by the "recentActivity never includes another company's activity" test: its
  // actor_id: null row isn't covered by the actor_id-based activity_log cleanup below.
  let orphanedActivityEntityId: string | null = null;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert({ name: "Test Co (dashboard)", slug: "test-co-dashboard" }, { onConflict: "slug" })
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: otherCompany, error: otherCompanyError } = await supabase
      .from("companies")
      .upsert(
        { name: "Test Co (dashboard, other)", slug: "test-co-dashboard-other" },
        { onConflict: "slug" }
      )
      .select("id")
      .single();
    if (otherCompanyError) throw otherCompanyError;
    otherCompanyId = otherCompany.id;

    const { data: meAuthUser, error: meAuthError } = await supabase.auth.admin.createUser({
      email: `dashboard-test-me-${crypto.randomUUID()}@example.com`,
      password: "password123",
      email_confirm: true,
    });
    if (meAuthError || !meAuthUser.user) throw meAuthError;
    createdAuthUserIds.push(meAuthUser.user.id);
    me = await createProfile({
      authUserId: meAuthUser.user.id,
      companyId,
      fullName: "Me",
      role: "employee",
    });

    const { data: coworkerAuthUser, error: coworkerAuthError } =
      await supabase.auth.admin.createUser({
        email: `dashboard-test-coworker-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
    if (coworkerAuthError || !coworkerAuthUser.user) throw coworkerAuthError;
    createdAuthUserIds.push(coworkerAuthUser.user.id);
    coworker = await createProfile({
      authUserId: coworkerAuthUser.user.id,
      companyId,
      fullName: "Coworker",
      role: "employee",
    });
  });

  afterAll(async () => {
    // workflow_instance_steps.generated_task_id/instance_id have no ON DELETE cascade, so
    // these must go before the tasks delete below or they'd leave orphaned rows.
    if (workflowInstanceIdsToCleanUp.length > 0) {
      const { error: stepsDeleteError } = await supabase
        .from("workflow_instance_steps")
        .delete()
        .in("instance_id", workflowInstanceIdsToCleanUp);
      if (stepsDeleteError) throw stepsDeleteError;

      const { error: instancesDeleteError } = await supabase
        .from("workflow_instances")
        .delete()
        .in("id", workflowInstanceIdsToCleanUp);
      if (instancesDeleteError) throw instancesDeleteError;
    }
    if (workflowTemplateIdsToCleanUp.length > 0) {
      const { error: templateStepsDeleteError } = await supabase
        .from("workflow_template_steps")
        .delete()
        .in("template_id", workflowTemplateIdsToCleanUp);
      if (templateStepsDeleteError) throw templateStepsDeleteError;

      const { error: templatesDeleteError } = await supabase
        .from("workflow_templates")
        .delete()
        .in("id", workflowTemplateIdsToCleanUp);
      if (templatesDeleteError) throw templatesDeleteError;
    }

    const { error: tasksDeleteError } = await supabase
      .from("tasks")
      .delete()
      .in("company_id", [companyId, otherCompanyId]);
    if (tasksDeleteError) throw tasksDeleteError;

    const { error: requestsDeleteError } = await supabase
      .from("requests")
      .delete()
      .in("company_id", [companyId, otherCompanyId]);
    if (requestsDeleteError) throw requestsDeleteError;

    const { error: activityDeleteError } = await supabase
      .from("activity_log")
      .delete()
      .in("actor_id", [me.id, coworker.id]);
    if (activityDeleteError) throw activityDeleteError;

    if (orphanedActivityEntityId) {
      const { error: orphanedActivityDeleteError } = await supabase
        .from("activity_log")
        .delete()
        .eq("entity_id", orphanedActivityEntityId);
      if (orphanedActivityDeleteError) throw orphanedActivityDeleteError;
    }

    const { error: profilesDeleteError } = await supabase
      .from("profiles")
      .delete()
      .in("company_id", [companyId, otherCompanyId]);
    if (profilesDeleteError) throw profilesDeleteError;

    for (const authUserId of createdAuthUserIds) {
      await supabase.auth.admin.deleteUser(authUserId);
    }
  });

  it("returns all-zero counts and empty lists for a user with no data yet", async () => {
    const overview = await getPersonalOverview(coworker);
    expect(overview.counts).toEqual({
      myOpenTasks: 0,
      pendingApprovals: 0,
      myOpenRequests: 0,
      activeWorkflows: 0,
    });
    expect(overview.myTasks).toEqual([]);
    expect(overview.upcoming).toEqual({ overdue: 0, dueToday: 0, dueThisWeek: 0 });
    expect(overview.unreadNotifications).toBe(0);
  });

  it("counts only the caller's own open tasks, not a coworker's", async () => {
    const { error: myTaskError } = await supabase.from("tasks").insert({
      company_id: companyId,
      title: "My open task",
      status: "todo",
      priority: "medium",
      assignee_id: me.id,
      creator_id: me.id,
    });
    if (myTaskError) throw myTaskError;

    const { error: coworkerTaskError } = await supabase.from("tasks").insert({
      company_id: companyId,
      title: "Coworker's open task",
      status: "todo",
      priority: "medium",
      assignee_id: coworker.id,
      creator_id: coworker.id,
    });
    if (coworkerTaskError) throw coworkerTaskError;

    const overview = await getPersonalOverview(me);
    expect(overview.counts.myOpenTasks).toBe(1);
    expect(overview.myTasks).toHaveLength(1);
    expect(overview.myTasks[0].title).toBe("My open task");
  });

  it("buckets tasks into overdue / due today / due this week by due_date", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const today = new Date().toISOString();
    const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from("tasks").insert([
      {
        company_id: companyId,
        title: "Overdue task",
        status: "todo",
        priority: "medium",
        assignee_id: me.id,
        creator_id: me.id,
        due_date: yesterday,
      },
      {
        company_id: companyId,
        title: "Due today task",
        status: "todo",
        priority: "medium",
        assignee_id: me.id,
        creator_id: me.id,
        due_date: today,
      },
      {
        company_id: companyId,
        title: "Due this week task",
        status: "todo",
        priority: "medium",
        assignee_id: me.id,
        creator_id: me.id,
        due_date: inThreeDays,
      },
    ]);
    if (error) throw error;

    const overview = await getPersonalOverview(me);
    expect(overview.upcoming.overdue).toBe(1);
    expect(overview.upcoming.dueToday).toBe(1);
    expect(overview.upcoming.dueThisWeek).toBe(1);
  });

  it("recentActivity never includes another company's activity", async () => {
    const { data: otherCompanyTask, error: otherTaskError } = await supabase
      .from("tasks")
      .insert({
        company_id: otherCompanyId,
        title: "Other company task",
        status: "todo",
        priority: "medium",
      })
      .select("id")
      .single();
    if (otherTaskError) throw otherTaskError;
    orphanedActivityEntityId = otherCompanyTask.id;

    const { error: otherActivityError } = await supabase.from("activity_log").insert({
      entity_type: "task",
      entity_id: otherCompanyTask.id,
      actor_id: null,
      message: "Activity from a different company",
    });
    if (otherActivityError) throw otherActivityError;

    const { data: myTask, error: myTaskError } = await supabase
      .from("tasks")
      .insert({
        company_id: companyId,
        title: "My company task for activity",
        status: "todo",
        priority: "medium",
        assignee_id: me.id,
        creator_id: me.id,
      })
      .select("id")
      .single();
    if (myTaskError) throw myTaskError;

    const { error: myActivityError } = await supabase.from("activity_log").insert({
      entity_type: "task",
      entity_id: myTask.id,
      actor_id: me.id,
      message: "Activity from my company",
    });
    if (myActivityError) throw myActivityError;

    const overview = await getPersonalOverview(me);
    const messages = overview.recentActivity.map((entry) => entry.message);
    expect(messages).toContain("Activity from my company");
    expect(messages).not.toContain("Activity from a different company");
  });

  it("counts only approvals pending for me, scoped to my company", async () => {
    const { data: request, error: requestError } = await supabase
      .from("requests")
      .insert({
        company_id: companyId,
        title: "Needs my approval",
        category: "general",
        status: "under_review",
        created_by: coworker.id,
      })
      .select("id")
      .single();
    if (requestError) throw requestError;

    const { error: approvalError } = await supabase.from("approvals").insert({
      request_id: request.id,
      approver_id: me.id,
      status: "pending",
    });
    if (approvalError) throw approvalError;

    const overview = await getPersonalOverview(me);
    expect(overview.counts.pendingApprovals).toBe(1);
  });

  it("counts distinct active workflow instances, not the row count (a user can have >1 open step)", async () => {
    const { data: template, error: templateError } = await supabase
      .from("workflow_templates")
      .insert({
        company_id: companyId,
        slug: "dashboard-test-active-workflows",
        name: "Dashboard Active Workflows Test",
      })
      .select("id")
      .single();
    if (templateError) throw templateError;
    workflowTemplateIdsToCleanUp.push(template.id);

    const { data: templateStep, error: templateStepError } = await supabase
      .from("workflow_template_steps")
      .insert({
        template_id: template.id,
        step_order: 1,
        step_type: "task",
        title: "Step 1",
      })
      .select("id")
      .single();
    if (templateStepError) throw templateStepError;

    for (let i = 0; i < 2; i++) {
      const { data: task, error: taskError } = await supabase
        .from("tasks")
        .insert({
          company_id: companyId,
          title: `Workflow-generated task ${i}`,
          status: "todo",
          priority: "medium",
          assignee_id: me.id,
          creator_id: me.id,
        })
        .select("id")
        .single();
      if (taskError) throw taskError;

      const { data: instance, error: instanceError } = await supabase
        .from("workflow_instances")
        .insert({ company_id: companyId, template_id: template.id, status: "in_progress" })
        .select("id")
        .single();
      if (instanceError) throw instanceError;
      workflowInstanceIdsToCleanUp.push(instance.id);

      const { error: stepError } = await supabase.from("workflow_instance_steps").insert({
        instance_id: instance.id,
        template_step_id: templateStep.id,
        step_order: 1,
        status: "in_progress",
        generated_task_id: task.id,
      });
      if (stepError) throw stepError;
    }

    const overview = await getPersonalOverview(me);
    expect(overview.counts.activeWorkflows).toBe(2);
  });

  it("upcoming counts reflect every open task with a due date, not just the 5-item display list", async () => {
    const { data: manyTasksAuthUser, error: manyTasksAuthError } =
      await supabase.auth.admin.createUser({
        email: `dashboard-test-many-tasks-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
    if (manyTasksAuthError || !manyTasksAuthUser.user) throw manyTasksAuthError;
    createdAuthUserIds.push(manyTasksAuthUser.user.id);
    const manyTasksUser = await createProfile({
      authUserId: manyTasksAuthUser.user.id,
      companyId,
      fullName: "Many Tasks User",
      role: "employee",
    });

    const dayMs = 24 * 60 * 60 * 1000;
    const overdue = (daysAgo: number) => new Date(Date.now() - daysAgo * dayMs).toISOString();
    const inDays = (days: number) => new Date(Date.now() + days * dayMs).toISOString();

    const { error } = await supabase.from("tasks").insert([
      { title: "Overdue 1", due_date: overdue(5) },
      { title: "Overdue 2", due_date: overdue(4) },
      { title: "Overdue 3", due_date: overdue(3) },
      { title: "Due today 1", due_date: new Date().toISOString() },
      { title: "Due today 2", due_date: new Date().toISOString() },
      { title: "Due this week 1", due_date: inDays(2) },
      { title: "Due this week 2", due_date: inDays(4) },
    ].map((task) => ({
      ...task,
      company_id: companyId,
      status: "todo",
      priority: "medium",
      assignee_id: manyTasksUser.id,
      creator_id: manyTasksUser.id,
    })));
    if (error) throw error;

    const overview = await getPersonalOverview(manyTasksUser);
    expect(overview.upcoming.overdue).toBe(3);
    expect(overview.upcoming.dueToday).toBe(2);
    expect(overview.upcoming.dueThisWeek).toBe(2);
    expect(overview.myTasks).toHaveLength(5); // display list stays capped
  });
});

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("getCompanyOverview", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  const createdAuthUserIds: string[] = [];
  let opsManager: Profile;
  let employee: Profile;

  beforeAll(async () => {
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .upsert(
        { name: "Test Co (company overview)", slug: "test-co-company-overview" },
        { onConflict: "slug" }
      )
      .select("id")
      .single();
    if (companyError) throw companyError;
    companyId = company.id;

    const { data: opsManagerAuthUser, error: opsManagerAuthError } =
      await supabase.auth.admin.createUser({
        email: `dashboard-test-ops-${crypto.randomUUID()}@example.com`,
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

    const { data: employeeAuthUser, error: employeeAuthError } =
      await supabase.auth.admin.createUser({
        email: `dashboard-test-employee-${crypto.randomUUID()}@example.com`,
        password: "password123",
        email_confirm: true,
      });
    if (employeeAuthError || !employeeAuthUser.user) throw employeeAuthError;
    createdAuthUserIds.push(employeeAuthUser.user.id);
    employee = await createProfile({
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

    const { error: requestsDeleteError } = await supabase
      .from("requests")
      .delete()
      .eq("company_id", companyId);
    if (requestsDeleteError) throw requestsDeleteError;

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

  it("throws ForbiddenError for every non-elevated role", async () => {
    await expect(getCompanyOverview(employee)).rejects.toThrow(ForbiddenError);
  });

  it("returns totals for an elevated role", async () => {
    const overview = await getCompanyOverview(opsManager);
    expect(overview.totals.employees).toBeGreaterThanOrEqual(2); // opsManager + employee
  });

  it("getPersonalOverview also works for an elevated role (no role check gates it)", async () => {
    const overview = await getPersonalOverview(opsManager);
    expect(overview.counts).toEqual({
      myOpenTasks: 0,
      pendingApprovals: 0,
      myOpenRequests: 0,
      activeWorkflows: 0,
    });
  });

  it("lists an operation with zero linked tasks as totalTasks: 0, not an error", async () => {
    const { data: operation, error: operationError } = await supabase
      .from("operations")
      .insert({
        company_id: companyId,
        title: "Empty operation",
        owner_id: opsManager.id,
        status: "in_progress",
        priority: "medium",
      })
      .select("id")
      .single();
    if (operationError) throw operationError;

    const overview = await getCompanyOverview(opsManager);
    const found = overview.activeOperations.find((op) => op.id === operation.id);
    expect(found).toBeDefined();
    expect(found?.totalTasks).toBe(0);
    expect(found?.completedTasks).toBe(0);
  });

  it("attention.pendingApprovals counts every pending approval in the company, not just one approver's", async () => {
    const { data: request, error: requestError } = await supabase
      .from("requests")
      .insert({
        company_id: companyId,
        title: "Company-wide pending approval",
        category: "general",
        status: "under_review",
        created_by: employee.id,
      })
      .select("id")
      .single();
    if (requestError) throw requestError;

    const { error: approvalError } = await supabase.from("approvals").insert({
      request_id: request.id,
      approver_id: opsManager.id,
      status: "pending",
    });
    if (approvalError) throw approvalError;

    const overview = await getCompanyOverview(opsManager);
    expect(overview.attention.pendingApprovals).toBeGreaterThanOrEqual(1);
  });
});
