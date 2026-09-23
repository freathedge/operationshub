// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandSearch } from "@/components/command-search";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe("CommandSearch", () => {
  it("does not render dialog content when closed", () => {
    render(<CommandSearch open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
  });

  it("fetches and groups results by type when the query changes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { type: "task", id: "task-1", label: "Fix the printer", href: "/tasks/task-1" },
          { type: "employee", id: "emp-1", label: "Sarah Employee", href: "/employees/emp-1" },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CommandSearch open={true} onOpenChange={vi.fn()} />);
    const input = screen.getByPlaceholderText(/search/i);
    await userEvent.type(input, "printer");

    expect(await screen.findByText("Fix the printer")).toBeInTheDocument();
    expect(screen.getByText("Sarah Employee")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/search?q=printer"));
  });

  it("navigates and closes on selecting a result", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ type: "task", id: "task-1", label: "Fix the printer", href: "/tasks/task-1" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onOpenChange = vi.fn();

    render(<CommandSearch open={true} onOpenChange={onOpenChange} />);
    const input = screen.getByPlaceholderText(/search/i);
    await userEvent.type(input, "printer");
    await userEvent.click(await screen.findByText("Fix the printer"));

    expect(pushMock).toHaveBeenCalledWith("/tasks/task-1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
