import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/requests", () => ({
  getRequest: vi.fn(),
}));
vi.mock("@/lib/domain/comments", () => ({
  addComment: vi.fn(),
}));
vi.mock("@/lib/domain/activity", () => ({
  logActivity: vi.fn(),
}));
vi.mock("@/lib/realtime/broadcast", () => ({
  broadcastChange: vi.fn(),
}));
vi.mock("@/lib/domain/notifications", () => ({ createNotification: vi.fn() }));

import { getCurrentProfile } from "@/lib/auth/session";
import { getRequest } from "@/lib/domain/requests";
import { addComment } from "@/lib/domain/comments";
import { createNotification } from "@/lib/domain/notifications";
import { POST } from "@/app/api/requests/[id]/comments/route";
import { ForbiddenError } from "@/lib/domain/errors";

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

function jsonRequest(body: unknown) {
  return new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(getRequest).mockReset();
  vi.mocked(addComment).mockReset();
  vi.mocked(createNotification).mockReset();
});

describe("POST /api/requests/[id]/comments", () => {
  it("adds a comment for a request the caller can view", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getRequest).mockResolvedValue({ id: "request-1", companyId: "company-1" } as never);
    vi.mocked(addComment).mockResolvedValue({ id: "comment-1", body: "Looks good" } as never);

    const response = await POST(jsonRequest({ body: "Looks good" }), params("request-1"));
    expect(response.status).toBe(201);
    expect(addComment).toHaveBeenCalledWith("request", "request-1", PROFILE.id, "Looks good");
  });

  it("returns 400 for an empty body", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(jsonRequest({ body: "" }), params("request-1"));
    expect(response.status).toBe(400);
  });

  it("denies a caller who cannot view the request", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getRequest).mockRejectedValue(new ForbiddenError("nope"));

    const response = await POST(jsonRequest({ body: "Looks good" }), params("request-1"));
    expect(response.status).toBe(403);
  });

  it("notifies the request's creator when someone else comments, but not their own comment", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getRequest).mockResolvedValue({
      id: "request-1",
      companyId: "company-1",
      title: "Broken monitor",
      createdBy: "creator-1",
    } as never);
    vi.mocked(addComment).mockResolvedValue({ id: "comment-1" } as never);

    await POST(jsonRequest({ body: "Update" }), params("request-1"));
    expect(createNotification).toHaveBeenCalledWith(
      "creator-1",
      "request",
      "request-1",
      "comment_added",
      expect.stringContaining("commented")
    );

    vi.mocked(createNotification).mockClear();
    vi.mocked(getRequest).mockResolvedValue({
      id: "request-1",
      companyId: "company-1",
      title: "Broken monitor",
      createdBy: PROFILE.id,
    } as never);
    await POST(jsonRequest({ body: "My own" }), params("request-1"));
    expect(createNotification).not.toHaveBeenCalled();

    vi.mocked(createNotification).mockClear();
    vi.mocked(getRequest).mockResolvedValue({
      id: "request-1",
      companyId: "company-1",
      title: "Broken monitor",
      createdBy: null,
    } as never);
    await POST(jsonRequest({ body: "No creator on record" }), params("request-1"));
    expect(createNotification).not.toHaveBeenCalled();
  });
});
