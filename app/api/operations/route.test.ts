import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/operations", () => ({
  createOperation: vi.fn(),
  listOperations: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { createOperation, listOperations } from "@/lib/domain/operations";
import { GET, POST } from "@/app/api/operations/route";
import { ForbiddenError } from "@/lib/domain/errors";

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

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(createOperation).mockReset();
  vi.mocked(listOperations).mockReset();
});

describe("GET /api/operations", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/operations"));
    expect(response.status).toBe(401);
  });

  it("returns 400 for an invalid status filter", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await GET(new Request("http://localhost/api/operations?status=archived"));
    expect(response.status).toBe(400);
  });

  it("returns the operations list", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(listOperations).mockResolvedValue([{ id: "op-1" } as never]);
    const response = await GET(new Request("http://localhost/api/operations"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.operations).toEqual([{ id: "op-1" }]);
  });
});

describe("POST /api/operations", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost/api/operations", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await POST(jsonRequest({ title: "New Operation" }));
    expect(response.status).toBe(401);
  });

  it("returns 400 for a missing title", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(jsonRequest({}));
    expect(response.status).toBe(400);
  });

  it("returns 403 when the domain layer rejects the caller", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(createOperation).mockRejectedValue(new ForbiddenError());
    const response = await POST(jsonRequest({ title: "New Operation" }));
    expect(response.status).toBe(403);
  });

  it("creates the operation", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(createOperation).mockResolvedValue({ id: "op-1", title: "New Operation" } as never);
    const response = await POST(jsonRequest({ title: "New Operation" }));
    expect(response.status).toBe(201);
    expect(createOperation).toHaveBeenCalledWith(PROFILE, { title: "New Operation" });
  });
});
