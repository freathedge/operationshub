import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getRequest } from "@/lib/domain/requests";
import { addComment } from "@/lib/domain/comments";
import { logActivity } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import { addCommentSchema } from "@/lib/validation/tasks";
import { toErrorResponse } from "@/lib/api/error-response";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  const body = await request.json();
  const parsed = addCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const targetRequest = await getRequest(profile, id);
    const comment = await addComment("request", targetRequest.id, profile.id, parsed.data.body);
    await logActivity(
      "request",
      targetRequest.id,
      profile.id,
      `${profile.fullName} commented on this request`
    );
    try {
      await broadcastChange(profile.companyId, "requests", { type: "request_updated" });
    } catch (broadcastError) {
      console.error("broadcastChange failed:", broadcastError);
    }
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
