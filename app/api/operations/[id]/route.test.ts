import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/operations", () => ({
  getOperation: vi.fn(),
  updateOperation: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { getOperation, updateOperation } from "@/lib/domain/operations";
import { GET, PATCH } from "@/app/api/operations/[id]/route";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "Ops Manager",
  role: "operations_manager" as const,
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
  vi.mocked(getOperation).mockReset();
  vi.mocked(updateOperation).mockReset();
});

describe("GET /api/operations/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost"), params("op-1"));
    expect(response.status).toBe(401);
  });

  it("returns 404 when the operation does not exist", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getOperation).mockRejectedValue(new NotFoundError());
    const response = await GET(new Request("http://localhost"), params("op-1"));
    expect(response.status).toBe(404);
  });

  it("returns the operation detail", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getOperation).mockResolvedValue({
      operation: { id: "op-1", title: "Test Op" },
      progress: { completedTasks: 0, totalTasks: 0 },
      tasks: [],
      requests: [],
      assets: [],
      employees: [],
    } as never);
    const response = await GET(new Request("http://localhost"), params("op-1"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.operation.title).toBe("Test Op");
  });
});

describe("PATCH /api/operations/[id]", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await PATCH(jsonRequest({ status: "in_progress" }), params("op-1"));
    expect(response.status).toBe(401);
  });

  it("returns 400 for an invalid status", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await PATCH(jsonRequest({ status: "archived" }), params("op-1"));
    expect(response.status).toBe(400);
  });

  it("returns 403 when the domain layer rejects the caller", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(updateOperation).mockRejectedValue(new ForbiddenError());
    const response = await PATCH(jsonRequest({ status: "in_progress" }), params("op-1"));
    expect(response.status).toBe(403);
  });

  it("updates the operation", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(updateOperation).mockResolvedValue({ id: "op-1", status: "in_progress" } as never);
    const response = await PATCH(jsonRequest({ status: "in_progress" }), params("op-1"));
    expect(response.status).toBe(200);
    expect(updateOperation).toHaveBeenCalledWith(PROFILE, "op-1", { status: "in_progress" });
  });
});
