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

import SettingsPage from "@/app/(app)/settings/page";

beforeEach(() => {
  redirectMock.mockClear();
  authMock.mockReset();
  currentUserMock.mockReset();
  getProfileByAuthUserIdMock.mockReset();
});

describe("SettingsPage", () => {
  it("redirects to /login when there is no authenticated user", async () => {
    authMock.mockResolvedValue({ userId: null });

    await expect(SettingsPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects to /signup when the user has no profile yet", async () => {
    authMock.mockResolvedValue({ userId: "auth-1" });
    getProfileByAuthUserIdMock.mockResolvedValue(null);

    await expect(SettingsPage()).rejects.toThrow("REDIRECT:/signup");
  });

  it("renders the profile's name, role, and email", async () => {
    authMock.mockResolvedValue({ userId: "auth-1" });
    currentUserMock.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "max@alpentech.example" },
    });
    getProfileByAuthUserIdMock.mockResolvedValue({
      id: "profile-1",
      authUserId: "auth-1",
      companyId: "company-1",
      fullName: "Max Mustermann",
      role: "it",
      departmentId: null,
      managerId: null,
      positionTitle: null,
      employeeNumber: null,
      locationId: null,
      relatedOperationId: null,
      status: "active",
    });

    const element = await SettingsPage();
    const serialized = JSON.stringify(element);
    expect(serialized).toContain("Max Mustermann");
    expect(serialized).toContain('"it"');
    expect(serialized).toContain("max@alpentech.example");
    expect(serialized).toContain("Profile");
    expect(serialized).toContain("Appearance");
  });
});
