import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createProfile } from "@/lib/domain/profiles";
import type { Profile } from "@/lib/domain/profiles";
import { assignTask, createTask, deleteTask, getTask, listTasks, updateTaskStatus } from "@/lib/domain/tasks";
import { ForbiddenError, InvalidTransitionError, NotFoundError } from "@/lib/domain/errors";

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)(
  "createTask / getTask / listTasks",
  () => {
    const supabase = createSupabaseAdminClient();
    let companyId: string;
    let departmentAId: string;
    let departmentBId: string;
    const createdAuthUserIds: string[] = [];
    let employee: Profile;
    let managerA: Profile;
    let opsManager: Profile;

    beforeAll(async () => {
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .upsert({ name: "Test Co (tasks)", slug: "test-co-tasks" }, { onConflict: "slug" })
        .select("id")
        .single();
      if (companyError) throw companyError;
      companyId = company.id;

      const { data: departments, error: departmentsError } = await supabase
        .from("departments")
        .upsert(
          [
            { company_id: companyId, name: "Dept A (tasks test)" },
            { company_id: companyId, name: "Dept B (tasks test)" },
          ],
          { onConflict: "company_id,name" }
        )
        .select("id, name");
      if (departmentsError) throw departmentsError;
      departmentAId = departments.find((d) => d.name === "Dept A (tasks test)")!.id;
      departmentBId = departments.find((d) => d.name === "Dept B (tasks test)")!.id;

      async function createTestProfile(fullName: string, role: Profile["role"], departmentId: string | null) {
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email: `tasks-test-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
        if (authError || !authUser.user) throw authError;
        createdAuthUserIds.push(authUser.user.id);
        return createProfile({
          authUserId: authUser.user.id,
          companyId,
          fullName,
          role,
          departmentId,
        });
      }

      employee = await createTestProfile("Employee A", "employee", departmentAId);
      managerA = await createTestProfile("Manager A", "manager", departmentAId);
      opsManager = await createTestProfile("Ops Manager", "operations_manager", null);
    });

    afterAll(async () => {
      await supabase.from("tasks").delete().eq("company_id", companyId);
      await supabase.from("profiles").delete().in("auth_user_id", createdAuthUserIds);
      for (const id of createdAuthUserIds) {
        await supabase.auth.admin.deleteUser(id);
      }
      await supabase.from("companies").delete().eq("slug", "test-co-tasks");
    });

    it("creates a task with the creator and company set, and defaults", async () => {
      const task = await createTask(employee, { title: "Prepare laptop" });
      expect(task.creatorId).toBe(employee.id);
      expect(task.companyId).toBe(companyId);
      expect(task.status).toBe("todo");
      expect(task.priority).toBe("medium");
      expect(task.assigneeId).toBeNull();
    });

    it("lets the creator and the assignee view the task, but not an unrelated employee", async () => {
      const task = await createTask(employee, {
        title: "Assigned task",
        assigneeId: employee.id,
      });

      await expect(getTask(employee, task.id)).resolves.toMatchObject({ id: task.id });

      const stranger = await (async () => {
        const { data: authUser, error } = await supabase.auth.admin.createUser({
          email: `tasks-test-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
        if (error || !authUser.user) throw error;
        createdAuthUserIds.push(authUser.user.id);
        return createProfile({
          authUserId: authUser.user.id,
          companyId,
          fullName: "Stranger",
          role: "employee",
          departmentId: departmentBId,
        });
      })();

      await expect(getTask(stranger, task.id)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("lets a manager view tasks in their department but not another department's", async () => {
      const inDept = await createTask(employee, {
        title: "Dept A task",
        departmentId: departmentAId,
      });
      const outOfDept = await createTask(employee, {
        title: "Dept B task",
        departmentId: departmentBId,
      });

      await expect(getTask(managerA, inDept.id)).resolves.toMatchObject({ id: inDept.id });
      await expect(getTask(managerA, outOfDept.id)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("lets an operations_manager view any task in the company", async () => {
      const task = await createTask(employee, { title: "Any task" });
      await expect(getTask(opsManager, task.id)).resolves.toMatchObject({ id: task.id });
    });

    it("scopes listTasks to what each role is allowed to see", async () => {
      await supabase.from("tasks").delete().eq("company_id", companyId);

      const own = await createTask(employee, { title: "Employee's own task" });
      await createTask(managerA, { title: "Unrelated task", departmentId: departmentBId });

      const employeeTasks = await listTasks(employee, {});
      expect(employeeTasks.map((t) => t.id)).toEqual([own.id]);

      const opsManagerTasks = await listTasks(opsManager, {});
      expect(opsManagerTasks.length).toBe(2);
    });

    it("moves a task through a valid transition and sets completedAt on completion", async () => {
      const task = await createTask(employee, {
        title: "Status test",
        assigneeId: employee.id,
      });

      const inProgress = await updateTaskStatus(employee, task.id, "in_progress");
      expect(inProgress.status).toBe("in_progress");
      expect(inProgress.completedAt).toBeNull();

      const completed = await updateTaskStatus(employee, task.id, "completed");
      expect(completed.status).toBe("completed");
      expect(completed.completedAt).not.toBeNull();
    });

    it("rejects an invalid transition", async () => {
      const task = await createTask(employee, { title: "Invalid transition test" });
      await expect(updateTaskStatus(employee, task.id, "completed")).rejects.toBeInstanceOf(
        InvalidTransitionError
      );
    });

    // Note (ruled on during execution, 2026-08-27): the positive case below uses
    // `employee` (the task's creator), not `managerA`, as the authorized actor.
    // `canChangeTaskStatus` (Task 10) has no department-manager branch — only
    // assignee, creator, assignee's manager, and elevated roles can change status —
    // so managerA has no relationship to an unassigned, department-less task
    // created by someone else and would correctly be denied too. The creator is
    // the correct, unambiguous positive case for this test.
    it("denies a status change from an unrelated employee", async () => {
      const task = await createTask(employee, { title: "Unauthorized status change" });
      await expect(updateTaskStatus(employee, task.id, "in_progress")).resolves.toBeDefined();

      const stranger = await (async () => {
        const { data: authUser, error } = await supabase.auth.admin.createUser({
          email: `tasks-test-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
        if (error || !authUser.user) throw error;
        createdAuthUserIds.push(authUser.user.id);
        return createProfile({
          authUserId: authUser.user.id,
          companyId,
          fullName: "Stranger 2",
          role: "employee",
          departmentId: departmentBId,
        });
      })();

      const other = await createTask(employee, { title: "Another task" });
      await expect(updateTaskStatus(stranger, other.id, "in_progress")).rejects.toBeInstanceOf(
        ForbiddenError
      );
    });

    it("lets the creator assign a task, and lets the assignee self-claim it", async () => {
      const task = await createTask(employee, { title: "Assignment test" });
      const assigned = await assignTask(employee, task.id, managerA.id);
      expect(assigned.assigneeId).toBe(managerA.id);

      const unassigned = await createTask(employee, { title: "Self-claim test" });
      const selfClaimed = await assignTask(managerA, unassigned.id, managerA.id);
      expect(selfClaimed.assigneeId).toBe(managerA.id);
    });

    // Note (ruled on during execution, 2026-08-27): the target below is `managerA.id`,
    // not `stranger.id`. `canAssignTask` (Task 10) always allows self-claim
    // (`profile.id === targetAssignee.id`) by design — an unrelated employee assigning
    // a task to *themselves* is intentionally permitted, so that scenario can't be used
    // to test denial. Assigning to a third party unrelated to both the caller and the
    // task is the correct denial case.
    it("denies assignment from an unrelated employee", async () => {
      const task = await createTask(employee, { title: "Denied assignment test" });
      const stranger = await (async () => {
        const { data: authUser, error } = await supabase.auth.admin.createUser({
          email: `tasks-test-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
        if (error || !authUser.user) throw error;
        createdAuthUserIds.push(authUser.user.id);
        return createProfile({
          authUserId: authUser.user.id,
          companyId,
          fullName: "Stranger 3",
          role: "employee",
          departmentId: departmentBId,
        });
      })();

      await expect(assignTask(stranger, task.id, managerA.id)).rejects.toBeInstanceOf(
        ForbiddenError
      );
    });

    it("lets the creator delete a task, but denies an unrelated employee", async () => {
      const task = await createTask(employee, { title: "Delete test" });
      const stranger = await (async () => {
        const { data: authUser, error } = await supabase.auth.admin.createUser({
          email: `tasks-test-${crypto.randomUUID()}@example.com`,
          password: "password123",
          email_confirm: true,
        });
        if (error || !authUser.user) throw error;
        createdAuthUserIds.push(authUser.user.id);
        return createProfile({
          authUserId: authUser.user.id,
          companyId,
          fullName: "Stranger 4",
          role: "employee",
          departmentId: departmentBId,
        });
      })();

      await expect(deleteTask(stranger, task.id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(deleteTask(employee, task.id)).resolves.toBeUndefined();
      await expect(getTask(opsManager, task.id)).rejects.toBeInstanceOf(NotFoundError);
    });
  }
);
