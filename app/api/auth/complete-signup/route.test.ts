import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));
vi.mock("@/lib/domain/profiles", () => ({
  getProfileByAuthUserId: vi.fn(),
  createProfile: vi.fn(),
}));
vi.mock("@/lib/domain/companies", () => ({
  getDefaultCompany: vi.fn(),
}));

import { getProfileByAuthUserId, createProfile } from "@/lib/domain/profiles";
import { getDefaultCompany } from "@/lib/domain/companies";
import { POST } from "@/app/api/auth/complete-signup/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/auth/complete-signup", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  authMock.mockReset();
  vi.mocked(getProfileByAuthUserId).mockReset();
  vi.mocked(createProfile).mockReset();
  vi.mocked(getDefaultCompany).mockReset();
});

describe("POST /api/auth/complete-signup", () => {
  it("returns 401 when there is no authenticated user", async () => {
    authMock.mockResolvedValue({ userId: null });
    const response = await POST(jsonRequest({ fullName: "Max", role: "employee" }));
    expect(response.status).toBe(401);
  });

  it("creates a profile for an authenticated user without one yet", async () => {
    authMock.mockResolvedValue({ userId: "user_clerk123" });
    vi.mocked(getProfileByAuthUserId).mockResolvedValue(null);
    vi.mocked(getDefaultCompany).mockResolvedValue({
      id: "company-1",
      name: "AlpenTech Industries",
      slug: "alpentech-industries",
    });
    vi.mocked(createProfile).mockResolvedValue({
      id: "profile-1",
      authUserId: "user_clerk123",
      companyId: "company-1",
      fullName: "Max",
      role: "employee",
      departmentId: null,
      managerId: null,
      positionTitle: null,
      employeeNumber: null,
      locationId: null,
      relatedOperationId: null,
      status: "active" as const,
    });

    const response = await POST(jsonRequest({ fullName: "Max", role: "employee" }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.profile.fullName).toBe("Max");
  });

  it("returns 409 when a profile already exists", async () => {
    authMock.mockResolvedValue({ userId: "user_clerk123" });
    vi.mocked(getProfileByAuthUserId).mockResolvedValue({
      id: "profile-1",
      authUserId: "user_clerk123",
      companyId: "company-1",
      fullName: "Max",
      role: "employee",
      departmentId: null,
      managerId: null,
      positionTitle: null,
      employeeNumber: null,
      locationId: null,
      relatedOperationId: null,
      status: "active" as const,
    });

    const response = await POST(jsonRequest({ fullName: "Max", role: "employee" }));
    expect(response.status).toBe(409);
  });

  it("returns 400 for an invalid role", async () => {
    authMock.mockResolvedValue({ userId: "user_clerk123" });
    vi.mocked(getProfileByAuthUserId).mockResolvedValue(null);
    const response = await POST(jsonRequest({ fullName: "Max", role: "ceo" }));
    expect(response.status).toBe(400);
  });

  it("returns 500 with a JSON body when a domain call throws", async () => {
    authMock.mockResolvedValue({ userId: "user_clerk123" });
    vi.mocked(getProfileByAuthUserId).mockResolvedValue(null);
    vi.mocked(getDefaultCompany).mockRejectedValue(new Error("boom"));
    const response = await POST(jsonRequest({ fullName: "Max", role: "employee" }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Internal server error");
  });
});
