// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { OperationLinkPicker, OperationUnlinkButton } from "@/components/operations/operation-link-picker";

beforeEach(() => {
  refreshMock.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (url === "/api/tasks") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ tasks: [{ id: "task-1", title: "Move desks" }] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    })
  );
});

describe("OperationLinkPicker", () => {
  it("links the selected task and refreshes", async () => {
    render(<OperationLinkPicker operationId="op-1" entityType="task" />);

    const select = await screen.findByRole("combobox");
    await userEvent.click(select);
    await userEvent.click(await screen.findByRole("option", { name: "Move desks" }));
    await waitFor(() => expect(select).toHaveTextContent("Move desks"));
    await userEvent.click(screen.getByRole("button", { name: /^link$/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    // After a successful link the picker resets to empty (proves the Select is actually controlled).
    await waitFor(() => expect(select).toHaveTextContent("Select an item to link"));
    expect(select).not.toHaveTextContent("Move desks");
    expect(fetch).toHaveBeenCalledWith(
      "/api/operations/op-1/link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "link", entityType: "task", entityId: "task-1" }),
      })
    );
  });

  it("shows an error when the item list fails to load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/tasks") {
          return Promise.resolve({
            ok: false,
            json: async () => ({ error: "Failed to load tasks" }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );

    render(<OperationLinkPicker operationId="op-1" entityType="task" />);

    expect(await screen.findByText(/failed to load items to link/i)).toBeInTheDocument();
  });

  it("shows an error instead of a permanently-empty picker when the fetch rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/tasks") {
          return Promise.reject(new Error("network error"));
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );

    render(<OperationLinkPicker operationId="op-1" entityType="task" />);

    expect(await screen.findByText(/failed to load items to link/i)).toBeInTheDocument();
  });
});

describe("OperationUnlinkButton", () => {
  it("unlinks the entity and refreshes", async () => {
    render(<OperationUnlinkButton operationId="op-1" entityType="task" entityId="task-1" />);

    await userEvent.click(screen.getByRole("button", { name: /unlink/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/operations/op-1/link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "unlink", entityType: "task", entityId: "task-1" }),
      })
    );
  });

  it("shows an error when unlink fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: false,
          json: async () => ({ error: "Cannot unlink this entity" }),
        })
      )
    );

    render(<OperationUnlinkButton operationId="op-1" entityType="task" entityId="task-1" />);

    await userEvent.click(screen.getByRole("button", { name: /unlink/i }));

    expect(await screen.findByText(/cannot unlink this entity/i)).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
