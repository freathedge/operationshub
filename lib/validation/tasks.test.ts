import { describe, expect, it } from "vitest";
import {
  addCommentSchema,
  createAttachmentSchema,
  createTaskSchema,
  patchTaskSchema,
  taskFiltersSchema,
} from "@/lib/validation/tasks";

describe("createTaskSchema", () => {
  it("accepts a minimal valid payload", () => {
    expect(createTaskSchema.safeParse({ title: "Prepare laptop" }).success).toBe(true);
  });

  it("rejects an empty title", () => {
    const result = createTaskSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid priority", () => {
    expect(createTaskSchema.safeParse({ title: "x", priority: "urgent" }).success).toBe(false);
  });

  it("rejects a non-uuid departmentId", () => {
    expect(createTaskSchema.safeParse({ title: "x", departmentId: "not-a-uuid" }).success).toBe(
      false
    );
  });
});

describe("patchTaskSchema", () => {
  it("accepts a status-only payload", () => {
    expect(patchTaskSchema.safeParse({ status: "in_progress" }).success).toBe(true);
  });

  it("accepts an assigneeId-only payload", () => {
    expect(
      patchTaskSchema.safeParse({ assigneeId: "11111111-1111-4111-8111-111111111111" }).success
    ).toBe(true);
  });

  it("rejects an empty payload", () => {
    expect(patchTaskSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an invalid status value", () => {
    expect(patchTaskSchema.safeParse({ status: "done" }).success).toBe(false);
  });
});

describe("taskFiltersSchema", () => {
  it("accepts an empty filter set", () => {
    expect(taskFiltersSchema.safeParse({}).success).toBe(true);
  });

  it("accepts undefined values for unset query params", () => {
    expect(
      taskFiltersSchema.safeParse({ status: undefined, priority: undefined }).success
    ).toBe(true);
  });
});

describe("addCommentSchema", () => {
  it("rejects an empty body", () => {
    expect(addCommentSchema.safeParse({ body: "" }).success).toBe(false);
  });

  it("accepts a non-empty body", () => {
    expect(addCommentSchema.safeParse({ body: "Looks good" }).success).toBe(true);
  });
});

describe("createAttachmentSchema", () => {
  it("rejects an empty filename", () => {
    expect(createAttachmentSchema.safeParse({ filename: "" }).success).toBe(false);
  });

  it("accepts a filename", () => {
    expect(createAttachmentSchema.safeParse({ filename: "invoice.pdf" }).success).toBe(true);
  });
});
