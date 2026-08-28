import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/requests", () => ({
  getRequest: vi.fn(),
}));
vi.mock("@/lib/domain/attachments", () => ({
  createSignedUploadUrl: vi.fn(),
}));
vi.mock("@/lib/domain/activity", () => ({
  logActivity: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { getRequest } from "@/lib/domain/requests";
import { createSignedUploadUrl } from "@/lib/domain/attachments";
import { POST } from "@/app/api/requests/[id]/attachments/route";
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
  vi.mocked(createSignedUploadUrl).mockReset();
});

describe("POST /api/requests/[id]/attachments", () => {
  it("creates a signed upload URL for a request the caller can view", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getRequest).mockResolvedValue({ id: "request-1", companyId: "company-1" } as never);
    vi.mocked(createSignedUploadUrl).mockResolvedValue({
      attachment: { id: "attachment-1", storagePath: "request/request-1/file.pdf" },
      signedUrl: "https://example.com/upload",
      token: "token-1",
    } as never);

    const response = await POST(jsonRequest({ filename: "file.pdf" }), params("request-1"));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.token).toBe("token-1");
    expect(createSignedUploadUrl).toHaveBeenCalledWith(
      "request",
      "request-1",
      PROFILE.id,
      "file.pdf"
    );
  });

  it("returns 400 for an empty filename", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(jsonRequest({ filename: "" }), params("request-1"));
    expect(response.status).toBe(400);
  });

  it("denies a caller who cannot view the request", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getRequest).mockRejectedValue(new ForbiddenError("nope"));

    const response = await POST(jsonRequest({ filename: "file.pdf" }), params("request-1"));
    expect(response.status).toBe(403);
  });
});
