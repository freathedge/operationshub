// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
}));

const getCurrentProfileMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: () => getCurrentProfileMock(),
}));

vi.mock("@/lib/domain/reports", () => ({
  requestsByDepartment: vi.fn().mockResolvedValue([]),
  avgRequestCompletionTime: vi.fn().mockResolvedValue([]),
  taskStatistics: vi.fn().mockResolvedValue({ open: 0, completed: 0, overdue: 0 }),
  workflowCompletionRate: vi.fn().mockResolvedValue([]),
}));

import ReportsPage from "@/app/(app)/reports/page";

beforeEach(() => {
  redirectMock.mockClear();
  getCurrentProfileMock.mockReset();
});

describe("ReportsPage", () => {
  it("redirects to /dashboard when the caller cannot view reports", async () => {
    getCurrentProfileMock.mockResolvedValue({
      id: "profile-1",
      authUserId: "auth-1",
      companyId: "company-1",
      fullName: "Regular Employee",
      role: "employee",
      departmentId: null,
      managerId: null,
      positionTitle: null,
      employeeNumber: null,
      locationId: null,
      relatedOperationId: null,
      status: "active",
    });

    await expect(ReportsPage()).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("redirects to /login when there is no authenticated profile", async () => {
    getCurrentProfileMock.mockResolvedValue(null);

    await expect(ReportsPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("renders the report sections for an operations_manager", async () => {
    getCurrentProfileMock.mockResolvedValue({
      id: "profile-1",
      authUserId: "auth-1",
      companyId: "company-1",
      fullName: "Ops Manager",
      role: "operations_manager",
      departmentId: null,
      managerId: null,
      positionTitle: null,
      employeeNumber: null,
      locationId: null,
      relatedOperationId: null,
      status: "active",
    });

    const element = await ReportsPage();
    render(element);
    // These four cards/charts are real Client and Server Components, so raw
    // JSON.stringify()-on-unrendered-element assertions (as used for the redirect
    // tests above and in settings/page.test.tsx) can't see their internal text:
    // JSX composition (<Chart data={...} />) never invokes the component function,
    // it only creates an element referencing it, and calling a "use client"
    // component's function directly server-side breaks at real Next.js runtime.
    // Actually rendering the resolved element is the only way to verify these
    // nested titles without compromising the page's client/server component usage.
    expect(screen.getByText("Requests by Department")).toBeInTheDocument();
    expect(screen.getByText("Task Statistics")).toBeInTheDocument();
  });
});
