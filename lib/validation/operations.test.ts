import { describe, expect, it } from "vitest";
import {
  createOperationSchema,
  linkActionSchema,
  updateOperationSchema,
} from "@/lib/validation/operations";

describe("createOperationSchema", () => {
  it("requires a title", () => {
    expect(createOperationSchema.safeParse({ title: "" }).success).toBe(false);
  });

  it("accepts the minimal valid shape", () => {
    expect(createOperationSchema.safeParse({ title: "Vienna Office Relocation" }).success).toBe(
      true
    );
  });

  it("accepts every optional field", () => {
    const result = createOperationSchema.safeParse({
      title: "Vienna Office Relocation",
      description: "Move to the new building",
      ownerId: "11111111-1111-4111-8111-111111111111",
      departmentId: "22222222-2222-4222-8222-222222222222",
      priority: "high",
      startDate: "2026-10-01",
      targetDate: "2026-12-01",
    });
    expect(result.success).toBe(true);
  });
});

describe("updateOperationSchema", () => {
  it("rejects an invalid status", () => {
    expect(updateOperationSchema.safeParse({ status: "archived" }).success).toBe(false);
  });

  it("accepts a partial update", () => {
    expect(updateOperationSchema.safeParse({ status: "on_hold" }).success).toBe(true);
  });

  it("accepts nulling out a nullable field", () => {
    expect(updateOperationSchema.safeParse({ departmentId: null }).success).toBe(true);
  });
});

describe("linkActionSchema", () => {
  it("accepts a link action", () => {
    const result = linkActionSchema.safeParse({
      action: "link",
      entityType: "task",
      entityId: "11111111-1111-4111-8111-111111111111",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an unlink action", () => {
    const result = linkActionSchema.safeParse({
      action: "unlink",
      entityType: "employee",
      entityId: "11111111-1111-4111-8111-111111111111",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown entity type", () => {
    const result = linkActionSchema.safeParse({
      action: "link",
      entityType: "invoice",
      entityId: "11111111-1111-4111-8111-111111111111",
    });
    expect(result.success).toBe(false);
  });
});
