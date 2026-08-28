import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/profiles", () => ({
  listProfilesByRole: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { listProfilesByRole } from "@/lib/domain/profiles";
import { GET } from "@/app/api/profiles/route";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "Test User",
  role: "operations_manager" as const,
  departmentId: null,
  managerId: null,
};

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(listProfilesByRole).mockReset();
});

describe("GET /api/profiles", () => {
  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/profiles?role=manager"));
    expect(response.status).toBe(401);
  });

  it("returns peers with the requested role in the caller's company, excluding the caller", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(listProfilesByRole).mockResolvedValue([
      { id: "profile-2", fullName: "Alice" },
      { id: "profile-3", fullName: "Bob" },
    ]);

    const response = await GET(
      new Request("http://localhost/api/profiles?role=operations_manager")
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.profiles).toEqual([
      { id: "profile-2", fullName: "Alice" },
      { id: "profile-3", fullName: "Bob" },
    ]);
    expect(listProfilesByRole).toHaveBeenCalledWith(
      "company-1",
      "operations_manager",
      "profile-1"
    );
  });

  it("returns 400 for a missing role", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await GET(new Request("http://localhost/api/profiles"));
    expect(response.status).toBe(400);
  });

  it("returns 400 for an invalid role value", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await GET(new Request("http://localhost/api/profiles?role=ceo"));
    expect(response.status).toBe(400);
  });
});
