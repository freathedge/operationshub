import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: getUserMock } }),
}));

const getProfileByAuthUserIdMock = vi.fn();
vi.mock("@/lib/domain/profiles", () => ({
  getProfileByAuthUserId: (id: string) => getProfileByAuthUserIdMock(id),
}));

import { getCurrentProfile } from "@/lib/auth/session";

beforeEach(() => {
  getUserMock.mockReset();
  getProfileByAuthUserIdMock.mockReset();
});

describe("getCurrentProfile", () => {
  it("returns null when there is no authenticated user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const result = await getCurrentProfile();
    expect(result).toBeNull();
  });

  it("returns null when the user has no profile yet", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "auth-1" } } });
    getProfileByAuthUserIdMock.mockResolvedValue(null);
    const result = await getCurrentProfile();
    expect(result).toBeNull();
  });

  it("returns the profile for the authenticated user", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "auth-1" } } });
    getProfileByAuthUserIdMock.mockResolvedValue({ id: "profile-1", authUserId: "auth-1" });
    const result = await getCurrentProfile();
    expect(result).toEqual({ id: "profile-1", authUserId: "auth-1" });
  });
});
