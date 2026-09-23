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

import SettingsPage from "@/app/(app)/settings/page";

beforeEach(() => {
  redirectMock.mockClear();
  getUserMock.mockReset();
  getProfileByAuthUserIdMock.mockReset();
});

describe("SettingsPage", () => {
  it("redirects to /login when there is no authenticated user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    await expect(SettingsPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects to /signup when the user has no profile yet", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "auth-1" } } });
    getProfileByAuthUserIdMock.mockResolvedValue(null);

    await expect(SettingsPage()).rejects.toThrow("REDIRECT:/signup");
  });

  it("renders the profile's name, role, and email", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "auth-1", email: "max@alpentech.example" } },
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
  });
});
