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
const getUserMock = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { signUp: signUpMock, getSession: getSessionMock, getUser: getUserMock },
  }),
}));

import { SignupForm } from "@/components/auth/signup-form";

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  signUpMock.mockReset();
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({ data: { session: null } });
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: null } });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ profile: {} }),
    })
  );
});

async function fillValidForm() {
  await userEvent.type(screen.getByLabelText(/full name/i), "Max Mustermann");
  await userEvent.type(screen.getByLabelText(/email/i), "max@example.com");
  await userEvent.type(screen.getByLabelText(/^password$/i), "password123");
  await userEvent.type(screen.getByLabelText(/confirm password/i), "password123");
  await userEvent.selectOptions(screen.getByLabelText(/explore as/i), "IT");
}

describe("SignupForm", () => {
  it("shows a validation error when submitted empty", async () => {
    render(<SignupForm />);
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("shows an error when the passwords don't match", async () => {
    render(<SignupForm />);

    await userEvent.type(screen.getByLabelText(/full name/i), "Max Mustermann");
    await userEvent.type(screen.getByLabelText(/email/i), "max@example.com");
    await userEvent.type(screen.getByLabelText(/^password$/i), "password123");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "password456");
    await userEvent.selectOptions(screen.getByLabelText(/explore as/i), "IT");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText("Passwords do not match")).toBeInTheDocument();
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("grows and shifts from red toward green as the password gets longer", async () => {
    render(<SignupForm />);
    const passwordField = screen.getByLabelText(/^password$/i);
    const progressBar = screen.getByRole("progressbar", { name: /password strength/i });

    expect(progressBar).toHaveAttribute("aria-valuenow", "0");
    expect((progressBar.firstElementChild as HTMLElement).style.width).toBe("0%");

    await userEvent.type(passwordField, "a");
    expect(progressBar).toHaveAttribute("aria-valuenow", "1");
    const fillAtOneChar = progressBar.firstElementChild as HTMLElement;
    expect(fillAtOneChar.style.width).toBe("10%");
    expect(fillAtOneChar.style.backgroundColor).toBe("rgb(219, 81, 71)"); // mostly red

    await userEvent.type(passwordField, "a".repeat(9));
    const fillAtTenChars = progressBar.firstElementChild as HTMLElement;
    expect(progressBar).toHaveAttribute("aria-valuenow", "10");
    expect(fillAtTenChars.style.width).toBe("100%");
    expect(fillAtTenChars.style.backgroundColor).toBe("rgb(34, 197, 94)"); // fully green
  });

  it("signs up, completes the profile, and redirects to the dashboard", async () => {
    signUpMock.mockResolvedValue({ data: { session: { access_token: "token" } }, error: null });
    render(<SignupForm />);

    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/dashboard"));
    expect(refreshMock).toHaveBeenCalled();
    expect(signUpMock).toHaveBeenCalledWith({
      email: "max@example.com",
      password: "password123",
      options: {
        data: { role: "it" },
        emailRedirectTo: expect.stringContaining("/auth/confirmed"),
      },
    });
  });

  it("pre-selects the role from Supabase user metadata for a returning, already-authenticated user", async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "existing" } } });
    getUserMock.mockResolvedValue({ data: { user: { user_metadata: { role: "hr" } } } });

    render(<SignupForm />);

    expect(await screen.findByLabelText(/explore as/i)).toHaveValue("hr");
  });

  it("shows a check-your-email message when signup requires email confirmation", async () => {
    signUpMock.mockResolvedValue({ data: { session: null }, error: null });
    render(<SignupForm />);

    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("skips signUp and completes the profile when a session already exists", async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "existing" } } });
    render(<SignupForm />);

    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/dashboard"));
    expect(signUpMock).not.toHaveBeenCalled();
  });
});
