// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { EmployeeAccountControl } from "@/components/employees/employee-account-control";

beforeEach(() => {
  refreshMock.mockReset();
});

describe("EmployeeAccountControl", () => {
  it("shows the email for a linked employee and no resend-invite button", async () => {
    vi.stubGlobal("fetch", vi.fn());
    render(
      <EmployeeAccountControl
        employeeId="employee-1"
        currentRole="employee"
        currentStatus="active"
        account={{ linked: true, email: "ada@example.com" }}
      />
    );

    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resend invite/i })).not.toBeInTheDocument();
  });

  it("shows Account not found for a linked employee with no known email", async () => {
    vi.stubGlobal("fetch", vi.fn());
    render(
      <EmployeeAccountControl
        employeeId="employee-1"
        currentRole="employee"
        currentStatus="active"
        account={{ linked: true, email: null }}
      />
    );

    expect(screen.getByText("Account not found")).toBeInTheDocument();
    expect(screen.queryByText("Invitation pending")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resend invite/i })).not.toBeInTheDocument();
  });

  it("shows Invitation pending and a resend-invite button for a pending employee", async () => {
    vi.stubGlobal("fetch", vi.fn());
    render(
      <EmployeeAccountControl
        employeeId="employee-1"
        currentRole="employee"
        currentStatus="active"
        account={{ linked: false, invitedEmail: "pending@example.com" }}
      />
    );

    expect(screen.getByText("Invitation pending")).toBeInTheDocument();
    expect(screen.getByText(/pending@example.com/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resend invite/i })).toBeInTheDocument();
  });

  it("changes the role via PATCH and refreshes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EmployeeAccountControl
        employeeId="employee-1"
        currentRole="employee"
        currentStatus="active"
        account={{ linked: true, email: "ada@example.com" }}
      />
    );

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "Manager" }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/employees/employee-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ role: "manager" }),
      })
    );
  });

  it("toggles status to inactive via PATCH and refreshes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EmployeeAccountControl
        employeeId="employee-1"
        currentRole="employee"
        currentStatus="active"
        account={{ linked: true, email: "ada@example.com" }}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /deactivate/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/employees/employee-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "inactive" }),
      })
    );
  });

  it("shows Reactivate for an inactive employee", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(
      <EmployeeAccountControl
        employeeId="employee-1"
        currentRole="employee"
        currentStatus="inactive"
        account={{ linked: true, email: "ada@example.com" }}
      />
    );
    expect(screen.getByRole("button", { name: /reactivate/i })).toBeInTheDocument();
  });

  it("resends the invite via POST and shows confirmation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EmployeeAccountControl
        employeeId="employee-1"
        currentRole="employee"
        currentStatus="active"
        account={{ linked: false, invitedEmail: "pending@example.com" }}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /resend invite/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/employees/employee-1/resend-invite", { method: "POST" });
    expect(await screen.findByText(/invitation resent/i)).toBeInTheDocument();
  });

  it("shows an error message when a request fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({ error: "Something went wrong" }) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EmployeeAccountControl
        employeeId="employee-1"
        currentRole="employee"
        currentStatus="active"
        account={{ linked: true, email: "ada@example.com" }}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /deactivate/i }));

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
