import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getRequest } from "@/lib/domain/requests";
import { createSignedUploadUrl } from "@/lib/domain/attachments";
import { logActivity } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import { createAttachmentSchema } from "@/lib/validation/tasks";
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createAttachmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const targetRequest = await getRequest(profile, id);
    const result = await createSignedUploadUrl(
      "request",
      targetRequest.id,
      profile.id,
      parsed.data.filename
    );
    await logActivity(
      "request",
      targetRequest.id,
      profile.id,
      `${profile.fullName} attached a file`
    );
    try {
      await broadcastChange(profile.companyId, "requests", { type: "request_updated" });
    } catch (broadcastError) {
      console.error("broadcastChange failed:", broadcastError);
    }
    return NextResponse.json(
      { attachment: result.attachment, token: result.token },
      { status: 201 }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
