import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/assets", () => ({
  getAsset: vi.fn(),
  assignAsset: vi.fn(),
  changeAssetStatus: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { getAsset, assignAsset, changeAssetStatus } from "@/lib/domain/assets";
import { GET, PATCH } from "@/app/api/assets/[id]/route";
import { ForbiddenError, NotFoundError } from "@/lib/domain/errors";

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

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(getAsset).mockReset();
  vi.mocked(assignAsset).mockReset();
  vi.mocked(changeAssetStatus).mockReset();
});

describe("GET /api/assets/[id]", () => {
  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost"), params("asset-1"));
    expect(response.status).toBe(401);
  });

  it("returns the asset", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getAsset).mockResolvedValue({ id: "asset-1" } as never);

    const response = await GET(new Request("http://localhost"), params("asset-1"));
    expect(response.status).toBe(200);
  });

  it("maps a NotFoundError to 404", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getAsset).mockRejectedValue(new NotFoundError("no"));

    const response = await GET(new Request("http://localhost"), params("missing"));
    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/assets/[id]", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await PATCH(
      jsonRequest({ action: "changeStatus", status: "maintenance" }),
      params("asset-1")
    );
    expect(response.status).toBe(401);
  });

  it("assigns the asset when action is assign", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(assignAsset).mockResolvedValue({ id: "asset-1", assignedTo: "employee-1" } as never);

    const response = await PATCH(
      jsonRequest({ action: "assign", targetEmployeeId: "11111111-1111-4111-8111-111111111111" }),
      params("asset-1")
    );
    expect(response.status).toBe(200);
    expect(assignAsset).toHaveBeenCalledWith(
      PROFILE,
      "asset-1",
      "11111111-1111-4111-8111-111111111111"
    );
  });

  it("changes the asset's status when action is changeStatus", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(changeAssetStatus).mockResolvedValue({ id: "asset-1", status: "maintenance" } as never);

    const response = await PATCH(
      jsonRequest({ action: "changeStatus", status: "maintenance" }),
      params("asset-1")
    );
    expect(response.status).toBe(200);
    expect(changeAssetStatus).toHaveBeenCalledWith(PROFILE, "asset-1", "maintenance");
  });

  it("returns 400 for an invalid body", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await PATCH(jsonRequest({ action: "retire" }), params("asset-1"));
    expect(response.status).toBe(400);
  });

  it("maps a ForbiddenError to 403", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(changeAssetStatus).mockRejectedValue(new ForbiddenError("no"));

    const response = await PATCH(
      jsonRequest({ action: "changeStatus", status: "maintenance" }),
      params("asset-1")
    );
    expect(response.status).toBe(403);
  });
});
