// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { OperationEditControl } from "@/components/operations/operation-edit-control";

beforeEach(() => {
  refreshMock.mockReset();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});

describe("OperationEditControl", () => {
  it("submits an edited title and refreshes", async () => {
    render(
      <OperationEditControl operationId="op-1" title="Vienna Office Relocation" status="planning" priority="medium" />
    );

    const titleInput = screen.getByLabelText(/title/i);
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Vienna Office Move");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/operations/op-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ title: "Vienna Office Move" }),
      })
    );
  });

  it("disables the save button when the title is unchanged", () => {
    render(
      <OperationEditControl operationId="op-1" title="Vienna Office Relocation" status="planning" priority="medium" />
    );

    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });

  it("offers every status except the current one", () => {
    render(
      <OperationEditControl operationId="op-1" title="Vienna Office Relocation" status="planning" priority="medium" />
    );

    expect(screen.getByRole("button", { name: /move to in_progress/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /move to completed/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /move to cancelled/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /move to planning/i })).not.toBeInTheDocument();
  });

  it("submits a chosen status and refreshes", async () => {
    render(
      <OperationEditControl operationId="op-1" title="Vienna Office Relocation" status="planning" priority="medium" />
    );

    await userEvent.click(screen.getByRole("button", { name: /move to completed/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/operations/op-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "completed" }),
      })
    );
  });

  it("offers every priority except the current one", () => {
    render(
      <OperationEditControl operationId="op-1" title="Vienna Office Relocation" status="planning" priority="medium" />
    );

    expect(screen.getByRole("button", { name: /set priority to low/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /set priority to high/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /set priority to critical/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /set priority to medium/i })).not.toBeInTheDocument();
  });

  it("submits a chosen priority and refreshes", async () => {
    render(
      <OperationEditControl operationId="op-1" title="Vienna Office Relocation" status="planning" priority="medium" />
    );

    await userEvent.click(screen.getByRole("button", { name: /set priority to critical/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/operations/op-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ priority: "critical" }),
      })
    );
  });

  it("shows an error and does not refresh when the PATCH fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "You cannot update this operation" }) })
    );

    render(
      <OperationEditControl operationId="op-1" title="Vienna Office Relocation" status="planning" priority="medium" />
    );

    await userEvent.click(screen.getByRole("button", { name: /move to completed/i }));

    expect(await screen.findByText(/you cannot update this operation/i)).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
