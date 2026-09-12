// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { TaskAssetAssignmentForm } from "@/components/tasks/task-asset-assignment-form";

beforeEach(() => {
  refreshMock.mockReset();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});

describe("TaskAssetAssignmentForm", () => {
  it("shows a validation error when submitted empty", async () => {
    render(<TaskAssetAssignmentForm taskId="task-1" />);
    await userEvent.click(screen.getByRole("button", { name: /assign asset & complete/i }));

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
  });

  it("submits the asset details and refreshes", async () => {
    render(<TaskAssetAssignmentForm taskId="task-1" />);

    await userEvent.type(screen.getByLabelText(/name/i), "New Laptop");
    await userEvent.type(screen.getByLabelText(/category/i), "laptop");
    await userEvent.click(screen.getByRole("button", { name: /assign asset & complete/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/tasks/task-1/complete-with-asset",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "New Laptop", category: "laptop" }),
      })
    );
  });
});
