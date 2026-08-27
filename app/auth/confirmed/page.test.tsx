// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const getSessionMock = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { getSession: getSessionMock },
  }),
}));

import ConfirmedPage from "@/app/auth/confirmed/page";

beforeEach(() => {
  getSessionMock.mockReset();
});

describe("ConfirmedPage", () => {
  it("shows a confirmation message with a link back to sign up to finish the profile", async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "token" } } });
    render(<ConfirmedPage />);

    const link = await screen.findByRole("link", { name: /continue/i });
    expect(link).toHaveAttribute("href", "/signup");
  });

  it("shows an error message when no session is found", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    render(<ConfirmedPage />);

    expect(await screen.findByText(/invalid or expired/i)).toBeInTheDocument();
  });
});
