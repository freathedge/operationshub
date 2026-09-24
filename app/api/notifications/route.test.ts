import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/notifications", () => ({
  listNotifications: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { listNotifications } from "@/lib/domain/notifications";
import { GET } from "@/app/api/notifications/route";

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
  vi.mocked(listNotifications).mockReset();
});

describe("GET /api/notifications", () => {
  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns notifications and the unread count for the caller", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(listNotifications).mockResolvedValue([
      { id: "n1", profileId: "profile-1", entityType: "task", entityId: "t1", type: "task_assigned", message: "x", readAt: null, createdAt: "2026-09-24T00:00:00.000Z" },
      { id: "n2", profileId: "profile-1", entityType: "task", entityId: "t2", type: "task_assigned", message: "y", readAt: "2026-09-24T00:00:00.000Z", createdAt: "2026-09-24T00:00:00.000Z" },
    ] as never);

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.notifications).toHaveLength(2);
    expect(body.unreadCount).toBe(1);
    expect(listNotifications).toHaveBeenCalledWith("profile-1");
  });
});
