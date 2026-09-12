// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { EmployeeForm } from "@/components/employees/employee-form";

beforeEach(() => {
  pushMock.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (url.startsWith("/api/profiles")) {
        return Promise.resolve({ ok: true, json: async () => ({ profiles: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ employee: { id: "employee-1" } }) });
    })
  );
});

describe("EmployeeForm", () => {
  it("shows validation errors when submitted empty", async () => {
    render(<EmployeeForm departments={[]} locations={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /create employee/i }));

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
  });

  it("creates an employee without a department/location/manager and redirects", async () => {
    render(<EmployeeForm departments={[]} locations={[]} />);

    await userEvent.type(screen.getByLabelText(/full name/i), "New Hire");
    await userEvent.type(screen.getByLabelText(/^email$/i), "new.hire@example.com");
    await userEvent.click(screen.getByRole("button", { name: /create employee/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/employees/employee-1"));
  });
});
