import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/notifications", () => ({
  markNotificationRead: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { markNotificationRead } from "@/lib/domain/notifications";
import { PATCH } from "@/app/api/notifications/[id]/read/route";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";

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

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(markNotificationRead).mockReset();
});

describe("PATCH /api/notifications/[id]/read", () => {
  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await PATCH(new Request("http://localhost"), params("n1"));
    expect(response.status).toBe(401);
  });

  it("marks the notification read for the caller", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(markNotificationRead).mockResolvedValue({
      id: "n1", profileId: "profile-1", entityType: "task", entityId: "t1", type: "task_assigned", message: "x", readAt: "2026-09-24T00:00:00.000Z", createdAt: "2026-09-24T00:00:00.000Z",
    } as never);

    const response = await PATCH(new Request("http://localhost"), params("n1"));
    expect(response.status).toBe(200);
    expect(markNotificationRead).toHaveBeenCalledWith(PROFILE, "n1");
  });

  it("maps ForbiddenError to 403 and NotFoundError to 404", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);

    vi.mocked(markNotificationRead).mockRejectedValueOnce(new ForbiddenError("no"));
    expect((await PATCH(new Request("http://localhost"), params("n1"))).status).toBe(403);

    vi.mocked(markNotificationRead).mockRejectedValueOnce(new NotFoundError("no"));
    expect((await PATCH(new Request("http://localhost"), params("n1"))).status).toBe(404);
  });
});
