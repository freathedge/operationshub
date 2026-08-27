import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/tasks", () => ({
  getTask: vi.fn(),
}));
vi.mock("@/lib/domain/attachments", () => ({
  createSignedUploadUrl: vi.fn(),
  createSignedDownloadUrl: vi.fn(),
  listAttachments: vi.fn(),
}));
vi.mock("@/lib/domain/activity", () => ({
  logActivity: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { getTask } from "@/lib/domain/tasks";
import {
  createSignedDownloadUrl,
  createSignedUploadUrl,
  listAttachments,
} from "@/lib/domain/attachments";
import { GET, POST } from "@/app/api/tasks/[id]/attachments/route";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "Test User",
  role: "employee" as const,
  departmentId: null,
  managerId: null,
};

const TASK = {
  id: "task-1",
  companyId: "company-1",
  creatorId: "profile-1",
  assigneeId: null,
  departmentId: null,
};

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
  vi.mocked(getTask).mockReset();
  vi.mocked(createSignedUploadUrl).mockReset();
  vi.mocked(createSignedDownloadUrl).mockReset();
  vi.mocked(listAttachments).mockReset();
});

describe("GET /api/tasks/[id]/attachments", () => {
  it("returns attachments with a fresh download URL for each", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getTask).mockResolvedValue(TASK as never);
    vi.mocked(listAttachments).mockResolvedValue([
      { id: "attachment-1", storagePath: "task/task-1/file.pdf" } as never,
    ]);
    vi.mocked(createSignedDownloadUrl).mockResolvedValue("https://example.com/signed");

    const response = await GET(new Request("http://localhost"), params("task-1"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.attachments[0].downloadUrl).toBe("https://example.com/signed");
  });
});

describe("POST /api/tasks/[id]/attachments", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("creates a signed upload URL for a task the caller can view", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getTask).mockResolvedValue(TASK as never);
    vi.mocked(createSignedUploadUrl).mockResolvedValue({
      attachment: { id: "attachment-1", storagePath: "task/task-1/file.pdf" },
      signedUrl: "https://example.com/upload",
      token: "token-1",
    } as never);

    const response = await POST(jsonRequest({ filename: "file.pdf" }), params("task-1"));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.token).toBe("token-1");
  });

  it("returns 400 for an empty filename", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(jsonRequest({ filename: "" }), params("task-1"));
    expect(response.status).toBe(400);
  });
});
