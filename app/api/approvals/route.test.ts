import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/approvals", () => ({
  listApprovals: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { listApprovals } from "@/lib/domain/approvals";
import { GET } from "@/app/api/approvals/route";
import { ForbiddenError } from "@/lib/domain/errors";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "Test User",
  role: "employee" as const,
  departmentId: null,
  managerId: null,
  positionTitle: null,
  employeeNumber: null,
  locationId: null,
  relatedOperationId: null,
  status: "active" as const,
};

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(listApprovals).mockReset();
});

describe("GET /api/approvals", () => {
  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/approvals"));
    expect(response.status).toBe(401);
  });

  it("returns approvals scoped by the caller's filters", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(listApprovals).mockResolvedValue([]);

    const response = await GET(new Request("http://localhost/api/approvals?scope=all&status=pending"));
    expect(response.status).toBe(200);
    expect(listApprovals).toHaveBeenCalledWith(PROFILE, { scope: "all", status: "pending" });
  });

  it("returns 400 for an invalid filter value", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await GET(new Request("http://localhost/api/approvals?status=nope"));
    expect(response.status).toBe(400);
  });

  it("maps a ForbiddenError from the domain layer to 403", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(listApprovals).mockRejectedValue(new ForbiddenError("no"));

    const response = await GET(new Request("http://localhost/api/approvals?scope=all"));
    expect(response.status).toBe(403);
  });
});
