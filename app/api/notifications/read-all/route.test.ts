import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/notifications", () => ({
  markAllNotificationsRead: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { markAllNotificationsRead } from "@/lib/domain/notifications";
import { POST } from "@/app/api/notifications/read-all/route";

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
  vi.mocked(markAllNotificationsRead).mockReset();
});

describe("POST /api/notifications/read-all", () => {
  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await POST();
    expect(response.status).toBe(401);
  });

  it("marks all of the caller's notifications read", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(markAllNotificationsRead).mockResolvedValue(undefined);

    const response = await POST();
    expect(response.status).toBe(200);
    expect(markAllNotificationsRead).toHaveBeenCalledWith(PROFILE);
  });
});
