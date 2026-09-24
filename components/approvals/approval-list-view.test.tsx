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

import { ApprovalListView } from "@/components/approvals/approval-list-view";

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
        approvals: [
          {
            id: "approval-1",
            requestId: "request-1",
            requestTitle: "New laptop",
            status: "pending",
            createdAt: "2026-09-24T00:00:00.000Z",
            decidedAt: null,
          },
        ],
      }),
    })
  );
});

describe("ApprovalListView", () => {
  it("renders approvals returned from the API", async () => {
    renderWithClient(<ApprovalListView companyId="company-1" canViewAll={true} />);

    expect(await screen.findByText("New laptop")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("shows an empty state when there are no approvals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ approvals: [] }) })
    );
    renderWithClient(<ApprovalListView companyId="company-1" canViewAll={true} />);

    expect(await screen.findByText("No approvals found.")).toBeInTheDocument();
  });

  it("reads scope=all from the URL and requests all-scope, not the mine default", async () => {
    mockSearchParams = new URLSearchParams("scope=all");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ approvals: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithClient(<ApprovalListView companyId="company-1" canViewAll={true} />);

    await screen.findByText("No approvals found.");
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("scope=all");
  });

  it("hides the All toggle and ignores scope=all in the URL when the caller cannot view all approvals", async () => {
    mockSearchParams = new URLSearchParams("scope=all");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ approvals: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithClient(<ApprovalListView companyId="company-1" canViewAll={false} />);

    await screen.findByText("No approvals found.");
    expect(screen.queryByRole("button", { name: "All" })).not.toBeInTheDocument();
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("scope=mine");
  });
});
