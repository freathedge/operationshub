// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => ({ on: () => ({ subscribe: vi.fn() }) }),
    removeChannel: vi.fn(),
  }),
}));

import { DashboardView } from "@/components/dashboard/dashboard-view";

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const emptyPersonalOverview = {
  counts: { myOpenTasks: 0, pendingApprovals: 0, myOpenRequests: 0, activeWorkflows: 0 },
  myTasks: [],
  recentActivity: [],
  upcoming: { overdue: 0, dueToday: 0, dueThisWeek: 0 },
  unreadNotifications: 0,
};

describe("DashboardView", () => {
  it("renders the personal section for a user with no data yet, without crashing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ overview: emptyPersonalOverview }),
      })
    );

    renderWithClient(
      <DashboardView companyId="company-1" profileFullName="Adrian" canViewCompany={false} />
    );

    // "My Tasks" appears twice once loaded: once as the SummaryCards label, once as
    // MyTasksCard's title — findAllByText (unlike findByText) doesn't throw on multiple matches.
    expect(await screen.findAllByText("My Tasks")).not.toHaveLength(0);
    expect(screen.getByText("No open tasks assigned to you.")).toBeInTheDocument();
  });

  it("does not fetch or render the company section when canViewCompany is false", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ overview: emptyPersonalOverview }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithClient(
      <DashboardView companyId="company-1" profileFullName="Adrian" canViewCompany={false} />
    );

    await screen.findAllByText("My Tasks");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/dashboard/personal");
  });

  it("fetches the company overview when canViewCompany is true", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/dashboard/personal") {
        return Promise.resolve({ ok: true, json: async () => ({ overview: emptyPersonalOverview }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          overview: {
            totals: { employees: 0, assets: 0, openRequests: 0, activeTasks: 0 },
            attention: { criticalTasks: 0, pendingApprovals: 0, overdueRequests: 0 },
            activeOperations: [
              { id: "op-1", title: "Vienna Office Relocation", completedTasks: 3, totalTasks: 4 },
            ],
            departmentActivity: [],
          },
        }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithClient(
      <DashboardView companyId="company-1" profileFullName="Adrian" canViewCompany={true} />
    );

    await screen.findAllByText("My Tasks");
    expect(fetchMock).toHaveBeenCalledWith("/api/dashboard/company");
    expect(await screen.findByText("Vienna Office Relocation")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });
});
