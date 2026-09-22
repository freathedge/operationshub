import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/assets", () => ({
  completeAssetAssignmentTask: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { completeAssetAssignmentTask } from "@/lib/domain/assets";
import { POST } from "@/app/api/tasks/[id]/complete-with-asset/route";
import { ForbiddenError, UnprocessableRequestError } from "@/lib/domain/errors";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "IT Person",
  role: "it" as const,
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

function jsonRequest(body: unknown) {
  return new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(completeAssetAssignmentTask).mockReset();
});

describe("POST /api/tasks/[id]/complete-with-asset", () => {
  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await POST(
      jsonRequest({ name: "Laptop", category: "laptop" }),
      params("task-1")
    );
    expect(response.status).toBe(401);
  });

  it("completes the task and creates the asset", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(completeAssetAssignmentTask).mockResolvedValue({
      task: { id: "task-1", status: "completed" },
      asset: { id: "asset-1" },
    } as never);

    const response = await POST(
      jsonRequest({ name: "Laptop", category: "laptop" }),
      params("task-1")
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.asset.id).toBe("asset-1");
    expect(body.task.status).toBe("completed");
  });

  it("returns 400 for an invalid body", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(jsonRequest({ name: "", category: "" }), params("task-1"));
    expect(response.status).toBe(400);
  });

  it("maps an UnprocessableRequestError to 422", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(completeAssetAssignmentTask).mockRejectedValue(
      new UnprocessableRequestError("no")
    );

    const response = await POST(
      jsonRequest({ name: "Laptop", category: "laptop" }),
      params("task-1")
    );
    expect(response.status).toBe(422);
  });

  it("maps a ForbiddenError to 403", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(completeAssetAssignmentTask).mockRejectedValue(new ForbiddenError("no"));

    const response = await POST(
      jsonRequest({ name: "Laptop", category: "laptop" }),
      params("task-1")
    );
    expect(response.status).toBe(403);
  });
});
