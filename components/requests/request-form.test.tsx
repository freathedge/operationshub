// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { RequestForm } from "@/components/requests/request-form";

beforeEach(() => {
  pushMock.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ request: { id: "request-1" } }),
    })
  );
});

describe("RequestForm", () => {
  it("shows a validation error when submitted empty", async () => {
    render(<RequestForm />);
    await userEvent.click(screen.getByRole("button", { name: /submit request/i }));

    expect(await screen.findByText("Title is required")).toBeInTheDocument();
  });

  it("creates a request and redirects to its detail page", async () => {
    render(<RequestForm />);

    await userEvent.type(screen.getByLabelText(/title/i), "New laptop");
    await userEvent.click(screen.getByRole("button", { name: /submit request/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/requests/request-1"));
  });
});
