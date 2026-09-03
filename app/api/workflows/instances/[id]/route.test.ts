import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/workflows", () => ({
  getWorkflowProgress: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { getWorkflowProgress } from "@/lib/domain/workflows";
import { GET } from "@/app/api/workflows/instances/[id]/route";
import { NotFoundError } from "@/lib/domain/errors";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "Test User",
  role: "employee" as const,
  departmentId: null,
  managerId: null,
};

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(getWorkflowProgress).mockReset();
});

describe("GET /api/workflows/instances/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost"), params("instance-1"));
    expect(response.status).toBe(401);
  });

  it("returns 404 when the instance does not exist", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getWorkflowProgress).mockRejectedValue(new NotFoundError());
    const response = await GET(new Request("http://localhost"), params("instance-1"));
    expect(response.status).toBe(404);
  });

  it("returns the workflow progress", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getWorkflowProgress).mockResolvedValue({
      instance: { id: "instance-1" },
      steps: [],
    } as never);
    const response = await GET(new Request("http://localhost"), params("instance-1"));
    expect(response.status).toBe(200);
  });
});
