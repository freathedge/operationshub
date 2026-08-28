import { describe, expect, it } from "vitest";
import {
  createRequestSchema,
  decideApprovalSchema,
  patchRequestSchema,
  requestFiltersSchema,
} from "@/lib/validation/requests";

describe("createRequestSchema", () => {
  it("accepts a minimal valid payload", () => {
    expect(
      createRequestSchema.safeParse({ title: "New laptop", category: "equipment" }).success
    ).toBe(true);
  });

  it("rejects an empty title", () => {
    expect(createRequestSchema.safeParse({ title: "", category: "equipment" }).success).toBe(
      false
    );
  });

  it("rejects a missing category", () => {
    expect(createRequestSchema.safeParse({ title: "New laptop" }).success).toBe(false);
  });

  it("rejects an invalid category", () => {
    expect(
      createRequestSchema.safeParse({ title: "New laptop", category: "snacks" }).success
    ).toBe(false);
  });

  it("rejects a non-uuid departmentId", () => {
    expect(
      createRequestSchema.safeParse({
        title: "New laptop",
        category: "equipment",
        departmentId: "not-a-uuid",
      }).success
    ).toBe(false);
  });
});

describe("patchRequestSchema", () => {
  it("accepts a valid status", () => {
    expect(patchRequestSchema.safeParse({ status: "in_progress" }).success).toBe(true);
  });

  it("rejects a missing status", () => {
    expect(patchRequestSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an invalid status value", () => {
    expect(patchRequestSchema.safeParse({ status: "done" }).success).toBe(false);
  });
});

describe("requestFiltersSchema", () => {
  it("accepts an empty filter set", () => {
    expect(requestFiltersSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a full filter set", () => {
    expect(
      requestFiltersSchema.safeParse({
        status: "under_review",
        category: "software",
        departmentId: "11111111-1111-4111-8111-111111111111",
        scope: "mine",
      }).success
    ).toBe(true);
  });

  it("rejects an invalid scope value", () => {
    expect(requestFiltersSchema.safeParse({ scope: "everything" }).success).toBe(false);
  });
});

describe("decideApprovalSchema", () => {
  it("accepts a decision with no comment", () => {
    expect(decideApprovalSchema.safeParse({ decision: "approved" }).success).toBe(true);
  });

  it("accepts a decision with a comment", () => {
    expect(
      decideApprovalSchema.safeParse({ decision: "rejected", comment: "Not needed" }).success
    ).toBe(true);
  });

  it("rejects an invalid decision value", () => {
    expect(decideApprovalSchema.safeParse({ decision: "maybe" }).success).toBe(false);
  });
});
