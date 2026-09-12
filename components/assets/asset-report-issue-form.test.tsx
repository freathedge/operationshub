// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { AssetReportIssueForm } from "@/components/assets/asset-report-issue-form";

beforeEach(() => {
  refreshMock.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ task: { id: "task-1" } }) })
  );
});

describe("AssetReportIssueForm", () => {
  it("creates a task linked to the asset and refreshes", async () => {
    render(<AssetReportIssueForm assetId="asset-1" />);

    await userEvent.type(screen.getByLabelText(/describe the issue/i), "Screen is cracked");
    await userEvent.click(screen.getByRole("button", { name: /report issue/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/tasks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "Screen is cracked", relatedAssetId: "asset-1" }),
      })
    );
  });
});
