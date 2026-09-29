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
          {
            id: "employee-1",
            fullName: "Ada Lovelace",
            positionTitle: "Engineer",
            departmentId: null,
            status: "active",
            account: { linked: true, email: "ada@example.com" },
          },
        ],
      }),
    })
  );
});

describe("EmployeeListView", () => {
  it("renders the fetched employees", async () => {
    renderWithClient(<EmployeeListView companyId="company-1" canManageAccount={false} />);
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("shows the Account column and email when canManageAccount is true", async () => {
    renderWithClient(<EmployeeListView companyId="company-1" canManageAccount={true} />);
    expect(await screen.findByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();
  });

  it("hides the Account column when canManageAccount is false", async () => {
    renderWithClient(<EmployeeListView companyId="company-1" canManageAccount={false} />);
    await screen.findByText("Ada Lovelace");
    expect(screen.queryByText("Account")).not.toBeInTheDocument();
    expect(screen.queryByText("ada@example.com")).not.toBeInTheDocument();
  });

  it("shows an Invitation pending badge for a pending employee", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          employees: [
            {
              id: "employee-2",
              fullName: "Pending Hire",
              positionTitle: null,
              departmentId: null,
              status: "active",
              account: { linked: false, invitedEmail: "pending@example.com" },
            },
          ],
        }),
      })
    );
    renderWithClient(<EmployeeListView companyId="company-1" canManageAccount={true} />);
    expect(await screen.findByText("Invitation pending")).toBeInTheDocument();
  });
});
