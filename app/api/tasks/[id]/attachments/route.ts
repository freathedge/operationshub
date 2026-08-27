import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { getTask } from "@/lib/domain/tasks";
import { canUploadAttachment } from "@/lib/domain/permissions";
import {
  createSignedDownloadUrl,
  createSignedUploadUrl,
  listAttachments,
} from "@/lib/domain/attachments";
import { logActivity } from "@/lib/domain/activity";
import { broadcastChange } from "@/lib/realtime/broadcast";
import { createAttachmentSchema } from "@/lib/validation/tasks";
import { toErrorResponse } from "@/lib/api/error-response";
import { ForbiddenError } from "@/lib/domain/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const task = await getTask(profile, id);
    if (!canUploadAttachment(profile, task)) {
      throw new ForbiddenError("You cannot view attachments on this task");
    }
    const attachments = await listAttachments("task", task.id);
    const withUrls = await Promise.all(
      attachments.map(async (attachment) => ({
        ...attachment,
        downloadUrl: await createSignedDownloadUrl(attachment.storagePath),
      }))
    );
    return NextResponse.json({ attachments: withUrls });
  } catch (error) {
    return toErrorResponse(error);
  }
}

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
    const task = await getTask(profile, id);
    if (!canUploadAttachment(profile, task)) {
      throw new ForbiddenError("You cannot upload attachments to this task");
    }
    const result = await createSignedUploadUrl(
      "task",
      task.id,
      profile.id,
      parsed.data.filename
    );
    await logActivity("task", task.id, profile.id, `${profile.fullName} attached a file`);
    try {
      await broadcastChange(profile.companyId, "tasks", { type: "task_updated" });
    } catch (error) {
      console.error("broadcastChange failed:", error);
    }
    return NextResponse.json(
      { attachment: result.attachment, token: result.token },
      { status: 201 }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
