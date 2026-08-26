// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const getSessionMock = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { getSession: getSessionMock },
  }),
}));

import ConfirmedPage from "@/app/auth/confirmed/page";

beforeEach(() => {
  pushMock.mockReset();
  getSessionMock.mockReset();
});

describe("ConfirmedPage", () => {
  it("shows a confirmation message and continues to the dashboard on click", async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "token" } } });
    render(<ConfirmedPage />);

    await userEvent.click(await screen.findByRole("button", { name: /continue/i }));
    expect(pushMock).toHaveBeenCalledWith("/dashboard");
  });

  it("shows an error message when no session is found", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    render(<ConfirmedPage />);

    expect(await screen.findByText(/invalid or expired/i)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
