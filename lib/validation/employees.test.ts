import { describe, expect, it } from "vitest";
import { createEmployeeSchema, updateEmployeeSchema } from "@/lib/validation/employees";

describe("createEmployeeSchema", () => {
  it("requires a valid email, a name, and a role", () => {
    const result = createEmployeeSchema.safeParse({
      email: "not-an-email",
      fullName: "",
      role: "employee",
    });
    expect(result.success).toBe(false);
  });

  it("accepts the minimal valid shape and defaults are left to the domain layer", () => {
    const result = createEmployeeSchema.safeParse({
      email: "new.hire@example.com",
      fullName: "New Hire",
      role: "employee",
    });
    expect(result.success).toBe(true);
  });

  it("accepts every optional operational field", () => {
    const result = createEmployeeSchema.safeParse({
      email: "new.hire@example.com",
      fullName: "New Hire",
      role: "employee",
      departmentId: "11111111-1111-4111-8111-111111111111",
      managerId: "22222222-2222-4222-8222-222222222222",
      locationId: "33333333-3333-4333-8333-333333333333",
      positionTitle: "Software Engineer",
      employeeNumber: "EMP-00042",
      startOnboarding: false,
    });
    expect(result.success).toBe(true);
  });
});

describe("updateEmployeeSchema", () => {
  it("rejects an invalid status", () => {
    const result = updateEmployeeSchema.safeParse({ status: "on_leave" });
    expect(result.success).toBe(false);
  });

  it("accepts a partial update", () => {
    const result = updateEmployeeSchema.safeParse({ status: "inactive" });
    expect(result.success).toBe(true);
  });
});
