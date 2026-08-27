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

import { TaskListView } from "@/components/tasks/task-list-view";

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
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
});
