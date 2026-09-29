import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/employees", () => ({
  createEmployee: vi.fn(),
  listEmployees: vi.fn(),
  getAccountInfoForEmployees: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { createEmployee, listEmployees, getAccountInfoForEmployees } from "@/lib/domain/employees";
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
  relatedOperationId: null,
  invitedEmail: null,
  status: "active" as const,
};

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(createEmployee).mockReset();
  vi.mocked(listEmployees).mockReset();
  vi.mocked(getAccountInfoForEmployees).mockReset();
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
    vi.mocked(getAccountInfoForEmployees).mockResolvedValue(new Map());

    const response = await GET(new Request("http://localhost/api/employees?status=active"));
    expect(response.status).toBe(200);
    expect(listEmployees).toHaveBeenCalledWith(PROFILE, { status: "active" });
  });

  it("returns 400 for an invalid filter value", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await GET(new Request("http://localhost/api/employees?status=on_leave"));
    expect(response.status).toBe(400);
  });

  it("attaches account info per employee from getAccountInfoForEmployees", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(listEmployees).mockResolvedValue([
      { id: "employee-1" } as never,
      { id: "employee-2" } as never,
    ]);
    vi.mocked(getAccountInfoForEmployees).mockResolvedValue(
      new Map([["employee-1", { linked: true, email: "a@example.com" }]])
    );

    const response = await GET(new Request("http://localhost/api/employees"));
    const body = await response.json();

    expect(body.employees[0]).toEqual(
      expect.objectContaining({ id: "employee-1", account: { linked: true, email: "a@example.com" } })
    );
    expect(body.employees[1]).toEqual(expect.objectContaining({ id: "employee-2", account: null }));
  });

  it.each([
    { role: "hr" as const, account: { linked: false as const, invitedEmail: "pending@example.com" } },
    { role: "employee" as const, account: null },
  ])("never includes the raw invitedEmail field for a $role caller", async ({ role, account }) => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ ...PROFILE, role });
    vi.mocked(listEmployees).mockResolvedValue([
      { ...PROFILE, id: "pending-1", authUserId: null, role: "employee", invitedEmail: "pending@example.com" },
    ]);
    vi.mocked(getAccountInfoForEmployees).mockResolvedValue(
      account ? new Map([["pending-1", account]]) : new Map()
    );

    const response = await GET(new Request("http://localhost/api/employees"));
    const body = await response.json();

    expect(body.employees[0]).not.toHaveProperty("invitedEmail");
    expect(body.employees[0].id).toBe("pending-1");
    expect(body.employees[0].account).toEqual(account);
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

  it("never includes the raw invitedEmail field in the created employee", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(createEmployee).mockResolvedValue({
      ...PROFILE,
      id: "employee-1",
      authUserId: null,
      invitedEmail: "new.hire@example.com",
    });

    const response = await POST(
      jsonRequest({ email: "new.hire@example.com", fullName: "New Hire", role: "employee" })
    );
    const body = await response.json();
    expect(body.employee.id).toBe("employee-1");
    expect(body.employee).not.toHaveProperty("invitedEmail");
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
