// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

const updateUserMock = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { updateUser: updateUserMock },
  }),
}));

import { AcceptInviteForm } from "@/components/auth/accept-invite-form";

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  updateUserMock.mockReset();
});

describe("AcceptInviteForm", () => {
  it("shows an error when the passwords don't match", async () => {
    render(<AcceptInviteForm />);
    await userEvent.type(screen.getByLabelText(/^password$/i), "password123");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "different123");
    await userEvent.click(screen.getByRole("button", { name: /set password/i }));

    expect(await screen.findByText("Passwords do not match")).toBeInTheDocument();
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("sets the password and redirects to the dashboard", async () => {
    updateUserMock.mockResolvedValue({ error: null });
    render(<AcceptInviteForm />);

    await userEvent.type(screen.getByLabelText(/^password$/i), "password123");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /set password/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/dashboard"));
    expect(updateUserMock).toHaveBeenCalledWith({ password: "password123" });
  });
});
