import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/approvals", () => ({
  decideApproval: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { decideApproval } from "@/lib/domain/approvals";
import { POST } from "@/app/api/approvals/[id]/decide/route";
import { ForbiddenError, InvalidTransitionError } from "@/lib/domain/errors";

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
  vi.mocked(decideApproval).mockReset();
});

describe("POST /api/approvals/[id]/decide", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await POST(jsonRequest({ decision: "approved" }), params("approval-1"));
    expect(response.status).toBe(401);
  });

  it("records a decision", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(decideApproval).mockResolvedValue({
      id: "approval-1",
      status: "approved",
    } as never);

    const response = await POST(
      jsonRequest({ decision: "approved", comment: "Go ahead" }),
      params("approval-1")
    );
    expect(response.status).toBe(200);
    expect(decideApproval).toHaveBeenCalledWith(PROFILE, "approval-1", "approved", "Go ahead");
  });

  it("returns 400 for an invalid decision value", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(jsonRequest({ decision: "maybe" }), params("approval-1"));
    expect(response.status).toBe(400);
  });

  it("maps a ForbiddenError from the domain layer to 403", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(decideApproval).mockRejectedValue(new ForbiddenError("nope"));

    const response = await POST(jsonRequest({ decision: "approved" }), params("approval-1"));
    expect(response.status).toBe(403);
  });

  it("maps an InvalidTransitionError from the domain layer to 400", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(decideApproval).mockRejectedValue(new InvalidTransitionError("already decided"));

    const response = await POST(jsonRequest({ decision: "approved" }), params("approval-1"));
    expect(response.status).toBe(400);
  });
});
