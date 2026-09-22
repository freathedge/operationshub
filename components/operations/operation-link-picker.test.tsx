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
    await userEvent.selectOptions(select, "task-1");
    await userEvent.click(screen.getByRole("button", { name: /^link$/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/operations/op-1/link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "link", entityType: "task", entityId: "task-1" }),
      })
    );
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
});
