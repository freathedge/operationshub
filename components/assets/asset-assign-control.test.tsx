// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { AssetAssignControl } from "@/components/assets/asset-assign-control";

beforeEach(() => {
  refreshMock.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (url.startsWith("/api/employees")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ employees: [{ id: "employee-1", fullName: "Ada Lovelace" }] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    })
  );
});

describe("AssetAssignControl", () => {
  it("assigns the selected employee and refreshes", async () => {
    render(<AssetAssignControl assetId="asset-1" />);

    const select = await screen.findByLabelText(/assign to/i);
    await userEvent.click(select);
    await userEvent.click(await screen.findByRole("option", { name: "Ada Lovelace" }));
    await userEvent.click(screen.getByRole("button", { name: /^assign$/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/assets/asset-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ action: "assign", targetEmployeeId: "employee-1" }),
      })
    );
  });
});
