import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { markAllNotificationsRead } from "@/lib/domain/notifications";
import { toErrorResponse } from "@/lib/api/error-response";

export async function POST() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    await markAllNotificationsRead(profile);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
