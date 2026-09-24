import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
}));

const authMock = vi.fn();
const currentUserMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
  currentUser: () => currentUserMock(),
}));

const getProfileByAuthUserIdMock = vi.fn();
vi.mock("@/lib/domain/profiles", () => ({
  getProfileByAuthUserId: (id: string) => getProfileByAuthUserIdMock(id),
}));

const cookiesMock = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => cookiesMock(),
}));

import AppLayout from "@/app/(app)/layout";

beforeEach(() => {
  redirectMock.mockClear();
  authMock.mockReset();
  currentUserMock.mockReset();
  getProfileByAuthUserIdMock.mockReset();
  cookiesMock.mockReset();
  cookiesMock.mockReturnValue({ get: () => undefined });
});

describe("AppLayout", () => {
  it("redirects to /login when there is no authenticated user", async () => {
    authMock.mockResolvedValue({ userId: null });

    await expect(AppLayout({ children: null })).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects to /signup when the user has no profile yet", async () => {
    authMock.mockResolvedValue({ userId: "auth-1" });
    getProfileByAuthUserIdMock.mockResolvedValue(null);

    await expect(AppLayout({ children: null })).rejects.toThrow("REDIRECT:/signup");
  });

  it("renders the shell with the profile's name and role", async () => {
    authMock.mockResolvedValue({ userId: "auth-1" });
    currentUserMock.mockResolvedValue({
      emailAddresses: [{ emailAddress: "max@alpentech.example" }],
    });
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
    expect(JSON.stringify(element)).toContain('"role":"it"');
  });
});
