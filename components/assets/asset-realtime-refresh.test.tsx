// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

let capturedOnMessage: (() => void) | null = null;
vi.mock("@/lib/realtime/use-broadcast-listener", () => ({
  useBroadcastListener: (_channel: string, onMessage: () => void) => {
    capturedOnMessage = onMessage;
  },
}));

import { AssetRealtimeRefresh } from "@/components/assets/asset-realtime-refresh";

describe("AssetRealtimeRefresh", () => {
  it("refreshes the router when a broadcast is received", () => {
    render(<AssetRealtimeRefresh companyId="company-1" />);
    capturedOnMessage?.();
    expect(refreshMock).toHaveBeenCalled();
  });
});
