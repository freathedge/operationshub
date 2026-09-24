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
vi.mock("@/lib/domain/notifications", () => ({
  createNotification: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { getTask } from "@/lib/domain/tasks";
import { addComment, listComments } from "@/lib/domain/comments";
import { createNotification } from "@/lib/domain/notifications";
import { GET, POST } from "@/app/api/tasks/[id]/comments/route";

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
  vi.mocked(createNotification).mockReset();
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

  it("notifies the assignee when someone else comments, but not the assignee's own comment", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getTask).mockResolvedValue({ ...TASK, assigneeId: "assignee-1" } as never);
    vi.mocked(addComment).mockResolvedValue({ id: "comment-1" } as never);

    await POST(jsonRequest({ body: "Looks good" }), params("task-1"));
    expect(createNotification).toHaveBeenCalledWith(
      "assignee-1",
      "task",
      "task-1",
      "comment_added",
      expect.stringContaining("commented")
    );

    vi.mocked(createNotification).mockClear();
    vi.mocked(getTask).mockResolvedValue({ ...TASK, assigneeId: PROFILE.id } as never);
    await POST(jsonRequest({ body: "My own comment" }), params("task-1"));
    expect(createNotification).not.toHaveBeenCalled();

    vi.mocked(createNotification).mockClear();
    vi.mocked(getTask).mockResolvedValue({ ...TASK, assigneeId: null } as never);
    await POST(jsonRequest({ body: "On an unassigned task" }), params("task-1"));
    expect(createNotification).not.toHaveBeenCalled();
  });
});
