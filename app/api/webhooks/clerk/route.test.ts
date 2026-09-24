import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyWebhookMock = vi.fn();
vi.mock("@clerk/nextjs/webhooks", () => ({
  verifyWebhook: (req: Request) => verifyWebhookMock(req),
}));

const linkProfileToAuthUserMock = vi.fn();
vi.mock("@/lib/domain/profiles", () => ({
  linkProfileToAuthUser: (profileId: string, authUserId: string) =>
    linkProfileToAuthUserMock(profileId, authUserId),
}));

import { POST } from "@/app/api/webhooks/clerk/route";

function req() {
  return new Request("http://localhost/api/webhooks/clerk", { method: "POST" });
}

beforeEach(() => {
  verifyWebhookMock.mockReset();
  linkProfileToAuthUserMock.mockReset();
});

describe("POST /api/webhooks/clerk", () => {
  it("returns 400 when signature verification fails", async () => {
    verifyWebhookMock.mockRejectedValue(new Error("invalid signature"));
    const response = await POST(req());
    expect(response.status).toBe(400);
    expect(linkProfileToAuthUserMock).not.toHaveBeenCalled();
  });

  it("links a pending profile when user.created carries pendingProfileId metadata", async () => {
    verifyWebhookMock.mockResolvedValue({
      type: "user.created",
      data: { id: "user_clerk123", public_metadata: { pendingProfileId: "profile-1" } },
    });
    const response = await POST(req());
    expect(response.status).toBe(200);
    expect(linkProfileToAuthUserMock).toHaveBeenCalledWith("profile-1", "user_clerk123");
  });

  it("is a no-op (200) for user.created with no pendingProfileId metadata", async () => {
    verifyWebhookMock.mockResolvedValue({
      type: "user.created",
      data: { id: "user_clerk123", public_metadata: {} },
    });
    const response = await POST(req());
    expect(response.status).toBe(200);
    expect(linkProfileToAuthUserMock).not.toHaveBeenCalled();
  });

  it("is a no-op (200) for event types other than user.created", async () => {
    verifyWebhookMock.mockResolvedValue({
      type: "user.updated",
      data: { id: "user_clerk123", public_metadata: { pendingProfileId: "profile-1" } },
    });
    const response = await POST(req());
    expect(response.status).toBe(200);
    expect(linkProfileToAuthUserMock).not.toHaveBeenCalled();
  });
});
