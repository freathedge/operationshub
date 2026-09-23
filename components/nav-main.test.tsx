// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LayoutDashboardIcon } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { NavMain, type NavGroup } from "@/components/nav-main";

let mockPathname = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

// window.matchMedia is stubbed centrally in vitest.setup.ts (SidebarProvider's
// SidebarMenuButton calls useSidebar() -> useIsMobile(), which needs it).

const groups: NavGroup[] = [
  {
    label: "Home",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: <LayoutDashboardIcon /> },
      { title: "Tasks", url: "/tasks", icon: <LayoutDashboardIcon /> },
    ],
  },
  {
    label: "Resources",
    items: [{ title: "Employees", url: "/employees", icon: <LayoutDashboardIcon /> }],
  },
];

function renderNavMain() {
  return render(
    <SidebarProvider>
      <NavMain groups={groups} />
    </SidebarProvider>
  );
}

describe("NavMain", () => {
  it("renders both group labels and every item within them", () => {
    renderNavMain();
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Resources")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.getByText("Employees")).toBeInTheDocument();
  });

  it("links each item to its real route, not a dead '#'", () => {
    renderNavMain();
    expect(screen.getByText("Tasks").closest("a")).toHaveAttribute("href", "/tasks");
  });

  it("marks the item matching the current pathname as active", () => {
    mockPathname = "/tasks";
    renderNavMain();
    const tasksButton = screen.getByText("Tasks").closest("[data-slot='sidebar-menu-button']");
    // SidebarMenuButton's data-active comes from @base-ui/react's getStateAttributesProps:
    // boolean `true` state values are rendered as a valueless attribute (`data-active=""`),
    // not the string "true" (verified in @base-ui/react/internals/getStateAttributesProps.js).
    expect(tasksButton).toHaveAttribute("data-active", "");
  });

  it("marks the item active on a nested route, not just an exact match", () => {
    mockPathname = "/tasks/some-task-id";
    renderNavMain();
    const tasksButton = screen.getByText("Tasks").closest("[data-slot='sidebar-menu-button']");
    expect(tasksButton).toHaveAttribute("data-active", "");
  });

  it("does not mark an unrelated item active", () => {
    mockPathname = "/tasks";
    renderNavMain();
    const dashboardButton = screen
      .getByText("Dashboard")
      .closest("[data-slot='sidebar-menu-button']");
    // Falsy state values are omitted entirely by getStateAttributesProps, so the
    // attribute is absent rather than set to the string "false".
    expect(dashboardButton).not.toHaveAttribute("data-active");
  });
});
