import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/requests", () => ({
  createRequest: vi.fn(),
  listRequests: vi.fn(),
  submitRequest: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { createRequest, listRequests, submitRequest } from "@/lib/domain/requests";
import { GET, POST } from "@/app/api/requests/route";
import { ForbiddenError } from "@/lib/domain/errors";

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
  vi.mocked(createRequest).mockReset();
  vi.mocked(listRequests).mockReset();
  vi.mocked(submitRequest).mockReset();
});

describe("GET /api/requests", () => {
  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/requests"));
    expect(response.status).toBe(401);
  });

  it("returns requests scoped by the caller's filters", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(listRequests).mockResolvedValue([]);

    const response = await GET(new Request("http://localhost/api/requests?scope=mine"));
    expect(response.status).toBe(200);
    expect(listRequests).toHaveBeenCalledWith(PROFILE, { scope: "mine" });
  });

  it("returns 400 for an invalid filter value", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await GET(new Request("http://localhost/api/requests?status=nope"));
    expect(response.status).toBe(400);
  });
});

describe("POST /api/requests", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost/api/requests", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await POST(jsonRequest({ title: "x", category: "general" }));
    expect(response.status).toBe(401);
  });

  it("creates and submits a request", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(createRequest).mockResolvedValue({ id: "request-1", status: "draft" } as never);
    vi.mocked(submitRequest).mockResolvedValue({
      id: "request-1",
      status: "under_review",
    } as never);

    const response = await POST(jsonRequest({ title: "New laptop", category: "equipment" }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.request.status).toBe("under_review");
    expect(submitRequest).toHaveBeenCalledWith(PROFILE, "request-1");
  });

  it("returns 400 for an invalid body", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(jsonRequest({ title: "" }));
    expect(response.status).toBe(400);
  });

  it("maps a ForbiddenError from the domain layer to 403", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(createRequest).mockRejectedValue(new ForbiddenError("no"));

    const response = await POST(jsonRequest({ title: "New laptop", category: "equipment" }));
    expect(response.status).toBe(403);
  });
});
