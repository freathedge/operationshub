// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

const signUpMock = vi.fn();
const getSessionMock = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { signUp: signUpMock, getSession: getSessionMock },
  }),
}));

import { SignupForm } from "@/components/auth/signup-form";

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  signUpMock.mockReset();
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({ data: { session: null } });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ profile: {} }),
    })
  );
});

describe("SignupForm", () => {
  it("shows a validation error when submitted empty", async () => {
    render(<SignupForm />);
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("signs up, completes the profile, and redirects to the dashboard", async () => {
    signUpMock.mockResolvedValue({ data: { session: { access_token: "token" } }, error: null });
    render(<SignupForm />);

    await userEvent.type(screen.getByLabelText(/full name/i), "Max Mustermann");
    await userEvent.type(screen.getByLabelText(/email/i), "max@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.selectOptions(screen.getByLabelText(/explore as/i), "IT");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/dashboard"));
    expect(refreshMock).toHaveBeenCalled();
    expect(signUpMock).toHaveBeenCalledWith({
      email: "max@example.com",
      password: "password123",
    });
  });

  it("shows a check-your-email message when signup requires email confirmation", async () => {
    signUpMock.mockResolvedValue({ data: { session: null }, error: null });
    render(<SignupForm />);

    await userEvent.type(screen.getByLabelText(/full name/i), "Max Mustermann");
    await userEvent.type(screen.getByLabelText(/email/i), "max@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.selectOptions(screen.getByLabelText(/explore as/i), "IT");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("skips signUp and completes the profile when a session already exists", async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "existing" } } });
    render(<SignupForm />);

    await userEvent.type(screen.getByLabelText(/full name/i), "Max Mustermann");
    await userEvent.type(screen.getByLabelText(/email/i), "max@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.selectOptions(screen.getByLabelText(/explore as/i), "IT");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/dashboard"));
    expect(signUpMock).not.toHaveBeenCalled();
  });
});
