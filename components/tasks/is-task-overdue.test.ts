import { describe, expect, it } from "vitest";
import { isTaskOverdue } from "@/components/tasks/is-task-overdue";

describe("isTaskOverdue", () => {
  it("is true for a past due date on an open task", () => {
    expect(isTaskOverdue({ dueDate: "2020-01-01T00:00:00.000Z", status: "todo" })).toBe(true);
  });

  it("is false for a past due date on a completed task", () => {
    expect(isTaskOverdue({ dueDate: "2020-01-01T00:00:00.000Z", status: "completed" })).toBe(
      false
    );
  });

  it("is false for a past due date on a cancelled task", () => {
    expect(isTaskOverdue({ dueDate: "2020-01-01T00:00:00.000Z", status: "cancelled" })).toBe(
      false
    );
  });

  it("is false when there is no due date", () => {
    expect(isTaskOverdue({ dueDate: null, status: "todo" })).toBe(false);
  });

  it("is false for a future due date", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(isTaskOverdue({ dueDate: future, status: "todo" })).toBe(false);
  });
});
