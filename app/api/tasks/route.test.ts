import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/tasks", () => ({
  createTask: vi.fn(),
  listTasks: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { createTask, listTasks } from "@/lib/domain/tasks";
import { GET, POST } from "@/app/api/tasks/route";
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
  vi.mocked(createTask).mockReset();
  vi.mocked(listTasks).mockReset();
});

describe("GET /api/tasks", () => {
  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/tasks"));
    expect(response.status).toBe(401);
  });

  it("returns tasks scoped by the caller's filters", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(listTasks).mockResolvedValue([]);

    const response = await GET(new Request("http://localhost/api/tasks?status=todo"));
    expect(response.status).toBe(200);
    expect(listTasks).toHaveBeenCalledWith(PROFILE, { status: "todo" });
  });

  it("returns 400 for an invalid filter value", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await GET(new Request("http://localhost/api/tasks?status=nope"));
    expect(response.status).toBe(400);
  });
});

describe("POST /api/tasks", () => {
  function jsonRequest(body: unknown) {
    return new Request("http://localhost/api/tasks", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 401 when there is no authenticated profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await POST(jsonRequest({ title: "x" }));
    expect(response.status).toBe(401);
  });

  it("creates a task", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(createTask).mockResolvedValue({ id: "task-1" } as never);

    const response = await POST(jsonRequest({ title: "Prepare laptop" }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.task.id).toBe("task-1");
  });

  it("returns 400 for an invalid body", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(jsonRequest({ title: "" }));
    expect(response.status).toBe(400);
  });

  it("maps a ForbiddenError from the domain layer to 403", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(createTask).mockRejectedValue(new ForbiddenError("no"));

    const response = await POST(jsonRequest({ title: "Prepare laptop" }));
    expect(response.status).toBe(403);
  });
});
