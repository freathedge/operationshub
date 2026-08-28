import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));
vi.mock("@/lib/domain/approvals", () => ({
  reassignApproval: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { reassignApproval } from "@/lib/domain/approvals";
import { POST } from "@/app/api/approvals/[id]/reassign/route";
import { ForbiddenError, UnprocessableRequestError } from "@/lib/domain/errors";

const PROFILE = {
  id: "profile-1",
  authUserId: "auth-1",
  companyId: "company-1",
  fullName: "Test User",
  role: "operations_manager" as const,
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
  vi.mocked(reassignApproval).mockReset();
});

describe("POST /api/approvals/[id]/reassign", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const response = await POST(
      jsonRequest({ newApproverId: "11111111-1111-4111-8111-111111111111" }),
      params("approval-1")
    );
    expect(response.status).toBe(401);
  });

  it("returns 400 for a malformed JSON body", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const malformedRequest = new Request("http://localhost", {
      method: "POST",
      body: "{not valid json",
      headers: { "content-type": "application/json" },
    });
    const response = await POST(malformedRequest, params("approval-1"));
    expect(response.status).toBe(400);
  });

  it("records a reassignment", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(reassignApproval).mockResolvedValue({
      id: "approval-1",
      approverId: "11111111-1111-4111-8111-111111111111",
      status: "pending",
    } as never);

    const response = await POST(
      jsonRequest({
        newApproverId: "11111111-1111-4111-8111-111111111111",
        comment: "Better suited to review this",
      }),
      params("approval-1")
    );
    expect(response.status).toBe(200);
    expect(reassignApproval).toHaveBeenCalledWith(
      PROFILE,
      "approval-1",
      "11111111-1111-4111-8111-111111111111",
      "Better suited to review this"
    );
  });

  it("returns 400 for a non-uuid newApproverId", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    const response = await POST(jsonRequest({ newApproverId: "not-a-uuid" }), params("approval-1"));
    expect(response.status).toBe(400);
  });

  it("maps a ForbiddenError from the domain layer to 403", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(reassignApproval).mockRejectedValue(new ForbiddenError("nope"));

    const response = await POST(
      jsonRequest({ newApproverId: "11111111-1111-4111-8111-111111111111" }),
      params("approval-1")
    );
    expect(response.status).toBe(403);
  });

  it("maps an UnprocessableRequestError from the domain layer to 422", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(PROFILE);
    vi.mocked(reassignApproval).mockRejectedValue(
      new UnprocessableRequestError("The new approver must have the same role")
    );

    const response = await POST(
      jsonRequest({ newApproverId: "11111111-1111-4111-8111-111111111111" }),
      params("approval-1")
    );
    expect(response.status).toBe(422);
  });
});
