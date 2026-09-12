import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/employees", () => ({
  getEmployeeProfile: vi.fn(),
  updateEmployee: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { getEmployeeProfile, updateEmployee } from "@/lib/domain/employees";
import { GET, PATCH } from "@/app/api/employees/[id]/route";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";

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

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(getEmployeeProfile).mockReset();
  vi.mocked(updateEmployee).mockReset();
});

describe("GET /api/employees/[id]", () => {
  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost"), params("employee-1"));
    expect(response.status).toBe(401);
  });

  it("returns the employee profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getEmployeeProfile).mockResolvedValue({ profile: { id: "employee-1" } } as never);

    const response = await GET(new Request("http://localhost"), params("employee-1"));
    expect(response.status).toBe(200);
  });

  it("maps a NotFoundError to 404", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getEmployeeProfile).mockRejectedValue(new NotFoundError("no"));

    const response = await GET(new Request("http://localhost"), params("missing"));
    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/employees/[id]", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await PATCH(jsonRequest({ status: "inactive" }), params("employee-1"));
    expect(response.status).toBe(401);
  });

  it("updates the employee", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(updateEmployee).mockResolvedValue({ id: "employee-1", status: "inactive" } as never);

    const response = await PATCH(jsonRequest({ status: "inactive" }), params("employee-1"));
    expect(response.status).toBe(200);
    expect(updateEmployee).toHaveBeenCalledWith(PROFILE, "employee-1", { status: "inactive" });
  });

  it("returns 400 for an invalid body", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await PATCH(jsonRequest({ status: "on_leave" }), params("employee-1"));
    expect(response.status).toBe(400);
  });

  it("maps a ForbiddenError to 403", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(updateEmployee).mockRejectedValue(new ForbiddenError("no"));

    const response = await PATCH(jsonRequest({ status: "inactive" }), params("employee-1"));
    expect(response.status).toBe(403);
  });
});
