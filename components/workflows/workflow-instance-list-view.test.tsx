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

import { WorkflowInstanceListView } from "@/components/workflows/workflow-instance-list-view";

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
        instances: [
          {
            id: "instance-1",
            templateName: "Employee Onboarding",
            status: "in_progress",
            createdAt: "2026-09-24T00:00:00.000Z",
          },
        ],
      }),
    })
  );
});

describe("WorkflowInstanceListView", () => {
  it("renders instances returned from the API", async () => {
    renderWithClient(<WorkflowInstanceListView companyId="company-1" canViewAll={true} />);

    expect(await screen.findByText("Employee Onboarding")).toBeInTheDocument();
    expect(screen.getByText("in_progress")).toBeInTheDocument();
  });

  it("shows an empty state when there are no workflows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ instances: [] }) })
    );
    renderWithClient(<WorkflowInstanceListView companyId="company-1" canViewAll={true} />);

    expect(await screen.findByText("No workflows found.")).toBeInTheDocument();
  });

  it("reads scope=all from the URL and requests all-scope, not the mine default", async () => {
    mockSearchParams = new URLSearchParams("scope=all");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ instances: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithClient(<WorkflowInstanceListView companyId="company-1" canViewAll={true} />);

    await screen.findByText("No workflows found.");
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("scope=all");
  });

  it("hides the All toggle and ignores scope=all in the URL when the caller cannot view all workflows", async () => {
    mockSearchParams = new URLSearchParams("scope=all");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ instances: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithClient(<WorkflowInstanceListView companyId="company-1" canViewAll={false} />);

    await screen.findByText("No workflows found.");
    expect(screen.queryByRole("button", { name: "All" })).not.toBeInTheDocument();
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("scope=mine");
  });
});
