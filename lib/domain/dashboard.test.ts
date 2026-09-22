import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile, type Profile } from "@/lib/domain/profiles";
import { getPersonalOverview } from "@/lib/domain/dashboard";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)("getPersonalOverview", () => {
  const supabase = createSupabaseAdminClient();
  let companyId: string;
  let otherCompanyId: string;
  const createdAuthUserIds: string[] = [];
  let me: Profile;
  let coworker: Profile;

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
});
