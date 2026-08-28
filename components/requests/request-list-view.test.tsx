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

import { RequestListView } from "@/components/requests/request-list-view";

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
        requests: [
          {
            id: "request-1",
            title: "New laptop",
            status: "under_review",
            category: "equipment",
            departmentId: null,
            createdAt: "2026-08-27T00:00:00.000Z",
          },
        ],
      }),
    })
  );
});

describe("RequestListView", () => {
  it("renders requests returned from the API", async () => {
    renderWithClient(<RequestListView companyId="company-1" />);

    expect(await screen.findByText("New laptop")).toBeInTheDocument();
    expect(screen.getByText("under_review")).toBeInTheDocument();
  });

  it("shows an empty state when there are no requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ requests: [] }) })
    );
    renderWithClient(<RequestListView companyId="company-1" />);

    expect(await screen.findByText("No requests found.")).toBeInTheDocument();
  });
});
