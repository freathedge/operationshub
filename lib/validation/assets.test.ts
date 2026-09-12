import { describe, expect, it } from "vitest";
import { createAssetSchema, patchAssetSchema } from "@/lib/validation/assets";

describe("createAssetSchema", () => {
  it("requires a name and category", () => {
    const result = createAssetSchema.safeParse({ name: "", category: "" });
    expect(result.success).toBe(false);
  });

  it("accepts the minimal valid shape", () => {
    const result = createAssetSchema.safeParse({ name: "MacBook Pro 14\"", category: "laptop" });
    expect(result.success).toBe(true);
  });
});

describe("patchAssetSchema", () => {
  it("accepts an assign action", () => {
    const result = patchAssetSchema.safeParse({
      action: "assign",
      targetEmployeeId: "11111111-1111-4111-8111-111111111111",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a changeStatus action", () => {
    const result = patchAssetSchema.safeParse({ action: "changeStatus", status: "maintenance" });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown action", () => {
    const result = patchAssetSchema.safeParse({ action: "retire" });
    expect(result.success).toBe(false);
  });
});
