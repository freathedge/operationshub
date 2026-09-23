// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarProvider } from "@/components/ui/sidebar";
import { NavUser } from "@/components/nav-user";

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

const signOutMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: { signOut: signOutMock },
  }),
}));

const user = { name: "Max Mustermann", email: "max@alpentech.example", role: "it" };

function renderNavUser() {
  return render(
    <SidebarProvider>
      <NavUser user={user} />
    </SidebarProvider>
  );
}

describe("NavUser", () => {
  it("renders the profile's name and email, truncated", () => {
    renderNavUser();
    const nameEl = screen.getByText("Max Mustermann");
    expect(nameEl).toHaveClass("truncate");
    const emailEl = screen.getByText("max@alpentech.example");
    expect(emailEl).toHaveClass("truncate");
  });

  it("has a Settings menu item linking to /settings", async () => {
    renderNavUser();
    await userEvent.click(screen.getByText("Max Mustermann"));
    // The dropdown opens on the next animation frame (Base UI's Menu.Trigger opens
    // on mousedown via a rAF-scheduled state update, not synchronously on click), so
    // poll for the menu content with findByText rather than asserting immediately.
    const settingsLink = await screen.findByText("Settings");
    expect(settingsLink.closest("a")).toHaveAttribute("href", "/settings");
  });

  it("signs the user out and redirects to /login when Log out is clicked", async () => {
    renderNavUser();
    await userEvent.click(screen.getByText("Max Mustermann"));
    const logoutItem = await screen.findByText("Log out");
    await userEvent.click(logoutItem);

    expect(signOutMock).toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith("/login");
    expect(refreshMock).toHaveBeenCalled();
  });
});
