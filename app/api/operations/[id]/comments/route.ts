import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { loadOperationOrThrow } from "@/lib/domain/operations";
import { canCommentOnOperation } from "@/lib/domain/permissions";
import { addComment, listComments } from "@/lib/domain/comments";
import { logActivity } from "@/lib/domain/activity";
import { createNotification } from "@/lib/domain/notifications";
import { broadcastChange } from "@/lib/realtime/broadcast";
import { addCommentSchema } from "@/lib/validation/tasks";
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
    const operation = await loadOperationOrThrow(id);
    if (!canCommentOnOperation(profile, operation)) {
      throw new ForbiddenError("You cannot view comments on this operation");
    }
    const comments = await listComments("operation", operation.id);
    return NextResponse.json({ comments });
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
  const parsed = addCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const operation = await loadOperationOrThrow(id);
    if (!canCommentOnOperation(profile, operation)) {
      throw new ForbiddenError("You cannot comment on this operation");
    }
    const comment = await addComment("operation", operation.id, profile.id, parsed.data.body);
    await logActivity(
      "operation",
      operation.id,
      profile.id,
      `${profile.fullName} commented on this operation`
    );
    if (operation.ownerId !== profile.id) {
      await createNotification(
        operation.ownerId,
        "operation",
        operation.id,
        "comment_added",
        `${profile.fullName} commented on "${operation.title}"`
      );
    }
    try {
      await broadcastChange(profile.companyId, "operations", { type: "operation_updated" });
    } catch (error) {
      console.error("broadcastChange failed:", error);
    }
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
