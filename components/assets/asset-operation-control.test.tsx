// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { AssetOperationControl } from "@/components/assets/asset-operation-control";

beforeEach(() => {
  refreshMock.mockReset();
});

describe("AssetOperationControl", () => {
  it("shows a picker and links the selected operation when unlinked and the caller can manage", async () => {
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

    render(<AssetOperationControl assetId="asset-1" relatedOperationId={null} canManage />);

    const select = await screen.findByLabelText(/operation/i);
    await userEvent.click(select);
    await userEvent.click(await screen.findByRole("option", { name: "Vienna Relocation" }));
    await userEvent.click(screen.getByRole("button", { name: /^link$/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/operations/op-1/link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "link", entityType: "asset", entityId: "asset-1" }),
      })
    );
  });

  it("shows the linked operation's title and unlinks it when the caller can manage", async () => {
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

    render(<AssetOperationControl assetId="asset-1" relatedOperationId="op-1" canManage />);

    expect(await screen.findByText("Vienna Relocation")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /unlink/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/operations/op-1/link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "unlink", entityType: "asset", entityId: "asset-1" }),
      })
    );
  });

  it("shows an error instead of an empty picker when the operations list fails to load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/operations") {
          return Promise.resolve({ ok: false, json: async () => ({ error: "nope" }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );

    render(<AssetOperationControl assetId="asset-1" relatedOperationId={null} canManage />);

    expect(await screen.findByText(/failed to load operations/i)).toBeInTheDocument();
  });

  it("does not stay stuck on Loading... when the linked operation fails to load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/operations/op-1") {
          return Promise.resolve({ ok: false, json: async () => ({ error: "nope" }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );

    render(<AssetOperationControl assetId="asset-1" relatedOperationId="op-1" canManage />);

    expect(await screen.findByText(/failed to load operation/i)).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });

  it("shows the linked operation without an unlink button when the caller cannot manage", async () => {
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

    render(<AssetOperationControl assetId="asset-1" relatedOperationId="op-1" canManage={false} />);

    expect(await screen.findByText("Vienna Relocation")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /unlink/i })).not.toBeInTheDocument();
  });

  it("renders nothing when unlinked and the caller cannot manage", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    const { container } = render(
      <AssetOperationControl assetId="asset-1" relatedOperationId={null} canManage={false} />
    );

    expect(container).toBeEmptyDOMElement();
    expect(fetch).not.toHaveBeenCalled();
  });
});
