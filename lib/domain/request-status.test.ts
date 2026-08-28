import { describe, expect, it } from "vitest";
import { getValidNextStatuses } from "@/lib/domain/request-status";

describe("getValidNextStatuses", () => {
  it("allows approved to move to in_progress", () => {
    expect(getValidNextStatuses("approved")).toEqual(["in_progress"]);
  });

  it("allows in_progress to move to completed", () => {
    expect(getValidNextStatuses("in_progress")).toEqual(["completed"]);
  });

  it("treats draft, submitted, under_review, rejected, and completed as having no manual next status", () => {
    expect(getValidNextStatuses("draft")).toEqual([]);
    expect(getValidNextStatuses("submitted")).toEqual([]);
    expect(getValidNextStatuses("under_review")).toEqual([]);
    expect(getValidNextStatuses("rejected")).toEqual([]);
    expect(getValidNextStatuses("completed")).toEqual([]);
  });
});
