import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/assets", () => ({
  createAsset: vi.fn(),
  listAssets: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { createAsset, listAssets } from "@/lib/domain/assets";
import { GET, POST } from "@/app/api/assets/route";
import { ForbiddenError } from "@/lib/domain/errors";

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

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(createAsset).mockReset();
  vi.mocked(listAssets).mockReset();
});

describe("GET /api/assets", () => {
  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/assets"));
    expect(response.status).toBe(401);
  });

  it("returns assets scoped by the caller's filters", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(listAssets).mockResolvedValue([]);

    const response = await GET(new Request("http://localhost/api/assets?category=laptop"));
    expect(response.status).toBe(200);
    expect(listAssets).toHaveBeenCalledWith(PROFILE, { category: "laptop" });
  });

  it("returns 400 for an invalid filter value", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await GET(new Request("http://localhost/api/assets?status=broken"));
    expect(response.status).toBe(400);
  });
});

describe("POST /api/assets", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost/api/assets", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await POST(jsonRequest({ name: "x", category: "laptop" }));
    expect(response.status).toBe(401);
  });

  it("creates an asset", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(createAsset).mockResolvedValue({ id: "asset-1" } as never);

    const response = await POST(jsonRequest({ name: "MacBook Pro", category: "laptop" }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.asset.id).toBe("asset-1");
  });

  it("returns 400 for an invalid body", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(jsonRequest({ name: "", category: "" }));
    expect(response.status).toBe(400);
  });

  it("maps a ForbiddenError from the domain layer to 403", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(createAsset).mockRejectedValue(new ForbiddenError("no"));

    const response = await POST(jsonRequest({ name: "MacBook Pro", category: "laptop" }));
    expect(response.status).toBe(403);
  });
});
