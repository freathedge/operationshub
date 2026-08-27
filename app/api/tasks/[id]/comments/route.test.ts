import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/tasks", () => ({
  getTask: vi.fn(),
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
import { getTask } from "@/lib/domain/tasks";
import { addComment, listComments } from "@/lib/domain/comments";
import { GET, POST } from "@/app/api/tasks/[id]/comments/route";

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
  vi.mocked(addComment).mockReset();
  vi.mocked(listComments).mockReset();
});

describe("GET /api/tasks/[id]/comments", () => {
  it("returns comments for a task the caller can view", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getTask).mockResolvedValue(TASK as never);
    vi.mocked(listComments).mockResolvedValue([]);

    const response = await GET(new Request("http://localhost"), params("task-1"));
    expect(response.status).toBe(200);
    expect(listComments).toHaveBeenCalledWith("task", "task-1");
  });
});

describe("POST /api/tasks/[id]/comments", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("adds a comment for a task the caller can view", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getTask).mockResolvedValue(TASK as never);
    vi.mocked(addComment).mockResolvedValue({ id: "comment-1", body: "Looks good" } as never);

    const response = await POST(jsonRequest({ body: "Looks good" }), params("task-1"));
    expect(response.status).toBe(201);
    expect(addComment).toHaveBeenCalledWith("task", "task-1", PROFILE.id, "Looks good");
  });

  it("returns 400 for an empty body", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(jsonRequest({ body: "" }), params("task-1"));
    expect(response.status).toBe(400);
  });

  it("denies a caller who cannot view the task", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({
      ...PROFILE,
      id: "someone-else",
      companyId: "other-company",
    });
    vi.mocked(getTask).mockResolvedValue(TASK as never);

    const response = await POST(jsonRequest({ body: "Looks good" }), params("task-1"));
    expect(response.status).toBe(403);
  });
});
