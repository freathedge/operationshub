// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const onMock = vi.fn();
const subscribeMock = vi.fn();
const removeChannelMock = vi.fn();
let capturedCallback: (() => void) | undefined;

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => ({
      on: (_type: string, _filter: unknown, callback: () => void) => {
        capturedCallback = callback;
        onMock();
        return { subscribe: subscribeMock };
      },
    }),
    removeChannel: removeChannelMock,
  }),
}));

import { useBroadcastListener } from "@/lib/realtime/use-broadcast-listener";

function TestComponent({ onMessage }: { onMessage: () => void }) {
  useBroadcastListener("company:test:tasks", onMessage);
  return null;
}

beforeEach(() => {
  onMock.mockReset();
  subscribeMock.mockReset();
  removeChannelMock.mockReset();
  capturedCallback = undefined;
});

describe("useBroadcastListener", () => {
  it("subscribes to the channel and calls onMessage when a broadcast arrives", () => {
    const onMessage = vi.fn();
    render(<TestComponent onMessage={onMessage} />);

    expect(onMock).toHaveBeenCalled();
    expect(subscribeMock).toHaveBeenCalled();

    capturedCallback?.();
    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes on unmount", () => {
    const onMessage = vi.fn();
    const { unmount } = render(<TestComponent onMessage={onMessage} />);
    unmount();
    expect(removeChannelMock).toHaveBeenCalled();
  });
});
