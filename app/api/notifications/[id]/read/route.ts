import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { markNotificationRead } from "@/lib/domain/notifications";
import { toErrorResponse } from "@/lib/api/error-response";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const notification = await markNotificationRead(profile, id);
    return NextResponse.json({ notification });
  } catch (error) {
    return toErrorResponse(error);
  }
}
