// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { RequestReassignControl } from "@/components/requests/request-reassign-control";

function mockFetch(peers: { id: string; fullName: string }[]) {
  return vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
    if (!init || init.method === undefined) {
      return { ok: true, json: async () => ({ profiles: peers }) };
    }
    return { ok: true, json: async () => ({}) };
  });
}

beforeEach(() => {
  refreshMock.mockReset();
});

describe("RequestReassignControl", () => {
  it("loads peers and submits a reassignment", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        { id: "peer-1", fullName: "Alice" },
        { id: "peer-2", fullName: "Bob" },
      ])
    );

    render(<RequestReassignControl approvalId="approval-1" currentApproverRole="operations_manager" />);

    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/profiles?role=operations_manager");

    await userEvent.selectOptions(screen.getByRole("combobox"), "peer-1");
    await userEvent.click(screen.getByRole("button", { name: /reassign/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/approvals/approval-1/reassign",
      expect.objectContaining({ method: "POST" })
    );
    const postCall = vi
      .mocked(fetch)
      .mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === "POST")!;
    expect(JSON.parse(postCall[1]!.body as string)).toEqual({ newApproverId: "peer-1" });
  });

  it("renders nothing when there are no peers to reassign to", async () => {
    vi.stubGlobal("fetch", mockFetch([]));

    const { container } = render(
      <RequestReassignControl approvalId="approval-1" currentApproverRole="operations_manager" />
    );

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
