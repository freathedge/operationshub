import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/employees", () => ({
  resendEmployeeInvite: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { resendEmployeeInvite } from "@/lib/domain/employees";
import { POST } from "@/app/api/employees/[id]/resend-invite/route";
import { ForbiddenError, InvalidTransitionError, NotFoundError } from "@/lib/domain/errors";

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

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(resendEmployeeInvite).mockReset();
});

describe("POST /api/employees/[id]/resend-invite", () => {
  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await POST(new Request("http://localhost", { method: "POST" }), params("employee-1"));
    expect(response.status).toBe(401);
  });

  it("resends the invite and returns 200", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(resendEmployeeInvite).mockResolvedValue(undefined);

    const response = await POST(new Request("http://localhost", { method: "POST" }), params("employee-1"));
    expect(response.status).toBe(200);
    expect(resendEmployeeInvite).toHaveBeenCalledWith(PROFILE, "employee-1");
  });

  it("maps a ForbiddenError to 403", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(resendEmployeeInvite).mockRejectedValue(new ForbiddenError("no"));

    const response = await POST(new Request("http://localhost", { method: "POST" }), params("employee-1"));
    expect(response.status).toBe(403);
  });

  it("maps a NotFoundError to 404", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(resendEmployeeInvite).mockRejectedValue(new NotFoundError("no"));

    const response = await POST(new Request("http://localhost", { method: "POST" }), params("missing"));
    expect(response.status).toBe(404);
  });

  it("maps an InvalidTransitionError (already linked) to 400", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(resendEmployeeInvite).mockRejectedValue(new InvalidTransitionError("already linked"));

    const response = await POST(new Request("http://localhost", { method: "POST" }), params("employee-1"));
    expect(response.status).toBe(400);
  });
});
