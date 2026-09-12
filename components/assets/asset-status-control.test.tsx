// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { AssetStatusControl } from "@/components/assets/asset-status-control";

beforeEach(() => {
  refreshMock.mockReset();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});

describe("AssetStatusControl", () => {
  it("offers every status except the current one", () => {
    render(<AssetStatusControl assetId="asset-1" currentStatus="available" />);
    expect(screen.getByRole("button", { name: /move to assigned/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /move to maintenance/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /move to available/i })).not.toBeInTheDocument();
  });

  it("submits the chosen status and refreshes", async () => {
    render(<AssetStatusControl assetId="asset-1" currentStatus="available" />);

    await userEvent.click(screen.getByRole("button", { name: /move to maintenance/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/assets/asset-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ action: "changeStatus", status: "maintenance" }),
      })
    );
  });
});
