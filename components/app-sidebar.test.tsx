// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarProvider } from "@/components/ui/sidebar";

const mockPathname = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut: vi.fn() }),
}));

import { AppSidebar } from "@/components/app-sidebar";

const user = { name: "Max Mustermann", email: "max@alpentech.example", role: "it" };

describe("AppSidebar", () => {
  it("renders every Home and Resources nav item", () => {
    render(
      <SidebarProvider>
        <AppSidebar user={user} canViewReports={true} />
      </SidebarProvider>
    );
    for (const label of [
      "Dashboard",
      "Tasks",
      "Requests",
      "Operations",
      "Workflows",
      "Reports",
      "Employees",
      "Assets",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("does not render Reports when canViewReports is false", () => {
    render(
      <SidebarProvider>
        <AppSidebar user={user} canViewReports={false} />
      </SidebarProvider>
    );
    expect(screen.queryByText("Reports")).not.toBeInTheDocument();
  });

  it("renders the Search and Get Help secondary nav items", () => {
    render(
      <SidebarProvider>
        <AppSidebar user={user} canViewReports={true} />
      </SidebarProvider>
    );
    expect(screen.getByText("Search")).toBeInTheDocument();
    expect(screen.getByText("Get Help").closest("a")).toHaveAttribute(
      "href",
      "mailto:support@alpentech.example"
    );
  });

  it("renders the user's name in the footer menu", () => {
    render(
      <SidebarProvider>
        <AppSidebar user={user} canViewReports={true} />
      </SidebarProvider>
    );
    expect(screen.getByText("Max Mustermann")).toBeInTheDocument();
  });

  it("opens the command search dialog when the Search nav item is clicked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) })
    );

    render(
      <SidebarProvider>
        <AppSidebar user={user} canViewReports={true} />
      </SidebarProvider>
    );

    await userEvent.click(screen.getByText("Search"));
    expect(await screen.findByPlaceholderText(/search/i)).toBeInTheDocument();
  });
});
