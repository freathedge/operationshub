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

import { AssetListView } from "@/components/assets/asset-list-view";

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
        assets: [
          { id: "asset-1", assetCode: "AST-00001", name: "MacBook Pro", category: "laptop", status: "available", assignedTo: null },
        ],
      }),
    })
  );
});

describe("AssetListView", () => {
  it("renders the fetched assets", async () => {
    renderWithClient(<AssetListView companyId="company-1" />);
    expect(await screen.findByText("AST-00001")).toBeInTheDocument();
  });
});
