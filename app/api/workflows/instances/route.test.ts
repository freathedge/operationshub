import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/workflows", () => ({
  listWorkflowInstances: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { listWorkflowInstances } from "@/lib/domain/workflows";
import { GET } from "@/app/api/workflows/instances/route";
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
  vi.mocked(listWorkflowInstances).mockReset();
});

describe("GET /api/workflows/instances", () => {
  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/workflows/instances"));
    expect(response.status).toBe(401);
  });

  it("returns instances scoped by the caller's filters", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(listWorkflowInstances).mockResolvedValue([]);

    const response = await GET(
      new Request("http://localhost/api/workflows/instances?scope=all&status=in_progress")
    );
    expect(response.status).toBe(200);
    expect(listWorkflowInstances).toHaveBeenCalledWith(PROFILE, {
      scope: "all",
      status: "in_progress",
    });
  });

  it("returns 400 for an invalid filter value", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await GET(
      new Request("http://localhost/api/workflows/instances?status=nope")
    );
    expect(response.status).toBe(400);
  });

  it("maps a ForbiddenError from the domain layer to 403", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(listWorkflowInstances).mockRejectedValue(new ForbiddenError("no"));

    const response = await GET(
      new Request("http://localhost/api/workflows/instances?scope=all")
    );
    expect(response.status).toBe(403);
  });
});
