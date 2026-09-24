"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBroadcastListener } from "@/lib/realtime/use-broadcast-listener";
import type { Notification } from "@/lib/domain/notifications";

const ENTITY_ROUTES: Record<string, string> = {
  request: "/requests",
  task: "/tasks",
  asset: "/assets",
  operation: "/operations",
  workflow: "/workflows",
};

export function NotificationBell({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refetch = useCallback(async () => {
    const response = await fetch("/api/notifications");
    if (!response.ok) return;
    const body = await response.json();
    setNotifications(body.notifications as Notification[]);
    setUnreadCount(body.unreadCount as number);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useBroadcastListener(`profile:${profileId}:notifications`, refetch);

  async function handleSelect(notification: Notification) {
    if (notification.readAt === null) {
      setNotifications((current) =>
        current.map((n) =>
          n.id === notification.id ? { ...n, readAt: new Date().toISOString() } : n
        )
      );
      setUnreadCount((count) => Math.max(0, count - 1));
      await fetch(`/api/notifications/${notification.id}/read`, { method: "PATCH" });
    }
    const basePath = ENTITY_ROUTES[notification.entityType];
    if (basePath) {
      router.push(`${basePath}/${notification.entityId}`);
    }
  }

  async function handleMarkAllRead() {
    setNotifications((current) =>
      current.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }))
    );
    setUnreadCount(0);
    await fetch("/api/notifications/read-all", { method: "POST" });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label="Notifications"
          />
        }
      >
        <BellIcon />
        {unreadCount > 0 && (
          <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 min-w-4 px-1">
            {unreadCount}
          </Badge>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-80 max-h-96 overflow-y-auto" align="end" sideOffset={4}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between">
            Notifications
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs font-normal text-primary hover:underline"
              >
                Mark all as read
              </button>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {notifications.length === 0 && (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            No notifications yet.
          </div>
        )}
        {notifications.map((notification) => (
          <DropdownMenuItem key={notification.id} onClick={() => handleSelect(notification)}>
            <span
              className={
                notification.readAt === null ? "font-medium" : "text-muted-foreground"
              }
            >
              {notification.message}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
