import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getRequest } from "@/lib/domain/requests";
import { createSignedUploadUrl } from "@/lib/domain/attachments";
import { logActivity } from "@/lib/domain/activity";
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

  const body = await request.json();
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
    return NextResponse.json(
      { attachment: result.attachment, token: result.token },
      { status: 201 }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
