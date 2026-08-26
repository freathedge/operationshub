// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const signUpMock = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { signUp: signUpMock },
  }),
}));

import { SignupForm } from "@/components/auth/signup-form";

beforeEach(() => {
  pushMock.mockReset();
  signUpMock.mockReset();
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
    signUpMock.mockResolvedValue({ error: null });
    render(<SignupForm />);

    await userEvent.type(screen.getByLabelText(/full name/i), "Max Mustermann");
    await userEvent.type(screen.getByLabelText(/email/i), "max@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.selectOptions(screen.getByLabelText(/explore as/i), "IT");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/dashboard"));
    expect(signUpMock).toHaveBeenCalledWith({
      email: "max@example.com",
      password: "password123",
    });
  });
});
