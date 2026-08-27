import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/tasks", () => ({
  getTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  assignTask: vi.fn(),
  deleteTask: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { assignTask, deleteTask, getTask, updateTaskStatus } from "@/lib/domain/tasks";
import { GET, PATCH, DELETE } from "@/app/api/tasks/[id]/route";
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
  vi.mocked(getTask).mockReset();
  vi.mocked(updateTaskStatus).mockReset();
  vi.mocked(assignTask).mockReset();
  vi.mocked(deleteTask).mockReset();
});

describe("GET /api/tasks/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost"), params("task-1"));
    expect(response.status).toBe(401);
  });

  it("returns 404 when the task does not exist", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getTask).mockRejectedValue(new NotFoundError());
    const response = await GET(new Request("http://localhost"), params("task-1"));
    expect(response.status).toBe(404);
  });

  it("returns the task", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(getTask).mockResolvedValue({ id: "task-1" } as never);
    const response = await GET(new Request("http://localhost"), params("task-1"));
    expect(response.status).toBe(200);
  });
});

describe("PATCH /api/tasks/[id]", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("calls updateTaskStatus for a status payload", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(updateTaskStatus).mockResolvedValue({ id: "task-1", status: "in_progress" } as never);

    const response = await PATCH(jsonRequest({ status: "in_progress" }), params("task-1"));
    expect(response.status).toBe(200);
    expect(updateTaskStatus).toHaveBeenCalledWith(PROFILE, "task-1", "in_progress");
  });

  it("calls assignTask for an assigneeId payload", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(assignTask).mockResolvedValue({ id: "task-1" } as never);

    const response = await PATCH(
      jsonRequest({ assigneeId: "11111111-1111-4111-8111-111111111111" }),
      params("task-1")
    );
    expect(response.status).toBe(200);
    expect(assignTask).toHaveBeenCalledWith(
      PROFILE,
      "task-1",
      "11111111-1111-4111-8111-111111111111"
    );
  });

  it("returns 400 for an empty payload", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await PATCH(jsonRequest({}), params("task-1"));
    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/tasks/[id]", () => {
  it("returns 204 on success", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(deleteTask).mockResolvedValue(undefined);
    const response = await DELETE(new Request("http://localhost"), params("task-1"));
    expect(response.status).toBe(204);
  });
});
