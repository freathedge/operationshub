// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => ({ on: () => ({ subscribe: vi.fn() }) }),
    removeChannel: vi.fn(),
  }),
}));

import { NotificationBell } from "@/components/notification-bell";

const NOTIFICATION = {
  id: "n1",
  profileId: "profile-1",
  entityType: "task",
  entityId: "task-1",
  type: "task_assigned",
  message: 'You were assigned to "Fix printer"',
  readAt: null,
  createdAt: "2026-09-24T00:00:00.000Z",
};

function stubNotificationsFetch(notifications: unknown[], unreadCount: number) {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url === "/api/notifications") {
      return Promise.resolve({
        ok: true,
        json: async () => ({ notifications, unreadCount }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("NotificationBell", () => {
  it("shows the unread count badge from the initial fetch", async () => {
    stubNotificationsFetch([NOTIFICATION], 1);
    render(<NotificationBell profileId="profile-1" />);
    expect(await screen.findByText("1")).toBeInTheDocument();
  });

  it("shows no unread badge when there are no unread notifications", async () => {
    stubNotificationsFetch([], 0);
    render(<NotificationBell profileId="profile-1" />);
    await screen.findByRole("button", { name: "Notifications" });
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("marks a notification read and navigates to it on click", async () => {
    const fetchMock = stubNotificationsFetch([NOTIFICATION], 1);
    render(<NotificationBell profileId="profile-1" />);

    await userEvent.click(await screen.findByRole("button", { name: "Notifications" }));
    await userEvent.click(await screen.findByText(/Fix printer/));

    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/n1/read", { method: "PATCH" });
    expect(pushMock).toHaveBeenCalledWith("/tasks/task-1");
  });

  it("does not re-mark an already-read notification on a second click", async () => {
    const readNotification = { ...NOTIFICATION, readAt: "2026-09-24T00:00:00.000Z" };
    const fetchMock = stubNotificationsFetch([readNotification], 0);
    render(<NotificationBell profileId="profile-1" />);

    await userEvent.click(await screen.findByRole("button", { name: "Notifications" }));
    await userEvent.click(await screen.findByText(/Fix printer/));

    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/notifications/n1/read",
      expect.anything()
    );
    expect(pushMock).toHaveBeenCalledWith("/tasks/task-1");
  });

  it("marks all notifications read via 'Mark all as read'", async () => {
    const fetchMock = stubNotificationsFetch([NOTIFICATION], 1);
    render(<NotificationBell profileId="profile-1" />);

    await userEvent.click(await screen.findByRole("button", { name: "Notifications" }));
    await userEvent.click(await screen.findByText("Mark all as read"));

    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/read-all", { method: "POST" });
  });
});
