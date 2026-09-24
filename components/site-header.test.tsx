import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: vi.fn(),
}));

import { getCurrentProfile } from "@/lib/auth/session";
import { SiteHeader } from "@/components/site-header";

beforeEach(() => {
  vi.mocked(getCurrentProfile).mockReset();
});

describe("SiteHeader", () => {
  it("passes the current profile's id to the notification bell", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue({ id: "profile-1" } as never);
    const element = await SiteHeader();
    expect(JSON.stringify(element)).toContain('"profileId":"profile-1"');
  });

  it("renders no notification bell when there is no current profile", async () => {
    vi.mocked(getCurrentProfile).mockResolvedValue(null);
    const element = await SiteHeader();
    expect(JSON.stringify(element)).not.toContain("profileId");
  });
});
