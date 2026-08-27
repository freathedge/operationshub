// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { TaskForm } from "@/components/tasks/task-form";

beforeEach(() => {
  pushMock.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ task: { id: "task-1" } }),
    })
  );
});

describe("TaskForm", () => {
  it("shows a validation error when submitted empty", async () => {
    render(<TaskForm />);
    await userEvent.click(screen.getByRole("button", { name: /create task/i }));

    expect(await screen.findByText("Title is required")).toBeInTheDocument();
  });

  it("creates a task and redirects to its detail page", async () => {
    render(<TaskForm />);

    await userEvent.type(screen.getByLabelText(/title/i), "Prepare laptop");
    await userEvent.click(screen.getByRole("button", { name: /create task/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/tasks/task-1"));
  });
});
