import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/workflows", () => ({
  listWorkflowTemplates: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { listWorkflowTemplates } from "@/lib/domain/workflows";
import { GET } from "@/app/api/workflows/templates/route";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "Test User",
  role: "employee" as const,
  departmentId: null,
  managerId: null,
};

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(listWorkflowTemplates).mockReset();
});

describe("GET /api/workflows/templates", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns the company's templates", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(listWorkflowTemplates).mockResolvedValue([{ id: "template-1" } as never]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(listWorkflowTemplates).toHaveBeenCalledWith("company-1");
  });
});
