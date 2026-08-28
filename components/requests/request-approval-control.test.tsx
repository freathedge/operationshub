// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { RequestApprovalControl } from "@/components/requests/request-approval-control";

beforeEach(() => {
  refreshMock.mockReset();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});

describe("RequestApprovalControl", () => {
  it("submits an approve decision and refreshes", async () => {
    render(<RequestApprovalControl approvalId="approval-1" />);

    await userEvent.click(screen.getByRole("button", { name: /approve/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/approvals/approval-1/decide",
      expect.objectContaining({ method: "POST" })
    );
    const call = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(call[1]!.body as string)).toEqual({ decision: "approved" });
  });

  it("submits a reject decision", async () => {
    render(<RequestApprovalControl approvalId="approval-1" />);

    await userEvent.click(screen.getByRole("button", { name: /reject/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });
});
