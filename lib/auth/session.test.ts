import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

const getProfileByAuthUserIdMock = vi.fn();
vi.mock("@/lib/domain/profiles", () => ({
  getProfileByAuthUserId: (id: string) => getProfileByAuthUserIdMock(id),
}));

import { getCurrentProfile } from "@/lib/auth/session";

beforeEach(() => {
  authMock.mockReset();
  getProfileByAuthUserIdMock.mockReset();
});

describe("getCurrentProfile", () => {
  it("returns null when there is no authenticated user", async () => {
    authMock.mockResolvedValue({ userId: null });
    const result = await getCurrentProfile();
    expect(result).toBeNull();
  });

  it("returns null when the user has no profile yet", async () => {
    authMock.mockResolvedValue({ userId: "user_clerk123" });
    getProfileByAuthUserIdMock.mockResolvedValue(null);
    const result = await getCurrentProfile();
    expect(result).toBeNull();
  });

  it("returns the profile for the authenticated user", async () => {
    authMock.mockResolvedValue({ userId: "user_clerk123" });
    getProfileByAuthUserIdMock.mockResolvedValue({ id: "profile-1", authUserId: "user_clerk123" });
    const result = await getCurrentProfile();
    expect(result).toEqual({ id: "profile-1", authUserId: "user_clerk123" });
  });
});
