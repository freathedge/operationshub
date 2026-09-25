// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompleteSignupForm } from "@/components/auth/complete-signup-form";

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("CompleteSignupForm", () => {
  it("submits full name and role, then redirects to /dashboard on success", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    render(<CompleteSignupForm />);

    await userEvent.type(screen.getByLabelText("Full name"), "Max Mustermann");
    await userEvent.click(screen.getByLabelText("Explore as"));
    await userEvent.click(await screen.findByRole("option", { name: "Employee" }));
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/complete-signup",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ fullName: "Max Mustermann", role: "employee" }),
      })
    );
    expect(pushMock).toHaveBeenCalledWith("/dashboard");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("shows an error message when the request fails", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: "Profile already exists" }),
    });
    render(<CompleteSignupForm />);

    await userEvent.type(screen.getByLabelText("Full name"), "Max Mustermann");
    await userEvent.click(screen.getByLabelText("Explore as"));
    await userEvent.click(await screen.findByRole("option", { name: "Employee" }));
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText("Profile already exists")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("redirects to /dashboard when the profile was already linked by Clerk's webhook (409)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409 });
    render(<CompleteSignupForm />);

    await userEvent.type(screen.getByLabelText("Full name"), "Max Mustermann");
    await userEvent.click(screen.getByLabelText("Explore as"));
    await userEvent.click(await screen.findByRole("option", { name: "Employee" }));
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(pushMock).toHaveBeenCalledWith("/dashboard");
    expect(refreshMock).toHaveBeenCalled();
  });
});
