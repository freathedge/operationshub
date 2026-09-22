import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/operations", () => ({
  loadOperationOrThrow: vi.fn(),
}));
vi.mock("@/lib/domain/comments", () => ({
  addComment: vi.fn(),
  listComments: vi.fn(),
}));
vi.mock("@/lib/domain/activity", () => ({
  logActivity: vi.fn(),
}));
vi.mock("@/lib/realtime/broadcast", () => ({
  broadcastChange: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { loadOperationOrThrow } from "@/lib/domain/operations";
import { addComment, listComments } from "@/lib/domain/comments";
import { GET, POST } from "@/app/api/operations/[id]/comments/route";
import { NotFoundError } from "@/lib/domain/errors";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "Test User",
  role: "employee" as const,
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
  vi.mocked(loadOperationOrThrow).mockReset();
  vi.mocked(addComment).mockReset();
  vi.mocked(listComments).mockReset();
});

describe("GET /api/operations/[id]/comments", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost"), params("op-1"));
    expect(response.status).toBe(401);
  });

  it("returns 404 when the operation does not exist", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(loadOperationOrThrow).mockRejectedValue(new NotFoundError());
    const response = await GET(new Request("http://localhost"), params("op-1"));
    expect(response.status).toBe(404);
  });

  it("returns 403 for a caller from a different company", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(loadOperationOrThrow).mockResolvedValue({
      id: "op-1",
      companyId: "other-company",
    } as never);
    const response = await GET(new Request("http://localhost"), params("op-1"));
    expect(response.status).toBe(403);
  });

  it("returns the comments", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(loadOperationOrThrow).mockResolvedValue({
      id: "op-1",
      companyId: "company-1",
    } as never);
    vi.mocked(listComments).mockResolvedValue([{ id: "comment-1", body: "Looks good" } as never]);
    const response = await GET(new Request("http://localhost"), params("op-1"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.comments).toEqual([{ id: "comment-1", body: "Looks good" }]);
  });
});

describe("POST /api/operations/[id]/comments", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 400 for an empty comment body", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(jsonRequest({ body: "" }), params("op-1"));
    expect(response.status).toBe(400);
  });

  it("adds the comment", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(loadOperationOrThrow).mockResolvedValue({
      id: "op-1",
      companyId: "company-1",
    } as never);
    vi.mocked(addComment).mockResolvedValue({ id: "comment-1", body: "New comment" } as never);
    const response = await POST(jsonRequest({ body: "New comment" }), params("op-1"));
    expect(response.status).toBe(201);
    expect(addComment).toHaveBeenCalledWith("operation", "op-1", PROFILE.id, "New comment");
  });
});
