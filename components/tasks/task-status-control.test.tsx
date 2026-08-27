// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => ({ on: () => ({ subscribe: vi.fn() }) }),
    removeChannel: vi.fn(),
  }),
}));

import { TaskStatusControl } from "@/components/tasks/task-status-control";

beforeEach(() => {
  refreshMock.mockReset();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});

describe("TaskStatusControl", () => {
  it("only offers the valid next statuses for the current status", () => {
    render(<TaskStatusControl taskId="task-1" currentStatus="todo" />);

    expect(screen.getByRole("button", { name: /move to in_progress/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /move to cancelled/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /move to completed/i })).not.toBeInTheDocument();
  });

  it("shows no actions for a terminal status", () => {
    render(<TaskStatusControl taskId="task-1" currentStatus="completed" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("submits the chosen status and refreshes", async () => {
    render(<TaskStatusControl taskId="task-1" currentStatus="todo" />);

    await userEvent.click(screen.getByRole("button", { name: /move to in_progress/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/tasks/task-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "in_progress" }),
      })
    );
  });
});
