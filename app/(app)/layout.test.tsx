import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
}));

const getUserMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

const getProfileByAuthUserIdMock = vi.fn();
vi.mock("@/lib/domain/profiles", () => ({
  getProfileByAuthUserId: (id: string) => getProfileByAuthUserIdMock(id),
}));

import AppLayout from "@/app/(app)/layout";

beforeEach(() => {
  redirectMock.mockClear();
  getUserMock.mockReset();
  getProfileByAuthUserIdMock.mockReset();
});

describe("AppLayout", () => {
  it("redirects to /login when there is no authenticated user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    await expect(AppLayout({ children: null })).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects to /signup when the user has no profile yet", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "auth-1" } } });
    getProfileByAuthUserIdMock.mockResolvedValue(null);

    await expect(AppLayout({ children: null })).rejects.toThrow("REDIRECT:/signup");
  });

  it("renders the shell with the profile's name and role", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "auth-1" } } });
    getProfileByAuthUserIdMock.mockResolvedValue({
      id: "profile-1",
      authUserId: "auth-1",
      companyId: "company-1",
      fullName: "Max Mustermann",
      role: "it",
      departmentId: null,
      managerId: null,
    });

    const element = await AppLayout({ children: "hello" });
    expect(JSON.stringify(element)).toContain("Max Mustermann");
    expect(JSON.stringify(element)).toContain("it");
  });
});
