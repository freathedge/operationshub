import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/operations", () => ({
  linkEntity: vi.fn(),
  unlinkEntity: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { linkEntity, unlinkEntity } from "@/lib/domain/operations";
import { POST } from "@/app/api/operations/[id]/link/route";
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
  vi.mocked(linkEntity).mockReset();
  vi.mocked(unlinkEntity).mockReset();
});

describe("POST /api/operations/[id]/link", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await POST(
      jsonRequest({ action: "link", entityType: "task", entityId: "task-1" }),
      params("op-1")
    );
    expect(response.status).toBe(401);
  });

  it("returns 400 for an unknown entity type", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(
      jsonRequest({ action: "link", entityType: "invoice", entityId: "11111111-1111-4111-8111-111111111111" }),
      params("op-1")
    );
    expect(response.status).toBe(400);
  });

  it("calls linkEntity for a link action", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(linkEntity).mockResolvedValue(undefined);
    const response = await POST(
      jsonRequest({
        action: "link",
        entityType: "task",
        entityId: "11111111-1111-4111-8111-111111111111",
      }),
      params("op-1")
    );
    expect(response.status).toBe(200);
    expect(linkEntity).toHaveBeenCalledWith(
      PROFILE,
      "op-1",
      "task",
      "11111111-1111-4111-8111-111111111111"
    );
  });

  it("calls unlinkEntity for an unlink action", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(unlinkEntity).mockResolvedValue(undefined);
    const response = await POST(
      jsonRequest({
        action: "unlink",
        entityType: "employee",
        entityId: "11111111-1111-4111-8111-111111111111",
      }),
      params("op-1")
    );
    expect(response.status).toBe(200);
    expect(unlinkEntity).toHaveBeenCalledWith(
      PROFILE,
      "op-1",
      "employee",
      "11111111-1111-4111-8111-111111111111"
    );
  });

  it("returns 403 when the domain layer rejects the caller", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(linkEntity).mockRejectedValue(new ForbiddenError());
    const response = await POST(
      jsonRequest({
        action: "link",
        entityType: "task",
        entityId: "11111111-1111-4111-8111-111111111111",
      }),
      params("op-1")
    );
    expect(response.status).toBe(403);
  });
});
