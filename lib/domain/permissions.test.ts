import { describe, expect, it } from "vitest";
import {
  canAssignTask,
  canChangeTaskStatus,
  canCreateTask,
  canDeleteTask,
  canViewTask,
} from "@/lib/domain/permissions";
import type { Profile } from "@/lib/domain/profiles";
import type { TaskLike } from "@/lib/domain/permissions";

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "profile-1",
    authUserId: "auth-1",
    companyId: "company-1",
    fullName: "Test User",
    role: "employee",
    departmentId: null,
    managerId: null,
    ...overrides,
  };
}

function makeTask(overrides: Partial<TaskLike> = {}): TaskLike {
  return {
    companyId: "company-1",
    creatorId: "profile-1",
    assigneeId: null,
    departmentId: null,
    ...overrides,
  };
}

describe("canViewTask", () => {
  it("denies a profile from a different company", () => {
    const profile = makeProfile({ companyId: "other-company" });
    expect(canViewTask(profile, makeTask())).toBe(false);
  });

  it("allows the assignee", () => {
    const profile = makeProfile({ id: "assignee-1" });
    expect(canViewTask(profile, makeTask({ assigneeId: "assignee-1" }))).toBe(true);
  });

  it("allows the creator", () => {
    const profile = makeProfile({ id: "creator-1" });
    expect(canViewTask(profile, makeTask({ creatorId: "creator-1" }))).toBe(true);
  });

  it("denies an unrelated employee", () => {
    const profile = makeProfile({ id: "someone-else" });
    expect(canViewTask(profile, makeTask())).toBe(false);
  });

  it("allows a manager for a task in their department", () => {
    const profile = makeProfile({ id: "manager-1", role: "manager", departmentId: "dept-1" });
    expect(canViewTask(profile, makeTask({ departmentId: "dept-1" }))).toBe(true);
  });

  it("denies a manager for a task in a different department", () => {
    const profile = makeProfile({ id: "manager-1", role: "manager", departmentId: "dept-1" });
    expect(canViewTask(profile, makeTask({ departmentId: "dept-2" }))).toBe(false);
  });

  it("allows operations_manager, it, hr, and admin to view any company task", () => {
    for (const role of ["operations_manager", "it", "hr", "admin"] as const) {
      const profile = makeProfile({ id: "someone-else", role });
      expect(canViewTask(profile, makeTask())).toBe(true);
    }
  });
});

describe("canCreateTask", () => {
  it("allows any profile", () => {
    expect(canCreateTask(makeProfile())).toBe(true);
  });
});

describe("canAssignTask", () => {
  it("allows the creator", () => {
    const profile = makeProfile({ id: "creator-1" });
    const target = makeProfile({ id: "target-1" });
    expect(canAssignTask(profile, makeTask({ creatorId: "creator-1" }), null, target)).toBe(true);
  });

  it("allows self-claim", () => {
    const profile = makeProfile({ id: "employee-1" });
    expect(canAssignTask(profile, makeTask(), null, profile)).toBe(true);
  });

  it("allows the current assignee's manager", () => {
    const currentAssignee = makeProfile({ id: "assignee-1", managerId: "manager-1" });
    const profile = makeProfile({ id: "manager-1" });
    const target = makeProfile({ id: "target-1" });
    expect(canAssignTask(profile, makeTask(), currentAssignee, target)).toBe(true);
  });

  it("allows the target assignee's manager", () => {
    const target = makeProfile({ id: "target-1", managerId: "manager-1" });
    const profile = makeProfile({ id: "manager-1" });
    expect(canAssignTask(profile, makeTask(), null, target)).toBe(true);
  });

  it("allows operations_manager and admin regardless of relation", () => {
    const target = makeProfile({ id: "target-1" });
    for (const role of ["operations_manager", "admin"] as const) {
      const profile = makeProfile({ id: "someone-else", role });
      expect(canAssignTask(profile, makeTask(), null, target)).toBe(true);
    }
  });

  it("denies an unrelated employee", () => {
    const profile = makeProfile({ id: "someone-else" });
    const target = makeProfile({ id: "target-1" });
    expect(canAssignTask(profile, makeTask(), null, target)).toBe(false);
  });
});

describe("canChangeTaskStatus", () => {
  it("allows the assignee", () => {
    const profile = makeProfile({ id: "assignee-1" });
    expect(canChangeTaskStatus(profile, makeTask({ assigneeId: "assignee-1" }), profile)).toBe(
      true
    );
  });

  it("allows the creator", () => {
    const profile = makeProfile({ id: "creator-1" });
    expect(canChangeTaskStatus(profile, makeTask({ creatorId: "creator-1" }), null)).toBe(true);
  });

  it("allows the assignee's manager", () => {
    const assignee = makeProfile({ id: "assignee-1", managerId: "manager-1" });
    const profile = makeProfile({ id: "manager-1" });
    expect(
      canChangeTaskStatus(profile, makeTask({ assigneeId: "assignee-1" }), assignee)
    ).toBe(true);
  });

  it("denies an unrelated employee", () => {
    const profile = makeProfile({ id: "someone-else" });
    expect(canChangeTaskStatus(profile, makeTask(), null)).toBe(false);
  });
});

describe("canDeleteTask", () => {
  it("allows the creator", () => {
    const profile = makeProfile({ id: "creator-1" });
    expect(canDeleteTask(profile, makeTask({ creatorId: "creator-1" }))).toBe(true);
  });

  it("allows admin", () => {
    const profile = makeProfile({ id: "someone-else", role: "admin" });
    expect(canDeleteTask(profile, makeTask())).toBe(true);
  });

  it("denies an unrelated employee", () => {
    const profile = makeProfile({ id: "someone-else" });
    expect(canDeleteTask(profile, makeTask())).toBe(false);
  });
});
