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

let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

import { TaskListView } from "@/components/tasks/task-list-view";

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mockSearchParams = new URLSearchParams();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tasks: [
          {
            id: "task-1",
            title: "Prepare laptop",
            status: "todo",
            priority: "high",
            assigneeId: null,
            departmentId: null,
            dueDate: null,
          },
        ],
      }),
    })
  );
});

describe("TaskListView", () => {
  it("renders tasks returned from the API", async () => {
    renderWithClient(<TaskListView companyId="company-1" />);

    expect(await screen.findByText("Prepare laptop")).toBeInTheDocument();
    expect(screen.getByText("todo")).toBeInTheDocument();
  });

  it("shows an empty state when there are no tasks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tasks: [] }) })
    );
    renderWithClient(<TaskListView companyId="company-1" />);

    expect(await screen.findByText("No tasks found.")).toBeInTheDocument();
  });

  it("reads assigneeId from the URL and includes it in the fetch", async () => {
    mockSearchParams = new URLSearchParams("assigneeId=profile-1");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tasks: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithClient(<TaskListView companyId="company-1" />);

    await screen.findByText("No tasks found.");
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("assigneeId=profile-1");
  });

  it("shows a clear-filter link when a link-driven filter (assigneeId or departmentId) is active", async () => {
    mockSearchParams = new URLSearchParams("assigneeId=profile-1");
    renderWithClient(<TaskListView companyId="company-1" />);

    expect(await screen.findByText("Prepare laptop")).toBeInTheDocument();
    const clearLink = screen.getByRole("link", { name: /clear filter/i });
    expect(clearLink).toHaveAttribute("href", "/tasks");
  });

  it("does not show a clear-filter link when no link-driven filter is active", async () => {
    renderWithClient(<TaskListView companyId="company-1" />);

    await screen.findByText("Prepare laptop");
    expect(screen.queryByRole("link", { name: /clear filter/i })).not.toBeInTheDocument();
  });

  it("shows an Overdue badge for a past-due open task, but not a completed one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tasks: [
            {
              id: "task-1",
              title: "Overdue task",
              status: "todo",
              priority: "high",
              assigneeId: null,
              departmentId: null,
              dueDate: "2020-01-01T00:00:00.000Z",
            },
            {
              id: "task-2",
              title: "Done task",
              status: "completed",
              priority: "low",
              assigneeId: null,
              departmentId: null,
              dueDate: "2020-01-01T00:00:00.000Z",
            },
          ],
        }),
      })
    );

    renderWithClient(<TaskListView companyId="company-1" />);

    await screen.findByText("Overdue task");
    expect(screen.getAllByText("Overdue")).toHaveLength(1);
  });
});
