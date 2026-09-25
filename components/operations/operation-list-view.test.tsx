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

import { OperationListView } from "@/components/operations/operation-list-view";

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
        operations: [
          {
            id: "op-1",
            title: "Vienna Office Relocation",
            status: "in_progress",
            priority: "high",
            departmentId: null,
          },
        ],
      }),
    })
  );
});

describe("OperationListView", () => {
  it("renders the fetched operations", async () => {
    renderWithClient(<OperationListView companyId="company-1" departments={[]} />);
    expect(await screen.findByText("Vienna Office Relocation")).toBeInTheDocument();
  });
});
