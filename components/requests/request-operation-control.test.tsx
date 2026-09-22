// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { RequestOperationControl } from "@/components/requests/request-operation-control";

beforeEach(() => {
  refreshMock.mockReset();
});

describe("RequestOperationControl", () => {
  it("shows a picker and links the selected operation when unlinked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/operations") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ operations: [{ id: "op-1", title: "Vienna Relocation" }] }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );

    render(<RequestOperationControl requestId="request-1" relatedOperationId={null} />);

    const select = await screen.findByLabelText(/operation/i);
    await userEvent.selectOptions(select, "op-1");
    await userEvent.click(screen.getByRole("button", { name: /^link$/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/operations/op-1/link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "link", entityType: "request", entityId: "request-1" }),
      })
    );
  });

  it("shows the linked operation's title and unlinks it when already linked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/operations/op-1") {
          return Promise.resolve({
            ok: true,
            json: async () => ({ operation: { id: "op-1", title: "Vienna Relocation" } }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );

    render(<RequestOperationControl requestId="request-1" relatedOperationId="op-1" />);

    expect(await screen.findByText("Vienna Relocation")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /unlink/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/operations/op-1/link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "unlink", entityType: "request", entityId: "request-1" }),
      })
    );
  });
});
