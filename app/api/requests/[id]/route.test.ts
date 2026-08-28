import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/requests", () => ({
  getRequest: vi.fn(),
  transitionRequestStatus: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { getRequest, transitionRequestStatus } from "@/lib/domain/requests";
import { GET, PATCH } from "@/app/api/requests/[id]/route";
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
  vi.mocked(getRequest).mockReset();
  vi.mocked(transitionRequestStatus).mockReset();
});

describe("GET /api/requests/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost"), params("request-1"));
    expect(response.status).toBe(401);
  });

  it("returns 404 when the request does not exist", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getRequest).mockRejectedValue(new NotFoundError());
    const response = await GET(new Request("http://localhost"), params("request-1"));
    expect(response.status).toBe(404);
  });

  it("returns the request", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getRequest).mockResolvedValue({ id: "request-1" } as never);
    const response = await GET(new Request("http://localhost"), params("request-1"));
    expect(response.status).toBe(200);
  });
});

describe("PATCH /api/requests/[id]", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("calls transitionRequestStatus for a status payload", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(transitionRequestStatus).mockResolvedValue({
      id: "request-1",
      status: "in_progress",
    } as never);

    const response = await PATCH(jsonRequest({ status: "in_progress" }), params("request-1"));
    expect(response.status).toBe(200);
    expect(transitionRequestStatus).toHaveBeenCalledWith(PROFILE, "request-1", "in_progress");
  });

  it("returns 400 for an empty payload", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await PATCH(jsonRequest({}), params("request-1"));
    expect(response.status).toBe(400);
  });

  it("returns 400 for an invalid status value", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await PATCH(jsonRequest({ status: "nope" }), params("request-1"));
    expect(response.status).toBe(400);
  });
});
