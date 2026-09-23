// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SidebarProvider } from "@/components/ui/sidebar";

const mockPathname = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({ auth: { signOut: vi.fn() } }),
}));

import { AppSidebar } from "@/components/app-sidebar";

const user = { name: "Max Mustermann", email: "max@alpentech.example", role: "it" };

describe("AppSidebar", () => {
  it("renders every Home and Resources nav item", () => {
    render(
      <SidebarProvider>
        <AppSidebar user={user} />
      </SidebarProvider>
    );
    for (const label of ["Dashboard", "Tasks", "Requests", "Operations", "Workflows", "Employees", "Assets"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("renders the Search and Get Help secondary nav items", () => {
    render(
      <SidebarProvider>
        <AppSidebar user={user} />
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
        <AppSidebar user={user} />
      </SidebarProvider>
    );
    expect(screen.getByText("Max Mustermann")).toBeInTheDocument();
  });
});
