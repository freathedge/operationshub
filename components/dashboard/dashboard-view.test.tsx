// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
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
  // retry: false avoids react-query's default exponential-backoff retries pushing an error
  // state past findByText's default wait-for timeout in the error-path test below.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
      <DashboardView companyId="company-1" profileId="profile-1" profileFullName="Adrian" canViewCompany={false} />
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
      <DashboardView companyId="company-1" profileId="profile-1" profileFullName="Adrian" canViewCompany={false} />
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
      <DashboardView companyId="company-1" profileId="profile-1" profileFullName="Adrian" canViewCompany={true} />
    );

    await screen.findAllByText("My Tasks");
    expect(fetchMock).toHaveBeenCalledWith("/api/dashboard/company");
    expect(await screen.findByText("Vienna Office Relocation")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("shows an error message when the company overview fails to load", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/dashboard/personal") {
        return Promise.resolve({ ok: true, json: async () => ({ overview: emptyPersonalOverview }) });
      }
      return Promise.resolve({ ok: false, json: async () => ({ error: "forbidden" }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithClient(
      <DashboardView
        companyId="company-1"
        profileId="profile-1"
        profileFullName="Adrian"
        canViewCompany={true}
      />
    );

    await screen.findAllByText("My Tasks");
    expect(
      await screen.findByText("Failed to load the company overview.")
    ).toBeInTheDocument();
  });

  it("shows skeleton placeholders while the personal overview is loading, then removes them", async () => {
    let resolveFetch: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
    const pending = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending));

    renderWithClient(
      <DashboardView
        companyId="company-1"
        profileId="profile-1"
        profileFullName="Adrian"
        canViewCompany={false}
      />
    );

    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);

    resolveFetch!({ ok: true, json: async () => ({ overview: emptyPersonalOverview }) });
    await screen.findAllByText("My Tasks");
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBe(0);
  });

  it("links the My Tasks summary card and the Upcoming card to /tasks filtered to the caller", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ overview: emptyPersonalOverview }) })
    );

    renderWithClient(
      <DashboardView
        companyId="company-1"
        profileId="profile-1"
        profileFullName="Adrian"
        canViewCompany={false}
      />
    );

    await screen.findAllByText("My Tasks");
    const myTasksLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href") === "/tasks?assigneeId=profile-1");
    // One from the SummaryCards "My Tasks" card, one wrapping the UpcomingCard.
    expect(myTasksLinks.length).toBe(2);
  });

  it("links the Open Requests summary card to /requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ overview: emptyPersonalOverview }) })
    );

    renderWithClient(
      <DashboardView
        companyId="company-1"
        profileId="profile-1"
        profileFullName="Adrian"
        canViewCompany={false}
      />
    );

    await screen.findAllByText("My Tasks");
    expect(screen.getByText("Open Requests").closest("a")).toHaveAttribute("href", "/requests");
  });

  it("links recent activity entries to the entity they're about", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          overview: {
            ...emptyPersonalOverview,
            recentActivity: [
              {
                id: "activity-1",
                entityType: "request",
                entityId: "request-1",
                actorId: null,
                message: "Sarah requested a new laptop.",
                createdAt: "2026-09-22T00:00:00.000Z",
              },
            ],
          },
        }),
      })
    );

    renderWithClient(
      <DashboardView
        companyId="company-1"
        profileId="profile-1"
        profileFullName="Adrian"
        canViewCompany={false}
      />
    );

    const activityLink = await screen.findByText("Sarah requested a new laptop.");
    expect(activityLink.closest("a")).toHaveAttribute("href", "/requests/request-1");
  });

  it("links company totals and department rows to their filtered list views", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/dashboard/personal") {
        return Promise.resolve({ ok: true, json: async () => ({ overview: emptyPersonalOverview }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          overview: {
            totals: { employees: 3, assets: 5, openRequests: 2, activeTasks: 7 },
            attention: { criticalTasks: 1, pendingApprovals: 0, overdueRequests: 0 },
            activeOperations: [],
            departmentActivity: [
              { departmentId: "dept-1", name: "IT", openTasks: 4, openRequests: 1 },
            ],
          },
        }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithClient(
      <DashboardView
        companyId="company-1"
        profileId="profile-1"
        profileFullName="Adrian"
        canViewCompany={true}
      />
    );

    await screen.findByText("IT");
    expect(screen.getByText("Employees").closest("a")).toHaveAttribute("href", "/employees");
    expect(screen.getByText("Assets").closest("a")).toHaveAttribute("href", "/assets");
    expect(screen.getByText("Active Tasks").closest("a")).toHaveAttribute("href", "/tasks");
    expect(screen.getByText("1 critical tasks").closest("a")).toHaveAttribute(
      "href",
      "/tasks?priority=critical"
    );
    expect(screen.getByText("IT").closest("a")).toHaveAttribute(
      "href",
      "/tasks?departmentId=dept-1"
    );
  });
});
