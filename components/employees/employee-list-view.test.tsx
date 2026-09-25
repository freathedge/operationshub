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

import { EmployeeListView } from "@/components/employees/employee-list-view";

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
        employees: [
          { id: "employee-1", fullName: "Ada Lovelace", positionTitle: "Engineer", departmentId: null, status: "active" },
        ],
      }),
    })
  );
});

describe("EmployeeListView", () => {
  it("renders the fetched employees", async () => {
    renderWithClient(<EmployeeListView companyId="company-1" />);
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
  });
});
