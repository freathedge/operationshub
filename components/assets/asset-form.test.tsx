// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { AssetForm } from "@/components/assets/asset-form";

beforeEach(() => {
  pushMock.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ asset: { id: "asset-1" } }),
    })
  );
});

describe("AssetForm", () => {
  it("shows a validation error when submitted empty", async () => {
    render(<AssetForm departments={[]} locations={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /create asset/i }));

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
  });

  it("creates an asset and redirects to its detail page", async () => {
    render(<AssetForm departments={[]} locations={[]} />);

    await userEvent.type(screen.getByLabelText(/name/i), "MacBook Pro 14");
    await userEvent.type(screen.getByLabelText(/category/i), "laptop");
    await userEvent.click(screen.getByRole("button", { name: /create asset/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/assets/asset-1"));
  });
});
