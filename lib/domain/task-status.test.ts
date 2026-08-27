import { describe, expect, it } from "vitest";
import { getValidNextStatuses } from "@/lib/domain/task-status";

describe("getValidNextStatuses", () => {
  it("allows todo to move to in_progress or cancelled", () => {
    expect(getValidNextStatuses("todo")).toEqual(["in_progress", "cancelled"]);
  });

  it("allows in_progress to move to blocked, completed, or cancelled", () => {
    expect(getValidNextStatuses("in_progress")).toEqual(["blocked", "completed", "cancelled"]);
  });

  it("allows blocked to move back to in_progress or to cancelled", () => {
    expect(getValidNextStatuses("blocked")).toEqual(["in_progress", "cancelled"]);
  });

  it("treats completed and cancelled as terminal", () => {
    expect(getValidNextStatuses("completed")).toEqual([]);
    expect(getValidNextStatuses("cancelled")).toEqual([]);
  });
});
