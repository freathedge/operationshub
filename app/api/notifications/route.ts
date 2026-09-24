import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { listNotifications } from "@/lib/domain/notifications";
import { toErrorResponse } from "@/lib/api/error-response";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const notifications = await listNotifications(profile.id);
    const unreadCount = notifications.filter((n) => n.readAt === null).length;
    return NextResponse.json({ notifications: notifications.slice(0, 20), unreadCount });
  } catch (error) {
    return toErrorResponse(error);
  }
}
