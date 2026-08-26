import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("@/lib/domain/profiles", () => ({
  getProfileByAuthUserId: vi.fn(),
  createProfile: vi.fn(),
}));
vi.mock("@/lib/domain/companies", () => ({
  getDefaultCompany: vi.fn(),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
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
  vi.mocked(createSupabaseServerClient).mockReset();
  vi.mocked(getProfileByAuthUserId).mockReset();
  vi.mocked(createProfile).mockReset();
  vi.mocked(getDefaultCompany).mockReset();
});

describe("POST /api/auth/complete-signup", () => {
  it("returns 401 when there is no authenticated user", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as never);

    const response = await POST(jsonRequest({ fullName: "Max", role: "employee" }));
    expect(response.status).toBe(401);
  });

  it("creates a profile for an authenticated user without one yet", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "auth-1" } } }) },
    } as never);
    vi.mocked(getProfileByAuthUserId).mockResolvedValue(null);
    vi.mocked(getDefaultCompany).mockResolvedValue({
      id: "company-1",
      name: "AlpenTech Industries",
      slug: "alpentech-industries",
    });
    vi.mocked(createProfile).mockResolvedValue({
      id: "profile-1",
      authUserId: "auth-1",
      companyId: "company-1",
      fullName: "Max",
      role: "employee",
      departmentId: null,
      managerId: null,
    });

    const response = await POST(jsonRequest({ fullName: "Max", role: "employee" }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.profile.fullName).toBe("Max");
  });

  it("returns 409 when a profile already exists", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "auth-1" } } }) },
    } as never);
    vi.mocked(getProfileByAuthUserId).mockResolvedValue({
      id: "profile-1",
      authUserId: "auth-1",
      companyId: "company-1",
      fullName: "Max",
      role: "employee",
      departmentId: null,
      managerId: null,
    });

    const response = await POST(jsonRequest({ fullName: "Max", role: "employee" }));
    expect(response.status).toBe(409);
  });

  it("returns 400 for an invalid role", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "auth-1" } } }) },
    } as never);
    vi.mocked(getProfileByAuthUserId).mockResolvedValue(null);

    const response = await POST(jsonRequest({ fullName: "Max", role: "ceo" }));
    expect(response.status).toBe(400);
  });

  it("returns 500 with a JSON body when a domain call throws", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "auth-1" } } }) },
    } as never);
    vi.mocked(getProfileByAuthUserId).mockResolvedValue(null);
    vi.mocked(getDefaultCompany).mockRejectedValue(new Error("boom"));

    const response = await POST(jsonRequest({ fullName: "Max", role: "employee" }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Internal server error");
  });
});
