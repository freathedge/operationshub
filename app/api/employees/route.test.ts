import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/employees", () => ({
  createEmployee: vi.fn(),
  listEmployees: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { createEmployee, listEmployees } from "@/lib/domain/employees";
import { GET, POST } from "@/app/api/employees/route";
import { ForbiddenError } from "@/lib/domain/errors";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "HR Person",
  role: "hr" as const,
  departmentId: null,
  managerId: null,
  positionTitle: null,
  employeeNumber: null,
  locationId: null,
  status: "active" as const,
};

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(createEmployee).mockReset();
  vi.mocked(listEmployees).mockReset();
});

describe("GET /api/employees", () => {
  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/employees"));
    expect(response.status).toBe(401);
  });

  it("returns employees scoped by the caller's filters", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(listEmployees).mockResolvedValue([]);

    const response = await GET(new Request("http://localhost/api/employees?status=active"));
    expect(response.status).toBe(200);
    expect(listEmployees).toHaveBeenCalledWith(PROFILE, { status: "active" });
  });

  it("returns 400 for an invalid filter value", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await GET(new Request("http://localhost/api/employees?status=on_leave"));
    expect(response.status).toBe(400);
  });
});

describe("POST /api/employees", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost/api/employees", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await POST(jsonRequest({ email: "x@example.com", fullName: "X", role: "employee" }));
    expect(response.status).toBe(401);
  });

  it("creates an employee", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(createEmployee).mockResolvedValue({ id: "employee-1" } as never);

    const response = await POST(
      jsonRequest({ email: "new.hire@example.com", fullName: "New Hire", role: "employee" })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.employee.id).toBe("employee-1");
  });

  it("returns 400 for an invalid body", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(jsonRequest({ email: "not-an-email", fullName: "", role: "employee" }));
    expect(response.status).toBe(400);
  });

  it("maps a ForbiddenError from the domain layer to 403", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(createEmployee).mockRejectedValue(new ForbiddenError("no"));

    const response = await POST(
      jsonRequest({ email: "new.hire@example.com", fullName: "New Hire", role: "employee" })
    );
    expect(response.status).toBe(403);
  });
});
