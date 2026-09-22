// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { OperationForm } from "@/components/operations/operation-form";

beforeEach(() => {
  pushMock.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ operation: { id: "op-1" } }),
    })
  );
});

describe("OperationForm", () => {
  it("shows a validation error when submitted empty", async () => {
    render(<OperationForm departments={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /create operation/i }));

    expect(await screen.findByText("Title is required")).toBeInTheDocument();
  });

  it("creates an operation and redirects to its detail page", async () => {
    render(<OperationForm departments={[]} />);

    await userEvent.type(screen.getByLabelText(/title/i), "Vienna Office Relocation");
    await userEvent.click(screen.getByRole("button", { name: /create operation/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/operations/op-1"));
  });
});
