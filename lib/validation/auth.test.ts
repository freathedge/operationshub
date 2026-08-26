import { describe, expect, it } from "vitest";
import { completeSignupSchema } from "@/lib/validation/auth";

describe("completeSignupSchema", () => {
  it("accepts a valid payload", () => {
    const result = completeSignupSchema.safeParse({
      fullName: "Max Mustermann",
      role: "it",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an empty full name", () => {
    const result = completeSignupSchema.safeParse({
      fullName: "",
      role: "it",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an unknown role", () => {
    const result = completeSignupSchema.safeParse({
      fullName: "Max Mustermann",
      role: "ceo",
    });

    expect(result.success).toBe(false);
  });
});
