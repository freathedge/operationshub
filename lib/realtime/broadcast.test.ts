import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn().mockResolvedValue("ok");
const subscribeMock = vi.fn((callback: (status: string) => void) => {
  callback("SUBSCRIBED");
});
const channelMock = vi.fn(() => ({
  subscribe: subscribeMock,
  send: sendMock,
}));
const removeChannelMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    channel: channelMock,
    removeChannel: removeChannelMock,
  }),
}));

import { broadcastChange, broadcastToProfile } from "@/lib/realtime/broadcast";

beforeEach(() => {
  sendMock.mockClear();
  subscribeMock.mockClear();
  channelMock.mockClear();
  removeChannelMock.mockClear();
});

describe("broadcastChange", () => {
  it("subscribes to the company-scoped channel, sends the event, and cleans up", async () => {
    await broadcastChange("company-1", "tasks", { type: "task_created" });

    expect(channelMock).toHaveBeenCalledWith("company:company-1:tasks");
    expect(sendMock).toHaveBeenCalledWith({
      type: "broadcast",
      event: "task_created",
      payload: {},
    });
    expect(removeChannelMock).toHaveBeenCalled();
  });

  it("rejects if the channel fails to subscribe", async () => {
    subscribeMock.mockImplementationOnce((callback: (status: string) => void) => {
      callback("CHANNEL_ERROR");
    });

    await expect(broadcastChange("company-1", "tasks", { type: "task_created" })).rejects.toThrow();
  });
});

describe("broadcastToProfile", () => {
  it("subscribes to the profile-scoped channel, sends the event, and cleans up", async () => {
    await broadcastToProfile("profile-1", "notifications", { type: "approval_required" });

    expect(channelMock).toHaveBeenCalledWith("profile:profile-1:notifications");
    expect(sendMock).toHaveBeenCalledWith({
      type: "broadcast",
      event: "approval_required",
      payload: {},
    });
    expect(removeChannelMock).toHaveBeenCalled();
  });

  it("rejects if the channel fails to subscribe", async () => {
    subscribeMock.mockImplementationOnce((callback: (status: string) => void) => {
      callback("CHANNEL_ERROR");
    });

    await expect(
      broadcastToProfile("profile-1", "notifications", { type: "approval_required" })
    ).rejects.toThrow();
  });
});
