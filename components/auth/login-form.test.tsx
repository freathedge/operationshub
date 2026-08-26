// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

const signInWithPasswordMock = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { signInWithPassword: signInWithPasswordMock },
  }),
}));

import { LoginForm } from "@/components/auth/login-form";

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  signInWithPasswordMock.mockReset();
});

describe("LoginForm", () => {
  it("shows a validation error when submitted empty", async () => {
    render(<LoginForm />);
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Enter a valid email")).toBeInTheDocument();
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it("signs in and redirects to the dashboard", async () => {
    signInWithPasswordMock.mockResolvedValue({ error: null });
    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText(/email/i), "max@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/dashboard"));
    expect(refreshMock).toHaveBeenCalled();
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "max@example.com",
      password: "password123",
    });
  });

  it("shows the error message when sign-in fails", async () => {
    signInWithPasswordMock.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });
    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText(/email/i), "max@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Invalid login credentials")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
